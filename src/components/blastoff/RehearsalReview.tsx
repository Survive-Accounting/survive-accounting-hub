// REHEARSAL REVIEW — the overlay Film opens when a rehearsal round ends (BlastOffCapture owns the
// rounds: capture/rehearsal-rounds.ts). Turns each slide's raw transcript into two lines
// (rehearsal-brief.ts): what Lee said, cleaned, and a suggested improvement — with the
// talkthrough notes for that card (rehearsal-context.ts) and past kept lines riding along as
// real style examples. Lee picks one, or types his own, and it lands on frame.prompter.
//
// 2026-09-06, second pass: this used to be its own full-screen route/component with a private
// walk stage that redrew the slide and ran its own spacebar handling — a second, parallel copy
// of the capture surface Lee already knows. Lee: "I can't see the teleprompter or understand how
// it works... I'd prefer to see it somewhere on film... flip on teleprompter, then I record like
// I normally would. Same pop out window." So the walk stage is gone — BlastOffCapture itself now
// owns rehearsing (dictation + segments), and this file is only the review overlay it opens on
// top of the SAME capture surface, in the SAME window (popped out or not) once Lee is ready.
//
// 2026-09-06, third pass — ONE SLIDE AT A TIME. Lee: "Rehearsal review: it should just show
// each slide one at a time, suggested prompt. I think cleaned up version of 'what you said' then
// Suggested improvement. I pick either or write mine in." So the long scroll of cards is gone;
// it's one slide, two cards and a textarea, and any pick advances. The 1–5 rating, the comment
// and the revise-with-a-note input are gone with it ("one click"); edit = the textarea. After
// the last slide, the canned intro/bio/outro picker with ONE "Keep these", then "Done → round 2"
// (after round 1) or "Done → film" (after round 2).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { startTT, ttState } from "@/components/canvas/talkthrough-sync";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { runMicro } from "@/lib/talkthrough.functions";
import { logTeleprompterFeedback, topRehearsalExamples, type RehearsalAction } from "@/lib/rehearsal.functions";
import { logCannedLineUse, recentCannedLineUses } from "@/lib/canned-lines.functions";

import { cannedLinesFor, cannedWarnings, pickCannedLine, type CannedLine, type CannedSlot } from "./canned-lines";
import { isCannedFrameKind, REVIEW_ROUNDS } from "./capture/rehearsal-rounds";
import { FRAME_LABEL, insertStem, type BlastFrame } from "./plan";
import { buildRehearsalMessages, parseRehearsalSuggestions, type StyleExample } from "./rehearsal-brief";
import { rehearsalContextFor } from "./rehearsal-context";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", INK = "#05070D", MINT = "#3BF5A0", ORANGE = "#FF9F43";

function slideContextFor(f: BlastFrame, ceqById: Map<string, { stem: string }>): string {
  if (f.kind === "ceq" && f.ceqId) return ceqById.get(f.ceqId)?.stem ?? "";
  return insertStem(f) || (f.bullets ?? []).join("; ") || "";
}

interface SlideSuggestion { status: "loading" | "ready" | "error"; said: string; suggested: string; error?: string }

/** `onClose(done)` — "← back to rehearsal" (false) just closes; the Done button (true) closes
 *  too, having committed everything Lee picked; the round itself already ended when this
 *  opened, so both are the same close — the flag only says which button it was. */
