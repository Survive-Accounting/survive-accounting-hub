// REHEARSAL REVIEW — the overlay Film opens when a rehearsal round ends (BlastOffCapture owns the
// rounds: capture/rehearsal-rounds.ts). Turns each slide's raw transcript into two lines
// (rehearsal-brief.ts): what Lee said, cleaned, and a suggested improvement — with the
// talkthrough notes for that card (rehearsal-context.ts) and past kept lines riding along as
// real style examples. Lee picks one, or edits the suggestion in place, and it lands on
// frame.prompter.
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
// it's one slide, two cards, and any pick advances. After the last slide, the canned
// intro/bio/outro picker with ONE "Keep these", then "Done → round 2" (after round 1) or
// "Done → film" (after round 2).
//
// 2026-09-07, fourth pass — THE SLIDE, TALKING, EDITING IN PLACE. Lee:
//   · "With rehearsal review, I want to actually see the slide alongside these suggested lines."
//     → the actual slide, drawn by PhoneFrame at ~300px on the left; the lines on the right.
//   · "let's allow typing sure, but I want to by default speak things out… where I just click it
//     and start talking, it dictates it out… can the AI be following along in the background so
//     that the second I'm done talking (or even WHILE I'm talking) it will be suggesting the best
//     version? … I can then just say oh wait, yeah it's got it, use that (CLICK)" → "🎙 Say it"
//     (or T): dictation streams into a "your take" line and the brief re-runs every ~2.5 s of new
//     speech, one call in flight at a time, so "Suggested" updates live.
//   · "we're not writing our own, we're talking about it. BUT, if I want to write one in, I can
//     just edit the suggested one." → the "or write your own" box is gone; the Suggested text is
//     editable in place (click → Enter keeps, Escape cancels).
//   · "'The lines didn't come back clean. try again.' This was on the memorize this one? Not
//     sure why?" → a parse failure retries once on its own before the error shows, and the
//     error names the slide kind.
//   · The brief now sees THE CARD (stem + choices, correct one marked) so a suggestion has to
//     teach — see rehearsal-brief.ts — and returns keywords (→ frame.prompterKeys, the
//     teleprompter's scan mode) and a transition (→ frame.prompterTransition).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { isTypingTarget } from "@/components/canvas/film-lock";
import { startTT, ttState } from "@/components/canvas/talkthrough-sync";
import type { BoothCeq, BoothSetInfo } from "@/lib/talkthrough.functions";
import { runMicro } from "@/lib/talkthrough.functions";
import { logTeleprompterFeedback, topRehearsalExamples, type RehearsalAction } from "@/lib/rehearsal.functions";
import { logCannedLineUse, recentCannedLineUses } from "@/lib/canned-lines.functions";
import { useDictation } from "@/lib/use-dictation";

import { cannedLinesFor, cannedWarnings, pickCannedLine, type CannedLine, type CannedSlot } from "./canned-lines";
import { isCannedFrameKind, REVIEW_ROUNDS } from "./capture/rehearsal-rounds";
import type { SlideLayout } from "./layout";
import { PhoneFrame } from "./PhoneFrame";
import { FRAME_LABEL, type BlastFrame } from "./plan";
import {
  buildKeywordMessages, buildRehearsalMessages, parseKeywords, parseRehearsalSuggestions,
  type RehearsalRegister, type StyleExample,
} from "./rehearsal-brief";
import { nextSlideFor, rehearsalCardFor, rehearsalContextFor, slideContextFor } from "./rehearsal-context";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", INK = "#05070D", MINT = "#3BF5A0", ORANGE = "#FF9F43";

/** The slide drawn beside the lines — Lee: "I want to actually see the slide alongside". */
const SLIDE_W = 300;
/** How often the brief re-runs while Lee is talking (ms of new final speech). */
export const LIVE_BRIEF_EVERY_MS = 2500;

interface SlideSuggestion {
  status: "loading" | "ready" | "error";
  said: string; suggested: string;
  register: RehearsalRegister; transition: string | null; keywords: string[];
  /** The transcript these lines were made from — the round's, or the spoken take. */
  raw: string;
  error?: string;
}
const EMPTY: SlideSuggestion = { status: "loading", said: "", suggested: "", register: "teach", transition: null, keywords: [], raw: "" };

