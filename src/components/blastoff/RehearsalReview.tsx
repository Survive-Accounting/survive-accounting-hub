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
//
// 2026-09-07, fifth pass — SHORTEN PASSES, THE PICTURE, THE LEDGER. Lee: "Suggested prompters
// in prompter, a button to 'shorten' and revert icon if so. Shorten can almost be like, making
// more concise of what's written first, but then like another one is actually eliminating
// stuff. Shorts are, well, SHORT… Maybe let me do two passes (three?) to see how each looks.
// revert would go to the previous version." → "✂ shorten" on the Suggested card (and on a kept
// line): pass 1 concise, pass 2 cut, pass 3 tighter still — each its own small call on whichever
// version is showing; the versions stay as "v1 · v2 · v3" chips so he can look at each, ↶ steps
// back one, and "Use this" keeps whichever is showing. Shortening from an older version drops
// the ones after it (a new pass from there). "now we've illustrated for it (which could mean I
// now may reference the illustration!)" → the slide's picture rides in the brief as one line.
// And every runMicro here writes its price to the cost ledger (cost-ledger.functions.ts).
//
// 2026-09-07, sixth pass — THE TIMING MARKS, AND THE CARD ON FILM. Lee: "With the teleprompter,
// I can even highlight pieces of a line that are like when the transition takes place. A big
// part of my teaching style that hits so hard is my TIMING for moving a slide at the perfect
// emphasis moment… I could even 'double highlight' the word I want to transition on. So it's
// like transition phrase is yellow but the word itself is orange." → the brief proposes the
// phrase and the cue word (rehearsal-brief.ts); the Suggested card paints them (lib/prompter-
// marks.ts, the same painter the teleprompter window uses); select any words in the line and a
// tiny toolbar marks them as the phrase or the cue word, or clears; they land on
// frame.prompterMarks with the pick. And the prompter panel on /film (after round 2) mounts the
// SAME card — exported below as SuggestedCard, self-contained — so the line on film gets "Say
// it", the shorten passes, ↶ and the mark toolbar without a second copy of any of it
// (docs/USE-YOUR-WORDS-AUDIT.md #13).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { isTypingTarget } from "@/components/canvas/film-lock";
import { startTT, ttState } from "@/components/canvas/talkthrough-sync";
import type { BoothCeq, BoothSetInfo } from "@/lib/talkthrough.functions";
import { runMicro } from "@/lib/talkthrough.functions";
import { logCostEvent } from "@/lib/cost-ledger.functions";
import { logTeleprompterFeedback, topRehearsalExamples, type RehearsalAction } from "@/lib/rehearsal.functions";
import { logCannedLineUse, recentCannedLineUses } from "@/lib/canned-lines.functions";
import { markStyle, paintLine } from "@/lib/prompter-marks";
import { useDictation } from "@/lib/use-dictation";

import { cannedLinesFor, cannedWarnings, pickCannedLine, type CannedLine, type CannedSlot } from "./canned-lines";
import { isCannedFrameKind, REVIEW_ROUNDS } from "./capture/rehearsal-rounds";
import type { SlideLayout } from "./layout";
import { PhoneFrame } from "./PhoneFrame";
import { findMark, FRAME_LABEL, normalizeMarks, pruneMarks, type BlastFrame, type PrompterMarks } from "./plan";
import {
  buildKeywordMessages, buildRehearsalMessages, buildShortenLineMessages, parseKeywords, parseRehearsalSuggestions, parseShortenedLine, pictureLineFor,
  SHORTEN_PASS_LABEL, SHORTEN_PASSES, type RehearsalRegister, type RehearsalSuggestions, type ShortenedLine, type ShortenLineRequest, type ShortenPass, type StyleExample,
} from "./rehearsal-brief";
import { nextSlideFor, rehearsalCardFor, rehearsalContextFor, slideContextFor, type CardLookup } from "./rehearsal-context";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", INK = "#05070D", MINT = "#3BF5A0", ORANGE = "#FF9F43";

/** The slide drawn beside the lines — Lee: "I want to actually see the slide alongside". */
const SLIDE_W = 300;
/** How often the brief re-runs while Lee is talking (ms of new final speech). */
export const LIVE_BRIEF_EVERY_MS = 2500;

/** One look at the suggested line — v1 is the brief's own; each shorten pass adds one. The
 *  timing marks ride per version: a shortened line keeps whichever of them survived the cut. */
interface LineVersion { line: string; keywords: string[]; marks?: PrompterMarks; /** 0 = the brief's line; 1–3 = the pass that made it. */ pass: number }