export function RehearsalReview({ set, frames, ceqById, segments, round, initialPicks, onCommitLine, onClose }: {
  set: BoothSetInfo; frames: readonly BlastFrame[]; ceqById: Map<string, { stem: string }>;
  /** THIS round's transcript, per frame id. */
  segments: Record<string, string>;
  round: number;
  /** The SAME canned suggestions BlastOffCapture already picked and showed Lee while he was
   *  rehearsing — seeded here so Review preselects the exact line he practiced with, never a
   *  second, different roll. Absent slot → the picker rolls its own (e.g. this overlay opened
   *  before that fetch resolved). */
  initialPicks?: Partial<Record<CannedSlot, CannedLine>>;
  onCommitLine: (frameId: string, line: string) => void;
  onClose: (done: boolean) => void;
}) {
  // Intro/outro NEVER go through the AI suggester — Lee: "teleprompter really only needs to
  // generate for non intro/outro slides." They're canned (CannedPickerSection below), even if
  // Lee happened to talk over them while walking through in rehearsal mode.
  const candidates = useMemo(() => frames.filter((f) => !isCannedFrameKind(f.kind) && (segments[f.id] ?? "").trim()), [frames, segments]);
  // null = still fetching. The style examples are worth one quick server round-trip BEFORE the
  // model calls go out — firing without them would make the whole feedback loop decorative.
  const [examples, setExamples] = useState<StyleExample[] | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, SlideSuggestion>>({});
  /** What Lee kept this session, per frame — "✓ kept: …" and re-pickable. */
  const [kept, setKept] = useState<Record<string, string>>({});
  const [at, setAt] = useState(0);
  const fired = useRef(new Set<string>());

  useEffect(() => { topRehearsalExamples().then(setExamples).catch(() => setExamples([])); }, []);
  // The talkthrough store is local-first and idempotent to start (same call v3.index.tsx makes);
  // what Lee said about each card in Step 1 is read straight out of it below.
  useEffect(() => { startTT(); }, []);

  const suggest = useCallback(async (f: BlastFrame) => {
    setSuggestions((s) => ({ ...s, [f.id]: { status: "loading", said: s[f.id]?.said ?? "", suggested: s[f.id]?.suggested ?? "" } }));
    try {
      const m = buildRehearsalMessages({
        slideLabel: FRAME_LABEL[f.kind], slideContext: slideContextFor(f, ceqById),
        rawTranscript: segments[f.id] ?? "", talkthrough: rehearsalContextFor(ttState().doc, set.id, f.kind === "ceq" ? f.ceqId : null),
        styleExamples: examples ?? [],
      });
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 400 } });
      const lines = parseRehearsalSuggestions(r.text);
      if (!lines) throw new Error("The lines didn't come back clean — try again.");
      setSuggestions((s) => ({ ...s, [f.id]: { status: "ready", ...lines } }));
    } catch (e) {
      setSuggestions((s) => ({ ...s, [f.id]: { status: "error", said: s[f.id]?.said ?? "", suggested: s[f.id]?.suggested ?? "", error: e instanceof Error ? e.message : String(e) } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqById, segments, examples, set.id]);

  // Every slide at once, the moment the overlay opens (well — the moment the examples are in,
  // one quick round-trip): Lee shouldn't wait on one slide before seeing the next.
  useEffect(() => {
    if (examples === null) return;
    for (const f of candidates) if (!fired.current.has(f.id)) { fired.current.add(f.id); void suggest(f); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, examples]);

  const m = candidates.length;
  const onLast = at >= m;
  const frame = onLast ? null : candidates[at];
  const next = useCallback(() => setAt((v) => Math.min(m, v + 1)), [m]);
  const prev = useCallback(() => setAt((v) => Math.max(0, v - 1)), []);

  // ← / → walk the slides. Escape is BlastOffCapture's (it closes this overlay first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const commit = useCallback((f: BlastFrame, line: string, action: RehearsalAction) => {
    const finalLine = line.trim();
    if (!finalLine) return;
    onCommitLine(f.id, finalLine);
    setKept((k) => ({ ...k, [f.id]: finalLine }));
    void logTeleprompterFeedback({ data: {
      setId: set.id, frameId: f.id, rawTranscript: segments[f.id] ?? "", suggestedLine: suggestions[f.id]?.suggested ?? "",
      finalLine, action, who: getAdminWho(),
    } });
    next();
  }, [onCommitLine, set.id, segments, suggestions, next]);

  const doneLabel = round < REVIEW_ROUNDS ? `Done → round ${round + 1}` : "Done → film";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: INK, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "24px 20px 60px", overflowY: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🎙 Rehearsal review</h1>
          <span style={{ fontSize: 12.5, color: MUTED }}>round {round} · {onLast ? "done" : `slide ${at + 1} of ${m}`}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => onClose(false)} style={btn()}>← back to rehearsal</button>
        </div>

        {frame ? (
          <SlideScreen key={frame.id} frame={frame} context={slideContextFor(frame, ceqById)} raw={segments[frame.id] ?? ""} suggestion={suggestions[frame.id]}
            kept={kept[frame.id] ?? null} first={at === 0} last={at === m - 1}
            onPick={(line, action) => commit(frame, line, action)} onRetry={() => void suggest(frame)} onSkip={next} onPrev={prev} onNext={next} />
        ) : (
          <>
            {m === 0 && <p style={{ color: MUTED, fontSize: 13.5, marginTop: 20 }}>Nothing was said on a card slide this round — the canned lines below still stand.</p>}
            {m > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>Kept this round — click one to change it</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {candidates.map((f, k) => (
                    <button key={f.id} type="button" onClick={() => setAt(k)}
                      style={{ ...btn(kept[f.id] ? CREAM : MUTED), textAlign: "left", display: "flex", gap: 8, alignItems: "baseline", fontWeight: 500 }}>
                      <span style={{ color: kept[f.id] ? MINT : MUTED, fontWeight: 800, fontSize: 11 }}>{kept[f.id] ? "✓" : "–"}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD, whiteSpace: "nowrap" }}>{FRAME_LABEL[f.kind]}</span>
                      <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kept[f.id] ?? "skipped"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <CannedPickerSection setId={set.id} frames={frames} initialPicks={initialPicks} onCommitLine={onCommitLine} />
            <div style={{ marginTop: 22, display: "flex", gap: 8, alignItems: "center" }}>
              {m > 0 && <button type="button" onClick={prev} style={btn()}>← back a slide</button>}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => onClose(true)} style={{ ...btn(GOLD), fontSize: 14, padding: "8px 16px" }}>{doneLabel}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** ONE slide: what was said (collapsed), the two cards, the textarea. Keyed by frame id from
 *  the parent so the draft never carries over to the next slide. */
function SlideScreen({ frame, context, raw, suggestion, kept, first, last, onPick, onRetry, onSkip, onPrev, onNext }: {
  frame: BlastFrame; context: string; raw: string; suggestion: SlideSuggestion | undefined; kept: string | null; first: boolean; last: boolean;
  onPick: (line: string, action: RehearsalAction) => void; onRetry: () => void; onSkip: () => void; onPrev: () => void; onNext: () => void;
}) {
  const [draft, setDraft] = useState("");
  const ready = suggestion?.status === "ready";

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>{FRAME_LABEL[frame.kind]}</span>
        {context && <span style={{ fontSize: 12, color: MUTED }}>{context.length > 160 ? `${context.slice(0, 160)}…` : context}</span>}
      </div>
      {kept && <div style={{ marginTop: 8, fontSize: 12.5, color: MINT }}>✓ kept: <span style={{ color: CREAM }}>{kept}</span> <span style={{ color: MUTED }}>— pick again to change it</span></div>}
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>what you said</summary>
        <div style={{ marginTop: 4, fontSize: 12, color: MUTED, lineHeight: 1.4 }}>{raw}</div>
      </details>

      {suggestion?.status === "loading" && <div style={{ marginTop: 14, fontSize: 13, color: MUTED }}>Prepping the lines…</div>}
      {suggestion?.status === "error" && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: ORANGE, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {suggestion.error} <button type="button" onClick={onRetry} style={btn()}>Try again</button>
        </div>
      )}
      {ready && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {suggestion.said && <LineCard title="What you said, cleaned" line={suggestion.said} onUse={() => onPick(suggestion.said, "said")} />}
          <LineCard title="Suggested" line={suggestion.suggested} onUse={() => onPick(suggestion.suggested, "suggested")} />
        </div>
      )}

      <div style={{ marginTop: 12, border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>or write your own</div>
        <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="type the line exactly how you'd say it"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && draft.trim()) { e.preventDefault(); onPick(draft, "edited"); } }}
          style={{ marginTop: 6, width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "6px 8px", color: CREAM, font: "inherit", fontSize: 13.5, resize: "vertical" }} />
        <button type="button" disabled={!draft.trim()} onClick={() => onPick(draft, "edited")} style={{ ...btn(MINT), marginTop: 6, opacity: draft.trim() ? 1 : 0.5 }}>✓ Keep mine</button>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={onPrev} disabled={first} style={{ ...btn(), opacity: first ? 0.4 : 1 }}>←</button>
        <button type="button" onClick={onNext} style={btn()}>→</button>
        <span style={{ fontSize: 11, color: MUTED }}>arrow keys too</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onSkip} style={btn()}>{last ? "Skip → canned lines" : "Skip"}</button>
      </div>
    </div>
  );
}

