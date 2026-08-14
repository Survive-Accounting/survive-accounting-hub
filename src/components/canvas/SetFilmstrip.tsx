// SET FILMSTRIP (frames rename §2 + overview polish B) — the linear board: a vertical
// strip of the open set's FRAMES, frame 1 at top. The selected frame renders large in
// the editor beside it; hovering a gap reveals the [+] CEQ/Note chooser (§3).
//
// POLISH B (display-only):
//   WHERE-AM-I — the current frame is unmistakable (full opacity + accent ring);
//     same-RUN frames sit at ~80% with a slim labeled bracket; everything else ~55%.
//     Selection changes auto-scroll the current frame comfortably into view.
//   CONTROLLED DENSITY — no free zoom: fixed steps of 1 / 3 / 6 / 12 frames per
//     screen. Ctrl+scroll (or the tiny stepper on the strip header) moves between
//     steps with an eased transition; plain scroll just scrolls. Persists per user.
//     (The stepper lives on the strip header rather than the View menu — the menu
//     is previewer-deep and this keeps the control next to what it controls.)
//   RUN MAP RAIL — a thin rail along the strip edge: one segment per run,
//     proportional to frame count, labeled A/B/C…; click → jump to that run's
//     first frame; the current run's segment is highlighted. The seed of the
//     future exam map, deliberately display-only.
import { useEffect, useRef, useState } from "react";
import { FileText, HelpCircle, Plus, Star } from "lucide-react";

import { NEON } from "./theme";

export interface StripItem {
  id: string;
  stem: string;
  shorthand?: string;
  run?: string;
  noteOnly: boolean;
  free: boolean;
  clips: number;
  starred: boolean;
}

const DENSITY_STEPS = [1, 3, 6, 12] as const;
const DENSITY_KEY = "sa-strip-density";

/** The slim [+] that lives in the gap between two frames (and above/below the ends). */
function InsertGap({ at, onInsert }: { at: number; onInsert: (at: number, kind: "ceq" | "note") => void }) {
  const [chooser, setChooser] = useState(false);
  return (
    <div className="group relative flex h-2 shrink-0 items-center justify-center" onMouseLeave={() => setChooser(false)}>
      {!chooser ? (
        <button
          className="pointer-events-auto grid h-4 w-4 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}`, zIndex: 5 }}
          onClick={() => setChooser(true)}
          title="Insert a frame here"
        >
          <Plus className="h-3 w-3" />
        </button>
      ) : (
        <div className="absolute z-10 flex items-center gap-1 rounded-lg px-1.5 py-1" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.7)" }}>
          <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setChooser(false); onInsert(at, "ceq"); }} title="A question card — counts, practices, films">
            <HelpCircle className="h-3 w-3" /> CEQ frame
          </button>
          <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setChooser(false); onInsert(at, "note"); }} title="Text/memo-only: tips, trigger words, headspace. Films like a frame, never counts as a question">
            <FileText className="h-3 w-3" /> Note frame
          </button>
        </div>
      )}
    </div>
  );
}

/** Contiguous run segments (unlettered frames group as unlabeled segments). */
function runSegments(items: StripItem[]): { run: string | null; start: number; count: number }[] {
  const segs: { run: string | null; start: number; count: number }[] = [];
  items.forEach((it, i) => {
    const run = it.run?.trim() || null;
    const last = segs[segs.length - 1];
    if (last && last.run === run) last.count += 1;
    else segs.push({ run, start: i, count: 1 });
  });
  return segs;
}