interface SlideSuggestion {
  status: "loading" | "ready" | "error";
  said: string;
  /** The version SHOWING — mirrors versions[showing], so every reader of the line stays simple. */
  suggested: string;
  register: RehearsalRegister; transition: string | null; keywords: string[];
  /** The timing marks of the version showing (mirrors versions[showing].marks). */
  marks?: PrompterMarks;
  /** The transcript these lines were made from — the round's, or the spoken take. */
  raw: string;
  error?: string;
  /** The shorten stack: v1 · v2 · v3 chips. A new brief (a fresh take) starts it over. */
  versions: LineVersion[];
  showing: number;
  shortening?: boolean;
  shortenError?: string;
}
const EMPTY: SlideSuggestion = { status: "loading", said: "", suggested: "", register: "teach", transition: null, keywords: [], raw: "", versions: [], showing: 0 };

/** THE LEDGER — fire-and-forget after every runMicro here. Lee: "I want to know the cost per
 *  short." The UI never waits on it; a lost row is bookkeeping, not a lost line. */
function logCost(setId: string, label: "rehearsal line" | "shorten line" | "keywords", r: { model: string; usage: { costUsd: number } }) {
  void logCostEvent({ data: { setId, kind: "ai", usd: r.usage.costUsd, model: r.model, label, who: getAdminWho() } });
}

/** The marks the brief proposed, as the frame stores them. */
const marksOf = (s: RehearsalSuggestions): PrompterMarks | undefined => normalizeMarks({ phrase: s.transitionPhrase ?? undefined, word: s.cueWord ?? undefined });

// ---- THE CALLS, SHARED (sixth pass) ------------------------------------------
// The review briefs every slide up front and shortens on demand; the card on /film does the
// same for one line. Same request, same retry, same ledger row — written once, here.

/** What a line is ABOUT: enough to build the brief and a shorten request for ONE frame. The
 *  film page hands this to SuggestedCard; the review builds it per slide. */
export interface CardContext { setId: string; frame: BlastFrame; frames: readonly BlastFrame[]; ceqById: CardLookup }

function rehearsalRequestFor(ctx: CardContext, raw: string, examples: readonly StyleExample[]): { system: string; user: string } {
  const { frame: f, frames, ceqById, setId } = ctx;
  return buildRehearsalMessages({
    slideLabel: FRAME_LABEL[f.kind], slideContext: slideContextFor(f, ceqById),
    card: rehearsalCardFor(f, ceqById), nextSlide: nextSlideFor(frames, f, ceqById),
    rawTranscript: raw, talkthrough: rehearsalContextFor(ttState().doc, setId, f.kind === "ceq" ? f.ceqId : null),
    styleExamples: examples, picture: pictureLineFor(f.illustration),
  });
}

/** One brief, RETRIED ONCE QUIETLY (2026-09-07). Lee, on the error showing up on a "memorize
 *  this": "Not sure why?" — a one-off unparseable answer is the model's problem, not his; only a
 *  second miss surfaces, and then it says WHICH slide. */
async function runRehearsalBrief(ctx: CardContext, raw: string, examples: readonly StyleExample[]): Promise<RehearsalSuggestions> {
  const m = rehearsalRequestFor(ctx, raw, examples);
  let lines: RehearsalSuggestions | null = null;
  for (let attempt = 0; attempt < 2 && !lines; attempt++) {
    const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 500 } });
    logCost(ctx.setId, "rehearsal line", r);
    lines = parseRehearsalSuggestions(r.text);
  }
  if (!lines) throw new Error(`The lines for this "${FRAME_LABEL[ctx.frame.kind]}" slide didn't come back clean, twice — try again.`);
  return lines;
}

/** One shorten pass on one line. */
async function runShortenPass(ctx: CardContext, line: string, pass: ShortenPass, register: RehearsalRegister): Promise<ShortenedLine> {
  const req: ShortenLineRequest = { line, pass, card: rehearsalCardFor(ctx.frame, ctx.ceqById), register, picture: pictureLineFor(ctx.frame.illustration) };
  const m = buildShortenLineMessages(req);
  const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 200 } });
  logCost(ctx.setId, "shorten line", r);
  const out = parseShortenedLine(r.text);
  if (!out) throw new Error(`The ${SHORTEN_PASS_LABEL[pass]} pass didn't come back clean — try again.`);
  return out;
}

/** The scan keywords for a line the model didn't write; [] when the call fails. */
async function keywordsFor(setId: string, line: string): Promise<string[]> {
  const km = buildKeywordMessages(line);
  const r = await runMicro({ data: { system: km.system, user: km.user, maxOutput: 120 } });
  logCost(setId, "keywords", r);
  return parseKeywords(r.text);
}

/** A shorten pass applied to a suggestion state: the new version on top of `base`, showing. */
function pushVersion(cur: SlideSuggestion, base: LineVersion[], out: ShortenedLine, pass: ShortenPass): SlideSuggestion {
  const src = base[base.length - 1];
  const marks = pruneMarks(out.line, src?.marks);
  const versions = [...base, { line: out.line, keywords: out.keywords, marks, pass }];
  return { ...cur, shortening: false, versions, showing: versions.length - 1, suggested: out.line, keywords: out.keywords, marks };
}