function LineCard({ title, line, onUse }: { title: string; line: string; onUse: () => void }) {
  return (
    <div style={{ border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.4 }}>{line}</div>
      <button type="button" onClick={onUse} style={{ ...btn(MINT), marginTop: 8 }}>✓ Use this</button>
    </div>
  );
}

/** THE CANNED INTRO/OUTRO (2026-09-06). Lee: "much faster to have AI pick it versus me pick it."
 *  Always shown — unlike the AI candidates, it never waits on Lee having said anything, since
 *  these lines are fixed and picking one is instant. "Intro is two slides too" — the same text
 *  lands on BOTH the open and intro frames when one exists, so the prompter reads correctly
 *  whichever of the two is up when the take rolls; usage is still logged once per slot.
 *
 *  Third pass: ONE "Keep these" commits every present slot at once (the per-slot dropdown still
 *  lets Lee change one first) — one click, not three. */
function CannedPickerSection({ setId, frames, initialPicks, onCommitLine }: {
  setId: string; frames: readonly BlastFrame[]; initialPicks?: Partial<Record<CannedSlot, CannedLine>>;
  onCommitLine: (frameId: string, line: string) => void;
}) {
  const openFrame = useMemo(() => frames.find((f) => f.kind === "open"), [frames]);
  const introFrame = useMemo(() => frames.find((f) => f.kind === "intro"), [frames]);
  const outroFrame = useMemo(() => frames.find((f) => f.kind === "outro"), [frames]);
  // "I'm planning to try the bio in different places" (Lee) — found by kind, not position, so
  // moving it around the running order never breaks this picker.
  const bioFrame = useMemo(() => frames.find((f) => f.kind === "bio"), [frames]);
  // Seeded from BlastOffCapture's own pick when it has one — the exact line Lee already saw (and
  // may have rehearsed against) in the prompter panel, never a second, independent roll here.
  const [selected, setSelected] = useState<Partial<Record<CannedSlot, string>>>(() => ({ intro: initialPicks?.intro?.id, bio: initialPicks?.bio?.id, outro: initialPicks?.outro?.id }));
  const [kept, setKept] = useState(false);
  const select = useCallback((slot: CannedSlot, id: string) => setSelected((s) => ({ ...s, [slot]: id })), []);

  const slots: { slot: CannedSlot; frameIds: string[] }[] = [
    ...(openFrame || introFrame ? [{ slot: "intro" as const, frameIds: [openFrame?.id, introFrame?.id].filter((x): x is string => !!x) }] : []),
    ...(bioFrame ? [{ slot: "bio" as const, frameIds: [bioFrame.id] }] : []),
    ...(outroFrame ? [{ slot: "outro" as const, frameIds: [outroFrame.id] }] : []),
  ];
  if (slots.length === 0) return null;

  const keepAll = () => {
    for (const { slot, frameIds } of slots) {
      const line = cannedLinesFor(slot).find((l) => l.id === selected[slot]);
      if (!line) continue;
      for (const fid of frameIds) onCommitLine(fid, line.text);
      void logCannedLineUse({ data: { setId, slot, lineId: line.id } });
    }
    setKept(true);
  };

  return (
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>Canned — picked for you, change one if you want</div>
      {slots.map(({ slot }) => <CannedSlotRow key={slot} slot={slot} selectedId={selected[slot] ?? null} onSelect={(id) => select(slot, id)} kept={kept} />)}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={keepAll} disabled={kept} style={{ ...btn(MINT), opacity: kept ? 0.6 : 1 }}>{kept ? "✓ kept" : "✓ Keep these"}</button>
        {kept && <button type="button" onClick={() => setKept(false)} style={btn()}>change one</button>}
      </div>
    </div>
  );
}

