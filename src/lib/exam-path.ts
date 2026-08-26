// EXAM PATH (08-26) — the guided walk through an exam's available content.
//
// TWO LAYERS. The PATH is the product: a deterministic, flat list of steps Survive advances the
// student through (press Start, keep pressing Continue). The MAP (left sidebar) stays free
// navigation. This module owns what a step IS, the order, completion storage and progress math;
// the player renders it.
//
// STEPS COME FROM ACTUAL CONTENT. A step exists only when its content exists right now:
//   cram_video    — the set's published cram video (StudentSet.playbackId)
//   practice_set  — the set's CEQ questions (ceqCount > 0)
//   review_video  — the set's published review video (hasReview + reviewPlaybackId)
// Unavailable stages are NOT steps: they can render as "Coming soon" labels elsewhere, but they
// never sit in the denominator and Continue never lands on them — a student reaches 100% on
// what is actually published. When Lee publishes a new video the path re-derives on next load
// and the step simply appears (denominator grows; nothing else to migrate).
//
// COMPLETION IS LOCAL-FIRST. Steps are marked done in localStorage (`sa-path-steps`), keyed on
// the stable `${setId}:${stage}` id, so an anonymous student keeps progress across reloads on
// the same browser. Signed-in students ALSO get the existing per-set server rows
// (student_set_progress) via the surfaces that already write them — per-STAGE granularity stays
// local-only for now (documented in the report; no schema change in this pass).
//
// Client-safe: types + pure functions + localStorage; no server imports.
import type { StudentSet } from "@/lib/student.functions";
import type { SetStage } from "@/lib/set-flow";

export type PathStepKind = "cram_video" | "practice_set" | "review_video";

export interface PathStep {
  /** Stable id: `${setId}:${stage}` — survives content edits that don't remove the set. */
  id: string;
  setId: string;
  stage: SetStage;
  kind: PathStepKind;
  topicKey: string;
  topicName: string;
  /** Student-facing label: the set's shorthand (problem type), falling back to its name. */
  label: string;
  questions: number;
  runtimeSec: number | null;
}

export interface PathTopicLike {
  key: string;
  name: string;
  sets: Array<Pick<StudentSet, "id" | "name" | "shortLabel" | "playbackId" | "ceqCount" | "hasReview" | "reviewPlaybackId" | "runtimeSec" | "reviewRuntimeSec" | "access">>;
}

const setLabel = (s: PathTopicLike["sets"][number]): string => (s.shortLabel ?? s.name).replace(/^"|"$/g, "").replace(/\[\s*\]/g, "___");

/** The whole exam's guided order: topics in map order, each set walking cram → practice → review
 *  over whatever exists. Free sets only — a paid set never enters the free path. */
export function buildPath(topics: PathTopicLike[]): PathStep[] {
  const out: PathStep[] = [];
  for (const t of topics) {
    for (const s of t.sets) {
      if (s.access === "paid") continue;
      const base = { setId: s.id, topicKey: t.key, topicName: t.name, label: setLabel(s), questions: s.ceqCount };
      if (s.playbackId) out.push({ ...base, id: `${s.id}:cram`, stage: "cram", kind: "cram_video", runtimeSec: s.runtimeSec ?? null });
      if (s.ceqCount > 0) out.push({ ...base, id: `${s.id}:practice`, stage: "practice", kind: "practice_set", runtimeSec: null });
      if (s.hasReview && s.reviewPlaybackId) out.push({ ...base, id: `${s.id}:review`, stage: "review", kind: "review_video", runtimeSec: s.reviewRuntimeSec ?? null });
    }
  }
  return out;
}

// ── completion storage ─────────────────────────────────────────────────────────────────────────
export const PATH_STEPS_KEY = "sa-path-steps";
export const PATH_STARTED_KEY = "sa-path-started";
export const PATH_POS_KEY = "sa-path-pos";

export function readDoneSteps(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PATH_STEPS_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}
export function markStepDone(id: string): void {
  try {
    const m = readDoneSteps();
    if (m[id]) return;
    m[id] = Date.now();
    localStorage.setItem(PATH_STEPS_KEY, JSON.stringify(m));
    window.dispatchEvent(new CustomEvent("sa-path"));
  } catch { /* private mode */ }
}
export function pathStarted(): boolean {
  try { return localStorage.getItem(PATH_STARTED_KEY) === "1"; } catch { return false; }
}
export function setPathStarted(): void {
  try { localStorage.setItem(PATH_STARTED_KEY, "1"); window.dispatchEvent(new CustomEvent("sa-path")); } catch { /* ignore */ }
}
export function readPathPos(): string | null {
  try { return localStorage.getItem(PATH_POS_KEY); } catch { return null; }
}
export function writePathPos(stepId: string): void {
  try { localStorage.setItem(PATH_POS_KEY, stepId); } catch { /* ignore */ }
}

// ── derivations ────────────────────────────────────────────────────────────────────────────────
export interface PathProgress { done: number; total: number; pct: number }

/** Progress over AVAILABLE steps only. Done steps whose content later vanished don't count. */
export function pathProgress(steps: PathStep[], done: Record<string, number>): PathProgress {
  const total = steps.length;
  const n = steps.filter((s) => done[s.id]).length;
  return { done: n, total, pct: total ? Math.round((n / total) * 100) : 0 };
}

export const stepIndex = (steps: PathStep[], id: string | null): number => (id ? steps.findIndex((s) => s.id === id) : -1);

/** Next step strictly after `id` (or the first step when id is unknown). Continue skips nothing
 *  because unavailable content never became a step. */
export function nextPathStep(steps: PathStep[], id: string | null): PathStep | null {
  const i = stepIndex(steps, id);
  return steps[i + 1] ?? null;
}
export function prevPathStep(steps: PathStep[], id: string | null): PathStep | null {
  const i = stepIndex(steps, id);
  return i > 0 ? steps[i - 1] : null;
}
/** The first not-yet-done step — where Continue resumes after a reload. */
export function firstUnfinished(steps: PathStep[], done: Record<string, number>): PathStep | null {
  return steps.find((s) => !done[s.id]) ?? null;
}
/** True when every available step of the topic is done. */
export function topicComplete(steps: PathStep[], done: Record<string, number>, topicKey: string): boolean {
  const own = steps.filter((s) => s.topicKey === topicKey);
  return own.length > 0 && own.every((s) => !!done[s.id]);
}

/** Short human label for a step in the navigator: practice shows the problem type, videos are
 *  prefixed so "Next: Cram · Easy Points" reads correctly. */
export function stepShortLabel(step: PathStep): string {
  if (step.kind === "practice_set") return step.label;
  return `${step.kind === "cram_video" ? "Cram" : "Review"} · ${step.topicName}`;
}

/** Tiny metadata line (hover/tooltip use): "Practice · 8 questions · ~5–10 min" / "Cram · 4:12". */
export function stepMeta(step: PathStep): string {
  if (step.kind === "practice_set") return `Practice · ${step.questions} question${step.questions === 1 ? "" : "s"} · ${estRangeMin(step.questions)}`;
  const mins = step.runtimeSec ? `${Math.floor(step.runtimeSec / 60)}:${String(Math.round(step.runtimeSec % 60)).padStart(2, "0")}` : "video";
  return `${step.kind === "cram_video" ? "Cram" : "Review"} · ${mins}`;
}

/** One documented assumption for practice time: 0.65–0.9 min per question, rounded to 5s of
 *  minutes — humane ranges, no fake precision. */
export function estRangeMin(questions: number): string {
  const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
  return `~${r5(questions * 0.65)}–${r5(questions * 0.9)} min`;
}