/** Show version i without dropping any. */
function showingVersion(cur: SlideSuggestion, i: number): SlideSuggestion {
  const v = cur.versions[i];
  if (!v) return cur;
  return { ...cur, showing: i, suggested: v.line, keywords: v.keywords, marks: v.marks, shortenError: undefined };
}

/** New marks on the version showing — Lee's own selection wins over the brief's. */
function markedVersion(cur: SlideSuggestion, marks: PrompterMarks | undefined): SlideSuggestion {
  const m = normalizeMarks(marks);
  const versions = cur.versions.map((v, i) => (i === cur.showing ? { ...v, marks: m } : v));
  return { ...cur, marks: m, versions };
}

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
  /** The kept line — and, since 2026-09-07, its keywords (frame.prompterKeys), the hand-off
   *  (frame.prompterTransition) and the timing marks (frame.prompterMarks; an empty object
   *  clears them). All optional so a two-arg caller keeps working; it just won't write them. */
  onCommitLine: (frameId: string, line: string, keys?: string[], transition?: string, marks?: PrompterMarks) => void;
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
  /** What Lee kept this session, per frame — "✓ kept: …" (painted with its marks) and re-pickable. */
  const [kept, setKept] = useState<Record<string, { line: string; marks?: PrompterMarks }>>({});
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
      const lines = await runRehearsalBrief({ setId: set.id, frame: f, frames, ceqById }, raw, examples ?? []);
      if (!alive.current) return;
      // A newer take is already waiting → this answer is stale; the finally block runs the new one.
      // A fresh brief starts the shorten stack over: v1 is this line, with the marks it proposed.
      const marks = marksOf(lines);
      if (!pending.current[f.id]) setSuggestions((s) => ({ ...s, [f.id]: { status: "ready", ...lines, marks, raw, versions: [{ line: lines.suggested, keywords: lines.keywords, marks, pass: 0 }], showing: 0 } }));
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

  // SHORTEN — one pass on whichever version is showing. `fromKept` restarts the stack at the
  // kept line ("✂ shorten" beside "✓ kept: …"), so a line Lee already kept can be cut down the
  // same way and kept again. Shortening from an older version drops the ones after it.
  const shorten = useCallback(async (f: BlastFrame, fromKept?: { line: string; marks?: PrompterMarks }) => {
    const s = suggestions[f.id];
    if (!s || s.shortening) return;
    const base: LineVersion[] = fromKept ? [{ line: fromKept.line, keywords: [], marks: pruneMarks(fromKept.line, fromKept.marks), pass: 0 }] : s.versions.slice(0, s.showing + 1);
    if (base.length === 0 || base.length > SHORTEN_PASSES) return;
    const pass = base.length as ShortenPass;
    const src = base[base.length - 1];
    setSuggestions((all) => ({ ...all, [f.id]: { ...(all[f.id] ?? s), shortening: true, shortenError: undefined, versions: base, showing: base.length - 1, suggested: src.line, keywords: src.keywords, marks: src.marks } }));
    try {
      const out = await runShortenPass({ setId: set.id, frame: f, frames, ceqById }, src.line, pass, s.register);
      if (!alive.current) return;
      setSuggestions((all) => {
        const cur = all[f.id];
        // A fresh take landed meanwhile and restarted the stack → this pass belongs to a line that's gone.
        if (!cur || cur.versions[0]?.line !== base[0].line) return all;
        return { ...all, [f.id]: pushVersion(cur, base, out, pass) };
      });
    } catch (e) {
      if (alive.current) setSuggestions((all) => (all[f.id] ? { ...all, [f.id]: { ...all[f.id], shortening: false, shortenError: e instanceof Error ? e.message : String(e) } } : all));
    }
  }, [suggestions, ceqById, set.id, frames]);

  /** The v1 · v2 · v3 chips and ↶: show a version without dropping any. */
  const showVersion = useCallback((f: BlastFrame, i: number) => {
    setSuggestions((all) => (all[f.id] ? { ...all, [f.id]: showingVersion(all[f.id], i) } : all));
  }, []);
  /** The mark toolbar: Lee's selection becomes the phrase or the cue word on the version showing. */
  const setMarks = useCallback((f: BlastFrame, marks: PrompterMarks | undefined) => {
    setSuggestions((all) => (all[f.id] ? { ...all, [f.id]: markedVersion(all[f.id], marks) } : all));
  }, []);

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

  const commit = useCallback(async (f: BlastFrame, line: string, action: RehearsalAction, picked?: PrompterMarks) => {
    const finalLine = line.trim();
    if (!finalLine) return;
    const sug = suggestions[f.id];
    const transition = sug?.transition ?? undefined;
    // The marks go with the pick, pruned to the line actually kept — and ALWAYS as an object, so
    // picking "what you said" (no marks) clears the ones a suggestion left on the frame before.
    const marks = pruneMarks(finalLine, picked) ?? {};
    // The model's keywords belong to the line it wrote; a line Lee said or edited gets its own
    // below, after the pick has already landed — the pick never waits on a second call.
    const knownKeys = action === "suggested" && sug?.keywords.length ? sug.keywords : undefined;
    onCommitLine(f.id, finalLine, knownKeys, transition, marks);
    keptRef.current[f.id] = finalLine;
    setKept((k) => ({ ...k, [f.id]: { line: finalLine, marks: normalizeMarks(marks) } }));
    void logTeleprompterFeedback({ data: {
      setId: set.id, frameId: f.id, rawTranscript: sug?.raw || segments[f.id] || "", suggestedLine: sug?.suggested ?? "",
      finalLine, action, who: getAdminWho(),
    } });
    next();
    if (knownKeys) return;
    try {
      const keys = await keywordsFor(set.id, finalLine);
      // Only if this is still the line he kept — a re-pick in the meantime wins.
      if (keys.length && alive.current && keptRef.current[f.id] === finalLine) onCommitLine(f.id, finalLine, keys, transition, marks);
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
                onPick={(line, action, marks) => void commit(frame, line, action, marks)} onRetry={() => void suggest(frame)} onLiveBrief={(take) => void suggest(frame, take)}
                onShorten={() => void shorten(frame)} onShortenKept={(k) => void shorten(frame, k)} onShow={(i) => showVersion(frame, i)} onMarks={(marks) => setMarks(frame, marks)}
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
                      <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kept[f.id] ? <Painted line={kept[f.id].line} marks={kept[f.id].marks} /> : "skipped"}</span>
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
function SlideScreen({ frame, context, raw, suggestion, kept, first, last, onPick, onRetry, onLiveBrief, onShorten, onShortenKept, onShow, onMarks, onSkip, onPrev, onNext }: {
  frame: BlastFrame; context: string; raw: string; suggestion: SlideSuggestion | undefined; kept: { line: string; marks?: PrompterMarks } | null; first: boolean; last: boolean;
  onPick: (line: string, action: RehearsalAction, marks: PrompterMarks | undefined) => void; onRetry: () => void;
  /** The spoken take so far — the parent re-runs the brief with it as the raw transcript. */
  onLiveBrief: (take: string) => void;
  /** One shorten pass on the showing version; on the kept line (restarts the stack there); show version i. */
  onShorten: () => void; onShortenKept: (kept: { line: string; marks?: PrompterMarks }) => void; onShow: (i: number) => void;
  /** The mark toolbar's pick for the version showing. */
  onMarks: (marks: PrompterMarks | undefined) => void;
  onSkip: () => void; onPrev: () => void; onNext: () => void;
}) {
  const hasLines = !!suggestion?.suggested;
  const loading = suggestion?.status === "loading";
  // T toggles talking here (the review is Lee's own overlay; on /film T stays free).
  const talk = useSpokenTake(onLiveBrief, true);
  const useLabel = talk.take ? "✓ use that" : "✓ Use this";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD }}>{FRAME_LABEL[frame.kind]}</span>
        {context && <span style={{ fontSize: 12, color: MUTED }}>{context.length > 160 ? `${context.slice(0, 160)}…` : context}</span>}
      </div>
      {kept && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: MINT, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span>✓ kept: <span style={{ color: CREAM }}><Painted line={kept.line} marks={kept.marks} /></span> <span style={{ color: MUTED }}>— pick again to change it</span></span>
          {/* Shorten the line he already kept: the stack restarts at it, the pass lands in Suggested, Use this keeps it again. */}
          {hasLines && <button type="button" onClick={() => onShortenKept(kept)} disabled={!!suggestion?.shortening} title="A concise pass on the kept line — lands in Suggested" style={{ ...btn(), fontSize: 11, padding: "2px 8px" }}>✂ shorten this</button>}
        </div>
      )}
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
          {suggestion.said && <LineCard title={talk.take ? "Your take, cleaned" : "What you said, cleaned"} line={suggestion.said} useLabel={useLabel} onUse={() => onPick(suggestion.said, "said", undefined)} />}
          <LineCardView suggestion={suggestion} loading={loading} useLabel={useLabel} onPick={onPick} onShorten={onShorten} onShow={onShow} onMarks={onMarks} />
        </div>
      )}

      <TalkRow talk={talk} hotkey />

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

