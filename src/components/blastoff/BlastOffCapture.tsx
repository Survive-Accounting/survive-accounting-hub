// CAPTURE — /v3/$topic/$set/blast-off/film. The phone, full height, spacebar
// forward. Nothing else on screen: OBS captures this window and anything that
// is not the frame is in the shot.
//
// Since 2026-09-04 this draws the SAME PhoneFrame the Review stage draws (Lee:
// "these easy points ones can get away with just the /film possibly?"), so the
// slide Lee approved on /results is, pixel for pixel at a bigger size, the slide
// that films — black surround, the wordmark watermark, the campus banner, all
// by the same rules.
//
// THE TOOLS (2026-09-04, evening). Lee: "It's missing the interactivity tools
// (really all of them are now …) alt + click to grab/move, zooming, spotlights,
// shift click drag to highlight, clicking an answer choice … We've built so
// much great stuff, why isn't it working?" The audit
// (docs/FILM-INTERACTIVITY-AUDIT.md) answered: every tool lives in the canvas
// previewer and reads a React context the canvas popout provides; this route
// mounted the same card INERT with only the highlight context. So this file
// now provides what the live card reads — practice (click an answer, click
// again to resolve, with the sounds), the rehearsal spotlight (Ctrl+click,
// Ctrl+Shift for the super, +Alt for the siren), the shared text highlights
// (Shift+click a word, drag to highlight) — and is the `film-mode` root the
// card stylesheet keys its motion on, with the brand cursor. The camera
// (zoom, O, Alt-move, grips), the F1 arrows, the teleprompter sync and the
// 9:16 pop-out each live in ./capture/* and plug in here — joined on
// 2026-09-06 by the rehearsal rounds (R), the teleprompter's own pop-out
// window and the "?" hotkeys card, same folder, same shape.
//
// TWO WINDOWS, ONE MONITOR (2026-09-07). Lee: "I am planning to pop out the capture window and
// be looking at that when I'm recording live… but the /film window is still open and has the
// slides right there too. I would prefer with capture window having a 10 second countdown… like
// we're on slide 0 at that point. and once that countdown starts, we have the /film on slide
// one… BUT, when countdown hits, we advance /film to slide 2. It's maybe a bit more, not
// blurred, but like opaque, so it's not complete focus yet. BUT, this will help me to see *what
// slide comes next* so I can have some really smooth transitions in mind." And: "The film screen
// has the slides in the exact center of the monitor. There's enough space to the left for me to
// place popout capture window to the left, so I can see them side by side, but within one
// monitor." So the pop-out (the take, the CURRENT slide) sits left; this main window stays
// centred and, while the pop-out is live, becomes the NEXT-SLIDE PREVIEW: the slide after the
// pop-out's, at 0.55 opacity, its own spacebar ignored. The pop-out drives, never the reverse.
// How the main window knows (the sa-film-active record's popout flag + heartbeat) is
// capture/prompter-sync.ts; the countdown itself is capture/popout.ts. "A big part of my
// teaching style that hits so hard is my TIMING for moving a slide at the perfect emphasis
// moment" — seeing the next slide is what this buys him.
//
// THE MAP (2026-09-07, cluster/cluster-spec.ts). Lee: "see the entire cluster from birds eye
// view in the frame, but we can go swim around for it in the capture window." On a cluster
// frame the SHOTS are the spacebar: space walks the shot until the last, then the frame;
// shift+space walks shots back, then the previous frame; the shot resets on a frame change.
// The camera gestures act on the FIELD there (capture/field-roam.ts — wheel, alt-drag, 0, O),
// the card camera stands down (`target: "field"`), the record carries the shot for the prompter,
// and a click on A / L / E cycles its arrow for the take only (never written to the map).
//
// FILM FROM HERE (2026-09-10, `startFrameId` / the route's ?frame=<id>). Lee: "'Film from here'
// is essential. I'm sick of scrolling all the way through. If that can be a popout from right
// there, that'd be epic. I don't have to go to the rehearsal spot most times." The walk OPENS on
// the named slide (startIndexOf, seeded once when the plan lands) — main window and, because the
// pop-out copies the URL, the pop-out too. Nothing else moved: F4 still never moves the slide, C
// still counts in from slide 0, and the rounds' "from slide 1" is still slide 1.
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { ASSEMBLY_SHORT_MS, ASSEMBLY_TOTAL_MS } from "@/components/brand-cards/cold-open";
import { BrandCursor } from "@/components/canvas/BrandCursor";
import { V3_DISPLAY, type Crumb } from "@/components/v3/Shell";
import { MoveContext, PersistContext, PracticeContext, PreviewSpotContext, ScaleContext, WidthContext, type PreviewSpotApi } from "@/components/canvas/CeqPreviewer";
import { applyRegularClick, applySuperClick, type SpotSets } from "@/components/canvas/spotlight";
import { HighlightContext, useTextHighlights } from "@/components/canvas/text-highlights";
import { recentCannedLineUses } from "@/lib/canned-lines.functions";
import { useDictation } from "@/lib/use-dictation";

import { BG, CREAM, EDGE, GOLD, MUTED, usePlan } from "./BlastOffEditor";
import { cannedLinesFor, pickCannedLine, type CannedLine, type CannedSlot } from "./canned-lines";
import { CaptureArrows } from "./capture/arrows";
import { useCaptureCamera } from "./capture/camera";
import { useFieldRoam } from "./capture/field-roam";
import { HotkeysModal } from "./capture/HotkeysModal";
import { COUNTDOWN_SECONDS, countdownCue, countdownTone, useCapturePopout, useCountdown } from "./capture/popout";
import { previewIndex, signalRoll, useCapturePrompterSyncFrame, usePopoutTake, useRollSignal } from "./capture/prompter-sync";
import { fmtClock, historyLabel, initialRounds, opensReview, prompterEditable, reduceRounds, roundLabel, roundMode, roundSegments, showsPrompterInRound } from "./capture/rehearsal-rounds";
import { useTeleprompterPopout } from "./capture/teleprompter-popout";
import { isCamSpot, nextCamSpot, type CamSpot } from "./capture/webcam-spots";
import { camDefault, layoutOf, type RailStatus } from "./layout";
import { ClusterFilmContext, type ClusterFilm } from "./cluster/ClusterStage";
import { resolveCluster, type ArrowOverrides, type EqTerm } from "./cluster/cluster-models";
import { cameraAt, shotsOf } from "./cluster/cluster-spec";
import { nextEqDir } from "./cluster/nodes/EquationNode";
import { questionProgress } from "./frame-view";
import { PhoneFrame } from "./PhoneFrame";
import { markStyle, paintLine } from "@/lib/prompter-marks";

import { FRAME_LABEL, filmFrames, normalizeMarks, patchFrame, planTakes, takeLabel, type BlastFrame, type PrompterMarks } from "./plan";
import { RehearsalReview, SuggestedCard } from "./RehearsalReview";
import { SlideEditContext } from "./slide-edit";

/** open/intro share the "intro" slot (one spoken line, two frames); bio and outro are their own. */
function cannedSlotOf(kind: BlastFrame["kind"]): CannedSlot | null {
  if (kind === "open" || kind === "intro") return "intro";
  if (kind === "outro") return "outro";
  if (kind === "bio") return "bio";
  return null;
}

const NO_SPOTS: SpotSets = { regular: new Set(), superKey: null, superTone: "focus" };

