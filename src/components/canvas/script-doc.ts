// SCRIPT DOC (pure) — the course script model behind the Script Editor modal,
// the teleprompter overlay, and the "Export course script" markdown. Reads the
// same scene structure the outline does: lessons (path order) › beat columns
// (Hook · Teach · Model/Practice · Check) › frames (row order). Never
// hand-maintained; a frame's script lives ON the frame (FrameBox.script).
import { markLabel } from "./card-marks";
import { BEAT_COLUMNS, BEAT_LABEL, beatColOf, subIndexOf } from "./frames";
import type { Beat, FilmStatus, FrameScript } from "./types";

/** Minimal node shape (route nodes / tests both satisfy it). */
export interface ScriptNode {
  id: string;
  type?: string;
  parentId?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/** SCRIPT STATE (Phase 3) — the writing status of a frame's script. "empty" is
 *  derived (no text yet) and never stored; the other three are set by Lee. */
export type ScriptState = "empty" | "draft" | "review" | "final";
export const SCRIPT_STATE_ORDER: ScriptState[] = ["empty", "draft", "review", "final"];
export const SCRIPT_STATE_META: Record<ScriptState, { label: string; color: string; short: string }> = {
  empty: { label: "Empty", color: "#7A879B", short: "—" },
  draft: { label: "Draft", color: "#8CC0EE", short: "D" },
  review: { label: "Review", color: "#F5D48F", short: "R" },
  final: { label: "Final", color: "#7EF3C0", short: "✓" },
};

/** The effective state: an explicit scriptState wins, else it's derived from
 *  whether there's any script text (empty vs draft). */
export function deriveScriptState(script: FrameScript | undefined): ScriptState {
  if (!hasScript(script)) return "empty";
  const s = script?.scriptState;
  return s === "draft" || s === "review" || s === "final" ? s : "draft";
}

/** Cycle a frame's set state forward (draft → review → final → draft). "empty"
 *  frames start at draft. Returns the value to persist on FrameScript.scriptState. */
export function cycleScriptState(current: ScriptState): "draft" | "review" | "final" {
  switch (current) {
    case "draft": return "review";
    case "review": return "final";
    case "final": return "draft";
    default: return "draft"; // empty → draft
  }
}

export interface ScriptFrameRow {
  frameId: string;
  beat: Beat;
  subIndex: number;
  /** Frame N within the lesson's walk order (1-based). */
  n: number;
  title: string;
  script: FrameScript;
  filmStatus: FilmStatus;
  /** Phase 3: the derived writing status. */
  state: ScriptState;
}

export interface ScriptBeatGroup {
  beat: Beat;
  label: string;
  frames: ScriptFrameRow[];
}

export interface ScriptLessonGroup {
  lessonId: string;
  label: string;
  pathOrder: number;
  beats: ScriptBeatGroup[];
  /** Progress: frames with any script text / total. */
  scripted: number;
  filmed: number;
  total: number;
  /** Phase 3: frames whose script is marked Final. */
  final: number;
}

const pathOrderOf = (n: ScriptNode): number => {
  const v = n.data.pathOrder;
  return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
};

const lessonLabelOf = (n: ScriptNode): string => (n.data.label as string) || "Lesson";

export const hasScript = (s: FrameScript | undefined): boolean =>
  !!s && !!((s.entry ?? "").trim() || (s.beats ?? "").trim() || (s.exit ?? "").trim() || (s.marks?.length ?? 0) > 0);

/** Card marks as a round-trippable line ("Cards: @List — note · @Memo"). */
function marksLine(s: FrameScript | undefined): string | null {
  const marks = s?.marks ?? [];
  if (marks.length === 0) return null;
  return "Cards: " + marks.map((m) => `@${markLabel(m.kind)}${m.note ? ` — ${m.note}` : ""}`).join(" · ");
}

export const filmStatusOf = (d: Record<string, unknown>): FilmStatus => {
  const v = d.filmStatus;
  return v === "filmed" || v === "retake" ? v : "unfilmed";
};

/** The whole course script: lessons in path order › beats in column order ›
 *  frames in row order — the same walk the spacebar performs. */
export function scriptTree(nodes: ScriptNode[]): ScriptLessonGroup[] {
  const lessons = nodes
    .filter((n) => n.type === "lesson")
    .sort((a, b) => pathOrderOf(a) - pathOrderOf(b) || a.position.y - b.position.y || a.position.x - b.position.x);
  return lessons.map((l) => {
    const frames = nodes.filter((n) => n.type === "frame" && n.parentId === l.id);
    let n = 0;
    const beats: ScriptBeatGroup[] = BEAT_COLUMNS.map((beat) => {
      const inBeat = frames
        .filter((f) => beatColOf(f as never) === beat)
        .sort((a, b) => subIndexOf(a as never) - subIndexOf(b as never));
      return {
        beat,
        label: BEAT_LABEL[beat],
        frames: inBeat.map((f) => {
          const script = (f.data.script as FrameScript) ?? {};
          return {
            frameId: f.id,
            beat,
            subIndex: subIndexOf(f as never),
            n: ++n,
            title: (f.data.title as string) || "",
            script,
            filmStatus: filmStatusOf(f.data),
            state: deriveScriptState(script),
          };
        }),
      };
    }).filter((g) => g.frames.length > 0);
    const all = beats.flatMap((g) => g.frames);
    return {
      lessonId: l.id,
      label: lessonLabelOf(l),
      pathOrder: pathOrderOf(l),
      beats,
      scripted: all.filter((f) => hasScript(f.script)).length,
      filmed: all.filter((f) => f.filmStatus === "filmed").length,
      total: all.length,
      final: all.filter((f) => f.state === "final").length,
    };
  });
}

/** Beats text → markdown bullet lines (already-bulleted lines pass through). */
function beatsToBullets(beats: string): string[] {
  return beats
    .split("\n")
    .map((ln) => ln.trim())
    .filter(Boolean)
    .map((ln) => (/^[-*•]\s/.test(ln) ? `- ${ln.replace(/^[-*•]\s+/, "")}` : `- ${ln}`));
}

/** "Export course script" — one printable markdown doc, lessons › beats ›
 *  frames with entry / beats / exit. Frames without a script still appear
 *  (flagged) so the doc doubles as the shot list. */
export function courseScriptMarkdown(tree: ScriptLessonGroup[], courseName: string): string {
  const lines: string[] = [`# ${courseName} — course script`, ""];
  const totals = tree.reduce(
    (a, l) => ({ scripted: a.scripted + l.scripted, total: a.total + l.total }),
    { scripted: 0, total: 0 },
  );
  lines.push(`_${tree.length} lessons · ${totals.scripted}/${totals.total} frames scripted · exported ${new Date().toISOString().slice(0, 10)}_`, "");
  for (const l of tree) {
    lines.push(`## ${l.label}`, "");
    for (const g of l.beats) {
      lines.push(`### ${g.label}`, "");
      for (const f of g.frames) {
        const head = `**Frame ${f.n}${f.title ? ` — ${f.title}` : ""}**`;
        lines.push(head, "");
        const s = f.script;
        if (!hasScript(s)) {
          lines.push("_(no script yet)_", "");
          continue;
        }
        if ((s.entry ?? "").trim()) lines.push(`> ${s.entry!.trim()}`, "");
        if ((s.beats ?? "").trim()) {
          lines.push(...beatsToBullets(s.beats!));
          lines.push("");
        }
        if ((s.exit ?? "").trim()) lines.push(`> _${s.exit!.trim()}_`, "");
        const ml = marksLine(s);
        if (ml) lines.push(ml, "");
      }
    }
  }
  return lines.join("\n");
}