// ---- THE SPOKEN TAKE, shared by the review and the card on /film ---------------------------

interface SpokenTake { take: string; interim: string; talking: boolean; supported: boolean; toggle: () => void }

/** "I want to by default speak things out… click it and start talking, it dictates it out… can
 *  the AI be following along in the background". `take` is every FINAL chunk so far; `interim`
 *  is what SpeechRecognition is still working out — shown live, replaced on every event, same
 *  as the film captions. Escape while talking STOPS it — caught in the capture phase so it
 *  never reaches BlastOffCapture's Escape (which would close the review, or leave Film, under
 *  Lee mid-sentence). `hotkey` adds T to toggle it. */
function useSpokenTake(onLiveBrief: (take: string) => void, hotkey: boolean): SpokenTake {
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
  const toggle = () => (dictation.on ? stopTalk() : startTalk());
  const toggleRef = useRef(toggle); toggleRef.current = toggle;
  const onRef = useRef(dictation.on); onRef.current = dictation.on;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget()) return;
      if (e.key === "Escape" && onRef.current) { e.preventDefault(); e.stopImmediatePropagation(); toggleRef.current(); return; }
      if (hotkey && (e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleRef.current(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hotkey]);

  return { take, interim, talking: dictation.on, supported: dictation.supported, toggle };
}