function CannedSlotRow({ slot, selectedId, onSelect, kept }: { slot: CannedSlot; selectedId: string | null; onSelect: (id: string) => void; kept: boolean }) {
  const pool = useMemo(() => cannedLinesFor(slot), [slot]);
  const [recent, setRecent] = useState<string[] | null>(null);

  useEffect(() => {
    let live = true;
    recentCannedLineUses({ data: { slot } }).then((r) => {
      if (!live) return;
      setRecent(r);
      // The seed already answers "what to show" when BlastOffCapture supplied one — this fetch
      // is still needed for `recent` (the warnings below), just not for re-picking a selection.
      if (!selectedId) { const p = pickCannedLine(pool, slot, r)?.id ?? pool[0]?.id; if (p) onSelect(p); }
    }).catch(() => { if (live) { setRecent([]); if (!selectedId && pool[0]) onSelect(pool[0].id); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  const selected: CannedLine | null = pool.find((l) => l.id === selectedId) ?? null;
  const warnings = recent && selectedId ? cannedWarnings(selectedId, recent) : [];

  return (
    <div style={{ border: `1px solid ${kept ? MINT + "55" : EDGE}`, borderRadius: 12, padding: "12px 14px", opacity: kept ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>{slot === "intro" ? "Intro" : slot === "outro" ? "Outro" : "Bio"}</span>
        <select value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value)} disabled={kept}
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "4px 8px", color: CREAM, font: "inherit", fontSize: 12.5 }}>
          {pool.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
      </div>
      {selected && <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.4 }}>{selected.text}</div>}
      {warnings.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: ORANGE }}>{warnings.map((w) => `⚠ ${w}`).join("  ")}</div>
      )}
    </div>
  );
}

function btn(color = CREAM): React.CSSProperties {
  return { font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "transparent", color, cursor: "pointer" };
}