// NO NATIVE SELECTION ON THE FILM SURFACE, EXCEPT UNDER SHIFT (2026-09-09). Lee: a click-drag
// across a stem turned blue, and the camera ring got selected — in the shot. CeqPreviewer sets
// `userSelect: "text"` INLINE on the stem, the choices and the callout body in film mode (that is
// how shift+drag reads a selection for a highlight), so a plain root rule loses to it: hence
// `!important`. The `sa-shift` class is capture/camera.ts's Shift latch — while Shift is down the
// card's text is selectable again and its ::selection is the amber it always was, so shift+drag
// highlights exactly as before; a single-word shift+click is caret-based and never needed the
// selection at all. This is CSS, not chrome: it rides in the pop-out too, where it matters most.
//
// THE ONE EXCEPTION is the chrome that EDITS: the prompter panel and the rehearsal review read
// `window.getSelection()` for the mark toolbar ("select words → transition phrase / cue word")
// and hold a textarea. Both are main-window overlays, never the shot, so `data-sa-film-chrome`
// hands them their selection back, in the browser's own colour.
const FILM_SELECT_CSS = `
.film-mode, .film-mode * { -webkit-user-select: none !important; user-select: none !important; -webkit-user-drag: none; }
.film-mode.sa-shift .sa-pv-node, .film-mode.sa-shift .sa-pv-node * { -webkit-user-select: text !important; user-select: text !important; }
.film-mode ::selection { background: transparent; }
.film-mode.sa-shift .sa-pv-node ::selection { background: rgba(252,163,17,0.9); color: #0B0F1E; }
.film-mode [data-sa-film-chrome], .film-mode [data-sa-film-chrome] * { -webkit-user-select: text !important; user-select: text !important; }
.film-mode [data-sa-film-chrome] ::selection { background: Highlight; color: HighlightText; }
`;

/** FILM FROM HERE (2026-09-10): where the walk starts — the index of `startFrameId` in the frames
 *  being walked (the split's, or the whole set's), or 0 when there is no id or the list does not
 *  have it. Never throws: an id from another split, a skipped slide, or a stale link is slide 1,
 *  exactly as before. Pure, so it is testable on its own. */
export function startIndexOf(frames: readonly { id: string }[], startFrameId: string | undefined | null): number {
  if (!startFrameId) return 0;
  const k = frames.findIndex((f) => f.id === startFrameId);
  return k < 0 ? 0 : k;
}