/** The talk box: the button, the one-line hint, the take as it lands. */
function TalkRow({ talk, hotkey, compact }: { talk: SpokenTake; hotkey?: boolean; compact?: boolean }) {
  const { talking, supported, take, interim } = talk;
  return (
    <div style={{ marginTop: compact ? 8 : 12, border: `1px solid ${talking ? MINT + "88" : EDGE}`, borderRadius: 12, padding: compact ? "8px 10px" : "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {supported ? (
          <button type="button" onClick={talk.toggle} style={{ ...btn(talking ? ORANGE : MINT), borderColor: talking ? ORANGE + "88" : MINT + "66" }}>
            {talking ? "■ Stop (Esc)" : hotkey ? "🎙 Say it (T)" : "🎙 Say it"}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: MUTED }}>Dictation needs Chrome or Edge — click the suggested line to edit it instead.</span>
        )}
        {!compact && (
          <span style={{ fontSize: 11, color: MUTED }}>
            {talking ? "talking — Suggested follows along; ✓ use that when it's got it" : supported ? "say the line your way; the suggestion updates while you talk" : ""}
          </span>
        )}
      </div>
      {(take || interim) && (
        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.45 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginRight: 8 }}>your take</span>
          {take}{interim && <span style={{ color: MUTED }}> {interim}</span>}
        </div>
      )}
    </div>
  );
}

/** A line with its timing marks painted — the shared painter, so this is the same yellow and
 *  orange the teleprompter window shows. */