/** `onClose(done)` — "← back to rehearsal" (false) just closes; the Done button (true) closes
 *  too, having committed everything Lee picked; the round itself already ended when this
 *  opened, so both are the same close — the flag only says which button it was. */
export function RehearsalReview({ set, frames, ceqById, segments, round, initialPicks, layout = "pass1", onCommitLine, onClose }: {
  set: BoothSetInfo; frames: readonly BlastFrame[]; ceqById: Map<string, BoothCeq>;
  /** THIS round's transcript, per frame id. */
  segments: Record<string, string>;
  round: number;
  /** The SAME canned suggestions BlastOffCapture already picked and showed Lee while he was
   *  rehearsing — seeded here so Review preselects the exact line he practiced with, never a
   *  second, different roll. Absent slot → the picker rolls its own (e.g. this overlay opened
   *  before that fetch resolved). */
  initialPicks?: Partial<Record<CannedSlot, CannedLine>>;
  /** The set's slide template (layout.ts) — so the slide drawn here is the one that films. */
  layout?: SlideLayout;
  /** The kept line — and, since 2026-09-07, its keywords (frame.prompterKeys) and the hand-off
   *  (frame.prompterTransition). Both optional so a two-arg caller keeps working; it just
   *  won't write them. */
  onCommitLine: (frameId: string, line: string, keys?: string[], transition?: string) => void;
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
  const keptRef = useRef<Record<string, string>>({});
  const [at, setAt] = useState(0);
  const fired = useRef(new Set<string>());
  // ONE CALL IN FLIGHT PER SLIDE while Lee talks: a newer take that arrives mid-call waits as
  // `pending` and runs the moment the call lands — and the landed result is dropped as stale
  // when a newer take is waiting, so "Suggested" only ever shows the newest speech.
  const inFlight = useRef<Record<string, boolean>>({});
  const pending = useRef<Record<string, string | undefined>>({});
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => { topRehearsalExamples().then(setExamples).catch(() => setExamples([])); }, []);
  // The talkthrough store is local-first and idempotent to start (same call v3.index.tsx makes);
  // what Lee said about each card in Step 1 is read straight out of it below.
  useEffect(() => { startTT(); }, []);

  const suggestRef = useRef<(f: BlastFrame, raw?: string) => Promise<void>>(async () => {});
  const suggest = useCallback(async (f: BlastFrame, rawOverride?: string) => {
    const raw = (rawOverride ?? segments[f.id] ?? "").trim();
    if (!raw) return;
    if (inFlight.current[f.id]) { pending.current[f.id] = raw; return; }
    inFlight.current[f.id] = true;
    setSuggestions((s) => ({ ...s, [f.id]: { ...(s[f.id] ?? EMPTY), status: "loading", error: undefined } }));
    try {
      const m = buildRehearsalMessages({
        slideLabel: FRAME_LABEL[f.kind], slideContext: slideContextFor(f, ceqById),
        card: rehearsalCardFor(f, ceqById), nextSlide: nextSlideFor(frames, f, ceqById),
        rawTranscript: raw, talkthrough: rehearsalContextFor(ttState().doc, set.id, f.kind === "ceq" ? f.ceqId : null),
        styleExamples: examples ?? [],
      });
      // RETRY ONCE, QUIETLY (2026-09-07). Lee, on the error showing up on a "memorize this":
      // "Not sure why?" — a one-off unparseable answer is the model's problem, not his; only a
      // second miss surfaces, and then it says WHICH slide.
      let lines = null;
      for (let attempt = 0; attempt < 2 && !lines; attempt++) {
        const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 500 } });
        lines = parseRehearsalSuggestions(r.text);
      }
      if (!lines) throw new Error(`The lines for this "${FRAME_LABEL[f.kind]}" slide didn't come back clean, twice — try again.`);
      if (!alive.current) return;
      // A newer take is already waiting → this answer is stale; the finally block runs the new one.
      if (!pending.current[f.id]) setSuggestions((s) => ({ ...s, [f.id]: { status: "ready", ...lines, raw } }));
    } catch (e) {
      if (alive.current) setSuggestions((s) => ({ ...s, [f.id]: { ...(s[f.id] ?? EMPTY), status: "error", error: e instanceof Error ? e.message : String(e) } }));
    } finally {
      inFlight.current[f.id] = false;
      const p = pending.current[f.id];
      pending.current[f.id] = undefined;
      if (p && alive.current) void suggestRef.current(f, p);
    }
  }, [ceqById, segments, examples, set.id, frames]);
  suggestRef.current = suggest;

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

  // ← / → walk the slides. Escape is BlastOffCapture's (it closes this overlay first) — except
  // while Lee is talking, when SlideScreen catches it first to stop the dictation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget()) return;
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const commit = useCallback(async (f: BlastFrame, line: string, action: RehearsalAction) => {
    const finalLine = line.trim();
    if (!finalLine) return;
    const sug = suggestions[f.id];
    const transition = sug?.transition ?? undefined;
    // The model's keywords belong to the line it wrote; a line Lee said or edited gets its own
    // below, after the pick has already landed — the pick never waits on a second call.
    const knownKeys = action === "suggested" && sug?.keywords.length ? sug.keywords : undefined;
    onCommitLine(f.id, finalLine, knownKeys, transition);
    keptRef.current[f.id] = finalLine;
    setKept((k) => ({ ...k, [f.id]: finalLine }));
    void logTeleprompterFeedback({ data: {
      setId: set.id, frameId: f.id, rawTranscript: sug?.raw || segments[f.id] || "", suggestedLine: sug?.suggested ?? "",
      finalLine, action, who: getAdminWho(),
    } });
    next();
    if (knownKeys) return;
    try {
      const km = buildKeywordMessages(finalLine);
      const r = await runMicro({ data: { system: km.system, user: km.user, maxOutput: 120 } });
      const keys = parseKeywords(r.text);
      // Only if this is still the line he kept — a re-pick in the meantime wins.
      if (keys.length && alive.current && keptRef.current[f.id] === finalLine) onCommitLine(f.id, finalLine, keys, transition);
    } catch { /* the line is kept either way; the prompter just shows lines for it */ }
  }, [onCommitLine, set.id, segments, suggestions, next]);

  const doneLabel = round < REVIEW_ROUNDS ? `Done → round ${round + 1}` : "Done → film";
  const frameIndex = frame ? frames.findIndex((x) => x.id === frame.id) : -1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: INK, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "24px 20px 60px", overflowY: "auto" }}>
      <div style={{ maxWidth: frame ? 980 : 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🎙 Rehearsal review</h1>
          <span style={{ fontSize: 12.5, color: MUTED }}>round {round} · {onLast ? "done" : `slide ${at + 1} of ${m}`}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => onClose(false)} style={btn()}>← back to rehearsal</button>
        </div>

        {frame ? (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginTop: 18, flexWrap: "wrap" }}>
            {/* THE SLIDE ITSELF — the same PhoneFrame that films, not a summary of it. */}
            <div style={{ flex: `0 0 ${SLIDE_W}px` }}>
              <PhoneFrame frame={frame} frames={frames} index={frameIndex} set={set} w={SLIDE_W} layout={layout} live={false} />
            </div>
            <div style={{ flex: 1, minWidth: 320 }}>
              <SlideScreen key={frame.id} frame={frame} context={slideContextFor(frame, ceqById)} raw={segments[frame.id] ?? ""} suggestion={suggestions[frame.id]}
                kept={kept[frame.id] ?? null} first={at === 0} last={at === m - 1}
                onPick={(line, action) => void commit(frame, line, action)} onRetry={() => void suggest(frame)} onLiveBrief={(take) => void suggest(frame, take)}
                onSkip={next} onPrev={prev} onNext={next} />
            </div>
          </div>
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

/** ONE slide's lines: what was said (collapsed), the two cards, the talk button and the spoken
 *  take. Keyed by frame id from the parent so the take, the draft and the dictation never carry
 *  over to the next slide (unmount stops the microphone). */
function SlideScreen({ frame, context, raw, suggestion, kept, first, last, onPick, onRetry, onLiveBrief, onSkip, onPrev, onNext }: {
  frame: BlastFrame; context: string; raw: string; suggestion: SlideSuggestion | undefined; kept: string | null; first: boolean; last: boolean;
  onPick: (line: string, action: RehearsalAction) => void; onRetry: () => void;
  /** The spoken take so far — the parent re-runs the brief with it as the raw transcript. */
  onLiveBrief: (take: string) => void;
  onSkip: () => void; onPrev: () => void; onNext: () => void;
}) {
  const hasLines = !!suggestion?.suggested;
  const loading = suggestion?.status === "loading";

  // THE SPOKEN TAKE. `take` is every FINAL chunk so far; `interim` is what SpeechRecognition is
  // still working out — shown live, replaced on every event, same as the film captions.
  const [take, setTake] = useState("");
  const [interim, setInterim] = useState("");
  const dictation = useDictation((final, live) => {
    setInterim(live);
    if (final.trim()) setTake((t) => `${t} ${final}`.trim());
  });
  // "WHILE I'm talking it will be suggesting the best version": a throttle, not a debounce —
  // continuous speech would keep pushing a debounce out and nothing would ever update. The
  // first new speech briefs at once; after that at most once per LIVE_BRIEF_EVERY_MS, and the
  // tail (the last chunk before a pause) always lands.
  const lastBriefAt = useRef(0);
  const briefed = useRef("");
  useEffect(() => {
    if (!take || take === briefed.current) return;
    const wait = Math.max(0, lastBriefAt.current + LIVE_BRIEF_EVERY_MS - Date.now());
    const id = window.setTimeout(() => { lastBriefAt.current = Date.now(); briefed.current = take; onLiveBrief(take); }, wait);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take]);

  const startTalk = () => { if (!dictation.supported || dictation.on) return; setTake(""); setInterim(""); briefed.current = ""; dictation.start(); };
  const stopTalk = () => { dictation.stop(); setInterim(""); };
  const toggleTalk = () => (dictation.on ? stopTalk() : startTalk());
  const toggleRef = useRef(toggleTalk); toggleRef.current = toggleTalk;
  const onRef = useRef(dictation.on); onRef.current = dictation.on;

  // T toggles talking; Escape while talking STOPS it — caught in the capture phase so it never
  // reaches BlastOffCapture's Escape (which would close the whole review under Lee mid-sentence).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget()) return;
      if (e.key === "Escape" && onRef.current) { e.preventDefault(); e.stopImmediatePropagation(); toggleRef.current(); return; }
      if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleRef.current(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const talking = dictation.on;
  const useLabel = take ? "✓ use that" : "✓ Use this";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>{FRAME_LABEL[frame.kind]}</span>
        {context && <span style={{ fontSize: 12, color: MUTED }}>{context.length > 160 ? `${context.slice(0, 160)}…` : context}</span>}
      </div>
      {kept && <div style={{ marginTop: 8, fontSize: 12.5, color: MINT }}>✓ kept: <span style={{ color: CREAM }}>{kept}</span> <span style={{ color: MUTED }}>— pick again to change it</span></div>}
      <details style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>what you said in the round</summary>
        <div style={{ marginTop: 4, fontSize: 12, color: MUTED, lineHeight: 1.4 }}>{raw}</div>
      </details>

      {loading && !hasLines && <div style={{ marginTop: 14, fontSize: 13, color: MUTED }}>Prepping the lines…</div>}
      {suggestion?.status === "error" && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: ORANGE, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {suggestion.error} <button type="button" onClick={onRetry} style={btn()}>Try again</button>
        </div>
      )}
      {hasLines && suggestion && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.75 : 1, transition: "opacity 120ms" }}>
          {suggestion.said && <LineCard title={take ? "Your take, cleaned" : "What you said, cleaned"} line={suggestion.said} useLabel={useLabel} onUse={() => onPick(suggestion.said, "said")} />}
          <SuggestedCard suggestion={suggestion} loading={loading} useLabel={useLabel} onPick={onPick} />
        </div>
      )}

      {/* TALK. Lee: "I want to by default speak things out… click it and start talking". */}
      <div style={{ marginTop: 12, border: `1px solid ${talking ? MINT + "88" : EDGE}`, borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {dictation.supported ? (
            <button type="button" onClick={toggleTalk} style={{ ...btn(talking ? ORANGE : MINT), borderColor: talking ? ORANGE + "88" : MINT + "66" }}>
              {talking ? "■ Stop (Esc)" : "🎙 Say it (T)"}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: MUTED }}>Dictation needs Chrome or Edge — click the suggested line to edit it instead.</span>
          )}
          <span style={{ fontSize: 11, color: MUTED }}>
            {talking ? "talking — Suggested follows along; ✓ use that when it's got it" : dictation.supported ? "say the line your way; the suggestion updates while you talk" : ""}
          </span>
        </div>
        {(take || interim) && (
          <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.45 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginRight: 8 }}>your take</span>
            {take}{interim && <span style={{ color: MUTED }}> {interim}</span>}
          </div>
        )}
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