export function BlastOffCapture({ set, topicName, onExit, crumbs, take: takeParam, startFrameId }: {
  set: BoothSetInfo; topicName?: string; onExit: () => void;
  /** The V3 breadcrumb (Lee, 2026-09-07: "Show navigation breadcrumbs on /film") — drawn small,
   *  top-left, only with the chrome and only in the main window, so it never films. */
  crumbs?: Crumb[];
  /** ?take=N (2026-09-09): film ONE split — the Nth run between cuts, 0-based, numbered the way
   *  /v3/post's rows are. Undefined films the whole set. Lee: "I only did account classification
   *  > assets. Not the full thing." */
  take?: number;
  /** ?frame=<id> (2026-09-10): FILM FROM HERE — the walk opens ON this slide instead of slide 1.
   *  Lee: "'Film from here' is essential. I'm sick of scrolling all the way through. If that can
   *  be a popout from right there, that'd be epic. I don't have to go to the rehearsal spot most
   *  times." An id not in the walked frames is ignored. Only where the walk STARTS: C (count in)
   *  and the rehearsal's own "from slide 1" jumps are untouched. */
  startFrameId?: string;
}) {
  const { plan, commit } = usePlan(set);
  const [i, setI] = useState(0);
  const ceqById = useMemo(() => new Map(set.ceqs.map((c) => [c.id, c])), [set.ceqs]);
  // The SHARED highlight store (canvas/text-highlights) — same gesture, same
  // offsets, same gold as the canvas. Session-scoped, so marks survive walking
  // between frames within a rip and die only on ` or leaving capture.
  // KEYED BY THE SET (2026-09-08), so the marks cross into the pop-out. Lee: "highlights on text
  // when in popped out need to persist. I'll pre-highlight things before filming sometimes."
  const { api: hlApi, clearAll: clearAllTextHls } = useTextHighlights(set.id);
  // THE PROMPTER (2026-09-03): the lines Lee kept on the review deck, beside
  // the slide they belong to. P hides and shows it.
  const [prompter, setPrompter] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  // Skipped cards never reach a take.
  const all = useMemo(() => filmFrames(plan?.frames ?? []), [plan]);
  // ONE SPLIT (2026-09-09): with ?take=N the frames are that run's alone, so everything below —
  // n, idx, the pop-out's next-slide preview, the prompter sync, the rounds — walks only the split
  // and never has to know. The takes are cut over the FILMED frames, exactly as /v3/post numbers
  // them (lib/blastoff.functions.ts), so "Split 2" here is "Split 2" there. The pop-out inherits
  // the URL, so both windows compute the same list — previewIndex depends on that.
  const takes = useMemo(() => planTakes(all), [all]);
  const takeInfo = takeParam != null ? takes[takeParam] : undefined;
  /** ?take=N named a split the plan does not have — film the whole set, and say so in the chrome. */
  const takeMissing = takeParam != null && !takeInfo;
  const frames = takeInfo ? takeInfo.frames : all;
  const n = frames.length;
  // FILM FROM HERE (2026-09-10, startIndexOf above). The plan arrives after mount, so `i` cannot
  // be seeded in useState — it is seeded ONCE, the first render that has a plan, and set DURING
  // that render (React re-renders before committing, so no paint and no effect — in particular
  // the sa-film-active record — ever sees slide 1 first). Once only: after that the walk is
  // Lee's, and nothing here pulls him back. Rehearsal needs no skipping: the rounds start "off",
  // which IS filming — R is the way in, never the way out.
  const [startSeeded, setStartSeeded] = useState(!startFrameId);
  if (!startSeeded && plan) {
    setStartSeeded(true);
    const k = startIndexOf(frames, startFrameId);
    if (k > 0) setI(k);
  }
  // THE NEXT-SLIDE PREVIEW (2026-09-07, header). This is the main window when `take` is non-null:
  // the 9:16 pop-out is live (its record is fresh, capture/prompter-sync.ts) and this window shows
  // the slide AFTER the pop-out's — `idx` IS that slide for everything below (the phone, the
  // camera, the prompter panel), so nothing downstream has to know. Slide 1 during the pop-out's
  // countdown; one past the end on its last slide ("— end —"). The pop-out never listens.
  const popout = useCapturePopout();
  const take = usePopoutTake(set.id, !popout.isPopout);
  const previewIdx = take ? previewIndex(frames, take) : null;
  const preview = previewIdx !== null;
  const atEnd = preview && previewIdx >= n;
  const idx = preview ? Math.min(previewIdx, Math.max(0, n - 1)) : Math.min(i, Math.max(0, n - 1));
  const frame = frames[idx];
  const frameId = frame?.id ?? null;
  const ceq = frame?.kind === "ceq" && frame.ceqId ? ceqById.get(frame.ceqId) : undefined;

  // ---- THE MAP (header): the shot being walked, per frame — a new frame is shot 0 with no
  // flash of the old one (the same {id, value} pattern the card camera's slide state uses).
  const cluster = frame?.kind === "cluster" ? frame.cluster ?? null : null;
  const shots = useMemo(() => (cluster ? shotsOf(cluster) : []), [cluster]);
  const [shotState, setShotState] = useState<{ id: string; shot: number }>({ id: "", shot: 0 });
  const shot = cluster && shotState.id === frameId ? Math.min(shotState.shot, Math.max(0, shots.length - 1)) : 0;
  const setShot = useCallback((f: (s: number) => number) => { const id = frameId ?? ""; setShotState((p) => ({ id, shot: Math.max(0, f(p.id === id ? p.shot : 0)) })); }, [frameId]);
  // THE ARROWS (Lee: "click around each A = L + E and move the arrows how I want"): the take's
  // overrides over the map's own arrows, per frame, never written back to the plan.
  const [arrowState, setArrowState] = useState<{ id: string; over: ArrowOverrides }>({ id: "", over: {} });
  const arrowOverrides = arrowState.id === frameId ? arrowState.over : undefined;
  const resolvedMap = useMemo(() => (cluster ? resolveCluster(cluster) : null), [cluster]);
  const onArrowCycle = useCallback((nodeId: string, term: EqTerm) => {
    const base = resolvedMap?.get(nodeId)?.view;
    if (!base || base.kind !== "equation") return;
    const id = frameId ?? "";
    setArrowState((p) => {
      const over = p.id === id ? p.over : {};
      const cur = over[nodeId]?.[term] ?? base.arrows[term];
      return { id, over: { ...over, [nodeId]: { ...over[nodeId], [term]: nextEqDir(cur) } } };
    });
  }, [resolvedMap, frameId]);

  // POPOUT-ONLY EDITING (2026-09-06, Lee: "let the illustrations be picked up and movable
  // resizable from capture popout window"). slide-edit.ts's own rule is that capture never
  // provides this context — a real, deliberate choice so nothing shifts mid-take by accident —
  // so this only reaches PhoneFrame at all when popout.isPopout is true (below), never in the
  // plain in-page capture. Patches the CURRENT frame only, straight onto the plan.
  const patchCurrentFrame = useCallback((p: Partial<BlastFrame>) => { if (plan && frameId) commit(patchFrame(plan.frames, frameId, p)); }, [plan, commit, frameId]);

  // ---- REHEARSAL (2026-09-06, second pass). Lee: "I can't see the teleprompter or understand
  // how it works... I'd prefer to see it somewhere on film. Flip on teleprompter, then I record
  // like I normally would. Same pop out window. But it's letting me talk about each slide and
  // run through what I plan to say. Then we have the review at the end, then we go nail it and
  // move to next video." So this lives right here, in the real capture surface — R toggles
  // rehearsing (or the chip in the chrome bar); walking slide to slide while it's on (the exact
  // same spacebar navigation as a real take) dictates into the round's segments, keyed by frame
  // id; Review turns each into two lines (his words cleaned, and a suggestion) Lee picks from or
  // overwrites, which lands on frame.prompter — the SAME prompter panel below then shows it once
  // he's back to actually filming.
  //
  // ROUNDS (2026-09-06, third pass — capture/rehearsal-rounds.ts has the whole design record).
  // Lee: "Putting this into rounds... round 1, round 2." "Time the rehearsal... it should start
  // with a spacebar. So, I enter rehearsal mode, then press space to start." R arms, space
  // starts (from slide 1, clock and dictation running), space on the last slide walks off the end
  // and finishes; rounds 1 and 2 end in the review, 3+ just show the time. Round 1 is blind.
  const [rounds, dispatchRounds] = useReducer(reduceRounds, undefined, initialRounds);
  const phase = rounds.phase;
  const running = phase === "running";
  /** 0 when not rehearsing — what the prompter panel's gating reads. */
  const rehearsalRound = phase === "off" ? 0 : rounds.round;
  /** THIS round's transcript, per frame id. */
  const segments = roundSegments(rounds);
  // LIVE CAPTION (2026-09-06): Lee: "as I'm talking, just live dictate over there... seeing the
  // words populate will help me get a feel for brevity visually." `interim` is the in-progress,
  // not-yet-finalized chunk SpeechRecognition is still working out — shown live, replaced (not
  // accumulated) on every event; only a FINAL chunk joins the round's segments.
  const [interim, setInterim] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const frameIdRef = useRef(frameId);
  frameIdRef.current = frameId;
  const dictation = useDictation((final, live) => {
    const fid = frameIdRef.current;
    setInterim(live);
    if (!final.trim() || !fid) return;
    dispatchRounds({ type: "addFinal", frameId: fid, text: final });
  });
  useEffect(() => {
    if (!running || !dictation.supported) return;
    dictation.start();
    return () => dictation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  // Walking to another slide restarts the slide clock (and clears the in-progress caption).
  useEffect(() => { setInterim(""); if (running) dispatchRounds({ type: "slide", now: Date.now() }); }, [frameId, running]);
  // The clock pill re-renders four times a second while a round is armed or running — nothing
  // else keys on this, so it's the cheapest honest clock there is.
  const [, tick] = useState(0);
  useEffect(() => {
    if (phase === "off") return;
    const t = setInterval(() => tick((v) => v + 1), 250);
    return () => clearInterval(t);
  }, [phase]);
  // Round 3+ ends without a review — "just show the round time" for a moment, then nothing on
  // screen that could film.
  const [lastRound, setLastRound] = useState<{ round: number; seconds: number } | null>(null);
  useEffect(() => {
    if (!lastRound) return;
    const t = setTimeout(() => setLastRound(null), 4000);
    return () => clearTimeout(t);
  }, [lastRound]);

  const finishRound = useCallback(() => {
    if (rounds.phase !== "running") return;
    const now = Date.now();
    dispatchRounds({ type: "finish", now });
    if (opensReview(rounds.round)) setShowReview(true);
    else setLastRound({ round: rounds.round, seconds: Math.round((now - (rounds.startedAt ?? now)) / 1000) });
  }, [rounds]);
  /** R: off → armed · armed → off · running → finished (review after rounds 1 and 2). */
  const pressR = useCallback(() => {
    if (rounds.phase === "off") dispatchRounds({ type: "arm" });
    else if (rounds.phase === "armed") dispatchRounds({ type: "cancel" });
    else finishRound();
  }, [rounds.phase, finishRound]);
  /** Space while armed: from slide 1, clock and dictation on. */
  const startRound = useCallback(() => { setI(0); dispatchRounds({ type: "start", now: Date.now() }); }, []);
  /** Shift+R / "↺ start over (round 1)" — Lee, 2026-09-07: "Start over should give you another
   *  round 1." From ANY phase: back to slide 1, armed on round 1, nothing of this session's
   *  rehearsal kept (the reducer wipes the transcripts and the times; the dictation stops because
   *  the phase is no longer running). The "done" toast goes too — it was a round that no longer
   *  counts. */
  const startOver = useCallback(() => { setI(0); setInterim(""); setLastRound(null); dispatchRounds({ type: "startOver" }); }, []);
  /** ` / "✕ scratch take" — this slide's take, this round. */
  const scratchTake = useCallback(() => { setInterim(""); if (frameId) dispatchRounds({ type: "scratch", frameId }); }, [frameId]);

  // Keys + the hand-off (2026-09-07): the rehearsal review passes the scan keywords and the
  // transition of the line Lee kept; the teleprompter's keyword mode reads them off the frame.
  // And the TIMING MARKS (2026-09-07, later — Lee: "transition phrase is yellow but the word
  // itself is orange"): an object sets them (an empty one clears — a fresh pick with no marks
  // must not keep an old slide's), undefined leaves them.
  const commitPrompterLine = useCallback((fid: string, line: string, keys?: string[], transition?: string, marks?: PrompterMarks) => {
    if (plan) commit(patchFrame(plan.frames, fid, { prompter: [line], ...(keys ? { prompterKeys: keys } : {}), ...(transition !== undefined ? { prompterTransition: transition } : {}), ...(marks !== undefined ? { prompterMarks: normalizeMarks(marks) } : {}) }));
  }, [plan, commit]);
  /** The panel's card, line k of the frame's prompter (the review writes one line; older plans
   *  may hold several): that line is replaced in place; keys / transition / marks belong to the
   *  frame, so only the first line's card writes them. */
  const commitPrompterAt = useCallback((fid: string, k: number, line: string, keys?: string[], transition?: string, marks?: PrompterMarks) => {
    if (!plan) return;
    const f = plan.frames.find((x) => x.id === fid);
    const committed = f?.prompter ?? [];
    const prompter = committed.length ? committed.map((l, j) => (j === k ? line : l)) : [line];
    if (k > 0) { commit(patchFrame(plan.frames, fid, { prompter })); return; }
    commit(patchFrame(plan.frames, fid, { prompter, ...(keys ? { prompterKeys: keys } : {}), ...(transition !== undefined ? { prompterTransition: transition } : {}), ...(marks !== undefined ? { prompterMarks: normalizeMarks(marks) } : {}) }));
  }, [plan, commit]);
  // The round already ended when the review opened, so closing it — by "← back to rehearsal" or
  // by Done — is just closing it; the next R arms the next round.
  const closeReview = useCallback((_done: boolean) => { setShowReview(false); }, []);
  const segmentCount = Object.keys(segments).length;

  // ---- CANNED INTRO/OUTRO/BIO (2026-09-06). Lee: "when I am in rehearse mode, I want to
  // already have the suggested intro/outro/bio canned ready. So I can start practicing using
  // it." Picked ONCE per mount (not re-rolled every time Lee walks back to the slide — a
  // suggestion that changes under him mid-rehearsal would be its own kind of confusing), fed to
  // the prompter panel below as a clearly-marked SUGGESTION until Review actually commits one,
  // and handed to RehearsalReview as the seed for its own picker so the line Lee practiced with
  // is the same one preselected there — never a second, different roll.
  const [cannedPicks, setCannedPicks] = useState<Partial<Record<CannedSlot, CannedLine>>>({});
  useEffect(() => {
    let live = true;
    Promise.all((["intro", "outro", "bio"] as const).map((slot) =>
      recentCannedLineUses({ data: { slot } })
        .then((recent) => [slot, pickCannedLine(cannedLinesFor(slot), slot, recent)] as const)
        .catch(() => [slot, cannedLinesFor(slot)[0] ?? null] as const)
    )).then((entries) => {
      if (!live) return;
      const picks: Partial<Record<CannedSlot, CannedLine>> = {};
      for (const [slot, pick] of entries) if (pick) picks[slot] = pick;
      setCannedPicks(picks);
    });
    return () => { live = false; };
  }, []);
  const cannedSlot = cannedSlotOf(frame?.kind ?? "ceq");
  const cannedSuggestion = cannedSlot ? cannedPicks[cannedSlot] ?? null : null;

  // ---- PRACTICE: click a choice to emphasise it, click it again to resolve ----
  // No sound cue at all now (Lee, 2026-09-06: "Remove cha ching in capture mode"... "Remove
  // scratch out sound too") — the canvas's own per-question confirmSfx toggle is untouched;
  // this is Blast Off Film's own resolve, and it never had that toggle to begin with, it just
  // always played both.
  const [emph, setEmph] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Set<number>>(() => new Set());
  const resolveChoice = useCallback((k: number) => {
    if (resolved.has(k)) return;
    setEmph(k);
    setResolved((r) => new Set(r).add(k));
  }, [ceq, resolved]);
  const practice = useMemo(() => ({ emph, resolved, select: (k: number) => setEmph(k), resolveChoice }), [emph, resolved, resolveChoice]);

  // ---- THE REHEARSAL SPOTLIGHT: Ctrl+click = a gold pill (re-click a lit one
  // clears all); Ctrl+Shift = the super (🔥); +Alt = the siren (🚨). Same
  // reducers as the canvas (canvas/spotlight.ts), same CSS (PV_CSS).
  const [spots, setSpots] = useState<SpotSets>(NO_SPOTS);
  const spotClick = useCallback((key: string, e: React.PointerEvent) => {
    if (e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setSpots((s) => applySuperClick(s, key, e.altKey ? "warn" : "focus")); return; }
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setSpots((s) => (s.regular.has(key) || s.superKey === key ? NO_SPOTS : applyRegularClick(s, key))); }
  }, []);
  const spotApi = useMemo<PreviewSpotApi>(() => ({
    state: (key) => (spots.regular.has(key) || spots.superKey === key ? "spot" : null),
    flamed: (key) => spots.superKey === key,
    tone: () => spots.superTone ?? "focus",
    onClick: spotClick,
    any: () => spots.regular.size > 0 || spots.superKey !== null,
  }), [spots, spotClick]);

  // Walking to another slide starts it clean: no emphasis, no spotlight. The
  // text highlights are the one thing that survives a walk (as on the canvas).
  useEffect(() => { setEmph(null); setResolved(new Set()); setSpots(NO_SPOTS); }, [frameId]);
  // THE HERO (2026-09-05): ctrl+click on the camera — the camera takes the top of the frame
  // and the wordmark takes the centre. Lives here, not in the phone, so the next slide, the
  // backtick wipe and B→off all end it (they could not reach the phone's private state).
  const [hero, setHero] = useState(false);
  useEffect(() => { setHero(false); }, [frameId]);
  // THE CAPTION RAIL CHECK: the phone reports whether the card or the camera sits on the
  // fixed rail; the chrome bar says so before the take, not after the burn.
  const [railStatus, setRailStatus] = useState<RailStatus>("clear");
  // ` also puts the map's arrows back the way the map has them (the take's overrides go).
  const resetTake = useCallback(() => { setEmph(null); setResolved(new Set()); setSpots(NO_SPOTS); clearAllTextHls(); setHero(false); setArrowState({ id: "", over: {} }); }, [clearAllTextHls]);

  // ---- the plug-ins: camera, arrows, teleprompter sync, the 9:16 pop-out ----
  // On a map frame the card camera stands down and the field roam takes the same gestures.
  const camera = useCaptureCamera({ hostRef, frameId: frameId ?? "", target: cluster ? "field" : "card" });
  const fieldRoam = useFieldRoam({ hostRef, active: !!cluster && !preview, shot: cluster ? cameraAt(cluster, shot) : null, field: cluster?.field ?? null, key: `${frameId ?? ""}:${shot}` });
  const openTeleprompter = useTeleprompterPopout(set.id);
  // THE COUNTDOWN (pop-out only; capture/popout.ts). Starting it jumps to slide 0, so slide 1 is
  // what is there when the black lifts. Cancelling (space) leaves slide 1 up as well.
  //
  // THE COUNT AND THE ASSEMBLY ARE THE SAME SECONDS (2026-09-08). Lee: "I do want a countdown as
  // well to ensure that filming is easy. I can take a deep breath, and know exactly when to hit
  // F1... so I don't miss the transition. Better yet, for exact consistency, I'd love to reuse the
  // tool I built for wiring this up to OBS." So the count is NOT a black card in front of slide 1
  // any more: slide 1 assembles itself across the ten seconds (brand-cards/cold-open.ts), the
  // number recedes as the frame fills, and the wordmark lands on zero. `countRun` restarts the
  // assembly when the count is started again from the same slide.
  //
  // ONE RUN AT A TIME. `run.id` is the assembly's identity — a new id remounts it and it plays
  // from the top; the same id leaves it wherever it finished (the CSS holds its end state), which
  // is what must happen the instant the count reaches zero. Two things start a run: pressing C
  // (ten seconds, the take) and ARRIVING on the open frame (2.2 s, so the cold open always
  // assembles even when Lee doesn't count in — walk away and back and it plays again).
  //
  // AND IN THE POP-OUT IT HOLDS (2026-09-08). The pop-out IS the OBS window capture, so
  // whatever it is showing when Lee hits Record is the head of the file. Playing the short
  // assembly on arrival left it sitting on a FINISHED slide one; pressing C then snapped it
  // back to black and rebuilt it — a head every take would need trimming, which is the one
  // thing filming in a single pass is supposed to avoid. So in the pop-out the open frame holds
  // at rest — black, the bolt, nothing assembled, exactly Lee's own picture of it ("nothing
  // being on the screen maybe except the Bolt in the background") — until C rolls it. Record
  // whenever; the take starts when the machine starts. Every other window keeps the arrival
  // play, because nothing there is being recorded.
  //
  // THE COUNT AND THE ASSEMBLY ARE NOT THE SAME SECONDS (2026-09-09) — corrected, because they
  // were. Lee: "The assembly animation isn't working like I want. I want it to start assembling
  // the second the video starts. The second I start talking. So the countdown from 10, at 0 I
  // hit my recording hotkey F4. Animation begins. We could even program the animation to hit
  // when I press f4?"
  //
  // We can, and that is the whole fix. The count is now a LEAD-IN and nothing else: ten seconds
  // to breathe while the pop-out holds on black and the bolt, with the number in the main window
  // only. It starts nothing. F4 — Lee's OBS record hotkey — is what rolls: the recording begins
  // and the machine begins assembling on the same press, so frame one of the file is frame one
  // of the assembly and there is no head to trim and no dead air to talk over.
  //
  // F4 REACHES THE POP-OUT FROM EITHER WINDOW. Only the focused window sees a keypress, and the
  // window that must assemble is the pop-out — so whichever window gets the key rolls itself and
  // writes the roll (capture/prompter-sync.ts), and the pop-out acts on it either way.
  //
  // F4 DOES NOT MOVE THE SLIDE (2026-09-09, later). It used to `setI(0)` as well — every F4, in
  // both windows, snapped back to slide 1. Lee: "I press it mid-split and it wrecks the take."
  // F4 is the OBS record key; recording can start on any slide (a second split, a retake from
  // slide 4). So `roll` only bumps the run: the cold open is gated on idx === 0 below, so F4 on
  // slide 1 still assembles it and F4 anywhere else just means OBS is recording. The COUNT keeps
  // its jump to the top — C means "go to slide 0 and count in", and that is a different key.
  const [run, setRun] = useState<{ id: number; ms: number; held?: boolean }>({ id: 0, ms: ASSEMBLY_SHORT_MS });
  const roll = useCallback(() => setRun((r) => ({ id: r.id + 1, ms: ASSEMBLY_TOTAL_MS })), []);
  const countdown = useCountdown(useCallback(() => { setI(0); setRun((r) => ({ id: r.id + 1, ms: ASSEMBLY_SHORT_MS, held: true })); }, []));
  const { start: startCountdown, cancel: cancelCountdown } = countdown;
  // F4 pressed in the OTHER window: roll, and end any count that was still running.
  useRollSignal(set.id, popout.isPopout, useCallback(() => { cancelCountdown(); roll(); }, [cancelCountdown, roll]));
  const counting = countdown.seconds !== null;
  // WHICH SLIDE ASSEMBLES (2026-09-09). Lee: "animation still isn't showing up on entrance."
  // It could not: his draft SKIPS the cold open, so filmFrames drops it and slide one is the
  // INTRO — and the assembly only ever attached to kind "open". Whatever he opens on is the
  // slide that has to build itself, and both brand cards are drawn by the same component
  // (BoltZoom), so the choreography lands on either. Anchored to the first FILMED slide rather
  // than to a kind: F4 rolls the video, and the video starts wherever he starts it.
  const isOpenFrame = !!frame && idx === 0 && (frame.kind === "open" || frame.kind === "intro");
  const lastOpenId = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpenFrame) { lastOpenId.current = null; return; }
    // The count's own jump to slide 0 lands here too — it already started its run, so record the
    // slide and leave it alone, and do NOT re-run when the count ends (that would replay the
    // short assembly on top of the landing).
    if (lastOpenId.current === frameId || counting) { lastOpenId.current = frameId; return; }
    lastOpenId.current = frameId;
    // In the pop-out, arriving does not play it — it HOLDS (see the note above). C rolls it.
    setRun((r) => (popout.isPopout ? { id: r.id + 1, ms: ASSEMBLY_SHORT_MS, held: true } : { id: r.id + 1, ms: ASSEMBLY_SHORT_MS }));
  }, [isOpenFrame, frameId, counting, popout.isPopout]);
  // The main window's NEXT preview never assembles: it is showing Lee what is coming, so it shows
  // slide one finished. Nor does anything outside capture — the Review stage draws it at rest.
  const coldOpen = isOpenFrame && !preview ? { ms: run.ms, key: run.id, held: !!run.held } : null;
  // What this window tells the teleprompter (and, from the pop-out, the main window): its slide —
  // or, during the countdown, no slide ("slide 0") with the countdown flag. The main window
  // writes NOTHING while the pop-out's take is live: the pop-out is the one that films.
  // ...and, since 2026-09-08, the COUNT ITSELF: the digits are Lee's, not the audience's, so
  // they travel to this window instead of drawing in the shot (capture/popout.ts's header).
  useCapturePrompterSyncFrame(set.id, counting ? null : frame ?? null, { paused: take !== null, popout: popout.isPopout, countdown: counting, ...(countdown.seconds !== null ? { count: countdown.seconds } : {}), ...(cluster ? { shot } : {}) });
  // Inside the popped-out window the chrome starts hidden — the window IS the shot.
  const [chrome, setChrome] = useState(!popout.isPopout);
  // THE CAMERA for this take: the slide's own spot, or B's override (home →
  // corner → hero → top → off — nextCamSpot in webcam-spots.ts; "top" joined
  // the cycle with pass 2, 2026-09-05), which lasts until the next slide.
  const [camOverride, setCamOverride] = useState<CamSpot | null>(null);
  useEffect(() => { setCamOverride(null); }, [frameId]);
  const camNow: CamSpot = camOverride ?? (frame ? (isCamSpot(frame.cam) ? frame.cam : camDefault(layoutOf(plan), frame.kind).spot) : "off");
  // A QA override left on the filming PC films the wrong pass — say so in the chrome (audit §2.15).
  const qaLayout = (() => { try { return typeof window !== "undefined" ? window.localStorage.getItem("sa-layout-qa") : null; } catch { return null; } })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (showReview) {
        // The review overlay is a modal on top of capture — Escape backs out of IT first,
        // never straight past it out of Film. Every other shortcut is capture's own and stays
        // inert while it's up (the overlay has its own buttons/inputs).
        if (e.key === "Escape") { e.preventDefault(); closeReview(false); }
        return;
      }
      if (showHotkeys) {
        // The hotkeys card is a reference, not a surface — Escape or ? closes it, nothing else
        // fires through it.
        if (e.key === "Escape" || e.key === "?") { e.preventDefault(); setShowHotkeys(false); }
        return;
      }
      if (e.key === "?") { e.preventDefault(); setShowHotkeys(true); return; }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        // THE COUNTDOWN: space while it runs cancels it (slide 1 stays up). And the main window's
        // own space is ignored while the pop-out's take is live — the pop-out drives.
        if (counting) { cancelCountdown(); return; }
        if (preview) return;
        // REHEARSAL: space while armed STARTS the round (Lee: "I enter rehearsal mode, then press
        // space to start"); space on the LAST slide while running walks off the end and FINISHES
        // it — no wrap, the slide stays. Otherwise it's the same walk as a real take.
        if (rounds.phase === "armed" && !e.shiftKey) { startRound(); return; }
        // THE MAP: the shots first — space walks the shot until the last, shift+space back to
        // the first; only off either end does the walk leave the frame.
        if (cluster && !e.shiftKey && shot < shots.length - 1) { setShot((s) => s + 1); return; }
        if (cluster && e.shiftKey && shot > 0) { setShot((s) => s - 1); return; }
        if (rounds.phase === "running" && !e.shiftKey && idx >= n - 1) { finishRound(); return; }
        if (e.shiftKey) setI((v) => Math.max(0, v - 1));
        else setI((v) => Math.min(n - 1, v + 1));
      }
      // ` = the full wipe, same mental model as every other filming surface: temporary state
      // goes (emphasis, spotlight, highlights), nothing saved is touched. While rehearsing, it
      // ALSO clears this slide's dictated segment — Lee: "I'll run through up to 3 takes of
      // it" — so a take he doesn't like doesn't just pile onto the next attempt. And it drops
      // chrome (2026-09-06, Lee: "selector box and resize tools visible on one of my
      // illustrations. Not let those be shown. Or if I hit ` it can override to remove them from
      // screen if needed") — the illustration's drag/resize decorations are gated on chrome
      // (below), so this is the guaranteed "get it off screen" reset, on top of chrome already
      // defaulting off in the popout.
      else if (e.code === "Backquote" || e.key === "`") {
        e.preventDefault(); resetTake(); setChrome(false); scratchTake();
      }
      else if (e.key === "Escape") { e.preventDefault(); onExit(); }
      else if (e.key.toLowerCase() === "h") { e.preventDefault(); setChrome((v) => !v); }
      else if (e.key.toLowerCase() === "p") { e.preventDefault(); setPrompter((v) => !v); }
      // R arms / cancels / finishes a round; Shift+R starts the whole rehearsal over (round 1).
      else if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (e.shiftKey) startOver(); else pressR(); }
      else if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); const nx = nextCamSpot(camNow); setCamOverride(nx); if (nx === "off") setHero(false); }
      // C: the 10 s lead-in — in the 9:16 pop-out only (the main window is the preview then).
      else if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && !e.altKey && popout.isPopout && !counting) { e.preventDefault(); startCountdown(); }
      // F4 — ROLL. Lee's OBS record hotkey, and now the assembly's too: "I want it to start
      // assembling the second the video starts… We could even program the animation to hit when
      // I press f4?" Handled in BOTH windows, because only the focused one sees the key — this
      // window rolls itself if it is the pop-out, and either way signals the other one. Never
      // preventDefault'd away from OBS: the hook that gives OBS the key is the operating
      // system's, not the page's, so nothing here can take it.
      else if (e.key === "F4" && !e.altKey) {
        e.preventDefault();
        cancelCountdown();
        if (popout.isPopout) roll();
        signalRoll(set.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, idx, onExit, resetTake, camNow, showReview, closeReview, showHotkeys, rounds.phase, startRound, finishRound, pressR, startOver, scratchTake, counting, startCountdown, cancelCountdown, preview, popout.isPopout, cluster, shot, shots.length, setShot, roll, set.id]);

  // What FrameView's map draws from (cluster/ClusterStage.tsx): in the main window's NEXT
  // preview the map is its bird's-eye with everything revealed — honest about what comes next.
  const clusterFilm = useMemo<ClusterFilm | null>(() => (cluster ? { shot, roam: fieldRoam.roam, overview: preview, arrowOverrides, onArrowCycle } : null), [cluster, shot, fieldRoam.roam, preview, arrowOverrides, onArrowCycle]);

  // FIT THE PHONE to the window: as tall as the window allows, 9:16. Size the
  // browser window to 9:16 (or pop it out) and the phone IS the window.
  const [w, setW] = useState(540);
  useEffect(() => {
    const fit = () => setW(Math.max(240, Math.min(window.innerWidth, Math.floor(window.innerHeight * 9 / 16))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  if (!plan) return <div style={{ minHeight: "100vh", background: BG, color: MUTED, display: "grid", placeItems: "center" }}>Loading the running order…</div>;
  if (n === 0 || !frame) return <div style={{ minHeight: "100vh", background: "#000", color: MUTED, display: "grid", placeItems: "center" }}>Every slide is skipped — nothing to film.</div>;

  return (
    <HighlightContext.Provider value={hlApi}>
    <PracticeContext.Provider value={practice}>
    <PreviewSpotContext.Provider value={spotApi}>
    <MoveContext.Provider value={camera.moveBy}>
    <WidthContext.Provider value={camera.setWidth}>
    <ScaleContext.Provider value={camera.setScale}>
    <PersistContext.Provider value={camera.persist}>
    <div ref={hostRef} className={`film-mode${camera.rootClass ? ` ${camera.rootClass}` : ""}`} onWheel={camera.onWheel}
      style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
      {/* Nothing selects here unless Shift is down (FILM_SELECT_CSS above) — main window AND
          pop-out, since a blue selection in the pop-out is a blue selection in the video. */}
      <style>{FILM_SELECT_CSS}</style>
      {/* Gated on `chrome` too (2026-09-06) — not just popout — so the illustration's drag/
          resize decorations (IllustrationLayer.tsx's dashed border + grip, drawn any time
          onPlace exists at all) never persist into the shot: they're only live while chrome is
          visible (H, or off by default in the popout, or forced off by ` — see the keydown
          handler above), same as everything else that's setup-only, never filmed. */}
      {/* THE NEXT-SLIDE PREVIEW (2026-09-07, header): while the pop-out's take is live this phone
          is the slide AFTER it — "not blurred, but like opaque, so it's not complete focus yet"
          — with a NEXT tag; slide 1 undimmed during the pop-out's countdown ("we have the /film
          on slide one"); "— end —" past the last slide. This window is never in the shot then,
          so the tag can sit on the phone. */}
      {atEnd ? (
        <div style={{ width: w, height: Math.round(w * 16 / 9), background: "#000", display: "grid", placeItems: "center", color: MUTED, fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: "0.08em" }}>— end —</div>
      ) : (
        <div style={{ position: "relative", opacity: preview && !take?.countdown ? 0.55 : 1, transition: "opacity 200ms ease-out" }}>
          <SlideEditContext.Provider value={popout.isPopout && chrome ? patchCurrentFrame : null}>
          <ClusterFilmContext.Provider value={clusterFilm}>
            <PhoneFrame frame={frame} frames={frames} index={idx} set={set} topicName={topicName} w={w} rounded={false} capture popout={popout.isPopout} stageStyle={camera.stageStyle} cardOverride={camera.cardOverride} camSpot={camOverride ?? undefined} layout={layoutOf(plan)} hero={hero} onHero={setHero} onRailStatus={setRailStatus} coldOpen={coldOpen}
              progress={questionProgress(frames, ceqById).get(frame.id)} />
          </ClusterFilmContext.Provider>
          </SlideEditContext.Provider>
          {preview && (
            <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 35, pointerEvents: "none", background: "rgba(7,11,20,0.88)", border: `1px solid ${GOLD}66`, borderRadius: 999, padding: "3px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, whiteSpace: "nowrap" }}>
              {take?.countdown ? "first · counting down in the pop-out" : "next"}
            </div>
          )}
        </div>
      )}
      <CaptureArrows hostRef={hostRef} frameId={frame.id} />
      {/* THE BRAND CURSOR — the bolt, as on the canvas popout. The native
          cursor is hidden; turn "Capture Cursor" off on the OBS source. */}
      {/* Lee, 2026-09-06: "don't show the bolt cursor on intro 1 and intro 2 slides" — the
          wordmark itself already has an animated bolt there; a second one following the mouse
          competes with it. */}
      <BrandCursor hostRef={hostRef} enabled={frame.kind !== "open" && frame.kind !== "intro"} />
      {/* THE COUNTDOWN — and where its DIGITS draw (2026-09-08). Lee: "So, will students see the
          3 2 1?" They would have. This is the pop-out, and the pop-out's client area is exactly
          what OBS window-captures, so the number was in the video. It is gone from here: the
          count is Lee's cue, not the audience's, and it now draws in the MAIN /film window (the
          block below, off prompter-sync's `count`). What the shot shows across those ten seconds
          is the cold open assembling and nothing else — clean from the first frame, no head to
          trim, which is the point of filming in one pass.

          A count started on a slide that is NOT the cold open still gets the black card, because
          there is nothing there to assemble and the card is what keeps that slide out of the
          recording until zero. It carries the wordmark alone — a slate, not a timer. */}
      {counting && !coldOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#000", display: "grid", placeItems: "center", userSelect: "none" }}>
          <SurviveWordmark size={Math.max(14, Math.round(w * 0.055))} />
        </div>
      )}
      {/* THE COUNT — IN BOTH WINDOWS, and the pop-out is the one that matters (2026-09-09).
          Lee: "I have the popped out window. I hit C. I see the countdown. But it's not in
          popped out window — the countdown shows in the /film interface."

          It was pop-out-EXCLUDED on purpose the day before, when the count and the assembly were
          the same ten seconds: the pop-out is the OBS capture, so a number drawn there was a
          number in the video. That reason is gone. F4 is what starts the recording now, and the
          count runs entirely BEFORE it — "I hit C, it counts down from 10. On 0, I hit F4. This
          starts my OBS recording AND it starts the launch animation." Nothing is recording while
          the digits are up, so they belong where his eyes are: the window he films into. The
          main window keeps its copy for when he is looking there instead. */}
      {(() => {
        const n = popout.isPopout ? countdown.seconds : take?.countdown ? take.count : null;
        if (n === null || n === undefined) return null;
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", pointerEvents: "none", userSelect: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div key={n} style={{ fontFamily: V3_DISPLAY, fontWeight: 800, fontSize: Math.round(w * 0.5), lineHeight: 1, color: countdownTone(n) === "gold" ? GOLD : CREAM, fontVariantNumeric: "tabular-nums", textShadow: "0 6px 30px rgba(0,0,0,0.9)" }}>
                {n}
              </div>
              <div style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: CREAM, background: "rgba(7,11,20,0.86)", border: `1px solid ${GOLD}55`, borderRadius: 999, padding: "5px 14px", whiteSpace: "nowrap" }}>
                {countdownCue(n)}
              </div>
            </div>
          </div>
        );
      })()}
      {/* BREADCRUMBS (2026-09-07, Lee: "Show navigation breadcrumbs on /film") — the same crumbs
          V3Shell would draw, in the chrome's own quiet style; main window only, chrome only, so
          they never film. Escape still exits the way it always did. */}
      {chrome && !popout.isPopout && crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" style={{
          position: "fixed", top: 10, left: 12, zIndex: 30, display: "flex", alignItems: "center", gap: 6,
          background: "rgba(7,11,20,0.86)", border: `1px solid ${EDGE}`, borderRadius: 10, padding: "5px 10px",
          fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11.5, color: MUTED, whiteSpace: "nowrap",
        }}>
          {crumbs.map((c, k) => (
            <span key={`${c.label}-${k}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {k > 0 && <span>›</span>}
              {c.to ? <Link to={c.to} style={{ color: MUTED, fontWeight: 600, textDecoration: "none" }}>{c.label}</Link> : <span style={{ color: CREAM, fontWeight: 700 }}>{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      {chrome && (
        <div style={{
          position: "fixed", left: 12, bottom: 12, display: "flex", gap: 12, alignItems: "center", zIndex: 30,
          background: "rgba(7,11,20,0.86)", border: `1px solid ${EDGE}`, borderRadius: 10,
          padding: "7px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 11.5, color: MUTED,
        }}>
          {/* In preview mode the count is the pop-out's, and what THIS window shows is the next one
              (Lee: "when countdown hits, we advance /film to slide 2"). */}
          {preview ? (
            <span style={{ color: GOLD, fontWeight: 800 }}>
              pop-out {take?.countdown ? "counting down" : `on ${previewIdx} / ${n}`} · showing {atEnd ? "the end" : previewIdx + 1}
            </span>
          ) : takeInfo ? (
            // ONE SPLIT: which run this is, his name for it when he gave one, and where in it.
            <span title={`?take=${takeInfo.index} — filming this split only (${n} of ${all.length} slides)`} style={{ color: GOLD, fontWeight: 800 }}>
              Split {takeInfo.index + 1}{takeInfo.name ? ` · ${takeLabel(takeInfo)}` : ""} · {idx + 1}/{n}
            </span>
          ) : (
            <span style={{ color: GOLD, fontWeight: 800 }}>{idx + 1} / {n}</span>
          )}
          {takeMissing && (
            <span title={`The plan has ${takes.length} split${takes.length === 1 ? "" : "s"}; ?take=${takeParam} names none of them`} style={{ color: "#FF9F43", fontWeight: 800 }}>
              split {(takeParam ?? 0) + 1} not found — filming the whole set
            </span>
          )}
          <span>{atEnd ? "— end —" : FRAME_LABEL[frame.kind]}</span>
          {/* THE MAP: where the walk is inside the slide, and the shot's label. */}
          {cluster && !preview && shots.length > 0 && (
            <span title="space / shift+space walk the map's shots; off the last one, the next slide" style={{ color: CREAM, fontWeight: 700 }}>
              shot {shot + 1} / {shots.length}{shots[shot]?.label ? ` · ${shots[shot].label}` : ""}
            </span>
          )}
          {qaLayout &&<span title="localStorage sa-layout-qa is set on this browser — the take films THIS pass, not the set's" style={{ color: "#FF7A59", fontWeight: 800 }}>layout override: {qaLayout}</span>}
          <span title="The fixed caption rail (layout.ts CAPTION_RAIL): where the burned captions will land on this slide"
            style={{ color: railStatus === "clear" ? MUTED : GOLD, fontWeight: railStatus === "clear" ? 500 : 800 }}>
            {railStatus === "clear" ? "captions clear" : railStatus === "card" ? "captions: ON THE CARD" : railStatus === "illustration" ? "captions: ON THE PICTURE" : "captions: under the camera"}
          </span>
          {/* The long hotkey sentence that used to sit here is the "?" card now (capture/
              HotkeysModal.tsx) — Lee: "put that all behind a modal link. It's a lot of text in
              bottom left." B's camera state stays visible since it changes per take. */}
          {/* The cold open BORROWS the corner while it assembles even though the open frame's own
              spot is "off" (PhoneFrame's note) — say so, or the bar reads "off" with a camera on
              screen. Lee: "my camera's out on the right and comes in." */}
          <span title="B cycles the camera">B camera {coldOpen && camNow === "off" ? "corner · the cold open" : camNow}</span>
          {/* REHEARSAL (2026-09-06, second pass): the toggle lives right here, in the same chrome
              bar as everything else about this take — Lee: "I'd prefer to see it somewhere on
              film." Third pass: the chip is the same R the key is — arm, cancel, or finish. */}
          <button onClick={pressR} title={phase === "off" ? "Arm a rehearsal round (R) — then space to start it" : phase === "armed" ? "Armed — space starts, R cancels" : "Rehearsing — R (or space on the last slide) ends the round"}
            style={{ color: phase === "off" ? GOLD : "#000", background: phase === "off" ? "none" : phase === "armed" ? GOLD : "#3BF5A0", border: `1px solid ${phase === "off" ? GOLD + "66" : phase === "armed" ? GOLD : "#3BF5A0"}`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>
            {phase === "off" ? "🎙 rehearse" : phase === "armed" ? `${roundLabel(rounds.round)} armed` : `${roundLabel(rounds.round)} rehearsing`}
          </button>
          {running && (
            <span style={{ color: dictation.on ? "#3BF5A0" : "#FF9F43", fontWeight: 700 }}>
              {dictation.supported ? (dictation.on ? "listening" : "not listening") : "dictation unsupported — try Chrome"}
            </span>
          )}
          {/* Visible whenever rehearsal has any state at all — armed, running, or rounds already
              done — since it now means the whole thing from the top (Lee, 2026-09-07: "Start over
              should give you another round 1"). */}
          {(phase !== "off" || rounds.history.length > 0) && (
            <button onClick={startOver} title="Start the rehearsal over (shift+R): every round's transcript and time wiped, back to slide 1, armed on round 1. Your committed lines stay." style={chip()}>↺ start over (round 1)</button>
          )}
          {running && <button onClick={scratchTake} title="Scratch this slide's take (`) — this round only" style={chip()}>✕ scratch take</button>}
          {/* THE COUNTDOWN button — pop-out only (H shows this bar there; C is the key). */}
          {popout.isPopout && !counting && (
            <button onClick={startCountdown} title="10 s lead-in (C): this window holds on black and the bolt while it counts — the NUMBER shows in the main /film window only, never here, so it is never in the recording. On zero press F4: your OBS recording and the cold open start on the same press." style={chip()}>⏱ 10 s lead-in → F4</button>
          )}
          {phase === "off" && segmentCount > 0 && (
            // "lines N →", not "review N →" (2026-09-07): "Review" is the Editor step's old name,
            // and this chip opens the rehearsal review of the round's LINES — say what it opens.
            <button onClick={() => setShowReview(true)} title={`Go over round ${rounds.round}'s lines again`}
              style={{ color: "#14213D", background: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>
              lines {segmentCount} →
            </button>
          )}
          {popout.open && !popout.isPopout && (
            <button onClick={popout.open} title="Open this page as its own 9:16 window, snapped to 1080×1920 for OBS"
              style={{ color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>⧉ pop out 9:16</button>
          )}
          {/* TELEPROMPTER POPOUT (2026-09-06): its own window, not the embedded panel below —
              Lee: "prompter appears in the popped out one, it's in the way of filming... I can
              place it to the side of popped out film capture." */}
          {!popout.isPopout && (
            <button onClick={openTeleprompter} title="Open the teleprompter in its own window — place it beside the film pop-out, off camera"
              style={{ color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 }}>⧉ pop out teleprompter</button>
          )}
          {popout.status && <span style={{ color: CREAM }}>{popout.status}</span>}
          {rounds.history.length > 0 && <span title="This session's rehearsal rounds" style={{ color: CREAM, fontWeight: 700 }}>{historyLabel(rounds.history)}</span>}
          <button onClick={() => setShowHotkeys(true)} title="Every shortcut (?)" style={{ ...chip(), padding: "2px 7px" }}>?</button>
        </div>
      )}
      {/* ARMED: the banner over the phone — Lee: "I enter rehearsal mode, then press space to
          start." Round 1 says it's blind before he starts, so the empty prompter isn't a surprise. */}
      {phase === "armed" && (
        <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 40, pointerEvents: "none", fontFamily: "'Rubik', system-ui, sans-serif" }}>
          <div style={{ background: "rgba(7,11,20,0.9)", border: `1px solid ${GOLD}66`, borderRadius: 14, padding: "18px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>Round {rounds.round} · press space to start</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{roundMode(rounds.round)}</div>
          </div>
        </div>
      )}
      {/* THE CLOCK (Lee: "Any rehearsal I do should have a running time"). Fixed to the WINDOW,
          not the phone's chrome bar — visible with chrome hidden — and it only exists while a
          round is armed or running, so it can never be in a real take. */}
      {phase !== "off" && (() => {
        const now = Date.now();
        return (
          <div style={{ position: "fixed", top: 10, right: 12, zIndex: 40, background: "rgba(7,11,20,0.88)", border: `1px solid ${running ? "#3BF5A0" : GOLD}66`, borderRadius: 999, padding: "4px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12.5, fontWeight: 800, color: CREAM, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: running ? "#3BF5A0" : GOLD }}>{roundLabel(rounds.round)}</span> · {fmtClock(rounds.startedAt ? now - rounds.startedAt : 0)} · <span style={{ color: MUTED, fontWeight: 600 }}>slide {fmtClock(rounds.slideStartedAt ? now - rounds.slideStartedAt : 0)}</span>
          </div>
        );
      })()}
      {lastRound && phase === "off" && (
        <div style={{ position: "fixed", top: 10, right: 12, zIndex: 40, background: "rgba(7,11,20,0.88)", border: `1px solid ${EDGE}`, borderRadius: 999, padding: "4px 12px", fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12.5, fontWeight: 800, color: CREAM }}>
          {roundLabel(lastRound.round)} · {fmtClock(lastRound.seconds * 1000)} <span style={{ color: MUTED, fontWeight: 600 }}>done</span>
        </div>
      )}
      {showHotkeys && <HotkeysModal onClose={() => setShowHotkeys(false)} />}
      {showReview && (
        // The review edits lines and selects words to mark them — selection stays on inside it
        // (FILM_SELECT_CSS's data-sa-film-chrome). display: contents, so the overlay's own fixed
        // positioning is untouched.
        <div data-sa-film-chrome="" style={{ display: "contents" }}>
          <RehearsalReview set={set} frames={frames} ceqById={ceqById} segments={segments} round={rounds.round} initialPicks={cannedPicks} onCommitLine={commitPrompterLine} onClose={closeReview} layout={layoutOf(plan)} />
        </div>
      )}
      {/* LIVE DICTATION CAPTION (2026-09-06). Lee: "as I'm talking, just live dictate over
          there... seeing the words populate will help me get a feel for brevity visually." What's
          already final for this slide, plus whatever's still in progress — cleared by walking to
          a new slide or by ` (a fresh take). */}
      {running && (segments[frameId ?? ""] || interim) && (
        <div style={{
          position: "fixed", left: "50%", bottom: chrome ? 60 : 16, transform: "translateX(-50%)", zIndex: 30,
          maxWidth: "min(640px, 86vw)", background: "rgba(7,11,20,0.88)", border: `1px solid ${EDGE}`, borderRadius: 12,
          padding: "10px 16px", fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM, fontSize: 15, lineHeight: 1.4, textAlign: "center",
        }}>
          {segments[frameId ?? ""]}
          {interim && <span style={{ color: MUTED }}> {interim}</span>}
        </div>
      )}
      {/* Never inside the true film pop-out (2026-09-06, Lee: "prompter appears in the popped
          out one, it's in the way of filming") — that window IS the shot; the teleprompter now
          has its own separate pop-out (the button above) instead. Still shown in the main
          window (P toggles it there) and, harmlessly, in Review/authoring contexts. */}
      {/* ROUND 1 IS BLIND (2026-09-06): "I want it to intentionally let me practice blind first in
          round 1... Round 1 is about getting the feel down." The panel is hidden on every frame
          but the canned ones — even a line committed in an earlier session — and the canned
          suggestion still shows on open/intro/outro/bio, since practicing with those IS the point. */}
      {prompter && !popout.isPopout && showsPrompterInRound(rehearsalRound, frame.kind) && (() => {
        // A committed prompter line always wins; otherwise, on a canned slide (open/intro/outro/
        // bio) with nothing committed yet, the auto-picked suggestion fills the panel so Lee can
        // already rehearse with it — Lee: "I want to already have the suggested intro/outro/bio
        // canned ready. So I can start practicing using it." Clearly marked SUGGESTED until
        // Review actually commits one.
        const committed = frame.prompter ?? [];
        const lines = committed.length ? committed : cannedSuggestion ? [cannedSuggestion.text] : [];
        if (lines.length === 0) return null;
        const suggested = committed.length === 0;
        // "Only editable manually after round 2, to try to avoid over doing the review process."
        // Since 2026-09-07 (docs/USE-YOUR-WORDS-AUDIT.md #13) "editable" means the rehearsal
        // review's own Suggested card, mounted here per line: click it to edit in place, "🎙 Say
        // it" for a spoken take with the live brief, ✂ shorten passes with v1·v2·v3 + ↶, and the
        // mark toolbar (select words → transition phrase / cue word). Main window only (this
        // panel never renders in the film pop-out at all). Before that it is read-only, with the
        // marks painted the way the teleprompter window paints them.
        const editable = prompterEditable(rounds);
        return (
          // data-sa-film-chrome: the mark toolbar reads the selection — the film root's
          // no-selection rule (FILM_SELECT_CSS) stops at this panel.
          <div data-sa-film-chrome="" style={{
            position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", width: editable ? 360 : 300, maxHeight: "80vh", overflowY: "auto", zIndex: 30,
            background: "rgba(7,11,20,0.88)", border: `1px ${suggested ? "dashed" : "solid"} ${EDGE}`, borderRadius: 12, padding: "10px 14px",
            fontFamily: "'Rubik', system-ui, sans-serif", color: CREAM,
          }}>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
              Prompter{suggested ? " · suggested" : ""}{editable ? <span style={{ color: MUTED, letterSpacing: "0.06em", textTransform: "none", fontWeight: 600 }}> · click the line to edit · select words to mark the hand-off</span> : null}
            </div>
            {lines.map((line, k) => editable ? (
              <div key={`${frame.id}:${k}`} style={{ marginTop: k === 0 ? 0 : 8 }}>
                <SuggestedCard ctx={{ setId: set.id, frame, frames, ceqById }} line={line}
                  keys={k === 0 ? frame.prompterKeys : undefined} marks={k === 0 ? frame.prompterMarks : undefined} transition={k === 0 ? frame.prompterTransition : undefined}
                  onCommit={(text, keys, transition, marks) => commitPrompterAt(frame.id, k, text, keys, transition, marks)} />
              </div>
            ) : (
              <PrompterLine key={`${frame.id}:${k}:${line}`} line={line} marks={k === 0 ? frame.prompterMarks : undefined} first={k === 0} />
            ))}
          </div>
        );
      })()}
    </div>
    </PersistContext.Provider>
    </ScaleContext.Provider>
    </WidthContext.Provider>
    </MoveContext.Provider>
    </PreviewSpotContext.Provider>
    </PracticeContext.Provider>
    </HighlightContext.Provider>
  );
}

/** A small chrome-bar button, gold outline. */
const chip = (): React.CSSProperties => ({ color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 6, padding: "2px 8px", fontWeight: 800, cursor: "pointer", fontSize: 11 });

/** One prompter line, read-only, its timing marks painted (the plain textarea that used to
 *  open here after round 2 is the review's SuggestedCard now — see the panel above). */
function PrompterLine({ line, marks, first }: { line: string; marks: PrompterMarks | undefined; first: boolean }) {
  return (
    <div style={{ fontSize: 17, lineHeight: 1.4, fontWeight: 600, padding: "5px 0", borderTop: first ? "none" : `1px solid ${EDGE}` }}>
      {paintLine(line, marks).map((s, i) => <span key={i} style={markStyle(s.tone)}>{s.text}</span>)}
    </div>
  );
}