function Painted({ line, marks }: { line: string; marks: PrompterMarks | undefined }) {
  return <>{paintLine(line, marks).map((s, i) => <span key={i} style={markStyle(s.tone)}>{s.text}</span>)}</>;
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

/** THE SUGGESTED CARD's face: the register chip, the version chips (v1 · v2 · v3 — one per
 *  shorten pass, click to look at each), the line (click → edit in place: Enter keeps the edit
 *  as "edited" — or as "suggested" if he changed nothing — Escape cancels), the keywords the
 *  prompter's scan mode will show, the hand-off small beneath, and "✂ shorten" with its pass
 *  counter + ↶. Lee: "if I want to write one in, I can just edit the suggested one."
 *
 *  THE MARKS (sixth pass): the line is painted — the transition phrase yellow, the cue word
 *  orange — and selecting any words in it floats a tiny toolbar: "transition phrase" / "cue
 *  word" / "clear". A plain click (no selection) still opens the editor; a drag-select never
 *  does. Keyboard-free on purpose — the marks are a mouse gesture on the words themselves. */
function LineCardView({ suggestion, loading, useLabel, onPick, onShorten, onShow, onMarks }: {
  suggestion: SlideSuggestion; loading: boolean; useLabel: string;
  onPick: (line: string, action: RehearsalAction, marks: PrompterMarks | undefined) => void;
  onShorten: () => void; onShow: (i: number) => void; onMarks: (marks: PrompterMarks | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);

  const keep = () => {
    const d = draft.trim();
    if (!d) return;
    // An edited line keeps whichever marks still fit it.
    onPick(d, d === suggestion.suggested.trim() ? "suggested" : "edited", pruneMarks(d, suggestion.marks));
    setEditing(false);
  };
  const startEdit = () => { setDraft(suggestion.suggested); setEditing(true); };

  // THE SELECTION → THE TOOLBAR. Read on mouseup inside the line; the selected words must be in
  // the line (findMark — so a selection that ran off the edge of the line is just ignored), and
  // the mark stored is the line's own slice of them.
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const readSelection = () => {
    const s = window.getSelection();
    const raw = s?.toString().replace(/\s+/g, " ").trim() ?? "";
    const el = lineRef.current, host = wrapRef.current;
    if (!s || !raw || s.rangeCount === 0 || !el || !host || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) { setSel(null); return; }
    const i = findMark(suggestion.suggested, raw);
    if (i < 0) { setSel(null); return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    const h = host.getBoundingClientRect();
    setSel({ text: suggestion.suggested.slice(i, i + raw.length), x: r.left - h.left + r.width / 2, y: r.top - h.top });
  };
  useEffect(() => {
    if (!sel) return;
    const off = (e: MouseEvent) => { if (!(e.target as HTMLElement | null)?.closest?.("[data-mark-toolbar]")) setSel(null); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [sel]);
  const mark = (next: PrompterMarks | undefined) => { onMarks(next); window.getSelection()?.removeAllRanges(); setSel(null); };

  // The pass the NEXT press would run: from the showing version, so shortening v1 again after
  // looking back at it is pass 1 again (and drops the later versions). Three is the ceiling.
  const nextPass = Math.min(SHORTEN_PASSES, suggestion.showing + 1) as ShortenPass;
  const canShorten = suggestion.showing < SHORTEN_PASSES && !suggestion.shortening && !loading;
  const showingVersion = suggestion.versions[suggestion.showing];
  const words = suggestion.suggested.trim() ? suggestion.suggested.trim().split(/\s+/).length : 0;
  const marks = suggestion.marks;

  return (
    <div ref={wrapRef} style={{ position: "relative", border: `1px solid ${GOLD}55`, borderRadius: 12, padding: "10px 14px" }}>
      {sel && !editing && (
        <div data-mark-toolbar role="toolbar" aria-label="Mark the selection"
          style={{ position: "absolute", left: sel.x, top: sel.y - 36, transform: "translateX(-50%)", zIndex: 5, display: "flex", gap: 4, background: INK, border: `1px solid ${GOLD}88`, borderRadius: 8, padding: 3, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => mark({ ...marks, phrase: sel.text })} title="The words that pull into the next slide (yellow)" style={{ ...toolBtn(), background: "rgba(252,163,17,0.35)", color: CREAM }}>transition phrase</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => mark({ ...marks, word: sel.text })} title="The word you change the slide on (orange)" style={{ ...toolBtn(), background: ORANGE, color: "#14213D" }}>cue word</button>
          {marks && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => mark(undefined)} title="Clear both marks" style={toolBtn()}>clear</button>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>Suggested</span>
        <span title={suggestion.register === "cheat-code" ? "how you know the answer — move on" : "a beat of why, then the answer"}
          style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: suggestion.register === "cheat-code" ? ORANGE : GOLD, border: `1px solid ${suggestion.register === "cheat-code" ? ORANGE : GOLD}66`, borderRadius: 999, padding: "1px 7px" }}>
          {suggestion.register}
        </span>
        {/* v1 · v2 · v3 — "let me do two passes (three?) to see how each looks". */}
        {suggestion.versions.length > 1 && (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "baseline" }}>
            {suggestion.versions.map((v, i) => (
              <button key={i} type="button" onClick={() => onShow(i)} disabled={editing}
                title={v.pass === 0 ? "the brief's own line" : `pass ${v.pass} · ${SHORTEN_PASS_LABEL[v.pass as ShortenPass]}`}
                style={{ font: "inherit", fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 999, cursor: "pointer", background: i === suggestion.showing ? `${GOLD}33` : "transparent", border: `1px solid ${i === suggestion.showing ? GOLD : EDGE}`, color: i === suggestion.showing ? CREAM : MUTED }}>
                v{i + 1}
              </button>
            ))}
          </span>
        )}
        {showingVersion && showingVersion.pass > 0 && <span style={{ fontSize: 10.5, color: MUTED }}>{SHORTEN_PASS_LABEL[showingVersion.pass as ShortenPass]} · {words} words</span>}
        {loading && <span style={{ fontSize: 10.5, color: MUTED }}>updating…</span>}
        {suggestion.shortening && <span style={{ fontSize: 10.5, color: MUTED }}>shortening…</span>}
      </div>
      {editing ? (
        <textarea ref={ref} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); keep(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); }
          }}
          style={{ marginTop: 6, width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: `1px solid ${GOLD}88`, borderRadius: 8, padding: "6px 8px", color: CREAM, font: "inherit", fontSize: 15, lineHeight: 1.4, resize: "vertical" }} />
      ) : (
        <div ref={lineRef} onMouseUp={readSelection}
          // A drag-select ends in a click too — only a plain click (nothing selected) opens the editor.
          onClick={() => { if (window.getSelection()?.toString().trim()) return; startEdit(); }}
          title="Click to edit — Enter keeps, Escape cancels · select words to mark the transition phrase or the cue word"
          style={{ marginTop: 6, fontSize: 15, lineHeight: 1.5, cursor: "text", borderRadius: 6, margin: "6px -6px 0", padding: "0 6px" }}>
          <Painted line={suggestion.suggested} marks={marks} />
        </div>
      )}
      {!editing && (
        <div style={{ marginTop: 5, fontSize: 10.5, color: MUTED, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          {marks?.phrase && <span><span style={{ ...markStyle("phrase"), padding: "0 4px" }}>transition</span> {marks.phrase}</span>}
          {marks?.word && <span><span style={{ ...markStyle("word"), padding: "0 4px", fontSize: 10 }}>flip on</span> {marks.word}</span>}
          {!marks && <span>select words in the line to mark the hand-off — the phrase yellow, the word you flip the slide on orange</span>}
        </div>
      )}
      {suggestion.keywords.length > 0 && !editing && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>scan</span>
          {suggestion.keywords.map((k, i) => <span key={i} style={{ fontSize: 11.5, color: CREAM, background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "1px 7px" }}>{k}</span>)}
        </div>
      )}
      {suggestion.transition && <div style={{ marginTop: 6, fontSize: 12, color: GOLD }}>→ {suggestion.transition}</div>}
      {suggestion.shortenError && <div style={{ marginTop: 6, fontSize: 12, color: ORANGE }}>{suggestion.shortenError}</div>}
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {editing ? (
          <>
            <button type="button" onClick={keep} disabled={!draft.trim()} style={{ ...btn(MINT), opacity: draft.trim() ? 1 : 0.5 }}>✓ Keep (Enter)</button>
            <button type="button" onClick={() => setEditing(false)} style={btn()}>cancel (Esc)</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onPick(suggestion.suggested, "suggested", marks)} style={btn(MINT)}>{useLabel}</button>
            <button type="button" onClick={startEdit} style={btn()}>edit</button>
            <span style={{ flex: 1 }} />
            {/* ↶ walks back one version; the chips above jump to any. Nothing is dropped until a
                new pass runs from an older version. */}
            {suggestion.showing > 0 && (
              <button type="button" onClick={() => onShow(suggestion.showing - 1)} title={`back to v${suggestion.showing}`} style={{ ...btn(), padding: "6px 9px" }}>↶</button>
            )}
            <button type="button" onClick={onShorten} disabled={!canShorten} title={suggestion.showing >= SHORTEN_PASSES ? "that's three passes — ↶ to go back" : `pass ${nextPass} · ${SHORTEN_PASS_LABEL[nextPass]}`}
              style={{ ...btn(GOLD), opacity: canShorten ? 1 : 0.5, display: "inline-flex", gap: 6, alignItems: "baseline" }}>
              ✂ shorten
              <span style={{ fontSize: 10.5, fontWeight: 700, color: MUTED }}>
                {suggestion.showing >= SHORTEN_PASSES ? "3 of 3" : `pass ${nextPass} · ${SHORTEN_PASS_LABEL[nextPass]}`}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** A mark-toolbar button. */
const toolBtn = (): React.CSSProperties => ({ font: "inherit", fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" });

// ---- THE CARD ON FILM (sixth pass; docs/USE-YOUR-WORDS-AUDIT.md #13) ------------------------

/** THE SUGGESTED CARD, SELF-CONTAINED — the prompter panel on /film mounts this for the kept
 *  line after round 2, where a plain textarea used to be. Same face as the review's card
 *  (LineCardView), and it owns for ONE line what the review owns for every slide: the shorten
 *  stack (v1 is the kept line), "🎙 Say it" with the live brief, the keywords follow-up, the
 *  feedback row. `onCommit` mirrors BlastOffCapture's commitPrompterLine — keys/transition
 *  undefined = leave them; marks alone save the moment Lee marks them (no extra click when the
 *  line itself didn't change). */
export function SuggestedCard({ ctx, line, keys, marks, transition, onCommit }: {
  ctx: CardContext;
  line: string; keys?: readonly string[]; marks?: PrompterMarks; transition?: string;
  onCommit: (line: string, keys: string[] | undefined, transition: string | undefined, marks: PrompterMarks | undefined) => void;
}) {
  const seed = (l: string, k: readonly string[] | undefined, m: PrompterMarks | undefined, t: string | undefined): SlideSuggestion =>
    ({ status: "ready", said: "", suggested: l, register: "teach", transition: t ?? null, keywords: [...(k ?? [])], marks: normalizeMarks(m), raw: "", versions: [{ line: l, keywords: [...(k ?? [])], marks: normalizeMarks(m), pass: 0 }], showing: 0 });
  const [sug, setSug] = useState<SlideSuggestion>(() => seed(line, keys, marks, transition));
  const [examples, setExamples] = useState<StyleExample[]>([]);
  useEffect(() => { startTT(); topRehearsalExamples().then(setExamples).catch(() => setExamples([])); }, []);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  /** The line the FRAME has — marks on exactly this line save on their own. */
  const committedRef = useRef(line); committedRef.current = line;
  // A line changed UNDER the card — the review overlay re-opened ("lines N →") and Lee kept a
  // different one there — reseeds it; the card's own commits don't (they already reset it).
  const lastCommit = useRef(line);
  useEffect(() => {
    if (line === lastCommit.current) return;
    lastCommit.current = line;
    setSug(seed(line, keys, marks, transition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  // One call in flight while Lee talks; the newest take waits and runs when it lands.
  const inFlight = useRef(false);
  const pending = useRef<string | undefined>(undefined);
  const suggestRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const suggest = useCallback(async (raw: string) => {
    if (!raw.trim()) return;
    if (inFlight.current) { pending.current = raw; return; }
    inFlight.current = true;
    setSug((s) => ({ ...s, status: "loading", error: undefined }));
    try {
      const lines = await runRehearsalBrief(ctx, raw, examples);
      if (!alive.current) return;
      const m = marksOf(lines);
      if (!pending.current) setSug({ status: "ready", ...lines, marks: m, raw, versions: [{ line: lines.suggested, keywords: lines.keywords, marks: m, pass: 0 }], showing: 0 });
    } catch (e) {
      if (alive.current) setSug((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
    } finally {
      inFlight.current = false;
      const p = pending.current;
      pending.current = undefined;
      if (p && alive.current) void suggestRef.current(p);
    }
  }, [ctx, examples]);
  suggestRef.current = suggest;

  const shorten = useCallback(async () => {
    if (sug.shortening) return;
    const base = sug.versions.slice(0, sug.showing + 1);
    if (base.length === 0 || base.length > SHORTEN_PASSES) return;
    const pass = base.length as ShortenPass;
    const src = base[base.length - 1];
    setSug((s) => ({ ...s, shortening: true, shortenError: undefined, versions: base, showing: base.length - 1, suggested: src.line, keywords: src.keywords, marks: src.marks }));
    try {
      const out = await runShortenPass(ctx, src.line, pass, sug.register);
      if (!alive.current) return;
      setSug((cur) => (cur.versions[0]?.line !== base[0].line ? cur : pushVersion(cur, base, out, pass)));
    } catch (e) {
      if (alive.current) setSug((s) => ({ ...s, shortening: false, shortenError: e instanceof Error ? e.message : String(e) }));
    }
  }, [sug, ctx]);

  const setMarks = useCallback((m: PrompterMarks | undefined) => {
    setSug((cur) => markedVersion(cur, m));
    // Marks on the line the frame already has save at once — that IS the edit.
    if (sug.suggested.trim() === committedRef.current.trim()) onCommit(committedRef.current, undefined, undefined, normalizeMarks(m) ?? {});
  }, [sug.suggested, onCommit]);

  const commit = useCallback(async (picked: string, action: RehearsalAction, m: PrompterMarks | undefined) => {
    const finalLine = picked.trim();
    if (!finalLine) return;
    const pruned = pruneMarks(finalLine, m) ?? {};
    const knownKeys = action === "suggested" && sug.keywords.length ? sug.keywords : undefined;
    // Only a real decision is a style example — re-keeping the frame's own line unchanged isn't.
    const changed = finalLine !== committedRef.current.trim() || !!sug.raw;
    lastCommit.current = finalLine;
    onCommit(finalLine, knownKeys, sug.transition ?? undefined, pruned);
    if (changed) void logTeleprompterFeedback({ data: { setId: ctx.setId, frameId: ctx.frame.id, rawTranscript: sug.raw, suggestedLine: sug.suggested, finalLine, action, who: getAdminWho() } });
    // The kept line is v1 again.
    setSug(seed(finalLine, knownKeys, pruned, sug.transition ?? undefined));
    if (knownKeys) return;
    try {
      const k = await keywordsFor(ctx.setId, finalLine);
      if (k.length && alive.current && committedRef.current.trim() === finalLine) { onCommit(finalLine, k, sug.transition ?? undefined, pruned); setSug((s) => (s.suggested === finalLine ? { ...s, keywords: k, versions: s.versions.map((v, i) => (i === 0 ? { ...v, keywords: k } : v)) } : s)); }
    } catch { /* kept either way */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sug, onCommit, ctx.setId, ctx.frame.id]);

  const talk = useSpokenTake((take) => void suggest(take), false);
  const loading = sug.status === "loading";
  const useLabel = talk.take ? "✓ use that" : "✓ Use this";

  return (
    <div>
      {sug.status === "error" && sug.error && (
        <div style={{ marginBottom: 8, fontSize: 12, color: ORANGE, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {sug.error} <button type="button" onClick={() => void suggest(sug.raw || talk.take)} style={btn()}>Try again</button>
        </div>
      )}
      {sug.said && talk.take && (
        <div style={{ marginBottom: 8 }}>
          <LineCard title="Your take, cleaned" line={sug.said} useLabel={useLabel} onUse={() => void commit(sug.said, "said", undefined)} />
        </div>
      )}
      <div style={{ opacity: loading ? 0.75 : 1, transition: "opacity 120ms" }}>
        <LineCardView suggestion={sug} loading={loading} useLabel={useLabel} onPick={(l, a, m) => void commit(l, a, m)} onShorten={() => void shorten()} onShow={(i) => setSug((cur) => showingVersion(cur, i))} onMarks={setMarks} />
      </div>
      <TalkRow talk={talk} compact />
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