function LineCard({ title, line, useLabel, onUse }: { title: string; line: string; useLabel: string; onUse: () => void }) {
  return (
    <div style={{ border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.4 }}>{line}</div>
      <button type="button" onClick={onUse} style={{ ...btn(MINT), marginTop: 8 }}>{useLabel}</button>
    </div>
  );
}

/** THE SUGGESTED CARD: the register chip, the line (click → edit in place: Enter keeps the
 *  edit as "edited" — or as "suggested" if he changed nothing — Escape cancels), the keywords
 *  the prompter's scan mode will show, and the hand-off small beneath. Lee: "if I want to write
 *  one in, I can just edit the suggested one." */
function SuggestedCard({ suggestion, loading, useLabel, onPick }: { suggestion: SlideSuggestion; loading: boolean; useLabel: string; onPick: (line: string, action: RehearsalAction) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);

  const keep = () => {
    const d = draft.trim();
    if (!d) return;
    onPick(d, d === suggestion.suggested.trim() ? "suggested" : "edited");
    setEditing(false);
  };

  return (
    <div style={{ border: `1px solid ${GOLD}55`, borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>Suggested</span>
        <span title={suggestion.register === "cheat-code" ? "how you know the answer — move on" : "a beat of why, then the answer"}
          style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: suggestion.register === "cheat-code" ? ORANGE : GOLD, border: `1px solid ${suggestion.register === "cheat-code" ? ORANGE : GOLD}66`, borderRadius: 999, padding: "1px 7px" }}>
          {suggestion.register}
        </span>
        {loading && <span style={{ fontSize: 10.5, color: MUTED }}>updating…</span>}
      </div>
      {editing ? (
        <textarea ref={ref} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); keep(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); }
          }}
          style={{ marginTop: 6, width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: `1px solid ${GOLD}88`, borderRadius: 8, padding: "6px 8px", color: CREAM, font: "inherit", fontSize: 15, lineHeight: 1.4, resize: "vertical" }} />
      ) : (
        <div onClick={() => { setDraft(suggestion.suggested); setEditing(true); }} title="Click to edit — Enter keeps, Escape cancels"
          style={{ marginTop: 6, fontSize: 15, lineHeight: 1.4, cursor: "text", borderRadius: 6, margin: "6px -6px 0", padding: "0 6px" }}>
          {suggestion.suggested}
        </div>
      )}
      {suggestion.keywords.length > 0 && !editing && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>scan</span>
          {suggestion.keywords.map((k, i) => <span key={i} style={{ fontSize: 11.5, color: CREAM, background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "1px 7px" }}>{k}</span>)}
        </div>
      )}
      {suggestion.transition && <div style={{ marginTop: 6, fontSize: 12, color: GOLD }}>→ {suggestion.transition}</div>}
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
        {editing ? (
          <>
            <button type="button" onClick={keep} disabled={!draft.trim()} style={{ ...btn(MINT), opacity: draft.trim() ? 1 : 0.5 }}>✓ Keep (Enter)</button>
            <button type="button" onClick={() => setEditing(false)} style={btn()}>cancel (Esc)</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onPick(suggestion.suggested, "suggested")} style={btn(MINT)}>{useLabel}</button>
            <button type="button" onClick={() => { setDraft(suggestion.suggested); setEditing(true); }} style={btn()}>edit</button>
          </>
        )}
      </div>
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
