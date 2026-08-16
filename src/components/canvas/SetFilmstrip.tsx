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
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, HelpCircle, MoreVertical, Plus, Star } from "lucide-react";

import { nextRunLetter, normRun, runSegments, usedRunLetters } from "./film-runs";
import { NEON } from "./theme";

export interface StripItem {
  id: string;
  stem: string;
  shorthand?: string;
  run?: string;
  noteOnly: boolean;
  frameMode?: "note" | "intro" | "outro";
  free: boolean;
  clips: number;
  starred: boolean;
}

const DENSITY_STEPS = [1, 3, 6, 12] as const;
const DENSITY_KEY = "sa-strip-density";

/** The gap between two frames (and above/below the ends). Closed it is a 2px hover
 *  target holding a [+]. Open it becomes a FULL-SIZE PLACEHOLDER CARD, in flow at the
 *  current density, so the surrounding cards slide apart to make room and nothing is
 *  clipped by the rail's 192px width (film-run fixes §5 — the old chooser was a tiny
 *  absolutely-positioned popover that ran off the rail edge).
 *  Only one gap is ever open: the strip owns `openAt`. Esc or a click anywhere else
 *  closes it without inserting. */
export type FrameKind = "ceq" | "note" | "intro" | "outro";

function InsertGap({ at, open, onOpen, onClose, onInsert, dense, rowH }: { at: number; open: boolean; onOpen: (at: number) => void; onClose: () => void; onInsert: (at: number, kind: FrameKind) => void; dense: boolean; rowH: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (open) {
    return (
      <div
        className="flex shrink-0 flex-col items-stretch justify-center gap-1 rounded-lg px-1.5 py-1"
        style={{
          minHeight: dense ? undefined : rowH,
          height: dense ? rowH : undefined,
          border: `1px dashed ${NEON.yellow}`,
          background: "rgba(252,163,17,0.08)",
        }}
      >
        <span className="text-center text-[8.5px] font-bold uppercase tracking-widest" style={{ color: NEON.muted }}>New frame</span>
        <button className="flex items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}`, background: "rgba(9,14,26,0.6)" }} onClick={() => { onClose(); onInsert(at, "ceq"); }} title="A question card — counts, practices, films">
          <HelpCircle className="h-3 w-3" /> CEQ frame
        </button>
        <button className="flex items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-bold" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}`, background: "rgba(9,14,26,0.6)" }} onClick={() => { onClose(); onInsert(at, "note"); }} title="NON-CEQ · note — tips, trigger words, headspace. Films like a frame, never counts as a question. Every element is deletable; the mode is switchable.">
          <FileText className="h-3 w-3" /> Note
        </button>
        <button className="flex items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-bold" style={{ color: "#8FD3FF", border: `1px solid ${NEON.borderSoft}`, background: "rgba(9,14,26,0.6)" }} onClick={() => { onClose(); onInsert(at, "intro"); }} title="NON-CEQ · intro — set up what's coming (the stem, the trap, the promise). Same freedom: delete anything, rename it, rebuild it.">
          <FileText className="h-3 w-3" /> Intro
        </button>
        <button className="flex items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-bold" style={{ color: "#B79CFF", border: `1px solid ${NEON.borderSoft}`, background: "rgba(9,14,26,0.6)" }} onClick={() => { onClose(); onInsert(at, "outro"); }} title="NON-CEQ · outro — the end card. Arrives with the Survive outro lockup staged; delete or restyle anything.">
          <FileText className="h-3 w-3" /> Outro
        </button>
        <span className="text-center text-[8px]" style={{ color: NEON.muted }}>Esc to cancel</span>
      </div>
    );
  }
  return (
    <div className="group relative flex h-2 shrink-0 items-center justify-center">
      <button
        className="pointer-events-auto grid h-4 w-4 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}`, zIndex: 5 }}
        onClick={() => onOpen(at)}
        title="Insert a frame here"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// (Contiguous run segments now come from film-runs.ts — the same grouping the
//  assign/fill-down actions reason about, so the rail can't drift from the write.)

export function SetFilmstrip({ items, qId, onSelect, onInsert, sel, onSelChange, actions, formulaNote }: {
  items: StripItem[];
  qId: string | null;
  onSelect: (id: string) => void;
  onInsert: (at: number, kind: FrameKind) => void;
  /** MULTI-SELECT (Lee): ctrl/⌘-click toggles one, shift-click takes the range from
   *  the last click. Drives the ⋮ menu's bulk actions. */
  sel?: Set<string>;
  onSelChange?: (next: Set<string>) => void;
  /** SET PROFILE (P6): the set's free-text creative intent, shown at the top. */
  formulaNote?: string;
  /** Bulk actions for the ⋮ menu — applied to the selection (or the open frame). */
  actions?: {
    shuffleChoices: () => void;
    star: () => void; boss: () => void; chaching: () => void; short: () => void; free: () => void;
    /** RUN LETTERS — stamp the selection (or the open frame) with a letter, or
     *  clear it with null. Optional so the strip renders before it's wired. */
    assignRun?: (letter: string | null) => void;
    /** Every unlettered frame inherits the letter above it — the 256-frame path. */
    fillDownRuns?: () => void;
    /** DISSECT (P5): open the moments editor for the open frame. */
    dissect?: () => void;
    /** SET PROFILE (P6): open the production-profile panel. */
    profile?: () => void;
    /** LAYOUT OPT-OUT: toggle "this frame ignores the set layout" on the selection. */
    ignoreLayout?: () => void;
    /** ANSWERS REVEALED (set-level): deal every CEQ with the correct choice
     *  already resolved — recap/review sets. */
    revealAnswers?: () => void;
    revealAnswersOn?: boolean;
    /** UPLOAD CLIP (Lee): attach one filmed clip covering the spine selection
     *  (or the open frame) — review lands on the Publish side. */
    uploadClip?: (file: File) => void;
    /** ARM UPLOADS (T2): takes that finish now bank against this selection. */
    /** Cycle a NON-CEQ frame between note / intro / outro. */
    frameMode?: () => void;
    armUploads?: () => void;
    armedLabel?: string;
  };
}) {
  const selected = sel ?? new Set<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  /** Which gap is showing its full-size chooser card (§5). One at a time; null = none. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const closeInsert = useCallback(() => setInsertAt(null), []);
  const anchorRef = useRef<string | null>(null); // shift-range origin
  const rowClick = (id: string, e: React.MouseEvent) => {
    if (!onSelChange) { onSelect(id); return; }
    const ids = items.map((it) => it.id);
    if (e.shiftKey && anchorRef.current) {
      const a = ids.indexOf(anchorRef.current); const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; onSelChange(new Set([...selected, ...ids.slice(lo, hi + 1)])); return; }
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id); else next.add(id);
      anchorRef.current = id;
      onSelChange(next);
      return;
    }
    // plain click = open the frame AND reset the selection to nothing
    anchorRef.current = id;
    if (selected.size) onSelChange(new Set());
    onSelect(id);
  };
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

  const currentRun = normRun(items.find((it) => it.id === qId)?.run);
  const segs = runSegments(items);
  const usedRuns = usedRunLetters(items);
  const nextRun = nextRunLetter(items);
  const dense = density >= 6; // mini-cards: shorthand + run + glyph, one line
  const rowH = `calc((100vh - 210px) / ${density})`;

  // student-facing numbering: CEQ frames only — notes are breath, not questions
  let ceqN = 0;
  return (
    <div className="flex w-48 shrink-0 border-r" style={{ borderColor: NEON.borderSoft, background: "rgba(0,0,0,0.18)" }}>
      {/* FORMULA NOTE (P6) — the set's creative intent, always in view while
          authoring. Display-only; edited in the Production profile panel. */}
      {formulaNote && (
        <div className="shrink-0 rounded px-1.5 py-1 text-[9px] italic leading-snug" style={{ color: "#FFD9A0", background: "rgba(252,163,17,0.08)", border: `1px solid rgba(252,163,17,0.25)` }} title="This set's formula (Production profile)">
          {formulaNote}
        </div>
      )}
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
        {/* STRIP MENU (Lee) — one ⋮ above the frames instead of a row of loose controls.
            Holds the density steps and every marker that used to be a text button in
            the bottom bar (★ boss / chaching / short / free), plus Shuffle choices.
            Markers apply to the SELECTION when there is one, else the open frame. */}
        <div className="relative flex shrink-0 items-center gap-1 px-1 pt-1">
          <button
            className="grid h-5 w-5 shrink-0 place-items-center rounded"
            style={{ color: menuOpen ? "#0B1322" : NEON.muted, background: menuOpen ? NEON.yellow : "transparent", border: `1px solid ${menuOpen ? NEON.yellow : NEON.borderSoft}` }}
            onClick={() => setMenuOpen((v) => !v)}
            title="Frame menu — density, shuffle choices, and the ★/boss/chaching/short markers"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {selected.size > 0 && (
            <button className="rounded px-1.5 text-[8.5px] font-black" style={{ color: "#0B1322", background: NEON.cyan }} onClick={() => onSelChange?.(new Set())} title="Clear the selection">
              {selected.size} selected ✕
            </button>
          )}
          {menuOpen && (<>
            <div className="fixed inset-0 z-[78]" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-0 top-7 z-[79] flex w-52 flex-col gap-1 rounded-xl p-2" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, boxShadow: "0 18px 44px -16px rgba(0,0,0,0.8)" }}>
              <div className="flex items-center gap-1">
                <span className="text-[8.5px] font-bold uppercase tracking-widest" style={{ color: NEON.muted }}>Density</span>
                <span className="ml-auto flex gap-0.5">
                  {DENSITY_STEPS.map((s) => (
                    <button key={s} className="rounded px-1.5 text-[9px] font-black tabular-nums" style={{ color: density === s ? "#0B1322" : NEON.muted, background: density === s ? NEON.yellow : "transparent", border: `1px solid ${density === s ? NEON.yellow : NEON.borderSoft}` }} onClick={() => setDensity(s)} title={`${s} frame${s === 1 ? "" : "s"} per screen`}>{s}</button>
                  ))}
                </span>
              </div>
              {actions && (<>
                <div className="my-0.5 h-px" style={{ background: NEON.borderSoft }} />
                <div className="text-[8.5px] font-bold uppercase tracking-widest" style={{ color: NEON.muted }}>
                  {selected.size > 0 ? `${selected.size} selected` : "This frame"}
                  <span className="ml-1 normal-case tracking-normal opacity-70">· ctrl/shift-click to pick</span>
                </div>
                <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10" style={{ color: NEON.yellow }} onClick={() => { setMenuOpen(false); actions.shuffleChoices(); }} title="Reorder each selected question's choices so the answer stops living at A. Chains and arrows follow their choice; “None of these” stays last.">
                  🔀 Shuffle choices
                </button>
                <div className="grid grid-cols-2 gap-1">
                  <button className="rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10" style={{ color: "#FFD23F", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.star(); }} title="Star — performer's note; inert for stitch/publish">★ Star</button>
                  <button className="rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.boss(); }} title="Boss card — fires the cram-launch cue on deal">👑 Boss</button>
                  <button className="rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.chaching(); }} title="Chaching on the correct-Enter (on by default)">💰 Chaching</button>
                  <button className="rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10" style={{ color: "#FF8B9E", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.short(); }} title="Flag as shorts-worthy — joins the Shorts queue">🎬 Short</button>
                  {actions.frameMode && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10" style={{ color: NEON.yellow }} onClick={() => { setMenuOpen(false); actions.frameMode!(); }} title="Cycle a NON-CEQ frame: note → intro → outro. Just a label and a starting point — every element on any frame is deletable, so you can always strip it bare and rebuild.">◑ Frame mode</button>}
                  {actions.armUploads && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10" style={{ color: actions.armedLabel ? "#0B1322" : "#B79CFF", background: actions.armedLabel ? "#B79CFF" : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.armUploads!(); }} title="ARM UPLOADS — every take you finish (F9 stop in OBS) banks against these frames automatically. Re-arm to replace the target.">🎯 Arm uploads{actions.armedLabel ? " · " + actions.armedLabel : ""}</button>}
                  {actions.uploadClip && (<>
                    <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10" style={{ color: "#3BF5A0" }} onClick={() => { setMenuOpen(false); uploadRef.current?.click(); }} title="Upload ONE clip that covers the selected frames (a run filmed in one take) — or just the open frame. It attaches to the first frame of the span; review it on the Publish side.">{"⬆ Upload clip" + ((sel?.size ?? 0) > 1 ? " · " + sel!.size + " frames" : "")}</button>
                    <input ref={uploadRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) actions.uploadClip!(f); }} />
                  </>)}
                  {actions.revealAnswers && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10" style={{ color: actions.revealAnswersOn ? "#0B1322" : "#3BF5A0", background: actions.revealAnswersOn ? "#3BF5A0" : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.revealAnswers!(); }} title="SET-LEVEL: every CEQ deals with its correct choice already resolved-green (silent) — for recap/review sets. Toggle any time.">✓ Answers revealed{actions.revealAnswersOn ? " · ON" : ""}</button>}
                  {actions.ignoreLayout && <button className="rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10" style={{ color: "#8FD3FF", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.ignoreLayout!(); }} title="This frame ignores the set layout — the base frame never places it, apply-to-all skips it. Its own hand-placed geometry governs.">📐 Ignore set layout</button>}
                  {actions.profile && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10" style={{ color: NEON.cyan }} onClick={() => { setMenuOpen(false); actions.profile!(); }} title="Per-set production profile — style, clip mapping, note budget, callout defaults, formula note, templates">⚙ Production profile…</button>}
                  {actions.dissect && <button className="rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10" style={{ color: "#B79CFF", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.dissect!(); }} title="Dissect — plan this CEQ as a SEQUENCE of short surgical clips (setup / the trap / resolution…) instead of one run-covered take">🔬 Dissect…</button>}
                  <button className="col-span-2 rounded px-1.5 py-1 text-[10px] font-bold hover:bg-white/10" style={{ color: "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setMenuOpen(false); actions.free(); }} title="Include in the FREE cut">🆓 Free</button>
                </div>
                {/* RUN LETTERS — a run = the span you capture in ONE take. Tap a letter
                    already used in this set, take the next one, or clear. Fill down
                    finishes the set from the split points you've marked. */}
                {(actions.assignRun || actions.fillDownRuns) && (<>
                  <div className="my-0.5 h-px" style={{ background: NEON.borderSoft }} />
                  <div className="text-[8.5px] font-bold uppercase tracking-widest" style={{ color: NEON.muted }}>
                    Run letter
                    <span className="ml-1 normal-case tracking-normal opacity-70">· one take</span>
                  </div>
                  {actions.assignRun && (
                    <div className="flex flex-wrap gap-1">
                      {usedRuns.map((L) => (
                        <button
                          key={L}
                          className="rounded px-1.5 py-0.5 text-[10px] font-black hover:bg-white/10"
                          style={{ color: currentRun === L ? "#0B1322" : NEON.cyan, background: currentRun === L ? NEON.cyan : "transparent", border: `1px solid ${currentRun === L ? NEON.cyan : NEON.borderSoft}` }}
                          onClick={() => { setMenuOpen(false); actions.assignRun?.(L); }}
                          title={`Film these frames as part of run ${L}`}
                        >{L}</button>
                      ))}
                      <button
                        className="rounded px-1.5 py-0.5 text-[10px] font-black hover:bg-white/10"
                        style={{ color: NEON.yellow, border: `1px dashed ${NEON.borderSoft}` }}
                        onClick={() => { setMenuOpen(false); actions.assignRun?.(nextRun); }}
                        title={`Start a new take: run ${nextRun}`}
                      >＋ {nextRun}</button>
                      <button
                        className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold hover:bg-white/10"
                        style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}
                        onClick={() => { setMenuOpen(false); actions.assignRun?.(null); }}
                        title="Remove the run letter — back to unlettered"
                      >✕ Clear</button>
                    </div>
                  )}
                  {actions.fillDownRuns && (
                    <button
                      className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/10"
                      style={{ color: NEON.cyan }}
                      onClick={() => { setMenuOpen(false); actions.fillDownRuns?.(); }}
                      title="Every unlettered frame takes the letter of the frame above it — mark the split points, then finish the set in one click. A set with no letters at all becomes one run: A."
                    >⤓ Fill down the set</button>
                  )}
                </>)}
              </>)}
            </div>
          </>)}
        </div>
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-1" onClick={(e) => { if (insertAt !== null && e.target === e.currentTarget) setInsertAt(null); }}>
          <InsertGap at={0} open={insertAt === 0} onOpen={setInsertAt} onClose={closeInsert} onInsert={onInsert} dense={dense} rowH={rowH} />
          {items.map((it, i) => {
            if (!it.noteOnly) ceqN += 1;
            const active = it.id === qId;
            const sameRun = !active && currentRun !== null && normRun(it.run) === currentRun;
            const label = (it.shorthand || it.stem || (it.noteOnly ? "Note" : "Question")).trim();
            return (
              <div key={it.id} className="flex shrink-0 flex-col" data-strip-frame={it.id}>
                <button
                  className="relative flex w-full flex-col justify-center gap-0.5 rounded-lg px-1.5 py-1 text-left"
                  style={{
                    minHeight: dense ? undefined : rowH,
                    height: dense ? rowH : undefined,
                    // SELECTED (bulk ops) reads as a cyan ring — distinct from the gold
                    // "currently open" ring, since a frame can be both at once.
                    // OPEN frame = a SUBTLE amber glow; SELECTED = the strong highlight
                    // (selection wins when both) — selection is the deliberate act now
                    // (frame copy/paste, bulk ops), so it gets the visual weight.
                    border: `1px solid ${selected.has(it.id) ? "rgba(79,209,224,0.85)" : active ? "rgba(252,163,17,0.4)" : NEON.borderSoft}`,
                    boxShadow: selected.has(it.id) ? "0 0 0 1.5px rgba(79,209,224,0.4)" : active ? "0 0 10px rgba(252,163,17,0.35)" : undefined,
                    background: selected.has(it.id) ? "rgba(79,209,224,0.12)" : active ? "rgba(252,163,17,0.05)" : "rgba(9,14,26,0.5)",
                    opacity: active || selected.has(it.id) ? 1 : sameRun ? 0.8 : 0.55,
                    transition: "height 220ms cubic-bezier(0.2,0.7,0.3,1), min-height 220ms cubic-bezier(0.2,0.7,0.3,1), opacity 150ms ease",
                  }}
                  onClick={(e) => { if (insertAt !== null) setInsertAt(null); rowClick(it.id, e); }}
                  title={it.stem || label}
                >
                  {/* same-run bracket — the shape of the take you're inside */}
                  {sameRun && <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded" style={{ background: NEON.cyan, opacity: 0.7 }} title={`Run ${it.run} — same take as the current frame`} />}
                  <div className="flex items-center gap-1">
                    {/* RAIL CLEANUP (film-run fixes §3.1): the "?" glyph before Q1/Q2/… is gone —
                        "Q3" already says it is a question. The note icon stays: it is the only
                        thing that distinguishes a note frame from a numbered one. */}
                    {it.noteOnly && <FileText className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} />}
                    <span className="text-[9px] font-bold tabular-nums" style={{ color: active ? NEON.yellow : NEON.muted }}>
                      {it.noteOnly ? (it.frameMode ?? "note") : `Q${ceqN}`}
                    </span>
                    {it.run && <span className="rounded px-1 text-[8.5px] font-black uppercase" style={{ color: "#0B1322", background: NEON.cyan }} title={`Run ${it.run} — filmed in one take`}>{it.run}</span>}
                    {dense && <span className="min-w-0 flex-1 truncate text-[9.5px] leading-tight" style={{ color: active ? NEON.text : "rgba(230,236,255,0.75)" }}>{label}</span>}
                    <span className="ml-auto flex shrink-0 items-center gap-0.5">
                      {it.starred && <Star className="h-2.5 w-2.5" style={{ color: "#FFD23F", fill: "#FFD23F" }} />}
                      {it.clips > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3BF5A0" }} title={`${it.clips} clip${it.clips === 1 ? "" : "s"}`} />}
                      {/* FREE badge removed (film-run fixes §3.2) — free-cut membership is a
                          publishing fact, and the PUBLISH tab is where it belongs. `it.free`
                          still feeds the ⋮ menu's Free toggle. */}
                    </span>
                  </div>
                  {!dense && <span className={density === 1 ? "text-[13px] leading-snug" : "line-clamp-2 text-[10px] leading-tight"} style={{ color: active ? NEON.text : "rgba(230,236,255,0.75)" }}>{label}</span>}
                </button>
                <InsertGap at={i + 1} open={insertAt === i + 1} onOpen={setInsertAt} onClose={closeInsert} onInsert={onInsert} dense={dense} rowH={rowH} />
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