export function SetFilmstrip({ items, qId, onSelect, onInsert }: {
  items: StripItem[];
  qId: string | null;
  onSelect: (id: string) => void;
  onInsert: (at: number, kind: "ceq" | "note") => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [density, setDensityRaw] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(DENSITY_KEY)); return DENSITY_STEPS.includes(v as never) ? v : 6; } catch { return 6; }
  });
  const setDensity = (v: number) => { setDensityRaw(v); try { localStorage.setItem(DENSITY_KEY, String(v)); } catch { /* ignore */ } };
  // Ctrl+scroll steps density; plain scroll always just scrolls the strip.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const i = DENSITY_STEPS.indexOf(density as never);
      const ni = Math.max(0, Math.min(DENSITY_STEPS.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
      if (DENSITY_STEPS[ni] !== density) setDensity(DENSITY_STEPS[ni]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [density]);
  // WHERE-AM-I: keep the current frame comfortably in view as selection moves.
  useEffect(() => {
    if (!qId) return;
    scrollRef.current?.querySelector(`[data-strip-frame="${qId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [qId]);

  const currentRun = items.find((it) => it.id === qId)?.run?.trim() || null;
  const segs = runSegments(items);
  const dense = density >= 6; // mini-cards: shorthand + run + glyph, one line
  const rowH = `calc((100vh - 210px) / ${density})`;

  // student-facing numbering: CEQ frames only — notes are breath, not questions
  let ceqN = 0;
  return (
    <div className="flex w-48 shrink-0 border-r" style={{ borderColor: NEON.borderSoft, background: "rgba(0,0,0,0.18)" }}>
      {/* RUN MAP RAIL — the miniature of the whole set. */}
      {items.length > 0 && (
        <div className="flex w-4 shrink-0 flex-col py-1" title="Run map — click a segment to jump to that run">
          {segs.map((s) => {
            const active = (s.run ?? null) === currentRun && currentRun !== null ? true : s.run === null && currentRun === null && items[s.start] && qId ? s.start <= items.findIndex((x) => x.id === qId) && items.findIndex((x) => x.id === qId) < s.start + s.count : false;
            return (
              <button
                key={`${s.run ?? "·"}-${s.start}`}
                className="mx-0.5 mb-0.5 grid min-h-0 place-items-center rounded-sm text-[7.5px] font-black uppercase"
                style={{ flexGrow: s.count, color: active ? "#0B1322" : NEON.muted, background: active ? NEON.cyan : "rgba(245,239,230,0.08)", border: `1px solid ${active ? NEON.cyan : "transparent"}` }}
                title={s.run ? `Run ${s.run} — ${s.count} frame${s.count === 1 ? "" : "s"}` : `${s.count} frame${s.count === 1 ? "" : "s"} with no run letter`}
                onClick={() => onSelect(items[s.start].id)}
              >{s.run ?? "·"}</button>
            );
          })}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* strip header: the density stepper (1/3/6/12 frames per screen). */}
        <div className="flex shrink-0 items-center justify-end gap-0.5 px-1 pt-1" title="Density — frames per screen. Ctrl+scroll steps too; plain scroll just scrolls.">
          {DENSITY_STEPS.map((s) => (
            <button key={s} className="rounded px-1 text-[8.5px] font-black tabular-nums" style={{ color: density === s ? "#0B1322" : NEON.muted, background: density === s ? NEON.yellow : "transparent", border: `1px solid ${density === s ? NEON.yellow : "transparent"}` }} onClick={() => setDensity(s)}>{s}</button>
          ))}
        </div>
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-1">
          <InsertGap at={0} onInsert={onInsert} />
          {items.map((it, i) => {
            if (!it.noteOnly) ceqN += 1;
            const active = it.id === qId;
            const sameRun = !active && currentRun !== null && (it.run?.trim() || null) === currentRun;
            const label = (it.shorthand || it.stem || (it.noteOnly ? "Note" : "Question")).trim();
            return (
              <div key={it.id} className="flex shrink-0 flex-col" data-strip-frame={it.id}>
                <button
                  className="relative flex w-full flex-col justify-center gap-0.5 rounded-lg px-1.5 py-1 text-left"
                  style={{
                    minHeight: dense ? undefined : rowH,
                    height: dense ? rowH : undefined,
                    border: `1px solid ${active ? "rgba(252,163,17,0.9)" : NEON.borderSoft}`,
                    boxShadow: active ? "0 0 0 1.5px rgba(252,163,17,0.45)" : undefined,
                    background: active ? "rgba(252,163,17,0.12)" : "rgba(9,14,26,0.5)",
                    opacity: active ? 1 : sameRun ? 0.8 : 0.55,
                    transition: "height 220ms cubic-bezier(0.2,0.7,0.3,1), min-height 220ms cubic-bezier(0.2,0.7,0.3,1), opacity 150ms ease",
                  }}
                  onClick={() => onSelect(it.id)}
                  title={it.stem || label}
                >
                  {/* same-run bracket — the shape of the take you're inside */}
                  {sameRun && <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded" style={{ background: NEON.cyan, opacity: 0.7 }} title={`Run ${it.run} — same take as the current frame`} />}
                  <div className="flex items-center gap-1">
                    {it.noteOnly
                      ? <FileText className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} />
                      : <HelpCircle className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} />}
                    <span className="text-[9px] font-bold tabular-nums" style={{ color: active ? NEON.yellow : NEON.muted }}>
                      {it.noteOnly ? "note" : `Q${ceqN}`}
                    </span>
                    {it.run && <span className="rounded px-1 text-[8.5px] font-black uppercase" style={{ color: "#0B1322", background: NEON.cyan }} title={`Run ${it.run} — filmed in one take`}>{it.run}</span>}
                    {dense && <span className="min-w-0 flex-1 truncate text-[9.5px] leading-tight" style={{ color: active ? NEON.text : "rgba(230,236,255,0.75)" }}>{label}</span>}
                    <span className="ml-auto flex shrink-0 items-center gap-0.5">
                      {it.starred && <Star className="h-2.5 w-2.5" style={{ color: "#FFD23F", fill: "#FFD23F" }} />}
                      {it.clips > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3BF5A0" }} title={`${it.clips} clip${it.clips === 1 ? "" : "s"}`} />}
                      {it.free && !it.noteOnly && <span className="text-[8px] font-black" style={{ color: "#3BF5A0" }} title="Free question">🆓</span>}
                    </span>
                  </div>
                  {!dense && <span className={density === 1 ? "text-[13px] leading-snug" : "line-clamp-2 text-[10px] leading-tight"} style={{ color: active ? NEON.text : "rgba(230,236,255,0.75)" }}>{label}</span>}
                </button>
                <InsertGap at={i + 1} onInsert={onInsert} />
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="px-2 py-6 text-center text-[10px] italic" style={{ color: NEON.muted }}>
              Empty set — hover above and click [+] to add the first frame.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
