// REVIEW DECK — Step 2 as the film draft.
//
// Lee (2026-09-03): "The main thing I want to get is a way to see the slides
// and edit them / approve them … spin up quick slides for Memorize This,
// Deeper Ideas, Cheat Codes and place them in the middle of a CEQ set …
// quickly remove a CEQ slide, duplicate, edit text, rearrange … Talkthrough is
// just talking. Review is seeing the filming draft as it stands … A third
// slide to the right of the current one … the teleprompter."
//
// Second pass: a drop line that says above or below; space and shift+space to
// walk the slides; "Summary slide" (opening / closing); bullets under a
// callout; a phone-shaped stage because every video is vertical; the prompter
// as stamps → phrases → slides.
//
// Third pass: "view all stamps … click each example and let it navigate to
// the slide it was from … let's just let the stamps be proofread by default.
// Save the raw text in the toggle still." And the card's heading is bold, not
// highlighted: "If I want to emphasize something, let me just highlight it
// when filming."
//
// Three EQUAL columns (Lee, 2026-09-04: "Film draft is left 1/3, slide # of #
// is middle 1/3, teleprompter is right 1/3"). LEFT: the Blast Off plan — the
// same frames film mode walks, with duplicate / skip / remove as icons that
// show on hover. MIDDLE: the selected slide on a 9:16 stage. RIGHT: one panel
// with two faces — the teleprompter, or the slide's editor ("instead of having
// edits of a slide underneath … have them left/right"); a CEQ edit shows
// before and after and saves through the one existing door (applyCeqEdit).
// Nothing here is a new store: the plan is deck.blastOff; prompter lines and
// bullets live on the frame.
//
// 2026-09-07: no teleprompter on the Editor — lines are made on Rehearse & Film
// (rounds + the rehearsal review). Lee: "I want to remove teleprompter lines from
// #2 Review. No teleprompter at all. I think just editor and illustrator all
// needed. And put these in two side by side buttons." So the right column's
// dropdown became two equal buttons, Editor | Illustrator, and the prompter face
// (stamps → phrases → slides, the "Proofread" micro call) left this file. The
// frame.prompter data is untouched — /film, the rehearsal review and the pop-out
// window still read and write it; this step just stops showing it.
//
// 2026-09-07, THE MAP. Lee: "I want to be able to create these sorts of clusters with just
// brainstorming. I want to set it up where I tell the teaching assistant what I'm thinking, we
// go back and forth and refine if needed, to ensure we're on the same page, then it goes and
// builds the cluster for me." "＋ Map" on the quick row inserts an empty map (▾ offers the three
// example maps — a list slide is a one-node map); a selected map swaps the right column for the
// MAP FACE (cluster/MapFace.tsx): the Teaching Assistant's thread inside the step, the
// bird's-eye of the field, the JSON. The assistant lives in the steps — no separate chat page.
//
// 2026-09-07, later: AUTOSAVE and SHORTEN. Lee: "Editing a ceq test should be automatic. No
// 'save to bank' needed." — so a card's stem and choices save themselves 800 ms after the last
// keystroke through the same door (applyCeqEdit); the Save button became a saving… / saved
// line; Revert stays. And: "Editor in any CEQ card or callout needs a 'shorten' button. Shorten
// could also be thought of as standardize … it's easier to scan and teach … I want the app/AI
// to make note of the edits I'm making, so 'shorten' (aka standardize) button gets smarter over
// time." The ✂ Shorten chip sits on the stage toolbar where the phone toggle was ("We won't use
// the phone button. So put Shorten to left of safe zones" — the phone stage is always on now);
// its BEFORE | AFTER panel opens at the top of the Editor face. Every settled save is logged
// (edit-log.functions.ts) and the newest pairs ride into the next Shorten as examples.
//
// 2026-09-07, "USE YOUR WORDS". Lee: "'Use your words' is the fundamental value we are building
// into survive accounting and survive studios… Wherever we can click, talk, get suggestions."
// Every word that CORRECTS or FINISHES a slide here was typed (USE-YOUR-WORDS-AUDIT.md #2, #3,
// #4, #9, #16). Now: 🎙 SAY IT on every callout, the blank, the exhibit caption, the intro and
// outro lines (SayItPanel — talk about the slide, the words come back in the cram register with
// their nesting, as CURRENT | PROPOSED, "Use this" patches; ✂ on the proposed lines); 🎙 SAY THE
// FIX on the card (SayTheFix — the spoken correction + the current stem/choices → the full card
// with the one correct marked, Apply writes through the same autosave); and THE LAST WORD —
// "we've illustrated for it… we've rehearsed it… and now we're at the final editing point.
// Maybe one last thing comes around to enhance our video… I want it all." — 🪄 Tighten to the
// lines on a slide that has kept prompter lines, and "Tighten all to the lines" at the top of
// the spine (one call per slide, in order, a progress line; every proposal waits on its slide
// for his click — never applied on its own). The mic re-briefs on the rehearsal review's
// throttle while he talks (LIVE_BRIEF_EVERY_MS, one call in flight, a stale answer dropped).
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { applyCeqEdit, duplicateCeqCard, revertCeqEdit, runMicro, type BoothCeq, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import { logCeqEdit, recentEditExamples, type EditSource } from "@/lib/edit-log.functions";
import { logCostEvent } from "@/lib/cost-ledger.functions";
import { buildShortenMessages, parseShorten, type EditExample, type ShortenFields, type ShortenRequest, type ShortenResult } from "@/lib/shorten-brief";
import { useDictation } from "@/lib/use-dictation";
import { buildCeqEditMessages, parseCeqEdit, type CeqEditResult } from "@/lib/ceq-edit-brief";
import {
  buildSlideTextMessages, buildTightenToLinesMessages, isSlideTextKind, parseSlideText, sameSlideText, slideTextFieldsOf, slideTextPatchOf,
  type SlideCard, type SlideTextFields, type SlideTextKind, type SlideTextResult,
} from "@/lib/slide-text-brief";
import { startTT, ttState } from "@/components/canvas/talkthrough-sync";
import { styleNotesFor } from "@/components/canvas/talkthrough";
import { rehearsalCardFor, rehearsalContextFor } from "./rehearsal-context";
import { buildShortenLineMessages, parseShortenedLine, pictureLineFor } from "./rehearsal-brief";
import { LIVE_BRIEF_EVERY_MS } from "./RehearsalReview";
import { NOTE_EYEBROW } from "@/components/canvas/frame-copy";
import { renderInline } from "@/components/canvas/inline-md";
import { getAdminWho } from "@/components/AdminGate";
import { blastOffPath, refreshBank } from "@/components/v3/use-bank";
import { V3_NAVY } from "@/components/v3/Shell";
import { rekeyAfterPlanChange } from "@/components/v3/publish-rekey";
import { BankPicker } from "./BankPicker";
import { indentBulletLine } from "./bullet-indent";
import { BIO_CARD } from "./bio-card";
import { CREAM, EDGE, GOLD, MUTED, PANEL, questionProgress, usePlan } from "./BlastOffEditor";
import { SetCard } from "./SetCard";
import { emptyTakes, nameTake, planTakes, takeLabel, type PlanTake } from "./plan";
import { AD_KINDS, FRAME_LABEL, backdropFor, canGoBig, cloneFrameToEnd, cutAfterFrame, standardOpener, isBigCallout, dropFrame, duplicateFrame, filmFrames, insertFrame, isAdKind, isInsert, isStandard, moveFrame, moveMany, newFrameId, pasteAfter, patchFrame, patchFramesOfKind, toggleSkip, type BackdropMode, type BlastFrame, type BlastFrameKind, isFullFrame } from "./plan";
// THE MULTI-SELECT and THE DRAG (2026-09-09, Lee's notes: multi-select, range select, group
// drag, copy/cut/paste, bundled ghost, zoom-out while dragging, auto-scroll). The pure parts
// live beside the plan (spine-select.ts, spine-drag.ts); this file only wires them to rows.
import { EMPTY_SELECTION, clickSelect, focusOnly, getClip, pickOrdered, setClip, type Selection } from "./spine-select";
import { DRAG_ZOOM_AFTER_MS, autoScrollDelta, buildBundleGhost } from "./spine-drag";
// THE FILM POP-OUT, opened from the spine (2026-09-09). The window name is what makes a second
// click refocus the same window instead of spawning another; the features snap it to 9:16.
import { POPOUT_BLOCKED, POPOUT_FEATURES, POPOUT_NAME, POPOUT_OPENED } from "./capture/popout";
import { ZOOM_VARIANTS } from "@/components/brand-cards/bolt-zoom";
// THE SLOGANS (2026-09-08) — the three lines, in the one place they are allowed to live
// (brand-cards/slogans.ts). The quick row inserts them; the Editor offers them as chips.
import { CRAM_NOT_LECTURE, OUTRO_SLOGANS, SLOGANS, TAGLINE } from "@/components/brand-cards/slogans";
import { PHRASE_SLIDE_KINDS } from "./prompter";
import { ADS, AD_LABEL } from "./AdSlide";
import { PhoneFrame } from "./PhoneFrame";
import { SlideEditContext } from "./slide-edit";
import { CAM_LABEL, CAM_SPOTS, camSpotOf, isCamSpot } from "./capture/webcam-spots";
import { camDefault, layoutOf } from "./layout";
import { canIllustrate } from "./illustration";
import { IllustrationPanel } from "./IllustrationPanel";
// THE MAP (2026-09-07): a cluster frame's face — the Teaching Assistant thread + the bird's-eye
// — and the three example maps the quick row inserts in one click (cluster/map-examples.ts).
import { MapFace } from "./cluster/MapFace";
import { MAP_EXAMPLES, cloneExample } from "./cluster/map-examples";
import { emptyCluster } from "./cluster/cluster-spec";
// THE EQUATION RUBRIC (2026-09-11): the pure rules (rubric.ts) behind the Editor's boxes,
// presets and toggles; the block itself is RubricFrame.tsx, drawn on the stage like any slide.
import { RUBRIC_KEYS, RUBRIC_MODE_LABEL, RUBRIC_PRESETS, applyPreset, cycleKey, emptyRubric, type RubricKey } from "./rubric";
// THE END-OF-TOPIC FRAMES (2026-09-11): the Editor faces read the bank the same way the slides
// do, so what the panel says the slide will say is what it says.
import { TOPIC_DONE_COPY, topicProgress, upNextFor } from "./end-of-topic";
import { SURVIBES_PROPS } from "./survibes";
import { useBank } from "@/components/v3/use-bank";
import type { MapCard } from "@/lib/cluster-brief";

/** What the AI board hands the deck: "＋ slide" on an idea card. */
export interface DeckApi { addSlide: (kind: BlastFrameKind, patch: Partial<BlastFrame>) => void }

const QUICK: readonly { kind: BlastFrameKind; label: string; patch?: Partial<BlastFrame> }[] = [
  { kind: "phrase", label: "Memorize this" },
  { kind: "cheat", label: "Cheat code" },
  { kind: "tip", label: "Go deeper" },
  // 2026-09-08, Lee: "Also, I'm not seeing a '+Tricky' type slide. Haven't we discussed this?"
  // The fourth of the family the September strategy doc asked for, and the last one built.
  { kind: "tricky", label: "Tricky question" },
  // 2026-09-09, Lee: "add a new one: Found on your exam."
  { kind: "found", label: "Found on your exam" },
  // 2026-09-04: the bolt detour (Lee's OBS camera bed) and the three ads.
  { kind: "bolt", label: "Bolt detour" },
  { kind: "ad", label: "Ad · Greek", patch: { ad: "greek" } },
  { kind: "ad", label: "Ad · reps", patch: { ad: "rep" } },
  { kind: "ad", label: "Ad · materials", patch: { ad: "send" } },
  { kind: "ad", label: "Ad · behind the scenes", patch: { ad: "building" } },
];

const SKY = "#7DD3FC";
const MINT = "#3BF5A0";
const RED = "#F87171";
const ORANGE = "#FF9F43";
/** The kind's colour in the list and on the stage — matches the detour skin. */
const KIND_COLOR: Partial<Record<BlastFrameKind, string>> = { cheat: GOLD, phrase: ORANGE, tip: SKY, tricky: "#F87171", found: "#FCA311", exhibit: GOLD, blank: MUTED, bolt: "#B3E5FC", ad: MINT, cluster: "#C4B5FD", slogan: "#FDA4AF", rubric: "#FCD34D", topic_done: "#FDBA74", up_next: "#A5B4FC", survibes: "#F472B6" };

// THE PHONE STAGE — every video is vertical (Lee: "I am considering even
// continuing to ONLY make vertical videos"). 9:16, with the zones TikTok and
// Shorts paint their own UI over, so a phrase never hides under a caption.
const STAGE_W = 306;

type CeqDraft = { stem: string; choices: { text: string; correct: boolean; feedback: string }[] };
const draftOf = (c: BoothCeq): CeqDraft => ({ stem: c.stem, choices: c.choices.map((x) => ({ text: x.text, correct: x.correct, feedback: x.feedback ?? "" })) });
const sameDraft = (a: CeqDraft, b: CeqDraft): boolean => JSON.stringify(a) === JSON.stringify(b);
/** What the edit log stores for a card: the words, not the feedback. */
const ceqFieldsOf = (d: CeqDraft): ShortenFields => ({ stem: d.stem, choices: d.choices.map((c) => ({ text: c.text, correct: c.correct })) });
/** Can applyCeqEdit take this draft as it stands? Mid-edit a draft is often momentarily not
 *  (two corrects while re-ticking, an empty new choice) — the autosave just waits. */
const draftValid = (d: CeqDraft, noteOnly: boolean): true | string => {
  if (!d.stem.trim()) return "needs a stem";
  if (noteOnly) return true;
  if (d.choices.some((c) => !c.text.trim())) return "an empty choice — fill it in or remove it";
  if (d.choices.filter((c) => c.correct).length !== 1) return "tick exactly one correct choice";
  return true;
};

// THE CALLOUT'S WORDS as Shorten and the edit log see them (2026-09-07): a cheat code has a
// bold title, a first line (body) and lines; a phrase or deep question has the heading (text)
// and lines — no separate first line. Same three kinds the detour editor below calls `detour`.
const isCallout = (k: BlastFrameKind): boolean => (PHRASE_SLIDE_KINDS as readonly { kind: BlastFrameKind }[]).some((x) => x.kind === k);
function calloutFieldsOf(f: BlastFrame): ShortenFields | null {
  if (!isCallout(f.kind)) return null;
  const bullets = (f.bullets ?? []).filter((b) => b.trim());
  return f.kind === "cheat" ? { title: f.title ?? "", text: f.body ?? "", bullets } : { title: f.text ?? "", bullets };
}
function calloutPatchOf(kind: BlastFrameKind, r: ShortenFields): Partial<BlastFrame> {
  const bullets = r.bullets ?? [];
  return kind === "cheat" ? { title: r.title ?? "", body: r.text ?? "", bullets } : { text: r.title ?? "", bullets };
}
/** A Shorten applied within this long is still "his edit over the shortening" — the strongest
 *  signal the edit log holds (source "shorten-edited"), like the rehearsal review's "wrote my own". */
const SHORTEN_EDIT_WINDOW_MS = 60_000;
type ShortenApplied = { target: string; at: number } | null;
const sourceFor = (applied: ShortenApplied, target: string): EditSource =>
  applied && applied.target === target && Date.now() - applied.at < SHORTEN_EDIT_WINDOW_MS ? "shorten-edited" : "manual";

// ------------------------------------------------------------ "use your words": the shared bits
// (2026-09-07). Three small pieces every mic on this page shares — the spoken take on the
// rehearsal review's throttle, one call in flight with the newest take winning, and a micro
// call that retries once on an unparseable answer and prices itself into the ledger.

/** THE SPOKEN TAKE. `take` is every FINAL chunk so far; `interim` is what SpeechRecognition is
 *  still working out (shown live, replaced on every event). While he talks, `onBrief(take)`
 *  fires on a THROTTLE, not a debounce — continuous speech would keep pushing a debounce out
 *  and nothing would ever update: the first new speech briefs at once, then at most once per
 *  LIVE_BRIEF_EVERY_MS, and the tail (the last chunk before a pause) always lands. Same shape
 *  as RehearsalReview's SlideScreen. Unsupported browsers get `supported: false` and the
 *  button explains itself; typing keeps working either way. */
function useSpokenTake(onBrief: (take: string) => void) {
  const [take, setTake] = useState("");
  const [interim, setInterim] = useState("");
  const dictation = useDictation((final, live) => {
    setInterim(live);
    if (final.trim()) setTake((t) => `${t} ${final}`.trim());
  });
  const lastBriefAt = useRef(0);
  const briefed = useRef("");
  const onBriefRef = useRef(onBrief);
  onBriefRef.current = onBrief;
  useEffect(() => {
    if (!take || take === briefed.current) return;
    const wait = Math.max(0, lastBriefAt.current + LIVE_BRIEF_EVERY_MS - Date.now());
    const id = window.setTimeout(() => { lastBriefAt.current = Date.now(); briefed.current = take; onBriefRef.current(take); }, wait);
    return () => window.clearTimeout(id);
  }, [take]);
  const start = () => { if (!dictation.supported || dictation.on) return; setTake(""); setInterim(""); briefed.current = ""; dictation.start(); };
  const stop = () => { dictation.stop(); setInterim(""); };
  return { take, interim, on: dictation.on, supported: dictation.supported, toggle: () => (dictation.on ? stop() : start()), stop };
}

/** ONE CALL IN FLIGHT: a newer argument that arrives mid-call waits as `pending` and runs the
 *  moment the call lands; the running call asks `stale()` before it writes, so what's shown is
 *  only ever the answer to the newest take. */
function useLatestRun<T>(run: (arg: T, stale: () => boolean) => Promise<void>) {
  const inFlight = useRef(false);
  const pending = useRef<{ arg: T } | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const go = useCallback(async (arg: T): Promise<void> => {
    if (inFlight.current) { pending.current = { arg }; return; }
    inFlight.current = true;
    try { await runRef.current(arg, () => pending.current !== null); }
    finally {
      inFlight.current = false;
      const p = pending.current;
      pending.current = null;
      if (p) void go(p.arg);
    }
  }, []);
  return go;
}

/** The micro lane, defended: one quiet retry on an answer that doesn't parse (the model's
 *  problem, not Lee's), then a plain error that names what it was for. Every attempt is priced
 *  into the cost ledger, fire-and-forget. */
async function microTwice<T>(setId: string, label: string, m: { system: string; user: string }, maxOutput: number, parse: (text: string) => T | null, what: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput } });
    void logCostEvent({ data: { setId, kind: "ai", usd: r.usage.costUsd, model: r.model, label, who: getAdminWho() } });
    const out = parse(r.text);
    if (out) return out;
  }
  throw new Error(`${what} didn't come back clean, twice — try again.`);
}

/** What a Say it / Tighten brief sees besides the slide's own words: the set card the slide
 *  sits after (the nearest card slide above it in the running order — a callout is usually the
 *  cheat code for the question just asked), what Lee said about that card in Step 1, and the
 *  slide's picture. Read at call time, so the talkthrough store is as fresh as it gets. */
interface SlideBriefContext { card?: SlideCard; talkthrough?: string; picture?: string; setName: string }
function slideBriefContextFor(frames: readonly BlastFrame[], f: BlastFrame, ceqById: Map<string, BoothCeq>, setId: string, setName: string): SlideBriefContext {
  const i = frames.findIndex((x) => x.id === f.id);
  let card: SlideCard | undefined;
  let talkthrough: string | undefined;
  for (let k = i - 1; k >= 0; k--) {
    const c = frames[k];
    if (c.kind !== "ceq" || !c.ceqId || ceqById.get(c.ceqId)?.noteOnly) continue;
    card = rehearsalCardFor(c, ceqById);
    talkthrough = rehearsalContextFor(ttState().doc, setId, c.ceqId) || undefined;
    break;
  }
  return { card, talkthrough, picture: pictureLineFor(f.illustration), setName };
}

/** THE CARD A MAP SITS AFTER (2026-09-07) — the nearest question card above it in the running
 *  order, with its id (the assistant may put it on the map as a ceq node), and what Lee said
 *  about it in Step 1. Same walk slideBriefContextFor makes; this one keeps the ceqId. */
function mapCardFor(frames: readonly BlastFrame[], f: BlastFrame, ceqById: Map<string, BoothCeq>, setId: string): { card?: MapCard; talkthrough?: string } {
  const i = frames.findIndex((x) => x.id === f.id);
  for (let k = i - 1; k >= 0; k--) {
    const c = frames[k];
    if (c.kind !== "ceq" || !c.ceqId) continue;
    const ceq = ceqById.get(c.ceqId);
    if (!ceq || ceq.noteOnly) continue;
    return { card: { ceqId: ceq.id, stem: ceq.stem, choices: ceq.choices.map(({ text, correct }) => ({ text, correct })) }, talkthrough: rehearsalContextFor(ttState().doc, setId, ceq.id) || undefined };
  }
  return {};
}

const chip = (on: boolean, color = GOLD): React.CSSProperties => ({
  border: `1px solid ${on ? color : EDGE}`, background: on ? `${color}22` : "transparent", color: on ? color : CREAM,
  borderRadius: 9, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
});
const tiny: React.CSSProperties = { background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, padding: "0 4px", lineHeight: 1 };
const field: React.CSSProperties = {
  width: "100%", background: "rgba(9,13,26,0.7)", border: `1px solid ${EDGE}`, borderRadius: 9, color: CREAM,
  padding: "7px 9px", fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box",
};
const eyebrow: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, fontWeight: 800 };
const subhead: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, fontWeight: 800 };
// PROFESSOR PASS (Lee, 2026-09-06: "make this look... like a professor would be using
// it"). One small change reused everywhere: a hairline rule under a section's header
// row, the way a printed syllabus rules off "Section 2" from what sits under it —
// spread into every header row's own style rather than a new wrapper, so nothing
// about the columns' structure changes. Chips, colors and copy are untouched.
const HEAD_RULE: React.CSSProperties = { borderBottom: `1px solid ${EDGE}`, paddingBottom: 8 };
/** A slide's kind, read as a stamped tag rather than plain colored text — the
 *  same information (colorOf/labelOf), boxed like a card catalog label. */
const kindTag = (color: string): React.CSSProperties => ({
  fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color,
  border: `1px solid ${color}55`, borderRadius: 4, padding: "1px 5px", minWidth: 92,
  textAlign: "center", boxSizing: "border-box", flexShrink: 0,
});

// THE RIGHT PANEL has two faces (Lee, 2026-09-04: "Teleprompter maybe can be
// toggleable between editor / teleprompter"). The face he left it on is
// remembered per browser; a browser that refuses storage just forgets.
// Three faces since 2026-09-05 (Lee: "Editor, Illustrator, Teleprompter in like a dropdown
// on right side"): the Illustrator is its own face, offered only on the kinds that take a
// picture (illustration.ts ILLUSTRATION_KINDS).
// TWO FACES AGAIN since 2026-09-07 — Editor | Illustrator, as two side-by-side buttons rather
// than a dropdown (Lee: "No teleprompter at all... put these in two side by side buttons").
// The teleprompter face is gone; its lines are made on Rehearse & Film now.
type RightTab = "editor" | "illustrator";
const RIGHT_TABS: { id: RightTab; label: string; title: string }[] = [
  { id: "editor", label: "Editor", title: "Edit the selected slide here, beside it" },
  { id: "illustrator", label: "Illustrator", title: "A picture for this slide — Memorize This, Cheat Code, Go Deeper, Tricky Question, blank and slogan slides" },
];
/** What the Illustrator button says when the selected slide's kind can't take a picture. */
const ILLUSTRATOR_OFF_TITLE = "Pictures go on Memorize This, Cheat Code, Go Deeper, Tricky Question, blank and slogan slides — not this kind";
const RIGHT_TAB_KEY = "sa-review-right-tab";
// A browser that last left the panel on the retired "teleprompter" face (the value this key
// held before 2026-09-07) lands on the Editor — the only face that exists for every slide —
// rather than on a face that no longer exists. Any other unknown value does the same.
const readRightTab = (): RightTab => { try { return localStorage.getItem(RIGHT_TAB_KEY) === "illustrator" ? "illustrator" : "editor"; } catch { return "editor"; } };
const writeRightTab = (t: RightTab): void => { try { localStorage.setItem(RIGHT_TAB_KEY, t); } catch { /* storage refused — the tab simply won't stick */ } };
/** The right column's shell, shared by both faces: sticky, so it rides along
 *  while the spine scrolls, and never taller than the viewport. */
const panelShell: React.CSSProperties = {
  background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 12px",
};
/** The spine's per-row verbs (duplicate · skip / remove) show on hover, or on
 *  the selected row — Lee: "icons that show up on hover on the left spine like
 *  when a slide is selected". Keyboard focus reveals them too. */
const SPINE_CSS = `
.sa-spine-row .sa-spine-tools{opacity:0;transition:opacity .12s}
.sa-spine-row:hover .sa-spine-tools,.sa-spine-row.is-on .sa-spine-tools,.sa-spine-row.is-menu .sa-spine-tools,.sa-spine-row .sa-spine-tools:focus-within{opacity:1}
.sa-slide-menu button:hover{background:rgba(255,255,255,0.06)}
.sa-spine-row.is-picked{outline:1px solid ${CREAM};outline-offset:-1px}
.sa-spine-peek{z-index:80;pointer-events:none;border-radius:8px;overflow:hidden;border:1px solid ${GOLD};box-shadow:0 14px 40px rgba(0,0,0,0.6);background:#000}
.sa-spine-card.is-hit{outline:2px solid ${MINT};outline-offset:-2px}
.sa-spine-h{scrollbar-width:thin}
.sa-spine-card > span:first-child{position:absolute;top:5px;left:5px;z-index:1;border-right:0!important;min-width:0!important;padding:1px 5px!important;background:rgba(9,13,26,0.85);border-radius:4px}
.sa-spine-card .sa-spine-thumb{align-self:center}
.sa-spine-card .sa-spine-tools{position:absolute;top:4px;right:4px;z-index:1;flex-wrap:wrap;justify-content:flex-end;max-width:76px;background:rgba(9,13,26,0.85);border-radius:6px;padding:2px}
`;

// THE SKIPPED FOLDER (Lee, 2026-09-06: "once a slide is skipped, move it to bottom
// in a skipped folder... make this look like an actual folder on a desktop"). A
// shade warmer than the spine's own panel so it reads as manila against navy —
// its own surface, not just another row — and the same three tones the professor
// pass's hairline rule already uses, just tinted gold instead of neutral.
const FOLDER_TAB = "rgba(252,163,17,0.16)";
const FOLDER_BODY = "rgba(252,163,17,0.05)";
const FOLDER_EDGE = "rgba(252,163,17,0.34)";
/** THE RUNNING ORDER AS SLIDES (2026-09-09). Lee: "the running order too, I would rather just
 *  see it kind of like we see in film mode." 88 px is the smallest a 9:16 card still reads as
 *  itself at a glance; the row keeps its number, its kind tag and its words beside it. */
const THUMB_W = 88;
const STRIP_VIEW_KEY = "sa-review-strip-view";
const readStripView = (): "film" | "list" => { try { return localStorage.getItem(STRIP_VIEW_KEY) === "list" ? "list" : "film"; } catch { return "film"; } };
/** THE FOLDS, per set (2026-09-09): which runs are collapsed, as their head frame ids, so a
 *  fold survives a reload, a trip to Film and back, and a new cut landing above it. A browser
 *  that refuses storage just forgets, like the other keys here. */
const COLLAPSED_KEY = "sa-review-collapsed:";
function readCollapsed(setId: string): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY + setId);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch { return new Set(); }
}
function writeCollapsed(setId: string, ids: Set<string>): void {
  try { localStorage.setItem(COLLAPSED_KEY + setId, JSON.stringify([...ids])); } catch { /* storage refused — the folds just won't stick */ }
}
/** THE EMPTY-RUN CHIP's colour — amber, a warning and not an error. */
const AMBER = "#F59E0B";
/** THE GUTTER BUTTONS on a split's bracket (▾ / 🎬): small, boxed, on the panel colour so they
 *  sit over the bracket's line. */
const gutterBtn: React.CSSProperties = {
  width: 18, height: 18, padding: 0, lineHeight: 1, fontSize: 10, cursor: "pointer", color: GOLD,
  background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center",
};

/** One landing place in the zoomed-out move overlay — a tall thin target between two slides.
 *  Click, don't drag: on a fifty-slide deck a click is the gesture that gets used. */
function MoveSlot({ to, onPick, first, last }: { to: number; onPick: (to: number) => void; first?: boolean; last?: boolean }) {
  const [hot, setHot] = useState(false);
  // A DRAG LANDS HERE TOO (2026-09-09): the overlay's tiles can be picked up, and a slot takes
  // the drop the same way it takes the click.
  return (
    <button onClick={() => onPick(to)} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      onDragOver={(e) => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)}
      onDrop={(e) => { e.preventDefault(); setHot(false); onPick(to); }}
      title={first ? "Put it first" : last ? "Put it last" : "Put it here"}
      style={{
        width: hot ? 22 : 14, alignSelf: "stretch", minHeight: 128, margin: "0 1px", cursor: "pointer",
        background: hot ? "rgba(252,163,17,0.22)" : "transparent",
        border: `1px dashed ${hot ? GOLD : "rgba(255,255,255,0.16)"}`, borderRadius: 5,
        transition: "width .1s, background .1s", padding: 0,
      }} />
  );
}

/** THE GAP UNDER A SLIDE (2026-09-09) — invisible until hovered, then three verbs: add a slide
 *  here, clone this one as its own editable card, or cut the video here. A marked cut stays
 *  visible, because it is structure rather than a hover affordance. */
function GapTools({ onInsert, onClone, onCut, cut, onOver, onDrop, vertical = false, kinds }: {
  onInsert: () => void; onClone: () => void; onCut: () => void; cut: boolean;
  /** THE STRIP (2026-09-10): the gap stands to the RIGHT of its slide, tools stacked. */
  vertical?: boolean;
  /** "+" opens these right here (Lee, 2026-09-10: "adding a slide underneath with the hover +
   *  doesn't work" — it only opened the insert toggle at the top of the column). Absent, "+"
   *  falls back to onInsert. */
  kinds?: readonly { label: string; color: string; add: () => void }[];
  /** A DROP TARGET TOO (2026-09-09). Releasing a dragged row over the gap used to produce no
   *  drop event at all — the move was silently discarded. The gap now says "below the slide
   *  above me", the same thing the row's own lower half says. */
  onOver?: () => void; onDrop?: () => void;
}) {
  const [hot, setHot] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const btn = (label: string, title: string, run: () => void, color: string) => (
    <button title={title} onClick={(e) => { e.stopPropagation(); run(); }}
      style={{ background: "rgba(9,13,26,0.92)", border: `1px solid ${color}`, color, borderRadius: 7, fontSize: 11, lineHeight: 1, padding: "2px 7px", cursor: "pointer" }}>{label}</button>
  );
  const plus = () => { if (kinds?.length) setChoosing(true); else onInsert(); };
  const chooser = choosing && kinds?.length ? (
    <div role="menu" onMouseLeave={() => setChoosing(false)}
      style={{ position: "absolute", top: vertical ? 0 : "100%", left: vertical ? "100%" : "50%", transform: vertical ? "none" : "translateX(-50%)", zIndex: 30, background: PANEL, border: `1px solid ${GOLD}88`, borderRadius: 9, padding: 6, display: "flex", flexDirection: "column", gap: 3, minWidth: 150, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", color: MUTED, padding: "2px 6px" }}>ADD HERE</span>
      {kinds.map((k) => (
        <button key={k.label} role="menuitem" onClick={(e) => { e.stopPropagation(); setChoosing(false); setHot(false); k.add(); }}
          style={{ textAlign: "left", background: "transparent", border: `1px solid ${k.color}55`, color: k.color, borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>＋ {k.label}</button>
      ))}
    </div>
  ) : null;
  if (vertical) {
    return (
      <div onMouseEnter={() => setHot(true)} onMouseLeave={() => { setHot(false); }}
        onDragOver={onOver ? (e) => { e.preventDefault(); onOver(); } : undefined}
        onDrop={onDrop ? (e) => { e.preventDefault(); onDrop(); } : undefined}
        style={{ position: "relative", alignSelf: "stretch", width: cut ? 26 : 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, flex: "0 0 auto" }}>
        {cut && <span style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 0, borderLeft: `2px dashed ${GOLD}`, pointerEvents: "none" }} />}
        {cut && !hot && !choosing && (
          <span style={{ position: "relative", fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", color: GOLD, background: PANEL, padding: "4px 0", writingMode: "vertical-rl" }}>✂ END</span>
        )}
        {(hot || choosing) && (
          <span className="flex flex-col" style={{ gap: 4, position: "relative" }}>
            {btn("＋", "Add a slide here", plus, MUTED)}
            {btn("⧉+", "Clone the slide before this gap as its own card — edit it without touching the original", onClone, MINT)}
            {btn(cut ? "✂↺" : "✂", cut ? "Remove this cut (the slides it added stay)" : "Cut the video here — a sign-off goes before, the standard opener after", onCut, GOLD)}
          </span>
        )}
        {chooser}
      </div>
    );
  }
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      onDragOver={onOver ? (e) => { e.preventDefault(); onOver(); } : undefined}
      onDrop={onDrop ? (e) => { e.preventDefault(); onDrop(); } : undefined}
      style={{ position: "relative", width: "100%", alignSelf: "stretch", height: cut ? 18 : 12, marginTop: -2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      {cut && <span style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 0, borderTop: `2px dashed ${GOLD}`, pointerEvents: "none" }} />}
      {cut && !hot && (
        <span style={{ position: "relative", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", color: GOLD, background: PANEL, padding: "0 6px" }}>✂ END OF VIDEO</span>
      )}
      {chooser}
      {hot && (
        <span className="flex" style={{ gap: 6, position: "relative" }}>
          {btn("＋", "Add a slide here", plus, MUTED)}
          {btn("⧉+", "Clone the slide above as its own card — edit it without touching the original", onClone, MINT)}
          {btn(cut ? "✂ undo" : "✂", cut ? "Remove this cut (the slides it added stay)" : "Cut the video here — a sign-off goes above, the standard opener below", onCut, GOLD)}
        </span>
      )}
    </div>
  );
}

const SKIP_FOLDER_KEY = "sa-review-skip-folder";
const readFolderOpen = (): boolean => { try { return localStorage.getItem(SKIP_FOLDER_KEY) === "open"; } catch { return false; } };
const writeFolderOpen = (v: boolean): void => { try { localStorage.setItem(SKIP_FOLDER_KEY, v ? "open" : "closed"); } catch { /* storage refused — it just won't stick */ } };

// THE SLIDE'S MENU (Lee, 2026-09-04: "for any slides, give them a … menu with
// any settings, tools, etc relevant to that slide. Maybe put that menu to
// right of the skip"). A ⋯ as the last hover icon on every row opens a small
// panel under the row. Every item goes through the verbs the icons and the
// editor already use — nothing here is a new door to the plan.
type MenuItem = { label: string; title?: string; color?: string; run: () => void };
/** A row of chips inside the menu — the bolt's six animations, the three ads. */
type MenuChips = { label: string; chips: { id: string; label: string; on: boolean; title?: string }[]; pick: (id: string) => void };

function SlideMenu({ items, chips, onClose }: { items: MenuItem[]; chips: MenuChips[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Escape closes; so does a press anywhere outside — except on a row's ⋯,
  // which toggles (or moves the menu to its own row) by itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current && t && !ref.current.contains(t) && !t.closest(".sa-spine-more")) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [onClose]);
  const item: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 7, padding: "5px 9px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" };
  return (
    <div ref={ref} role="menu" className="sa-slide-menu" draggable={false}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", right: 6, top: "calc(100% + 4px)", zIndex: 40, minWidth: 224, maxWidth: 300, background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.55)", padding: 5, cursor: "default" }}>
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" title={it.title} style={{ ...item, color: it.color ?? CREAM }} onClick={() => { it.run(); onClose(); }}>{it.label}</button>
      ))}
      {chips.map((g) => (
        <div key={g.label} style={{ padding: "6px 9px 4px", borderTop: `1px solid ${EDGE}`, marginTop: 4 }}>
          <div style={subhead}>{g.label}</div>
          <div className="flex" style={{ gap: 4, flexWrap: "wrap", marginTop: 5 }}>
            {g.chips.map((c) => (
              <button key={c.id} type="button" title={c.title} style={{ ...chip(c.on, ORANGE), padding: "2px 8px", fontSize: 10.5 }} onClick={() => { g.pick(c.id); onClose(); }}>{c.label}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** THE FOLDER ITSELF — a tab riding above a body, the way a manila folder sits on
 *  a desktop. Skipped cards keep their real place in the plan (see toggleSkip in
 *  plan.ts); nothing here reorders the running order or touches backdropFor —
 *  this only changes where the SPINE DRAWS them. Un-skipping one just stops
 *  hiding it, and it is already sitting at its real position — there is no
 *  "remembered slot" to put it back in, because it never actually left. */
function SkipFolder({ count, open, onToggle, children }: { count: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        title={open ? "Collapse the skipped folder" : "Expand the skipped folder"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, position: "relative", top: 1, zIndex: 1,
          background: FOLDER_TAB, border: `1px solid ${FOLDER_EDGE}`, borderBottom: "none",
          borderRadius: "7px 7px 0 0", padding: "5px 12px", cursor: "pointer",
          fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD,
        }}>
        <span aria-hidden>{open ? "📂" : "📁"}</span> Skipped <span style={{ color: MUTED }}>· {count}</span>
        <span aria-hidden style={{ fontSize: 9, color: MUTED }}>{open ? "▾" : "▸"}</span>
      </button>
      <div style={{
        background: FOLDER_BODY, border: `1px solid ${FOLDER_EDGE}`, borderRadius: "0 8px 8px 8px",
        padding: open ? 8 : "0 8px", maxHeight: open ? 4000 : 0, overflow: "hidden",
        transition: "max-height .15s ease",
      }}>
        {open && <div className="flex flex-col" style={{ gap: 5 }}>{children}</div>}
      </div>
    </div>
  );
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

// ------------------------------------------------------------------- one spine row
// A REAL COMPONENT, MEMOIZED (2026-09-09). `spineRow` was a closure inside the deck, so every
// keystroke in the right-hand editor (usePlan.commit → setPlan, synchronously) re-ran every row
// and re-drew every 88 px PhoneFrame — the "scrolling is laggy" on a 39-question set. Now the
// deck hands each row primitives and ONE stable handler object, and a row only re-renders when
// something about IT changed.

/** The deck's verbs, as one object that never changes identity (it reads the deck's latest
 *  closures through a ref). `i` is the REAL index into `frames` — the skipped-folder invariant
 *  every menu action depends on — never the row's position. */
interface SpineRowHandlers {
  select: (id: string, e: React.MouseEvent) => void;
  dragStart: (id: string, dt: DataTransfer | null) => void;
  over: (i: number, below: boolean) => void;
  drop: () => void;
  dragEnd: () => void;
  menu: (id: string) => void;
  closeMenu: () => void;
  move: (id: string) => void;
  duplicate: (id: string, i: number) => void;
  cloneCard: (id: string, i: number) => void;
  /** FILM FROM HERE (Lee, 2026-09-10: "I'm sick of scrolling all the way through"). */
  filmFrom: (id: string) => void;
  toggleSkip: (id: string) => void;
  remove: (id: string, i: number) => void;
}

interface SpineRowProps {
  frame: BlastFrame;
  /** The real index into `frames`. */
  i: number;
  /** The row's number in the film order; undefined inside the skipped folder. */
  number?: number;
  foldered: boolean;
  thumb: boolean;
  /** THE STRIP (2026-09-10): a vertical card — thumb on top, words under — sitting in a row. */
  card: boolean;
  /** A search hit (the 🔍 box) — outlined so the eye finds it on the strip. */
  isHit: boolean;
  isSelected: boolean;
  isPicked: boolean;
  isMenuOpen: boolean;
  isDragging: boolean;
  dropEdge: "above" | "below" | null;
  label: string;
  color: string;
  snippet: string;
  sameCardCount: number;
  prompterLines: number;
  tightened: boolean;
  /** The row's own set card (override-applied) — the comparator's stand-in for `set`. */
  ceq?: BoothCeq;
  /** The backdrop rule's answer for this slide, computed once per plan by the deck — the
   *  comparator's stand-in for `frames`. */
  backdrop: BackdropMode | null;
  /** The thumbnail's inputs. `frames` and `set` change identity on every keystroke, so the
   *  comparator ignores them: everything they feed the thumbnail is covered by `ceq`,
   *  `backdrop`, `progressX/Y` and `frame`. */
  frames: readonly BlastFrame[];
  set: BoothSetInfo;
  topicName: string;
  progressX?: number;
  progressY?: number;
  layout: "pass1" | "pass2";
  /** The ⋯ menu's contents — only ever built for the one row whose menu is open. */
  menu: { items: MenuItem[]; chips: MenuChips[] } | null;
  on: SpineRowHandlers;
}

/** Everything but `frames` and `set` by identity — see SpineRowProps for why those two are
 *  represented by `ceq` and `backdrop` instead. */
function sameRowProps(a: SpineRowProps, b: SpineRowProps): boolean {
  for (const k of Object.keys(b) as (keyof SpineRowProps)[]) {
    if (k === "frames" || k === "set") continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

const SpineRow = memo(function SpineRow(p: SpineRowProps) {
  const { frame: f, i, foldered, on } = p;
  // THE PEEK (Lee, 2026-09-10: "it's showing bigger one above it, and it's cut off"). The strip
  // is a sticky, overflow-x box, so anything positioned inside it is clipped; the peek is a
  // FIXED layer placed under the card from its screen rect on hover.
  const [peek, setPeek] = useState<{ x: number; y: number } | null>(null);
  const menu = p.isMenuOpen;
  // Foldered rows accept neither drag (nothing to reorder — a skipped card's
  // order relative to other skipped cards films nothing) nor drop (dragging an
  // active card into the folder isn't how a card gets skipped; the ⊘ button is).
  // An active row with its own menu open keeps accepting drops, same as before —
  // only picking IT up is disabled, so a press inside the menu never drags the row.
  const canDrop = !foldered;
  const draggableRow = !menu && canDrop;
  const progress = useMemo(() => (p.progressX != null && p.progressY != null ? { x: p.progressX, y: p.progressY } : undefined), [p.progressX, p.progressY]);
  return (
    <div data-frame-id={f.id} draggable={draggableRow}
      className={`sa-spine-row${p.card ? " sa-spine-card" : ""}${p.isSelected ? " is-on" : ""}${p.isPicked ? " is-picked" : ""}${p.isHit ? " is-hit" : ""}${menu ? " is-menu" : ""}`}
      onDragStart={(e) => on.dragStart(f.id, e.dataTransfer)}
      onDragOver={canDrop ? (e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); on.over(i, p.card ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2); } : undefined}
      onDrop={canDrop ? (e) => { e.preventDefault(); on.drop(); } : undefined}
      onDragEnd={on.dragEnd}
      onClick={(e) => on.select(f.id, e)}
      onMouseEnter={p.card ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setPeek({ x: r.left + r.width / 2, y: r.bottom + 8 }); } : undefined}
      onMouseLeave={p.card ? () => setPeek(null) : undefined}
      title={canDrop ? "Click to open · shift-click a range · ctrl-click to add · drag to reorder" : "Click to open"}
      style={{
        position: "relative", display: "flex", alignItems: p.card ? "stretch" : "center", gap: p.card ? 4 : 8, padding: p.card ? "6px 6px 5px" : "7px 10px", borderRadius: 7,
        ...(p.card ? { flexDirection: "column", width: 100, flex: "0 0 auto", boxSizing: "border-box" } : {}),
        background: foldered ? "rgba(9,13,26,0.35)" : PANEL,
        border: `1px solid ${p.isSelected ? GOLD : foldered ? FOLDER_EDGE : EDGE}`,
        boxShadow: p.dropEdge === "above" ? (p.card ? `-3px 0 0 0 ${SKY}` : `0 -3px 0 0 ${SKY}`) : p.dropEdge === "below" ? (p.card ? `3px 0 0 0 ${SKY}` : `0 3px 0 0 ${SKY}`) : "none",
        opacity: foldered ? 0.8 : p.isDragging ? 0.5 : 1, cursor: draggableRow ? "grab" : "pointer",
      }}>
      <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, minWidth: 18, borderRight: `1px solid ${EDGE}`, paddingRight: 6, fontVariantNumeric: "tabular-nums" }}>
        {p.number != null ? p.number : "⊘"}
      </span>
      {/* THE SLIDE ITSELF, small — the same renderer the middle pane and the film use, so what
          he scans here is what films. Not interactive: pointer events off, so the row's own
          click and drag still own the whole area. */}
      {p.thumb && (
        <span className="sa-spine-thumb" style={{ display: "inline-flex", flex: "0 0 auto", pointerEvents: "none", borderRadius: 4, overflow: "hidden", border: `1px solid ${EDGE}`, opacity: f.skipped ? 0.45 : 1 }}>
          <PhoneFrame frame={f} frames={p.frames} index={i} set={p.set} topicName={p.topicName} w={p.card ? 86 : THUMB_W} live={false} rounded={false}
            progress={progress} layout={p.layout} backdrop={p.backdrop} />
        </span>
      )}
      <span style={kindTag(p.color)}>{p.label}</span>
      {/* THE CARD IS THE LABEL (Lee, 2026-09-10: "I only need that label. None of the other text is
          needed. If I hover over a slide, pop out a more zoomed in version so I can see it better"). */}
      {!p.card && <span style={{ fontSize: 12, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: f.skipped ? "line-through" : "none" }}>{p.snippet}</span>}
      {p.card && p.thumb && peek && (
        <span className="sa-spine-peek" aria-hidden="true" style={{ position: "fixed", left: peek.x, top: Math.min(peek.y, window.innerHeight - 420), transform: "translateX(-50%)", display: "block" }}>
          <PhoneFrame frame={f} frames={p.frames} index={i} set={p.set} topicName={p.topicName} w={220} live={false} rounded={false} progress={progress} layout={p.layout} backdrop={p.backdrop} />
        </span>
      )}
      {/* SAME CARD, TWICE — say so on the row (2026-09-09). Lee duplicated Prepaid Rent
          meaning to make the copy a different question, and could not see that the two slides
          were one card until he edited one and both changed. A duplicate is a real thing he
          wants (a callback before the outro); it just has to be legible as one. */}
      {p.sameCardCount > 1 && (
        <span title="The same card appears more than once in this running order — editing it changes every copy. Use ⧉+ for a card you can edit on its own." style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", color: SKY, border: `1px solid ${SKY}55`, borderRadius: 5, padding: "1px 4px", whiteSpace: "nowrap" }}>SAME CARD ×{p.sameCardCount}</span>
      )}
      {/* Lines are made on Rehearse & Film (2026-09-07); the count still shows here so the spine says which slides have them. */}
      {p.prompterLines > 0 && <span title={`${p.prompterLines} teleprompter line${p.prompterLines > 1 ? "s" : ""} — made on Rehearse & Film`} style={{ fontSize: 10, color: MINT, fontWeight: 800 }}>🗒{p.prompterLines}</span>}
      {p.tightened && <span title="Tighten all: a proposal is waiting on this slide — open it to use or dismiss it" style={{ fontSize: 11 }}>🪄</span>}
      <span className="sa-spine-tools" style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: p.card ? 0 : 2, flexWrap: p.card ? "wrap" : "nowrap" }}>
        {/* TWO KINDS OF COPY, both on the row (2026-09-09). Lee reached for ⧉ expecting the
            second one: "I need to be able to clone a CEQ and edit it independently. I tried
            and it didn't work. See how I have two Q9's… I have Prepaid Rent first, then I
            wanted to make it Prepaid Insurance for a second one." ⧉ is the SAME card shown
            twice (a callback — edit either and both change, because they are one card); ⧉+
            makes a real new card he can edit freely. It was only in the ⋯ menu, which is how
            he missed it. */}
        {/* MOVE IT (2026-09-09). Lee: "if I want to reorder a slide we can put like a reorder
            icon to the top right of it outside the slide, and if I click that it lets me — it
            maybe zooms out a little bit and lets me drag it to where I would like it to be."
            Dragging the row still works; this is the version that does not need a steady hand
            down a fifty-slide list. */}
        {!foldered && (
          <button style={{ ...tiny, color: GOLD }} title="Film from here — pops out the 9:16 window starting on this slide" onClick={(e) => { e.stopPropagation(); on.filmFrom(f.id); }}>🎬</button>
        )}
        {!foldered && (
          <button style={tiny} title="Move this slide — pick a place in the zoomed-out order" onClick={(e) => { e.stopPropagation(); on.move(f.id); }}>⇅</button>
        )}
        <button style={tiny} title={f.kind === "ceq" ? "Duplicate — the SAME card, filmed twice. Editing either one edits the card." : "A copy right after this one"} onClick={(e) => { e.stopPropagation(); on.duplicate(f.id, i); }}>⧉</button>
        {f.kind === "ceq" && f.ceqId && (
          <button style={tiny} title="Clone as a NEW card — a real second card in the set, copied from this one, editable without touching the original" onClick={(e) => { e.stopPropagation(); on.cloneCard(f.id, i); }}>⧉+</button>
        )}
        {f.skipped ? (
          <button style={{ ...tiny, color: MINT }} title="Film this slide again" onClick={(e) => { e.stopPropagation(); on.toggleSkip(f.id); }}>↺</button>
        ) : isInsert(f.kind) ? (
          <button style={{ ...tiny, color: RED }} title="Remove this slide" onClick={(e) => { e.stopPropagation(); on.remove(f.id, i); }}>✕</button>
        ) : (
          <button style={{ ...tiny, color: RED }} title="Skip this card in the film (it stays in the set)" onClick={(e) => { e.stopPropagation(); on.toggleSkip(f.id); }}>⊘</button>
        )}
        <button className="sa-spine-more" style={{ ...tiny, color: menu ? GOLD : MUTED }} title="Everything for this slide — edit, duplicate, skip, backdrop, banner, and what only this kind has"
          aria-haspopup="menu" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); on.menu(f.id); }}>⋯</button>
      </span>
      {menu && p.menu && <SlideMenu items={p.menu.items} chips={p.menu.chips} onClose={on.closeMenu} />}
    </div>
  );
}, sameRowProps);

// slidePatchFor (a proofread phrase → the slide it becomes) left with the prompter face on
// 2026-09-07 — it had no caller outside it.

export function ReviewDeck({ set, topic, register, initialSelectedId = null, focusTake = null, knife = null }: {
  set: BoothSetInfo; topic: BoothTopic;
  /** THE KNIFE (cut this set into sibling sets) — the route's button, shown small beside the
   *  slides toggle instead of on its own row (Lee, 2026-09-10: "not losing so much vertical space"). */
  knife?: ReactNode;
  /** Hands the deck's verbs to whoever mounts it (the AI board's "＋ slide"). */
  register?: (api: DeckApi | null) => void;
  /** Open with this slide selected and scrolled into view — the route's ?frame= (2026-09-06,
   *  the illustration bank's deep link). Unknown id → the first slide, as always. */
  initialSelectedId?: string | null;
  /** ONE SPLIT (2026-09-10): 1-based; every other run folds shut and this one scrolls into view,
   *  once, when the plan is in. The folds are his from then on. */
  focusTake?: number | null;
}) {
  // CEQ edits saved this visit: the bank reloads on the next page load; until
  // then the preview and the list read the edited card from here.
  // `edits` rides along (2026-09-07) so the Revert count stays right whether the card's own
  // autosave or a Shorten Apply made the save.
  const [overrides, setOverrides] = useState<Record<string, CeqDraft & { edits: number }>>({});
  const viewSet = useMemo<BoothSetInfo>(() => ({
    ...set,
    ceqs: set.ceqs.map((c) => {
      const o = overrides[c.id];
      return o ? { ...c, stem: o.stem, choices: o.choices.map((x) => ({ text: x.text, correct: x.correct, feedback: x.feedback || undefined })), edits: o.edits } : c;
    }),
  }), [set, overrides]);

  const { plan, commit, saving, undo, redo } = usePlan(set);
  const frames = useMemo(() => plan?.frames ?? [], [plan]);
  const framesRef = useRef(frames); framesRef.current = frames;
  const ceqById = useMemo(() => new Map(viewSet.ceqs.map((c) => [c.id, c])), [viewSet.ceqs]);
  const progress = useMemo(() => questionProgress(filmFrames(frames), ceqById), [frames, ceqById]);
  // SUMMARY SLIDES (Lee: "instead of calling this a note slide, we call it a
  // summary slide. It'll be at the beginning and end of the video"). The set's
  // note-only cards in bank order: first = opening, last = closing.
  const summaryLabel = useMemo(() => {
    const notes = viewSet.ceqs.filter((c) => c.noteOnly).map((c) => c.id);
    const m = new Map<string, string>();
    notes.forEach((id, i) => m.set(id, notes.length >= 2 && i === 0 ? "Opening summary" : notes.length >= 2 && i === notes.length - 1 ? "Closing summary" : "Summary slide"));
    return m;
  }, [viewSet.ceqs]);

  // THE PICK (2026-09-09, spine-select.ts): a list with the focused slide LAST. `selId` is
  // derived from it, so the stage, the editor panel, Shorten, the callout log, the insert point
  // and DeckApi.addSlide keep reading the one focused slide exactly as they did; only the spine
  // knows there can be more than one. `setSelId` is a plain pick — every existing caller
  // (the Space walk, the row verbs, the deep link) means "just this one".
  const [pick, setPick] = useState<Selection>(() => (initialSelectedId ? { ids: [initialSelectedId], anchor: initialSelectedId } : EMPTY_SELECTION));
  const selId = pick.ids[pick.ids.length - 1] ?? null;
  const setSelId = useCallback((id: string | null) => setPick(id ? { ids: [id], anchor: id } : EMPTY_SELECTION), []);
  /** After any move: the moved slide is the pick, and the spine shows it — so a move never
   *  leaves him at the top wondering where it went. */
  const showMoved = useCallback((id: string) => {
    setSelId(id);
    window.setTimeout(() => document.querySelector(`[data-frame-id="${CSS.escape(id)}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), 80);
  }, [setSelId]);
  const sel = frames.find((f) => f.id === selId) ?? frames[0] ?? null;
  const selIdx = sel ? frames.indexOf(sel) : -1;
  /** The spine's row order — the running order without the skipped folder — which a shift-click
   *  range is measured along (a folded run's slides included: they are still in the order). */
  const spineOrder = useMemo(() => frames.filter((f) => !f.skipped).map((f) => f.id), [frames]);
  const pickedSet = useMemo(() => new Set(pick.ids), [pick]);
  // The deep link's slide scrolls into view once the plan is in — once, not on every select.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!initialSelectedId || scrolledTo.current === initialSelectedId || !frames.some((f) => f.id === initialSelectedId)) return;
    scrolledTo.current = initialSelectedId;
    document.querySelector(`[data-frame-id="${CSS.escape(initialSelectedId)}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [initialSelectedId, frames]);

  // Which face the right panel shows. Read lazily: the panel only renders once
  // the plan has loaded on the client, so there is nothing to mismatch.
  const [rightTab, setRightTabState] = useState<RightTab>(readRightTab);
  const setRightTab = useCallback((t: RightTab) => { setRightTabState(t); writeRightTab(t); }, []);

  const [picker, setPicker] = useState<BlastFrameKind | null>(null);
  /** The ▾ under "＋ Map" — the three example maps as one-click inserts (2026-09-07). */
  const [mapMenu, setMapMenu] = useState(false);
  /** "＋ Slogan" opens the three (2026-09-08) — one click each, the words already in. */
  const [sloganMenu, setSloganMenu] = useState(false);
  /** The insert row, folded away until asked for (2026-09-09) — see the button. */
  const [insertOpen, setInsertOpen] = useState(false);
  /** Slides or text rows in the running order. Read after mount — the server has no
   *  localStorage, and slides-then-list is a nicer first paint than the reverse. */
  const [stripView, setStripViewState] = useState<"film" | "list">("film");
  useEffect(() => { setStripViewState(readStripView()); }, []);
  const setStripView = (v: "film" | "list") => { setStripViewState(v); try { localStorage.setItem(STRIP_VIEW_KEY, v); } catch { /* cosmetic */ } };
  /** The slide whose ⇅ was pressed — the zoomed-out placement overlay is up for it. */
  const [moveId, setMoveId] = useState<string | null>(null);
  // THE SEARCH (Lee, 2026-09-10: "Search tool would be great too. Like CTRL F but better at
  // finding a slide than the browser CTRL F."). Matches a slide's label, its words, its card's
  // stem and choices; Enter walks the hits; Escape clears. Ctrl+F on this page opens it.
  const [query, setQuery] = useState("");
  const [hitAt, setHitAt] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // THE STRIP CAN HIDE (Lee: "Let me show / hide the top spine."). Remembered per browser.
  const [stripOpen, setStripOpenState] = useState(true);
  useEffect(() => { try { setStripOpenState(localStorage.getItem("sa-review-strip") !== "hidden"); } catch { /* forgets */ } }, []);
  const setStripOpen = (v: boolean) => { setStripOpenState(v); try { localStorage.setItem("sa-review-strip", v ? "open" : "hidden"); } catch { /* forgets */ } };
  // THE TAKES, ONCE (2026-09-09). Lee: "would be a huge help if I could collapse a split
  // group." The spine used to re-derive the grouping inline, per row, in O(n³); this is the one
  // planTakes the rest of the line uses — over filmFrames, so take N here IS /v3/post's
  // `<setId>#N` and /film's `?take=`. Skipped frames are in no take: they are in the folder.
  const takes = useMemo(() => planTakes(filmFrames(frames)), [frames]);
  const takeOf = useMemo(() => {
    const m = new Map<string, { take: PlanTake; posInTake: number }>();
    for (const t of takes) t.frames.forEach((f, k) => m.set(f.id, { take: t, posInTake: k }));
    return m;
  }, [takes]);
  /** Runs with no question in them (plan.ts emptyTakes) — flagged, never auto-fixed. */
  const emptyHeads = useMemo(() => new Set(emptyTakes(filmFrames(frames)).map((t) => t.headId)), [frames]);
  /** Which runs are folded shut, BY HEAD ID and remembered per set. It was a set of ordinals,
   *  in memory: a new cut above renumbered every fold below it, and Film-and-back lost them all.
   *  Read after mount like stripView (the server has no localStorage); written on every change
   *  once this set's folds are in, so the first paint never clobbers the stored ones. */
  const [collapsedState, setCollapsedState] = useState<{ setId: string | null; ids: Set<string> }>({ setId: null, ids: new Set() });
  const collapsed = collapsedState.ids;
  useEffect(() => { setCollapsedState({ setId: set.id, ids: readCollapsed(set.id) }); }, [set.id]);
  useEffect(() => { if (collapsedState.setId === set.id) writeCollapsed(set.id, collapsedState.ids); }, [collapsedState, set.id]);
  const setCollapsed = useCallback((fn: (s: Set<string>) => Set<string>) => setCollapsedState((c) => ({ setId: c.setId, ids: fn(c.ids) })), []);
  const toggleGroup = useCallback((headId: string) => setCollapsed((s) => { const x = new Set(s); if (x.has(headId)) x.delete(headId); else x.add(headId); return x; }), [setCollapsed]);
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTake || collapsedState.setId !== set.id || takes.length < 2) return;
    const want = takes[focusTake - 1];
    if (!want || focused.current === `${set.id}:${focusTake}`) return;
    focused.current = `${set.id}:${focusTake}`;
    setCollapsed(() => new Set(takes.filter((t) => t.headId !== want.headId).map((t) => t.headId)));
    setSelId(want.headId);
    window.setTimeout(() => document.querySelector(`[data-frame-id="${CSS.escape(want.headId)}"]`)?.scrollIntoView({ inline: "start", block: "nearest", behavior: "smooth" }), 50);
  }, [focusTake, takes, collapsedState.setId, set.id, setCollapsed, setSelId]);
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as string[];
    const hay = (f: BlastFrame): string => {
      const c = f.ceqId ? ceqById.get(f.ceqId) : undefined;
      return [labelOf(f), snippet(f), f.text ?? "", f.title ?? "", c?.stem ?? "", ...(c?.choices.map((x) => x.text) ?? [])].join(" · ").toLowerCase();
    };
    return frames.filter((f) => !f.skipped && hay(f).includes(q)).map((f) => f.id);
  }, [query, frames, ceqById]);
  const hitSet = useMemo(() => new Set(hits), [hits]);
  const goHit = useCallback((k: number) => {
    if (!hits.length) return;
    const n = ((k % hits.length) + hits.length) % hits.length;
    setHitAt(n);
    const id = hits[n];
    const t = takeOf.get(id)?.take;
    if (t) setCollapsed((c) => { if (!c.has(t.headId)) return c; const x = new Set(c); x.delete(t.headId); return x; });
    setSelId(id);
    window.setTimeout(() => document.querySelector(`[data-frame-id="${CSS.escape(id)}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), 60);
  }, [hits, takeOf, setCollapsed, setSelId]);
  useEffect(() => { if (hits.length) goHit(0); }, [hits.length === 0 ? "" : hits[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  /** A one-line note on the spine's header row — the pop-out's fate — for a few seconds. */
  const [spineNote, setSpineNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashNote = useCallback((text: string) => {
    setSpineNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setSpineNote(null), 6000);
  }, []);
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current); }, []);
  /** A row to scroll to once the plan that contains it has rendered (the cut's new intro). */
  const scrollTo = useRef<string | null>(null);
  useEffect(() => {
    const id = scrollTo.current;
    if (!id || !frames.some((f) => f.id === id)) return;
    scrollTo.current = null;
    document.querySelector(`[data-frame-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [frames]);
  /** The head frame whose name is being typed. Lee: "I'd also like to name it from the edit side." */
  const [renamingHead, setRenamingHead] = useState<string | null>(null);
  const renameTake = (headId: string, name: string) => { if (plan) commit(nameTake(plan.frames, headId, name)); setRenamingHead(null); };
  /** Insert after a given frame (or the selected one), optionally selecting it. */
  const insertAfter = useCallback((afterId: string | null, kind: BlastFrameKind, patch: Partial<BlastFrame> = {}, select = true) => {
    if (!plan) return;
    const f: BlastFrame = { id: newFrameId(kind), kind, ...patch };
    const i = afterId ? plan.frames.findIndex((x) => x.id === afterId) : selIdx;
    commit(insertFrame(plan.frames, f, i < 0 ? plan.frames.length - 1 : i));
    if (select) setSelId(f.id);
    setPicker(null);
  }, [plan, commit, selIdx]);
  const add = useCallback((kind: BlastFrameKind, patch: Partial<BlastFrame> = {}) => insertAfter(null, kind, patch, true), [insertAfter]);
  useEffect(() => { register?.({ addSlide: (k, p) => add(k, p) }); return () => register?.(null); }, [register, add]);

  const patch = useCallback((id: string, p: Partial<BlastFrame>) => { if (plan) commit(patchFrame(plan.frames, id, p)); }, [plan, commit]);
  /** Lee, 2026-09-05: "resize it from its fixed spot and it would apply to any other slides
   *  using that setting" — one click instead of a fast-track round trip. */
  const patchKind = useCallback((kind: BlastFrameKind, p: Partial<BlastFrame>) => { if (plan) commit(patchFramesOfKind(plan.frames, kind, p)); }, [plan, commit]);

  // SHORTEN (2026-09-07) — which slide's BEFORE | AFTER panel is open; it closes itself when
  // the selection moves. Opening it lands the right column on the Editor face, where it shows.
  const [shortenId, setShortenId] = useState<string | null>(null);
  const openShorten = useCallback(() => { if (!sel) return; setShortenId(sel.id); setRightTab("editor"); }, [sel, setRightTab]);
  /** The last Shorten applied — an edit on that target within the minute logs as "shorten-edited". */
  const shortenApplied = useRef<ShortenApplied>(null);
  const selCeq = sel?.kind === "ceq" && sel.ceqId ? ceqById.get(sel.ceqId) : undefined;
  const shortenReq = useMemo<ShortenRequest | null>(() => {
    if (!sel) return null;
    if (sel.kind === "ceq") return selCeq ? { kind: "ceq", stem: selCeq.stem, choices: selCeq.choices.map((c) => ({ text: c.text, correct: c.correct })) } : null;
    const f = calloutFieldsOf(sel);
    return f ? { kind: "callout", ...f } : null;
  }, [sel, selCeq]);

  // THE EDIT LOG for callouts (Lee: "make note of the edits I'm making"). Callouts autosave
  // through usePlan already; this only watches the words settle — 1.2 s after the last change
  // to the selected callout's title / line / bullets, one row: what it said when he started (or
  // after the last row) → what it says now. One row per settled save, never per keystroke.
  const calloutBase = useRef<{ id: string; json: string } | null>(null);
  const calloutJson = sel && isCallout(sel.kind) ? JSON.stringify(calloutFieldsOf(sel)) : null;
  useEffect(() => {
    if (!sel || calloutJson === null) { calloutBase.current = null; return; }
    if (calloutBase.current?.id !== sel.id) { calloutBase.current = { id: sel.id, json: calloutJson }; return; }
    if (calloutBase.current.json === calloutJson) return;
    const id = sel.id;
    const t = setTimeout(() => {
      const base = calloutBase.current;
      if (!base || base.id !== id || base.json === calloutJson) return;
      calloutBase.current = { id, json: calloutJson };
      void logCeqEdit({ data: { setId: set.id, target: id, kind: "callout", source: sourceFor(shortenApplied.current, id), before: JSON.parse(base.json) as ShortenFields, after: JSON.parse(calloutJson) as ShortenFields, who: getAdminWho() } });
    }, 1200);
    return () => clearTimeout(t);
  }, [sel, calloutJson, set.id]);

  /** Apply from the Shorten panel: a card writes through applyCeqEdit (the same door the
   *  autosave uses), a callout patches the plan; either way one "shorten" row in the log. */
  const applyShorten = useCallback(async (r: ShortenResult) => {
    if (!sel || !shortenReq) return;
    const who = getAdminWho();
    if (sel.kind === "ceq" && selCeq) {
      const before = draftOf(selCeq);
      // The feedback lines are not Shorten's to touch — they ride along by position.
      const after: CeqDraft = { stem: r.stem ?? before.stem, choices: (r.choices ?? []).map((c, i) => ({ text: c.text, correct: c.correct, feedback: before.choices[i]?.feedback ?? "" })) };
      await applyCeqEdit({ data: { ceqNodeId: selCeq.id, stem: after.stem, ...(!selCeq.noteOnly && after.choices.length ? { choices: after.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback || null })) } : {}) } });
      setOverrides((o) => ({ ...o, [selCeq.id]: { ...after, edits: selCeq.edits + 1 } }));
      refreshBank();
      shortenApplied.current = { target: selCeq.id, at: Date.now() };
      void logCeqEdit({ data: { setId: set.id, target: selCeq.id, kind: "ceq", source: "shorten", before: ceqFieldsOf(before), after: ceqFieldsOf(after), who } });
    } else {
      const before = calloutFieldsOf(sel);
      if (!before) return;
      const after: ShortenFields = { title: r.title ?? "", ...(before.text !== undefined ? { text: r.text ?? "" } : {}), bullets: r.bullets ?? [] };
      // The watcher above must not read this patch as a manual edit: its baseline moves first.
      calloutBase.current = { id: sel.id, json: JSON.stringify(after) };
      patch(sel.id, calloutPatchOf(sel.kind, after));
      shortenApplied.current = { target: sel.id, at: Date.now() };
      void logCeqEdit({ data: { setId: set.id, target: sel.id, kind: "callout", source: "shorten", before, after, who } });
    }
    setShortenId(null);
  }, [sel, selCeq, shortenReq, set.id, patch]);

  // THE TALKTHROUGH STORE (local-first, idempotent to start — the same call v3.index.tsx and
  // the rehearsal review make): the Say it brief reads what Lee said about the card in Step 1.
  useEffect(() => { startTT(); }, []);
  const briefContextFor = useCallback((f: BlastFrame): SlideBriefContext => slideBriefContextFor(frames, f, ceqById, set.id, set.name), [frames, ceqById, set.id, set.name]);

  // THE LAST WORD, every slide at once (2026-09-07). Lee: "now we're at the final editing point.
  // Maybe one last thing comes around to enhance our video… I want it all." One call per slide
  // that has kept prompter lines, in running order, sequential; each proposal waits on ITS
  // slide (a 🪄 on the spine row, the diff in the Editor) for his "Use this" — never applied on
  // its own. Cancel stops after the call in flight; proposals already in stay.
  const [tightenProposals, setTightenProposals] = useState<Record<string, SlideTextResult>>({});
  const [tightenRun, setTightenRun] = useState<{ at: number; total: number; label: string; done: boolean; found: number; error?: string } | null>(null);
  const tightenCancel = useRef(false);
  const tightenCandidates = useMemo(() => frames.filter((f) => !f.skipped && isSlideTextKind(f.kind) && (f.prompter?.length ?? 0) > 0), [frames]);
  const tightenAll = useCallback(async () => {
    const list = tightenCandidates;
    if (!list.length) return;
    tightenCancel.current = false;
    let found = 0;
    setTightenRun({ at: 0, total: list.length, label: "", done: false, found });
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (tightenCancel.current) break;
      setTightenRun({ at: i + 1, total: list.length, label: `${i + 1} of ${list.length} · ${FRAME_LABEL[f.kind]}`, done: false, found });
      const current = slideTextFieldsOf(f);
      if (!current || !isSlideTextKind(f.kind)) continue;
      try {
        const ctx = briefContextFor(f);
        const m = buildTightenToLinesMessages({ kind: f.kind, current, prompter: f.prompter ?? [], prompterKeys: f.prompterKeys, transition: f.prompterTransition, card: ctx.card, picture: ctx.picture });
        const kind = f.kind;
        const r = await microTwice(set.id, "tighten to the lines", m, 500, (t) => parseSlideText(t, kind), `The tightening for "${FRAME_LABEL[f.kind]}"`);
        if (sameSlideText(current, r)) continue; // already tight — nothing to show him
        found += 1;
        setTightenProposals((p) => ({ ...p, [f.id]: r }));
      } catch (e) {
        setTightenRun({ at: i + 1, total: list.length, label: `${i + 1} of ${list.length} · ${FRAME_LABEL[f.kind]}`, done: true, found, error: e instanceof Error ? e.message : String(e) });
        return;
      }
    }
    setTightenRun((s) => (s ? { ...s, done: true, found, label: tightenCancel.current ? "stopped" : "" } : s));
  }, [tightenCandidates, briefContextFor, set.id]);
  const settleTighten = useCallback((id: string) => setTightenProposals((p) => { if (!(id in p)) return p; const { [id]: _drop, ...rest } = p; return rest; }), []);
  const tightenWaiting = Object.keys(tightenProposals).filter((id) => frames.some((f) => f.id === id)).length;

  // Which row's ⋯ menu is open (one at a time). A row that leaves the plan
  // while its menu is up takes the menu with it.
  const [menuId, setMenuId] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuId(null), []);
  useEffect(() => { if (menuId && !frames.some((f) => f.id === menuId)) setMenuId(null); }, [frames, menuId]);

  // THE SKIPPED FOLDER's open/closed state (Lee, 2026-09-06) — remembered per
  // browser like the right panel's face; closed by default, since the point of
  // the folder is to get skipped cards out of the way.
  const [folderOpen, setFolderOpenState] = useState<boolean>(readFolderOpen);
  const setFolderOpen = useCallback((v: boolean) => { setFolderOpenState(v); writeFolderOpen(v); }, []);

  // SPACE / SHIFT+SPACE walk the slides (Lee: "I like to do this to prep
  // myself to film through them") — the same keys as film mode. Never while
  // typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only a bare space, not held, with nothing focused that takes text —
      // and never with a modifier (Ctrl+Space, Alt+Space are the browser's).
      // Not while a slide's ⋯ menu is open either — space is picking an item there.
      if (e.key !== " " || e.repeat || e.ctrlKey || e.metaKey || e.altKey || menuId || isTyping(e.target) || isTyping(document.activeElement) || !frames.length) return;
      e.preventDefault();
      // SKIPPED SLIDES ARE NOT IN THE WALK (2026-09-09). Lee: "if a card is skipped, like don't
      // show it in the preview at all… I want the spacebar to be me rehearsing how I'll actually
      // move the slides in the video filming itself." Film mode already walks filmFrames; this
      // is the Editor catching up, so the two rehearse the same running order. A skipped slide
      // is still reachable — it is in the folder, one click away.
      const i = selIdx < 0 ? 0 : selIdx;
      const step = e.shiftKey ? -1 : 1;
      let n = i + step;
      while (n > 0 && n < frames.length - 1 && frames[n].skipped) n += step;
      const next = Math.max(0, Math.min(frames.length - 1, n));
      if (frames[next].skipped && frames[next].id !== frames[i].id) return;   // nothing unskipped that way
      setSelId(frames[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames, selIdx, menuId, setSelId]);

  // THE CLIPBOARD KEYS (2026-09-09, Lee's notes: copy / cut / paste) — same guard as the Space
  // walk: never while typing, never with a ⋯ menu open. Ctrl/Cmd+C copies the pick (spine
  // order) into the tab's own buffer; Ctrl/Cmd+X copies then drops each one through dropFrame
  // (an insert goes; a set card is SKIPPED, never deleted — the folder is the undo); Ctrl/Cmd+V
  // puts fresh copies after the focused slide (plan.ts pasteAfter — the cut and the take name
  // stay behind) and picks them. Delete / Backspace skips the pick. Escape on a multi-pick
  // keeps only the focused slide. Nothing here touches a card on the server — it moves plan
  // frames only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || menuId || isTyping(e.target) || isTyping(document.activeElement) || !frames.length) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === "Escape") {
        if (pick.ids.length > 1) { e.preventDefault(); setPick(focusOnly(pick)); }
        return;
      }
      if (mod && key === "f") { e.preventDefault(); setStripOpen(true); window.setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select(); }, 30); return; }
      // UNDO / REDO (Lee, 2026-09-10: "Ctrl Z undo needs to work on the slide editor. I moved a
      // slide, and lost it."). The running order only — a card's words have their own ↶ Revert.
      // DUPLICATE (Lee, 2026-09-10: "CTRL + D to duplicate a slide I'm on") — the same ⧉ the
      // row offers: the same card shown twice, the copy selected.
      if (mod && key === "d") {
        e.preventDefault();
        if (sel && selIdx >= 0) duplicateAt(sel.id, selIdx);
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      const picked = pickOrdered(pick, spineOrder).map((id) => frames.find((f) => f.id === id)).filter((f): f is BlastFrame => !!f);
      if (mod && key === "c") {
        if (!picked.length) return;
        e.preventDefault();
        setClip(picked);
        return;
      }
      if (mod && key === "x") {
        if (!picked.length) return;
        e.preventDefault();
        setClip(picked);
        let next: BlastFrame[] = [...frames];
        for (const f of [...picked].reverse()) next = dropFrame(next, f.id);
        commit(next);
        const from = frames.indexOf(picked[0]);
        const landing = next.slice(Math.max(0, from)).find((f) => !f.skipped) ?? next[next.length - 1];
        setSelId(landing?.id ?? null);
        return;
      }
      if (mod && key === "v") {
        const clip = getClip();
        if (!clip.length) return;
        e.preventDefault();
        const { frames: next, ids } = pasteAfter(frames, clip, selIdx < 0 ? frames.length - 1 : selIdx);
        commit(next);
        setPick({ ids, anchor: ids[0] ?? null });
        return;
      }
      if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        if (!picked.length) return;
        e.preventDefault();
        let next: BlastFrame[] = [...frames];
        for (const f of picked) next = toggleSkip(next, f.id);
        commit(next);
        const from = frames.indexOf(picked[picked.length - 1]);
        const landing = next.slice(Math.max(0, from)).find((f) => !f.skipped) ?? next.slice(0, from).reverse().find((f) => !f.skipped);
        setSelId(landing?.id ?? null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, frames, selIdx, menuId, pick, spineOrder, commit, setSelId]);

  // DRAG TO REORDER — plain HTML5 drag, no library. The drop line sits above
  // or below the row under the cursor, so it is never a guess (Lee: "I can't
  // tell if it slots in above or below").
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ i: number; below: boolean } | null>(null);
  /** The bundle ghost under the pointer while a multi-pick drags (spine-drag.ts); removed on dragend. */
  const ghost = useRef<HTMLElement | null>(null);
  /** The rows' one stable handler object, and the ref it reads the deck's latest verbs through. */
  const live = useRef<SpineRowHandlers | null>(null);
  const rowOn = useMemo<SpineRowHandlers>(() => ({
    select: (id, e) => live.current?.select(id, e),
    dragStart: (id, dt) => live.current?.dragStart(id, dt),
    over: (i, below) => live.current?.over(i, below),
    drop: () => live.current?.drop(),
    dragEnd: () => live.current?.dragEnd(),
    menu: (id) => live.current?.menu(id),
    closeMenu: () => live.current?.closeMenu(),
    move: (id) => live.current?.move(id),
    duplicate: (id, i) => live.current?.duplicate(id, i),
    cloneCard: (id, i) => live.current?.cloneCard(id, i),
    filmFrom: (id) => live.current?.filmFrom(id),
    toggleSkip: (id) => live.current?.toggleSkip(id),
    remove: (id, i) => live.current?.remove(id, i),
  }), []);
  const dropGhost = () => { ghost.current?.remove(); ghost.current = null; };
  /** THE ZOOM-OUT (Lee's notes: zoom-out while dragging): after DRAG_ZOOM_AFTER_MS of dragging
   *  the spine gets `is-dragging` — rows shrink to a line each so the whole running order fits
   *  the viewport and the target is findable. Off again the moment the drag ends. */
  const dragZoom = false;
  const drop = () => {
    if (plan && dragId && over) {
      const to = over.below ? over.i + 1 : over.i;
      // A DRAGGED ROW THAT IS IN THE PICK DRAGS THE WHOLE PICK (B4/B5): one block, plan.ts
      // moveMany. A row outside the pick moves alone, as it always did.
      const bundle = pickedSet.has(dragId) ? pickOrdered(pick, spineOrder) : [dragId];
      if (bundle.length > 1) {
        commit(moveMany(plan.frames, bundle, to));
      } else {
        const from = plan.frames.findIndex((f) => f.id === dragId);
        const dest = from < to ? to - 1 : to;
        if (from >= 0 && from !== dest) commit(moveFrame(plan.frames, from, dest));
      }
      const movedId = dragId;
      window.setTimeout(() => showMoved(movedId), 0);
    }
    setDragId(null); setOver(null); dropGhost();
  };
  // AUTO-SCROLL WHILE DRAGGING (spine-drag.ts autoScrollDelta). The spine scrolls the DOCUMENT,
  // so the window is the scroller: a window-level dragover records the pointer's y (registered
  // only while a drag is on), a rAF loop scrolls by the band's answer, and the drag's end
  // cancels both. If a future layout makes the spine its own scroller, hand that element's
  // rect and scrollBy in here instead of the window's.
  useEffect(() => {
    if (!dragId) return;
    let y = -1;
    let raf = 0;
    const onMove = (e: DragEvent) => { y = e.clientY; };
    const tick = () => {
      if (y >= 0) { const d = autoScrollDelta(y, 0, window.innerHeight); if (d) window.scrollBy(0, d); }
      raf = window.requestAnimationFrame(tick);
    };
    window.addEventListener("dragover", onMove);
    raf = window.requestAnimationFrame(tick);
    // NO ZOOM-OUT (Lee, 2026-09-10: "No more zoom out when drag drop"). The strip is one row; the
    // target is in view already. DRAG_ZOOM_AFTER_MS stays exported for the list face.
    return () => {
      window.removeEventListener("dragover", onMove);
      window.cancelAnimationFrame(raf);
    };
  }, [dragId]);

  // THE ROW VERBS (Lee, 2026-09-04: "Duplicate and remove also can be icons
  // that show up on hover on the left spine"). Same moves the slide's chips
  // made: the copy is selected; a removed row hands selection to its
  // neighbour — but only when it was the selected one.
  const duplicateAt = (id: string, i: number) => { const next = duplicateFrame(frames, id); commit(next); setSelId(next[i + 1]?.id ?? id); };
  const cloneToEnd = (id: string) => { const next = cloneFrameToEnd(frames, id); commit(next); setSelId(next[next.length - 1]?.id ?? id); };

  // THE GAP'S THREE VERBS (2026-09-09).
  //
  // CLONE, and it always means the independent kind. Lee: "put a clone button (which in every
  // case, is about cloning so I can edit independently a new one. Not repeat the old one. I just
  // want to have the old one as a starting point. This is a speed thing to make editing
  // faster.)" So a set card goes through duplicateCeqCard — a real new card — and an insert is
  // simply duplicated, which is already independent (its own id, its own words).
  const cloneAfter = async (f: BlastFrame, i: number) => {
    if (f.kind === "ceq" && f.ceqId) { await cloneCard(f.id, i); return; }
    duplicateAt(f.id, i);
  };
  // CUT. The mark, the sign-off in front of it and the standard opener behind it, in one press.
  // AND THE RUN ABOVE FOLDS (2026-09-09, Lee's notes: hide / collapse the previous split). The
  // take that just closed is done with; so it collapses, the selection lands on the new opener's
  // intro — the head of the split he is now working on — and the spine scrolls there.
  // Un-cutting (✂ undo) only lifts the mark; nothing folds or moves.
  /** A CUT MOVES EVERY LATER SPLIT'S NUMBER — and /v3/post's rows are keyed by that number. So
   *  the rows follow their split (publish-rekey.ts) — Lee, 2026-09-10: "my revenues slide became
   *  expenses… so it doesn't happen again". */
  const rekey = (before: readonly BlastFrame[], after: readonly BlastFrame[]) => {
    void rekeyAfterPlanChange(set.id, before, after).catch((e) => flashNote(`⚠ post rows not re-keyed: ${e instanceof Error ? e.message : String(e)}`));
  };
  const cutAfter = (f: BlastFrame) => {
    const wasCut = !!f.cutAfter;
    const next = cutAfterFrame(frames, f.id, standardOpener(set.name, CRAM_NOT_LECTURE));
    commit(next);
    rekey(frames, next);
    // STAY PUT (Lee, 2026-09-10: "if I split on the spine, you don't have to zoom back to the
    // middle, just stay in the spot I'm at"). The cut lands; nothing folds, selects or scrolls.
    void wasCut;
  };
  // FILM THIS SPLIT (2026-09-09, Lee's notes: film from this split — the film icon on the
  // bracket). The 9:16 pop-out opens straight from the spine on /film with `?take=N` (the capture films that
  // run once P2 lands; until then it starts at slide 1). From the click, never an effect — a
  // popup opened from an effect is blocked — and under POPOUT_NAME, so a second click on any
  // bracket refocuses the one window rather than spawning another.
  /** FILM FROM HERE: the split this slide is in, starting on this slide, in the pop-out. */
  const filmFrom = (id: string) => {
    const t = takeOf.get(id)?.take;
    const href = blastOffPath(topic, set, "film") + "?popout=1" + (t ? "&take=" + t.index : "") + "&frame=" + encodeURIComponent(id);
    let w: Window | null = null;
    try { w = window.open(href, POPOUT_NAME, POPOUT_FEATURES); } catch { w = null; }
    if (w === null) { flashNote(POPOUT_BLOCKED); return; }
    try { w.focus(); } catch { /* ignore */ }
    flashNote(POPOUT_OPENED);
  };
  const filmTake = (take: PlanTake) => {
    const href = blastOffPath(topic, set, "film") + "?popout=1&take=" + take.index;
    let w: Window | null = null;
    try { w = window.open(href, POPOUT_NAME, POPOUT_FEATURES); } catch { w = null; }
    if (w === null) { flashNote(POPOUT_BLOCKED); return; }
    try { w.focus(); } catch { /* ignore */ }
    flashNote(POPOUT_OPENED);
  };
  /** REMOVE THE CUT that opens an empty run (A7): the mark sits on the frame right before the
   *  run's head; cutAfterFrame toggles it off. The opener slides it added stay — his now. */
  const uncutBefore = (take: PlanTake) => {
    const headAt = frames.findIndex((x) => x.id === take.headId);
    // The spine's takes are over filmFrames, so a mark on a SKIPPED slide is not the boundary
    // it shows — walk past those to the cut that actually opens this run.
    for (let k = headAt - 1; k >= 0; k--) if (!frames[k].skipped && frames[k].cutAfter) { const next = cutAfterFrame(frames, frames[k].id, []); commit(next); rekey(frames, next); return; }
  };
  // CLONE A SET CARD INTO ITS OWN CARD (2026-09-08). Lee: "If I duplicate a slide, then change
  // it, it's editing the previous slide. It's more a clone one that I can then edit
  // independently thing." Duplicate keeps pointing at the same question on purpose (that is how
  // he films a callback); THIS makes a real new card in the set and points the new slide at it,
  // so the two can say different things. Server-side, because the card lives in the scene.
  const [cloning, setCloning] = useState(false);
  const cloneCard = async (id: string, i: number) => {
    const f = frames.find((x) => x.id === id);
    if (!f?.ceqId || cloning) return;
    setCloning(true);
    try {
      const res = await duplicateCeqCard({ data: { ceqNodeId: f.ceqId } });
      // THE BANK FIRST (2026-09-10). This used to reload the whole page so the tab would learn
      // the new card's words — Lee: "if I clone a CEQ slide, it refreshes… I have to re-find
      // where I was." refreshBank re-fetches and hands the tree to every mounted screen now, so
      // we wait for it, THEN drop the frame in: the new ceqId is already live when the plan
      // reconciles, nothing flashes "no longer in the set", and the selection never moves.
      await refreshBank();
      const copy: BlastFrame = { ...f, id: newFrameId("ceq"), ceqId: res.ceqNodeId, skipped: undefined, bankItemId: undefined };
      const next = insertFrame(framesRef.current, copy, i);
      commit(next);
      showMoved(copy.id);
      setCloning(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not clone that card.");
      setCloning(false);
    }
  };
  const removeAt = (id: string, i: number) => { const next = dropFrame(frames, id); commit(next); if (id === sel?.id) setSelId(next[Math.min(i, next.length - 1)]?.id ?? null); };

  /** What the ⋯ menu offers this slide: the row's own verbs first, then the
   *  switches the editor and the stage have (backdrop, banner), then what only
   *  this kind has (the bolt's animation, which ad, the bio's portrait). */
  const menuFor = (f: BlastFrame, i: number): { items: MenuItem[]; chips: MenuChips[] } => {
    const edit = () => { setSelId(f.id); setRightTab("editor"); };
    const items: MenuItem[] = [
      {
        label: f.kind === "ad" ? "✎ Edit the copy" : f.kind === "ceq" && f.ceqId && ceqById.has(f.ceqId) ? "✎ Edit the card" : "✎ Edit this slide",
        title: "Open it in the editor, beside the slide", color: GOLD, run: edit,
      },
      // TWO KINDS OF COPY, and the difference is the whole point (2026-09-08). Duplicate is the
      // SAME card filmed twice — edit it and both slides change, because they are one question.
      // Clone as a new card makes a real second card in the set that can then say something
      // different. Lee hit the first expecting the second: "If I duplicate a slide, then change
      // it, it's editing the previous slide."
      { label: f.kind === "ceq" ? "⧉ Duplicate — same card, filmed twice" : "⧉ Duplicate", title: f.kind === "ceq" ? "A second slide showing this same question. Editing either one edits the card." : "A copy right after this one", run: () => duplicateAt(f.id, i) },
      ...(f.kind === "ceq" && f.ceqId
        ? [{ label: cloning ? "⧉+ Cloning…" : "⧉+ Clone as a NEW card", title: "A real new card in the set, copied from this one — edit it freely without touching the original", color: MINT, run: () => void cloneCard(f.id, i) }]
        : []),
      // Lee, 2026-09-08: "Clone slide to move to end" — "I'm adding more to return to them
      // faster at the end of a video sometimes." The copy lands ahead of the bio and the outro.
      { label: "⧉↓ Clone to the end", title: "A copy at the back of the running order, before the sign-off — for coming back to it at the end", run: () => cloneToEnd(f.id) },
      // A DUPLICATED set card really deletes (plan.ts dropFrame); the last one for a card skips.
      isInsert(f.kind) || (f.kind === "ceq" && f.ceqId && frames.some((x) => x.id !== f.id && x.ceqId === f.ceqId))
        ? { label: "✕ Remove", title: isInsert(f.kind) ? "Remove this slide" : "Delete this copy — the card itself stays in the set", color: RED, run: () => removeAt(f.id, i) }
        : f.skipped
          ? { label: "↺ Film it", title: "Film this slide again", color: MINT, run: () => commit(toggleSkip(frames, f.id)) }
          : { label: "⊘ Skip in the film", title: "Skip this card in the film (it stays in the set)", color: RED, run: () => commit(toggleSkip(frames, f.id)) },
    ];
    // THE TWO FORMATS, from the row too (2026-09-08) — the same switch the editor panel has, so
    // Lee can flip a slide without selecting it first.
    if (canGoBig(f.kind)) {
      items.push({
        label: `⚡ Format · ${isBigCallout(f) ? "big" : "card"}`,
        title: isBigCallout(f) ? "Drawn as the whole screen — bolt behind, big letters. Click for the card." : "Drawn as the detour card. Click to fill the whole screen instead.",
        run: () => patch(f.id, { display: isBigCallout(f) ? undefined : "big" }),
      });
    }
    // The cold open carries the banner unless told not to; every other slide only when asked.
    const bannerOn = f.kind === "open" ? f.banner !== "off" : f.banner === "on";
    items.push({
      label: `🏫 Campus banner · ${bannerOn ? "on" : "off"}`, title: "The slow Power Four banner along the lower third",
      run: () => patch(f.id, { banner: f.kind === "open" ? (f.banner === "off" ? undefined : "off") : (f.banner === "on" ? undefined : "on") }),
    });
    // THE CAMERA (2026-09-05): cycles the spots; "free" is placed by dragging the ring on the stage.
    items.push({ label: `📷 Camera · ${camSpotOf(f)}`, title: `Where Lee sits on this slide — ${CAM_LABEL[camSpotOf(f)]}. Click to cycle.`, run: () => patch(f.id, { cam: CAM_SPOTS[(CAM_SPOTS.indexOf(camSpotOf(f)) + 1) % CAM_SPOTS.length] }) });
    // THE ILLUSTRATION (polish pass): opens the Illustrator face for this slide.
    if (canIllustrate(f.kind)) items.push({
      label: `🎨 Illustration · ${f.illustration?.assetUrl ? "on" : f.illustration?.requested ? "idea banked" : "none"}`,
      title: "An optional picture — write and generate it in the Illustrator; drag it around on the slide.",
      run: () => { setSelId(f.id); setRightTab("illustrator"); },
    });
    if (f.kind === "bio") items.push({ label: `🖼 Portrait · ${f.portrait === "on" ? "on" : "off (parked)"}`, title: "The hand-drawn portrait over the black — on unless you turn it off", run: () => patch(f.id, { portrait: f.portrait === "on" ? undefined : "on" }) });
    const chips: MenuChips[] = [];
    if (f.kind === "bolt") chips.push({ label: "The animation", chips: ZOOM_VARIANTS.map((v) => ({ id: v.id, label: v.label, on: (f.variant ?? "zoom") === v.id, title: v.blurb })), pick: (id) => patch(f.id, { variant: id }) });
    if (f.kind === "ad") chips.push({ label: "Which ad", chips: AD_KINDS.map((k) => ({ id: k, label: AD_LABEL[k].replace(/^Ad · /, ""), on: (f.ad ?? "greek") === k })), pick: (id) => { if (isAdKind(id)) patch(f.id, { ad: id }); } });
    return { items, chips };
  };

  const snippet = (f: BlastFrame): string => {
    const ceq = f.ceqId ? ceqById.get(f.ceqId) : undefined;
    if (f.kind === "open") return "Black · the glow wordmark · Power Four ticker";
    if (f.kind === "intro") return f.text?.trim() || set.name;
    if (f.kind === "bio") return "Lee Ingram · BAccy · MAccy — Ole Miss";
    if (f.kind === "outro") return f.text?.trim() || TAGLINE;
    if (f.kind === "ceq") return ceq ? (ceq.noteOnly ? ceq.stem : `${ceq.label} · ${ceq.stem}`) : "— card missing from the set —";
    if (f.kind === "cheat") return [f.title, f.body].filter(Boolean).join(" — ") || "(empty cheat code)";
    if (f.kind === "ad") return f.title?.trim() || ADS[f.ad ?? "greek"].headline;
    if (f.kind === "bolt") return `Black + the ${f.variant ?? "zoom"} animation`;
    if (f.kind === "exhibit") return f.text?.trim() || (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit");
    if (f.kind === "cluster") return f.cluster ? `${f.cluster.title.trim() || "Untitled map"} · ${f.cluster.nodes.length} node${f.cluster.nodes.length === 1 ? "" : "s"}` : "(empty map)";
    return f.text?.trim() || `(empty ${FRAME_LABEL[f.kind].toLowerCase()})`;
  };
  const labelOf = (f: BlastFrame): string => (f.kind === "ceq" && f.ceqId && summaryLabel.get(f.ceqId)) || (f.kind === "ad" && f.ad ? AD_LABEL[f.ad] : FRAME_LABEL[f.kind]);
  const colorOf = (f: BlastFrame): string => KIND_COLOR[f.kind] ?? (isStandard(f.kind) ? SKY : f.kind === "ceq" && f.ceqId && summaryLabel.has(f.ceqId) ? MINT : MUTED);

  if (!plan) return <div style={{ color: MUTED, fontSize: 13 }}>Loading the film draft…</div>;

  const filmed = filmFrames(frames).length;
  const skipped = frames.length - filmed;
  // The two buttons at the top of the right column (2026-09-07). The Illustrator one goes
  // disabled on a kind that can't take a picture; the face itself still explains which can.
  const tabs = <RightTabs tab={rightTab} onTab={setRightTab} canIllustrate={!!sel && canIllustrate(sel.kind)} />;

  // THE SKIPPED FOLDER (Lee, 2026-09-06: "once a slide is skipped, move it to
  // bottom in a skipped folder"). JUDGMENT CALL: this splits how the spine DRAWS
  // the running order, not the running order itself — frames keeps its real
  // indices untouched (toggleSkip in plan.ts never moves anything), so
  // backdropFor, filmFrames and every index a menu action closes over below
  // still mean exactly what they meant before. Un-skipping a card from inside
  // the folder needs no "restore its old slot" logic because it never left one.
  const indexed = frames.map((f, i) => ({ f, i }));
  const activeRows = indexed.filter((r) => !r.f.skipped);
  const skippedRows = indexed.filter((r) => r.f.skipped);
  /** id → real index into `frames` (what every menu action and drop closes over), and id → the
   *  row's number in the film order. Both once per render, not once per row. */
  const indexOf = new Map(indexed.map((r) => [r.f.id, r.i]));
  const numberOf = new Map(activeRows.map((r, pos) => [r.f.id, pos + 1]));
  /** More than one take means every run gets a header — the first one included, which is what
   *  makes it collapsible and nameable. */
  const hasCuts = takes.length > 1;

  // THE ZOOMED-OUT MOVE (2026-09-09). `moveFrameRef` is the slide being placed; `moveTo` drops
  // it before the frame at `to`. moveFrame takes a from/to pair in the SAME list, and removing
  // the slide first shifts everything after it down one — so a target past the origin loses one.
  const moveFrameRef = moveId ? frames.find((f) => f.id === moveId) ?? null : null;
  // THIS SPLIT ONLY (Lee, 2026-09-10: "it should only let me reorder into the split. If I want to
  // move a slide into a different split, I'll just Ctrl X it and Ctrl V"). A skipped slide is in
  // no take, so it sees the whole order, as before.
  const moveTake = moveFrameRef ? takeOf.get(moveFrameRef.id)?.take ?? null : null;
  const moveRows = moveTake ? activeRows.filter((r) => takeOf.get(r.f.id)?.take === moveTake) : activeRows;
  const moveEnd = moveRows.length ? moveRows[moveRows.length - 1].i + 1 : frames.length;
  const moveTo = (to: number) => {
    const from = moveFrameRef ? frames.indexOf(moveFrameRef) : -1;
    if (from < 0) { setMoveId(null); return; }
    const movedId = moveFrameRef!.id;
    window.setTimeout(() => showMoved(movedId), 0);
    // The slide being placed is part of the pick → the whole pick goes, as one block (B4).
    const bundle = moveFrameRef && pickedSet.has(moveFrameRef.id) ? pickOrdered(pick, spineOrder) : [];
    if (bundle.length > 1) {
      commit(moveMany(frames, bundle, to));
    } else {
      const dest = to > from ? to - 1 : to;
      if (dest !== from) commit(moveFrame(frames, from, dest));
    }
    setMoveId(null);
  };
  /** The set's slide template — once, not once per row (it was read inside the row loop). */
  const layout = layoutOf(plan);
  /** SAME CARD ×n, counted once per plan rather than twice per row. */
  const sameCard = new Map<string, number>();
  for (const f of frames) if (f.kind === "ceq" && f.ceqId) sameCard.set(f.ceqId, (sameCard.get(f.ceqId) ?? 0) + 1);
  /** The backdrop rule's answer per slide, once per plan — the thumbnails read this (SpineRow
   *  passes it to PhoneFrame) so `frames` changing identity on a keystroke is not a re-render. */
  const backdropOf = new Map<string, BackdropMode | null>();
  frames.forEach((f, i) => backdropOf.set(f.id, backdropFor(frames, i, (id) => !!ceqById.get(id)?.noteOnly)));

  // THE DECK'S VERBS, for the rows (SpineRow is memoized on primitives + this one object). The
  // object never changes identity; it reads the latest closures through `live`, assigned every
  // render below, so a row's click always runs against the current plan.
  live.current = {
    filmFrom: (id) => filmFrom(id),
    select: (id, e) => {
      // A foldered row (not in the spine order) is only ever a plain pick.
      if (!spineOrder.includes(id)) { setSelId(id); return; }
      setPick((p) => clickSelect(p, spineOrder, id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }));
    },
    dragStart: (id, dt) => {
      setDragId(id);
      // A ROW IN THE PICK DRAGS THE WHOLE PICK, under one bundle ghost (spine-drag.ts).
      const bundle = pickedSet.has(id) ? pickOrdered(pick, spineOrder) : [id];
      if (dt) {
        try { dt.effectAllowed = "move"; } catch { /* some engines refuse */ }
        if (bundle.length > 1) {
          const first = frames.find((f) => f.id === bundle[0]);
          dropGhost();
          ghost.current = buildBundleGhost(document, bundle.length, first ? snippet(first) : "");
          try { dt.setDragImage(ghost.current, 20, 14); } catch { /* no custom image — the row's own snapshot then */ }
        }
      }
    },
    over: (i, below) => setOver({ i, below }),
    drop,
    dragEnd: () => { setDragId(null); setOver(null); dropGhost(); },
    menu: (id) => setMenuId((m) => (m === id ? null : id)),
    closeMenu,
    move: (id) => setMoveId(id),
    duplicate: duplicateAt,
    cloneCard: (id, i) => void cloneCard(id, i),
    toggleSkip: (id) => commit(toggleSkip(frames, id)),
    remove: removeAt,
  };
  /** One spine row, shared by the running order and the folder — `number` is the
   *  row's place in the actual film order (undefined inside the folder, where a
   *  slide has no such place); `foldered` turns off drag (a skipped card's order
   *  relative to other skipped cards films nothing, so there is nothing to reorder). */
  /** THE GAP'S "+" (2026-09-10): the quick kinds and a blank, inserted after the slide the gap
   *  follows — not after whatever happens to be selected. */
  const gapKinds = (f: BlastFrame) => [
    ...QUICK.map((q) => ({ label: q.label, color: KIND_COLOR[q.kind] ?? MUTED, add: () => insertAfter(f.id, q.kind, q.patch ?? {}, true) })),
    { label: "Blank", color: MUTED, add: () => insertAfter(f.id, "blank", {}, true) },
    ...SLOGANS.map((sl) => ({ label: `Slogan · ${sl.text.slice(0, 22)}`, color: KIND_COLOR.slogan ?? MUTED, add: () => { insertAfter(f.id, "slogan", { text: sl.text }, true); if (sl.art) setRightTab("illustrator"); } })),
    { label: "Map", color: KIND_COLOR.cluster ?? MUTED, add: () => insertAfter(f.id, "cluster", { cluster: emptyCluster("New map") }, true) },
    // A fresh rubric object per insert (emptyRubric() is called at click time, never shared).
    { label: "Rubric", color: KIND_COLOR.rubric ?? MUTED, add: () => insertAfter(f.id, "rubric", { rubric: emptyRubric() }, true) },
    // THE END-OF-TOPIC PAIR (2026-09-11). Up Next opens the skippable segment as it lands.
    { label: "Topic complete", color: KIND_COLOR.topic_done ?? MUTED, add: () => insertAfter(f.id, "topic_done", {}, true) },
    { label: "Up next", color: KIND_COLOR.up_next ?? MUTED, add: () => insertAfter(f.id, "up_next", { segment: "skippable" }, true) },
    { label: "Survibes", color: KIND_COLOR.survibes ?? MUTED, add: () => insertAfter(f.id, "survibes", {}, true) },
    { label: "Exhibit…", color: MUTED, add: () => { setSelId(f.id); setPicker("exhibit"); } },
  ];
  const spineRow = (f: BlastFrame, i: number, opts: { number?: number; foldered?: boolean; thumb?: boolean; card?: boolean } = {}) => {
    const foldered = !!opts.foldered;
    const prog = progress.get(f.id);
    return (
      <SpineRow key={f.id} frame={f} i={i} number={opts.number} foldered={foldered} thumb={!!opts.thumb} card={!!opts.card}
        isSelected={f.id === sel?.id} isPicked={pickedSet.has(f.id) && pick.ids.length > 1} isHit={hitSet.has(f.id)} isMenuOpen={menuId === f.id} isDragging={dragId === f.id}
        dropEdge={!foldered && over?.i === i && dragId !== f.id ? (over.below ? "below" : "above") : null}
        label={labelOf(f)} color={colorOf(f)} snippet={snippet(f)}
        sameCardCount={f.kind === "ceq" && f.ceqId ? sameCard.get(f.ceqId) ?? 0 : 0}
        prompterLines={f.prompter?.length ?? 0} tightened={!!tightenProposals[f.id]}
        ceq={f.ceqId ? ceqById.get(f.ceqId) : undefined} backdrop={backdropOf.get(f.id) ?? null}
        frames={frames} set={viewSet} topicName={topic.name} progressX={prog?.x} progressY={prog?.y} layout={layout}
        menu={menuId === f.id ? menuFor(f, i) : null}
        on={rowOn} />
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ------------------------------------------------ TOP: the spine, as a strip
          (Lee, 2026-09-10: "the slide spine is HORIZONTAL, not vertical. There's too much
          scrolling… slideable left to right, the hover +, split, etc. on the right side instead
          of bottom, the slide preview and the editor/illustrator next to each other, two columns
          centered"). Sticky, so the strip stays while the columns below scroll. */}
      <section style={{ position: "sticky", top: 0, zIndex: 6, background: V3_NAVY, paddingBottom: 4 }}>
        <style>{SPINE_CSS}</style>
        <div className="flex items-center" style={{ gap: 8, marginBottom: stripOpen ? 8 : 0, flexWrap: "wrap" }}>
          <button onClick={() => setStripOpen(!stripOpen)} title={stripOpen ? "Hide the slides" : "Show the slides"} aria-expanded={stripOpen}
            style={{ background: "transparent", border: `1px solid ${EDGE}`, borderRadius: 8, color: MUTED, cursor: "pointer", padding: "3px 8px", fontSize: 11, lineHeight: 1 }}>{stripOpen ? "▴ slides" : "▾ slides"}</button>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setHitAt(0); }} placeholder="🔍 find a slide (Ctrl+F)"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); goHit(hitAt + (e.shiftKey ? -1 : 1)); } if (e.key === "Escape") { setQuery(""); (e.target as HTMLInputElement).blur(); } }}
              style={{ font: "inherit", fontSize: 12, padding: "4px 9px", borderRadius: 8, border: `1px solid ${query ? MINT : EDGE}`, background: "rgba(255,255,255,0.05)", color: CREAM, outline: "none", width: 230 }} />
            {query && <span style={{ position: "absolute", right: 8, fontSize: 10.5, color: hits.length ? MINT : RED, pointerEvents: "none" }}>{hits.length ? `${hitAt + 1}/${hits.length}` : "0"}</span>}
          </span>
          <span style={{ fontSize: 11.5, color: MUTED }}>{filmed} slides{skipped ? ` · ${skipped} skipped` : ""}</span>
          {knife}
          {(spineNote ?? saving) && (() => { const s = spineNote ?? saving!; return <span style={{ fontSize: 11, color: s === POPOUT_BLOCKED || s.startsWith("⚠") ? RED : s === "saved" || s === POPOUT_OPENED ? MINT : MUTED, marginLeft: "auto" }}>{s}</span>; })()}
        </div>
        {/* THE INSERT TOGGLE AND ITS CHIP ROWS LEFT (Lee, 2026-09-10: "Insert a slide isn't needed.
            I will do it with the + hover icon"). Every kind they offered is in the gap's "+" now. */}
        {picker && <BankPicker kind={picker} setId={set.id} setName={set.name} onPick={(p) => add(picker, p)} onClose={() => setPicker(null)} />}

        {/* THE LAST WORD for every slide at once (2026-09-07) — only once some slide has kept
            prompter lines (they're made on Rehearse & Film); each proposal waits on its slide. */}
        {(tightenCandidates.length > 0 || tightenRun) && (
          <div style={{ marginBottom: 10 }}>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
              <button style={{ ...chip(!!tightenRun && !tightenRun.done), opacity: tightenCandidates.length ? 1 : 0.5 }} disabled={!tightenCandidates.length || (!!tightenRun && !tightenRun.done)}
                title={`Propose shorter words on every slide that has kept prompter lines (${tightenCandidates.length}) so the slide matches what you'll say — one call per slide, each proposal waits for your click`}
                onClick={() => void tightenAll()}>🪄 Tighten all to the lines{tightenRun && !tightenRun.done ? "…" : ` · ${tightenCandidates.length}`}</button>
              {tightenRun && !tightenRun.done && <button style={chip(false)} title="Stop after the slide in flight" onClick={() => { tightenCancel.current = true; }}>stop</button>}
              {tightenRun && <span style={{ fontSize: 11, color: tightenRun.error ? RED : MUTED }}>{tightenRun.error ? `⚠ ${tightenRun.error}` : tightenRun.done ? `${tightenRun.label ? `${tightenRun.label} · ` : ""}${tightenRun.found} proposal${tightenRun.found === 1 ? "" : "s"} waiting` : tightenRun.label}</span>}
            </div>
            {tightenWaiting > 0 && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3 }}>🪄 marks a slide with a proposal — open it, then "Use this" or dismiss. Nothing is applied on its own.</div>}
          </div>
        )}

        {/* THE RUNNING ORDER, AS SLIDES (2026-09-09). Lee: "the running order too, I would rather
            just see it kind of like we see in film mode… I want to see just scroll through the
            different slides, and I could spacebar through them, shift+spacebar to go backwards."
            So the list is thumbnails of the real slides — the same PhoneFrame the middle pane
            draws, at 88px — and the text rows stay one click away for a set where the words are
            what he is scanning for. The choice is remembered per browser. */}
        {/* THE GAP BETWEEN TWO SLIDES IS A CONTROL (2026-09-09). Lee: "When I hover underneath a
            slide in the spine, just put a + there that pops up to add a new slide OR put a clone
            button… AND have a scissor icon for cutting there." Everything he does between slides
            is now done between slides, instead of in a panel somewhere else. A run of slides
            between two cuts is one Short, and it collapses. */}
        <div className={`sa-spine sa-spine-h flex${dragZoom ? " is-dragging" : ""}`} style={{ gap: 14, overflowX: "auto", alignItems: "flex-start", paddingBottom: 8, display: stripOpen ? undefined : "none" }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}>
          {/* ONE RUN PER TAKE (2026-09-09), each with THE BRACKET in a left gutter — Lee's notes:
              a left-gutter Excel bracket per split, with a film icon on it. A
              2 px gold rule with caps spans the run; ▾/▸ folds it, 🎬 pops the 9:16 window out on
              that split. The header band between the gold hairlines stays (the name, typed right
              here); a folded run is one bar, and the bar is a drop target so a drag can land
              above it without opening it. A set with no cuts is one bracket with only 🎬. */}
          {takes.map((take) => {
            const isCollapsed = hasCuts && collapsed.has(take.headId);
            const firstReal = indexOf.get(take.frames[0]?.id ?? "") ?? 0;
            const empty = emptyHeads.has(take.headId);
            const count = take.frames.length;
            return (
              <div key={take.headId} style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 auto", borderLeft: `2px solid ${GOLD}`, paddingLeft: 6 }}>
                <div className="flex items-center" style={{ gap: 4 }}>
                  {hasCuts && (
                    <button style={gutterBtn} title={isCollapsed ? "Expand this split" : "Collapse this split"} aria-expanded={!isCollapsed} onClick={() => toggleGroup(take.headId)}>{isCollapsed ? "▸" : "▾"}</button>
                  )}
                  <button style={gutterBtn} title={hasCuts ? "Film this split — pops out the 9:16 window" : "Film this set"} onClick={() => filmTake(take)}>🎬</button>
                  {!hasCuts && <span style={{ fontSize: 10, color: MUTED }}>{count} slides</span>}
                </div>
                <div className="flex flex-col" style={{ gap: 4, minWidth: 0 }}>
                  {isCollapsed ? (
                    <button onClick={() => toggleGroup(take.headId)} title={`Expand ${takeLabel(take)} · ${count} slides`}
                      onDragOver={(e) => { e.preventDefault(); setOver({ i: firstReal, below: false }); }}
                      onDrop={(e) => { e.preventDefault(); drop(); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, textAlign: "left", minWidth: 0, cursor: "pointer", fontFamily: "inherit",
                        background: PANEL, border: `1px solid ${over?.i === firstReal && !over.below ? SKY : EDGE}`, borderRadius: 7, padding: "4px 10px",
                        fontSize: 11, fontWeight: 800, color: CREAM, boxShadow: over?.i === firstReal && !over.below ? `0 -3px 0 0 ${SKY}` : "none",
                      }}>
                      <span style={{ color: GOLD }}>▸</span> {take.index + 1}
                    </button>
                  ) : (
                    <>
                      {/* THE SPLIT'S OWN HEADER. Shown for EVERY split once there is more than one —
                          including the first, which had no header at all and so could not be collapsed
                          (Lee, 2026-09-09: "I need to be able to collapse the first split too. Right
                          now, it's only letting me collapse 2nd split onward"). The label is the take's
                          name, typed right here. */}
                      {hasCuts && (
                        <div className="flex items-center" style={{ gap: 8, margin: "0 0 2px", flexWrap: "nowrap" }}>
                          <span style={{ flex: 1, height: 1, background: `${GOLD}55`, minWidth: 6 }} />
                          {renamingHead === take.headId ? (
                            <input
                              autoFocus defaultValue={take.name}
                              onBlur={(e) => renameTake(take.headId, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); renameTake(take.headId, (e.target as HTMLInputElement).value); }
                                if (e.key === "Escape") { e.preventDefault(); setRenamingHead(null); }
                              }}
                              placeholder={`Split ${take.index + 1}`}
                              style={{ font: "inherit", fontSize: 11, fontWeight: 800, color: CREAM, background: "rgba(255,255,255,0.06)", border: `1px solid ${GOLD}88`, borderRadius: 7, padding: "2px 8px", outline: "none", minWidth: 180 }}
                            />
                          ) : (
                            <button onClick={() => setRenamingHead(take.headId)} style={{ ...chip(false, GOLD), fontSize: 10, padding: "2px 8px" }}
                              title="Name this video — Post shows this name">
                              {takeLabel(take)} ✎
                            </button>
                          )}
                          <span style={{ fontSize: 10, color: MUTED }}>{count} slide{count === 1 ? "" : "s"}</span>
                          {/* THE EMPTY RUN (plan.ts emptyTakes): a cut with no question behind it. Flagged
                              and offered a fix; never fixed on its own — the live data is Lee's. */}
                          {empty && (
                            <>
                              <span title="This run has an opener and a sign-off but no card — nothing to film" style={{ ...chip(true, AMBER), fontSize: 10, padding: "2px 8px", cursor: "default" }}>no questions in this split</span>
                              {take.index > 0 && (
                                <button onClick={() => uncutBefore(take)} style={{ ...chip(false, AMBER), fontSize: 10, padding: "2px 8px" }} title="Lift the cut that opens this run — the slides it added stay">remove this cut</button>
                              )}
                            </>
                          )}
                          <span style={{ flex: 1, height: 1, background: `${GOLD}55`, minWidth: 12 }} />
                        </div>
                      )}
                      <div className="flex" style={{ gap: 2, alignItems: "stretch" }}>
                        {take.frames.map((f) => {
                          const i = indexOf.get(f.id) ?? -1;
                          return (
                            <Fragment key={f.id}>
                              {spineRow(f, i, { number: numberOf.get(f.id), thumb: true, card: true })}
                              <GapTools vertical kinds={gapKinds(f)} onInsert={() => { setSelId(f.id); setInsertOpen(true); }} onClone={() => void cloneAfter(f, i)} onCut={() => cutAfter(f)} cut={!!f.cutAfter}
                                onOver={() => setOver({ i, below: true })} onDrop={drop} />
                            </Fragment>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {skippedRows.length > 0 && (
          <SkipFolder count={skippedRows.length} open={folderOpen} onToggle={() => setFolderOpen(!folderOpen)}>
            {skippedRows.map(({ f, i }) => spineRow(f, i, { foldered: true }))}
          </SkipFolder>
        )}
      </section>

      {/* MOVE A SLIDE, ZOOMED OUT (2026-09-09) — the whole running order at once, as slides, and
          a drop slot between every pair. Lee asked for "zooms out a little bit and lets me drag
          it to where I would like it to be"; a CLICK on the slot is the same gesture without the
          drag, which on a fifty-slide deck is the one that actually gets used. */}
      {moveFrameRef && (
        <div role="dialog" aria-label="Move this slide" onClick={() => setMoveId(null)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(4,6,12,0.86)", padding: 20, overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div className="flex items-center" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'League Spartan', Rubik, system-ui, sans-serif", fontSize: 18, fontWeight: 900, color: CREAM }}>Move “{snippet(moveFrameRef).slice(0, 46)}”</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>Click where it should go{moveTake ? ` — within ${takeLabel(moveTake)}` : ""}. Another split: Ctrl+X, then Ctrl+V there.</span>
              <button onClick={() => setMoveId(null)} style={{ ...chip(false), marginLeft: "auto" }}>cancel</button>
            </div>
            <div className="flex" style={{ flexWrap: "wrap", alignItems: "flex-start", gap: 2 }}>
              {moveRows.map(({ f, i }, pos) => (
                <span key={f.id} className="flex" style={{ alignItems: "stretch" }}>
                  <MoveSlot to={i} onPick={moveTo} first={pos === 0} />
                  {/* A tile can be picked up and dragged to a slot (2026-09-09) — picking it up
                      makes IT the slide being placed. */}
                  <span draggable onDragStart={() => setMoveId(f.id)}
                    style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: f.id === moveFrameRef.id ? 0.35 : 1, cursor: "grab" }}>
                    <span style={{ borderRadius: 5, overflow: "hidden", border: `1px solid ${f.id === moveFrameRef.id ? GOLD : EDGE}`, pointerEvents: "none" }}>
                      <PhoneFrame frame={f} frames={frames} index={i} set={viewSet} topicName={topic.name} w={moveRows.length > 24 ? 84 : 112} live={false} rounded={false} layout={layout} backdrop={backdropOf.get(f.id) ?? null} />
                    </span>
                    <span style={{ fontSize: 9.5, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{pos + 1}</span>
                  </span>
                </span>
              ))}
              <MoveSlot to={moveEnd} onPick={moveTo} last />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18, alignItems: "start", width: "100%", maxWidth: 1180, margin: "0 auto" }}>
      {/* --------------------------------------------- MIDDLE: the slide
          IT FOLLOWS HIM DOWN (2026-09-09). Lee: "Let the slide preview follow me as I scroll
          down from the spine, so I don't have to scroll back and forth." The spine is sixty
          rows long and the preview was pinned to the top of the page, so picking slide 40 meant
          scrolling back up to see what he had picked. Sticky, under the step bar's height. */}
      <section style={{ alignSelf: "start" }}>
        {sel && (
          <SlidePane key={sel.id} sel={sel} idx={selIdx} count={frames.length} label={labelOf(sel)} viewSet={viewSet} topic={topic}
            progress={progress.get(sel.id)}
            backdrop={backdropFor(frames, selIdx, (id) => !!ceqById.get(id)?.noteOnly)}
            frames={frames}
            layout={layout}
            onMove={(d) => commit(moveFrame(frames, selIdx, selIdx + d))}
            onGoHere={() => {
              const t = takeOf.get(sel.id)?.take;
              if (t) setCollapsed((c) => { if (!c.has(t.headId)) return c; const x = new Set(c); x.delete(t.headId); return x; });
              window.setTimeout(() => document.querySelector(`[data-frame-id="${CSS.escape(sel.id)}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), 60);
            }}
            onPatch={(p) => patch(sel.id, p)}
            addAfter={gapKinds(sel)}
            shorten={shortenReq ? { on: shortenId === sel.id, open: openShorten } : null} />
        )}
      </section>

      {/* --------------------------------- RIGHT: editor | illustrator (no teleprompter since 2026-09-07) */}
      {!sel ? (
        <section style={panelShell}>{tabs}</section>
      ) : sel.kind === "cluster" ? (
        // THE MAP FACE (2026-09-07) — whichever button is lit, a map shows its own face: the
        // assistant's thread, the bird's-eye, the JSON. The Illustrator button is disabled for it
        // (canIllustrate says no), so there is nothing else this column could show.
        <section style={panelShell}>
          {tabs}
          <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
            <span style={{ fontSize: 11.5, color: MUTED }}>{labelOf(sel)}{sel.skipped ? " · skipped" : ""}</span>
            {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? RED : saving === "saved" ? MINT : MUTED }}>{saving}</span>}
          </div>
          {(() => { const ctx = mapCardFor(frames, sel, ceqById, set.id); return <MapFace key={sel.id} sel={sel} setId={set.id} set={viewSet} card={ctx.card} talkthrough={ctx.talkthrough} onPatch={(p) => patch(sel.id, p)} />; })()}
        </section>
      ) : rightTab === "illustrator" ? (
        <section style={panelShell}>
          {tabs}
          <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
            <span style={{ fontSize: 11.5, color: MUTED }}>{labelOf(sel)}{sel.skipped ? " · skipped" : ""}</span>
          </div>
          {canIllustrate(sel.kind)
            ? <IllustrationPanel key={sel.id} sel={sel} setId={set.id} setName={set.name} frames={frames} onPatch={(p) => patch(sel.id, p)} />
            : <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Pictures go on Memorize This, Cheat Code, Go Deeper, Tricky Question, blank and slogan slides. Pick one of those in the spine, or insert a <b style={{ color: CREAM }}>＋ Blank</b> — on a blank slide the picture is the slide: the watermark, the picture and the camera if you want it.</div>}
        </section>
      ) : (
        <SlideEditor key={sel.id} sel={sel} label={labelOf(sel)} set={set} topic={topic} tabs={tabs} layout={layout}
          ceq={selCeq}
          saving={saving}
          shortenApplied={shortenApplied}
          above={shortenId === sel.id && shortenReq
            ? <ShortenPanel key={sel.id} req={shortenReq} setId={set.id} topicName={selCeq?.noteOnly ? NOTE_EYEBROW : topic.name} onApply={applyShorten} onClose={() => setShortenId(null)} />
            : null}
          sayIt={{ context: briefContextFor, seed: tightenProposals[sel.id], onSeedSettled: () => settleTighten(sel.id) }}
          onPatch={(p) => patch(sel.id, p)}
          onPatchKind={(p) => patchKind(sel.kind, p)}
          onSaved={(d, edits) => { if (sel.ceqId) setOverrides((o) => ({ ...o, [sel.ceqId!]: { ...d, edits } })); }} />
      )}
      </div>
    </div>
  );
}

/** THE TWO BUTTONS at the top of the right column (2026-09-07, Lee: "put these in two side by
 *  side buttons") — Editor | Illustrator, the same size and weight, the one you're on gold.
 *  Replaced the dropdown that named the face as the column's heading; each face still labels
 *  the slide under the buttons. The Illustrator button is disabled (with a reason) on a slide
 *  kind that can't take a picture; the face itself, if it's already up, says which kinds can. */
function RightTabs({ tab, onTab, canIllustrate: can }: { tab: RightTab; onTab: (t: RightTab) => void; canIllustrate: boolean }) {
  return (
    <div role="tablist" aria-label="Editor or Illustrator" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
      {RIGHT_TABS.map((t) => {
        const on = tab === t.id;
        const off = t.id === "illustrator" && !can;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} disabled={off}
            title={off ? ILLUSTRATOR_OFF_TITLE : t.title}
            onClick={() => onTab(t.id)}
            style={{
              ...eyebrow, textAlign: "center", padding: "7px 8px", borderRadius: 8, cursor: off ? "not-allowed" : "pointer",
              border: `1.5px solid ${on ? GOLD : EDGE}`, background: on ? "rgba(252,163,17,0.14)" : "transparent",
              color: on ? GOLD : off ? MUTED : CREAM, opacity: off ? 0.5 : 1,
            }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------ the middle column

function SlidePane({ sel, idx, count, label, viewSet, topic, progress, backdrop, frames, layout, onMove, onPatch, shorten, onGoHere, addAfter }: {
  /** Scroll the spine to this slide (unfolding its split if it is shut). */
  onGoHere: () => void;
  /** "＋ add after this" (2026-09-11): the same kinds the spine gap's "+" offers, inserted after
   *  THIS slide — so a slide can be added from the preview without finding its gap in the strip. */
  addAfter: readonly { label: string; color: string; add: () => void }[];
  sel: BlastFrame; idx: number; count: number; label: string; viewSet: BoothSetInfo; topic: BoothTopic;
  progress?: { x: number; y: number };
  /** The bolt-zoom backdrop the rule (or the override) gives this slide. */
  backdrop: BackdropMode | null;
  /** The whole running order — the phone applies the backdrop rule itself. */
  frames: readonly BlastFrame[];
  /** The set's slide template. */
  layout: "pass1" | "pass2";
  onMove: (d: -1 | 1) => void;
  /** Only the backdrop toggle patches from here; the words are edited in SlideEditor. */
  onPatch: (p: Partial<BlastFrame>) => void;
  /** ✂ Shorten (2026-09-07) — null on a slide with no words to shorten (the brand slides, ads,
   *  the bolt); `on` while its panel is up in the Editor. */
  shorten: { on: boolean; open: () => void } | null;
}) {
  // The stage is ALWAYS the phone since 2026-09-07 (Lee: "We won't use the phone button") — the
  // flat FrameView preview and its toggle left with that; every video is vertical.
  const [safe, setSafe] = useState(true);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
        <span style={eyebrow}>Slide {idx + 1} of {count}</span>
        <span style={{ fontSize: 11.5, color: MUTED }}>{label}{sel.skipped ? " · skipped" : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          {/* Lee: "put Shorten to left of safe zones". Disabled, with the reason, where there is nothing to shorten. */}
          <button style={{ ...chip(!!shorten?.on), opacity: shorten ? 1 : 0.45, cursor: shorten ? "pointer" : "not-allowed" }} disabled={!shorten}
            title={shorten ? "Shorten (standardize) this card's words with AI — cram, not teach; you see before and after first" : "Shorten works on a set card or a callout (Memorize This, Cheat Code, Go Deeper)"}
            onClick={() => shorten?.open()}>✂ Shorten</button>
          <button style={chip(safe, SKY)} title="Shade the zones TikTok and Shorts paint their own UI over" onClick={() => setSafe((v) => !v)}>safe zones</button>
          <button style={tiny} title="Move up" onClick={() => onMove(-1)}>↑</button>
          <button style={tiny} title="Move down" onClick={() => onMove(1)}>↓</button>
          <button style={{ ...tiny, color: GOLD }} title="Scroll the spine to this slide" onClick={onGoHere}>Go here ↓</button>
        </span>
      </div>

      {/* CLICK THE WORDS (Lee, 2026-09-04): the tagline, the tutor line, the domain,
          an ad's every line — editable on the slide itself. Cards keep the Editor tab. */}
      <SlideEditContext.Provider value={onPatch}>
        <PhoneFrame frame={sel} frames={frames} index={idx} set={viewSet} topicName={topic.name} progress={progress} safe={safe} dim={!!sel.skipped} w={STAGE_W} layout={layout} />
      </SlideEditContext.Provider>
      {/* ＋ ADD AFTER THIS (2026-09-11) — the gap's chooser, under the preview. */}
      <div style={{ position: "relative", marginTop: 8, width: STAGE_W }}>
        <button style={{ ...chip(adding, MUTED), textTransform: "none", letterSpacing: 0 }} title="Add a slide right after this one — same choices as the + in the strip" aria-expanded={adding}
          onClick={() => setAdding((v) => !v)}>＋ add after this {adding ? "▴" : "▾"}</button>
        {adding && (
          <div role="menu" onMouseLeave={() => setAdding(false)}
            style={{ position: "absolute", top: "100%", left: 0, zIndex: 30, marginTop: 4, background: PANEL, border: `1px solid ${GOLD}88`, borderRadius: 9, padding: 6, display: "flex", flexDirection: "column", gap: 3, minWidth: 170, maxHeight: 340, overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", color: MUTED, padding: "2px 6px" }}>ADD AFTER SLIDE {idx + 1}</span>
            {addAfter.map((k) => (
              <button key={k.label} role="menuitem" onClick={() => { setAdding(false); k.add(); }}
                style={{ textAlign: "left", background: "transparent", border: `1px solid ${k.color}55`, color: k.color, borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}>＋ {k.label}</button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// The phone stage itself is ./PhoneFrame.tsx — shared with /film (and the Arrange preview,
// retired into Review on 2026-09-05).

// ------------------------------------------------- the editor (right column)

/** Everything editable about the selected slide — beside it, not under it
 *  (Lee, 2026-09-04: "Instead of having edits of a slide underneath, it'd be
 *  faster/better to have them left/right"). A set card edits the card itself;
 *  an insert edits its words; the brand slides and ads edit their few
 *  switches. Same shell as the Illustrator — the two are faces of one column
 *  (the prompter was the other face until 2026-09-07). */

function SlideEditor({ sel, label, ceq, set, tabs, layout, saving, shortenApplied, above, sayIt, onPatch, onPatchKind, onSaved }: {
  /** The set's slide template — the camera chips read their default from it. */
  layout: "pass1" | "pass2";
  sel: BlastFrame; label: string; ceq?: BoothCeq; set: BoothSetInfo; topic: BoothTopic;
  /** The Editor | Illustrator buttons, drawn by the deck (the Teleprompter | Editor toggle until 2026-09-07). */
  tabs: ReactNode;
  /** usePlan's own save state — every field below writes through onPatch, which
   *  debounces into the same commit. Shown here too (not just on the spine)
   *  because the spine is out of view while typing in this panel. */
  saving: string | null;
  /** The deck's record of the last Shorten applied — the card's autosave reads it to log an
   *  edit within the minute as "shorten-edited". */
  shortenApplied: React.MutableRefObject<ShortenApplied>;
  /** The Shorten panel, when it is up for this slide — sits above the fields (2026-09-07). */
  above?: ReactNode;
  /** 🎙 SAY IT (2026-09-07): what the brief sees besides the slide's words, and a "Tighten all"
   *  proposal waiting on this slide, if one is. */
  sayIt?: { context: (f: BlastFrame) => SlideBriefContext; seed?: SlideTextResult; onSeedSettled: () => void };
  onPatch: (p: Partial<BlastFrame>) => void;
  /** Same fields, but written onto every OTHER slide of this same kind too (2026-09-05). */
  onPatchKind: (p: Partial<BlastFrame>) => void;
  /** A card's save landed: the words, and how many saved edits Revert can now undo. */
  onSaved: (d: CeqDraft, edits: number) => void;
}) {
  const bulletsText = (sel.bullets ?? []).join("\n");
  const detour = isCallout(sel.kind);
  /** The camera row, folded behind its icon until asked for (2026-09-09). */
  const [camOpen, setCamOpen] = useState(false);
  const ad = sel.kind === "ad" ? ADS[sel.ad ?? "greek"] : null;
  const adOwn = sel.text !== undefined || sel.title !== undefined || sel.bullets !== undefined || sel.url !== undefined;
  return (
    <section style={panelShell}>
      {tabs}
      <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap", ...HEAD_RULE }}>
        <span style={{ fontSize: 11.5, color: MUTED }}>{label}{sel.skipped ? " · skipped" : ""}</span>
        {/* Lee, 2026-09-06: "if I edit any text when editing slides, instant
            save it." It already did (onPatch → commit, debounced 500ms) — the
            "saving…/saved" readout just lived on the spine, off to the left,
            out of sight while typing here. Same readout, closer to the fields. */}
        {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") ? RED : saving === "saved" ? MINT : MUTED }}>{saving}</span>}
      </div>
      {above}
      <div>
        {sel.kind === "ceq" && ceq && <CeqEditor key={ceq.id} ceq={ceq} setId={set.id} shortenApplied={shortenApplied} onSaved={onSaved} />}
        {sel.kind === "ceq" && !ceq && <div style={{ fontSize: 12, color: RED }}>This card is no longer in the set — skip it.</div>}
        {/* THE TWO FORMATS (2026-09-08). Lee: "I want a way to have a memorize this, cheat code
            slide, deep ideas, tricky in two formats… either it's in the current format, or it's
            more emphatic where it's a slide just like the slogan one. Bolt in background. BIG
            letters… So I add the slide then choose the mode. The reason is that some of my
            slides are so short that they can fill up the whole screen. Other times it will be
            better to have current version then illustration." Same words either way — only the
            treatment changes, so flipping between them never costs him anything he typed. */}
        {/* WHICH CALLOUT THIS IS (2026-09-09). Lee: "For the callout slides, give me the option
            to switch between them. Like, memorize this, cheat code, tricky question, go deeper,
            and add a new one: Found on your exam." Which one a point IS only becomes obvious
            once it is on the screen, so switching must be one click and must not cost him the
            words: calloutFieldsOf/calloutPatchOf carry the heading and the lines across the
            cheat-code split (title+body there, text here), which is the only shape difference. */}
        {isCallout(sel.kind) && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED }}>Callout</span>
            <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
              {PHRASE_SLIDE_KINDS.map((k) => (
                <button key={k.kind} style={chip(sel.kind === k.kind, KIND_COLOR[k.kind] ?? GOLD)}
                  title={sel.kind === k.kind ? `This slide is a ${k.label}` : `Make this a ${k.label} — the words come with it`}
                  onClick={() => { if (sel.kind === k.kind) return; const w = calloutFieldsOf(sel); onPatch({ kind: k.kind, title: undefined, body: undefined, text: undefined, ...(w ? calloutPatchOf(k.kind, w) : {}) }); }}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {canGoBig(sel.kind) && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED }}>Format</span>
            <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
              <button style={chip(!isBigCallout(sel), SKY)} title="The detour card on the stage — room for a list, and a picture underneath" onClick={() => onPatch({ display: undefined })}>▭ Card</button>
              <button style={chip(isBigCallout(sel), ORANGE)} title="The whole screen — black, the bolt behind, the heading as big as it will go. Same treatment as a slogan slide." onClick={() => onPatch({ display: "big" })}>⚡ Big</button>
              <span style={{ fontSize: 11.5, color: MUTED, alignSelf: "center" }}>
                {isBigCallout(sel) ? "Fills the frame — best when the line is short." : "The card, with the lines under it."}
              </span>
            </div>
          </div>
        )}
        {sel.kind === "cheat" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <label style={{ fontSize: 11, color: MUTED }}>Title — the bold heading
              <textarea rows={1} style={{ ...field, resize: "vertical" }} value={sel.title ?? ""} placeholder="e.g. The Paycheck Test" onChange={(e) => onPatch({ title: e.target.value })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>First line under it
              <textarea style={{ ...field, minHeight: 48 }} value={sel.body ?? ""} placeholder="Ask yourself if they get a paycheck from the company. If so, they're internal." onChange={(e) => onPatch({ body: e.target.value })} /></label>
          </div>
        )}
        {((isCallout(sel.kind) && sel.kind !== "cheat") || sel.kind === "blank" || sel.kind === "exhibit") && (
          <label style={{ fontSize: 11, color: MUTED }}>{isCallout(sel.kind) ? "Title — the bold heading" : sel.kind === "exhibit" ? `Caption${sel.exhibitRef ? ` · exhibit: ${sel.exhibitRef}` : ""}` : "Text on the bare frame"}
            <textarea style={{ ...field, minHeight: 48, marginTop: 4 }} value={sel.text ?? ""} placeholder={sel.kind === "phrase" ? "e.g. Internal users" : sel.kind === "tricky" ? "e.g. Dividends are contra-EQUITY, not contra-asset" : sel.kind === "tip" ? "e.g. Why the board feels like a gray area" : "say it the way you'd say it on camera"} onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {detour && (
          <label style={{ fontSize: 11, color: MUTED, display: "block", marginTop: 8 }}>{sel.kind === "cheat" ? "More lines under it" : "Lines under it"} — one per line, Tab to nest
            <textarea style={{ ...field, minHeight: 64, marginTop: 4, tabSize: 2 }} value={bulletsText} placeholder={"Management\nBudgets, costs, forecasts\nProduction"}
              onChange={(e) => onPatch({ bullets: e.target.value.split("\n") })}
              // NESTING (2026-09-06, Lee: "let me tab over to nest bullets into another
              // indention under"): Tab/Shift+Tab on the current LINE, not the whole field —
              // a plain textarea Tab would otherwise just jump focus to the next control.
              onKeyDown={(e) => {
                if (e.key !== "Tab") return;
                e.preventDefault();
                const ta = e.currentTarget;
                const r = indentBulletLine(ta.value, ta.selectionStart, e.shiftKey ? -1 : 1);
                onPatch({ bullets: r.text.split("\n") });
                requestAnimationFrame(() => ta.setSelectionRange(r.cursor, r.cursor));
              }} /></label>
        )}
        {detour && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>Nothing is highlighted on its own — highlight while filming, or type ==like this== for a fixed one. Type __word__ to underline, or ____ for a blank.</div>}
        {sel.kind === "intro" && (
          <label style={{ fontSize: 11, color: MUTED }}>Topic line on the intro (blank = the set's name)
            <textarea rows={1} style={{ ...field, marginTop: 4, resize: "vertical" }} value={sel.text ?? ""} placeholder={set.name} onChange={(e) => onPatch({ text: e.target.value })} /></label>
        )}
        {/* THE EQUATION RUBRIC (2026-09-11) — the boxes (click to cycle), the transaction, the
            amount, arrows or amounts, the equity effect, and Lee's eight presets. */}
        {sel.kind === "rubric" && <RubricEditor sel={sel} onPatch={onPatch} />}
        {/* THE END-OF-TOPIC FRAMES (2026-09-11): what the bank will put on the slide, and the one
            typed line each has. */}
        {(sel.kind === "topic_done" || sel.kind === "up_next") && <EndOfTopicEditor sel={sel} set={set} onPatch={onPatch} />}
        {/* SURVIBES (2026-09-11): nothing to type — the flip is the slide. What the spacebar does is
            said here so it isn't a surprise on camera. */}
        {sel.kind === "survibes" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={{ fontSize: 11.5, color: MUTED }}>The logo flips on: at 0.7 s the bolt strikes, "ve" becomes "bes", the room lights red and blue, then the wordmark glides up and you take the frame in the big camera box on the left. Captions get the large box (the dashed one on the stage).</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>On camera, <b style={{ color: CREAM }}>space</b> pops a prop over the top area while the wordmark shrinks to the corner and the camera to a small circle under it; shift+space takes it down. Props so far: {SURVIBES_PROPS.map((p) => p.title).join(", ")}. A 2:00 monologue clock runs in the film chrome — never in the pop-out or the shot.</div>
          </div>
        )}
        {/* THE SLOGAN SLIDE (2026-09-08) — the words and nothing else. The picture, when the
            slide wants one, is the Illustrator's face; the chips are the three Lee actually
            says, straight from brand-cards/slogans.ts so the slide and the spoken line can
            never drift apart. */}
        {sel.kind === "slogan" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <label style={{ fontSize: 11, color: MUTED }}>The slogan — the whole slide
              <textarea style={{ ...field, minHeight: 48, marginTop: 4 }} value={sel.text ?? ""} placeholder={SLOGANS[0].text} onChange={(e) => onPatch({ text: e.target.value })} /></label>
            <div className="flex" style={{ gap: 5, flexWrap: "wrap" }}>
              {SLOGANS.map((s) => (
                <button key={s.id} style={{ ...chip((sel.text ?? "").trim() === s.text, ORANGE), fontSize: 10.5, textTransform: "none", letterSpacing: 0 }} title={s.blurb}
                  onClick={() => onPatch({ text: s.text })}>{s.text}</button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED }}>Black, the bolt alive behind it, the words as big as the frame takes. A picture is optional — add one on the Illustrator and the words step down under it.</div>
          </div>
        )}
        {/* THE OUTRO'S SLOGAN (2026-09-08). Lee: "ensure we have option to say, 'Like YT shorts
            for exam prep.' on the outro slides too. Like two versions I could use." Both house
            lines as one-click chips, blank = the tagline. This is also the ONLY slide either
            line appears on now — the cold open's default was retired the same day. */}
        {sel.kind === "outro" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <label style={{ fontSize: 11, color: MUTED }}>Slogan on the outro (blank = the tagline)
              <textarea rows={1} style={{ ...field, marginTop: 4, resize: "vertical" }} value={sel.text ?? ""} placeholder={TAGLINE} onChange={(e) => onPatch({ text: e.target.value })} /></label>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {OUTRO_SLOGANS.map((s) => (
                <button key={s.id} style={chip((sel.text?.trim() || TAGLINE) === s.text, GOLD)} title={s.blurb} onClick={() => onPatch({ text: s.text === TAGLINE ? undefined : s.text })}>{s.text}</button>
              ))}
            </div>
          </div>
        )}
        {/* 🎙 SAY IT + 🪄 TIGHTEN TO THE LINES (2026-09-07) — under the words, for every kind whose
            words are typed above: the callouts, the blank, the exhibit caption, the intro and outro. */}
        {sayIt && isSlideTextKind(sel.kind) && (
          <SayItPanel key={sel.id} sel={sel} kind={sel.kind} setId={set.id} context={sayIt.context} seed={sayIt.seed} onSeedSettled={sayIt.onSeedSettled} onPatch={onPatch} />
        )}
        {sel.kind === "bio" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div>
              <button style={chip(sel.portrait === "on", ORANGE)} title="The hand-drawn portrait over the black — on unless you turn it off" onClick={() => onPatch({ portrait: sel.portrait === "on" ? undefined : "on" })}>🖼 portrait · {sel.portrait === "on" ? "on" : "off (parked)"}</button>
            </div>
          </div>
        )}
        {sel.kind === "open" && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={{ fontSize: 11.5, color: MUTED }}>Black, the glow wordmark with the live bolt, the line, the Power Four ticker. The look is fixed now — the animations live on the bolt detour, and /branding keeps the experiments.</div>
            <div>
              <button style={chip(sel.banner !== "off", ORANGE)} title="The slow Power Four banner along the lower third" onClick={() => onPatch({ banner: sel.banner === "off" ? undefined : "off" })}>🏫 campus banner · {sel.banner === "off" ? "off" : "on"}</button>
            </div>
          </div>
        )}
        {sel.kind === "bolt" && (
          // THE BOLT DETOUR (Lee, 2026-09-04): "just black backdrop and the bolt
          // zoom animation, nothing else … a blank canvas to put things on".
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={subhead}>The animation</div>
            <div className="flex" style={{ gap: 5, flexWrap: "wrap" }}>
              {ZOOM_VARIANTS.map((v) => (
                <button key={v.id} style={chip((sel.variant ?? "zoom") === v.id, ORANGE)} title={v.blurb} onClick={() => onPatch({ variant: v.id })}>{v.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{ZOOM_VARIANTS.find((v) => v.id === (sel.variant ?? "zoom"))?.blurb}</div>
            <label style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
              psych <input type="range" min={0} max={1} step={0.05} value={sel.psych ?? 0.1} onChange={(e) => onPatch({ psych: Number(e.target.value) })} style={{ width: 160 }} />
              <span style={{ color: CREAM, fontVariantNumeric: "tabular-nums" }}>{Math.round((sel.psych ?? 0.1) * 100)}%</span>
              <span>0 = brand colours at rest · 100 = full trip</span>
            </label>
            <div style={{ fontSize: 11.5, color: MUTED }}>Black + the bolt, nothing else — put your camera on it in OBS, or lay an ad over it.</div>
          </div>
        )}
        {sel.kind === "ad" && ad && (
          // THE AD'S WORDS (Lee, 2026-09-04: "Let the ad's text be editable, so
          // I don't have to run changes through you"). Prefilled from the
          // built-in copy; an edit lands on this frame only — label → text,
          // headline → title, lines → bullets, address → url. "↺ default copy"
          // clears the four so the ad falls back to AdSlide.tsx.
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div style={subhead}>Which ad</div>
            <div className="flex" style={{ gap: 5, flexWrap: "wrap" }}>
              {AD_KINDS.map((k) => (
                <button key={k} style={chip((sel.ad ?? "greek") === k, ORANGE)} onClick={() => onPatch({ ad: k })}>{AD_LABEL[k]}</button>
              ))}
            </div>
            <div className="flex items-center" style={{ gap: 6, marginTop: 2 }}>
              <span style={subhead}>The copy</span>
              {adOwn && <span style={{ fontSize: 11, color: GOLD }}>edited on this slide</span>}
              <button style={{ ...chip(false), padding: "2px 8px", fontSize: 10.5, marginLeft: "auto", opacity: adOwn ? 1 : 0.5 }} disabled={!adOwn} title="Put the built-in words back — the four fields fall back to AdSlide.tsx"
                onClick={() => onPatch({ text: undefined, title: undefined, bullets: undefined, url: undefined })}>↺ default copy</button>
            </div>
            <label style={{ fontSize: 11, color: MUTED }}>Label — the small gold tag
              <input style={{ ...field, marginTop: 4 }} value={sel.text ?? ad.label} placeholder={ad.label} onChange={(e) => onPatch({ text: e.target.value })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Headline
              <textarea style={{ ...field, minHeight: 48, marginTop: 4 }} value={sel.title ?? ad.headline} placeholder={ad.headline} onChange={(e) => onPatch({ title: e.target.value })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Lines — one per line
              <textarea style={{ ...field, minHeight: 64, marginTop: 4 }} value={(sel.bullets ?? ad.lines).join("\n")} placeholder={ad.lines.join("\n")} onChange={(e) => onPatch({ bullets: e.target.value.split("\n") })} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Address — after "go to"
              <input style={{ ...field, marginTop: 4 }} value={sel.url ?? ad.url} placeholder={ad.url} onChange={(e) => onPatch({ url: e.target.value })} /></label>
            <div style={{ fontSize: 11.5, color: MUTED }}>Edits stay on this slide; every other rip keeps the built-in copy.</div>
          </div>
        )}
        {/* THE CAMERA (Lee, 2026-09-05): three fixed spots, free, or off — home 70 %+ of the time.
            BEHIND AN ICON since 2026-09-09: "camera on this slide should just be like a camera
            icon button, and if you click it, it opens those different options." It is on the
            default 70 % of the time, so the six chips were six chips of noise most of the time;
            the icon says where the camera is, and opens the row only when he wants to move it. */}
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setCamOpen((v) => !v)} style={{ ...chip(camOpen, ORANGE), textTransform: "none", letterSpacing: 0 }}
            title="Where you sit on this slide — click to change" aria-expanded={camOpen}>
            📷 {isCamSpot(sel.cam) ? sel.cam : camDefault(layout, sel.kind).spot} {camOpen ? "▴" : "▾"}
          </button>
          <div className="flex" style={{ gap: 5, flexWrap: "wrap", marginTop: 4, display: camOpen ? undefined : "none" }}>
            {CAM_SPOTS.map((c) => (
              <button key={c} style={chip((isCamSpot(sel.cam) ? sel.cam : camDefault(layout, sel.kind).spot) === c, ORANGE)} title={CAM_LABEL[c]} onClick={() => onPatch({ cam: c })}>{c}</button>
            ))}
          </div>
          {(isCamSpot(sel.cam) ? sel.cam : camDefault(layout, sel.kind).spot) === "free" && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Drag the ring on the stage to place it · wheel over it to resize.</div>}
          {/* SIZE (2026-09-05: "allow me to choose a camera on this slide location and resize
              it from its fixed spot and it would apply to any other slides using that setting"
              — instead of a fast-track round trip every time). Works on any spot but off; "apply
              to every ⟨kind⟩ slide" writes the size onto every other slide of this kind at once
              — one that's already been resized by hand individually keeps its own (plan.ts
              patchFramesOfKind). */}
          {(isCamSpot(sel.cam) ? sel.cam : camDefault(layout, sel.kind).spot) !== "off" && (() => {
            const current = sel.camSize ?? camDefault(layout, sel.kind).size ?? 0.28;
            return (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
                  Size — {Math.round(current * 100)}% of the frame width
                  <input type="range" min={12} max={90} value={Math.round(current * 100)}
                    onChange={(e) => onPatch({ camSize: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
                </label>
                <div className="flex" style={{ gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                  {sel.camSize !== undefined && <button style={chip(false)} title="Back to the built-in default — this slide only" onClick={() => onPatch({ camSize: undefined })}>↺ this slide's default</button>}
                  <button style={chip(false, ORANGE)} title={`Every ${FRAME_LABEL[sel.kind]} slide gets this size too. One you've already resized by hand keeps its own.`}
                    onClick={() => onPatchKind({ camSize: current })}>apply to every {FRAME_LABEL[sel.kind]} slide</button>
                </div>
              </div>
            );
          })()}
        </div>
        {sel.kind !== "open" && (
          <div style={{ marginTop: 8 }}>
            <button style={chip(sel.banner === "on", ORANGE)} title="Put the slow Power Four campus banner on this slide (any slide — an expansion moment)" onClick={() => onPatch({ banner: sel.banner === "on" ? undefined : "on" })}>🏫 campus banner · {sel.banner === "on" ? "on" : "off"}</button>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------ the end-of-topic faces

/** Topic Complete / Up Next: the bank's answer (read-only — the slide never types these) and
 *  the one line Lee can change. */
function EndOfTopicEditor({ sel, set, onPatch }: { sel: BlastFrame; set: BoothSetInfo; onPatch: (p: Partial<BlastFrame>) => void }) {
  const { topics, error } = useBank();
  const prog = topics ? topicProgress(topics, set.id) : null;
  const next = topics ? upNextFor(topics, set.id) : null;
  const done = sel.kind === "topic_done";
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div className="flex flex-col" style={{ gap: 4 }}>
        <span style={subhead}>From the bank — never typed</span>
        {error && <div style={{ fontSize: 12, color: RED }}>The bank didn't load: {error}</div>}
        {!topics && !error && <div style={{ fontSize: 12, color: MUTED }}>Loading the bank…</div>}
        {topics && done && (prog
          ? <div style={{ fontSize: 12.5, color: CREAM }}>Topic <b>{prog.topic.name}</b> · {TOPIC_DONE_COPY.note(prog.done, prog.total)}</div>
          : <div style={{ fontSize: 12, color: RED }}>This set isn't on an exam topic — the slide shows a red block.</div>)}
        {topics && !done && (next
          ? <div style={{ fontSize: 12.5, color: CREAM }}>Next topic <b>{next.topic.name}</b> · first set: {next.set.name}</div>
          : <div style={{ fontSize: 12, color: RED }}>This is the last set in the bank — nothing to tease; the slide shows a red block.</div>)}
      </div>
      <label style={{ fontSize: 11, color: MUTED }}>{done ? `The line under "${TOPIC_DONE_COPY.heading}" (blank = the mockup's)` : "Subtitle under the topic (blank = the next set's name)"}
        <textarea rows={2} style={{ ...field, marginTop: 4, resize: "vertical" }} value={sel.text ?? ""} placeholder={done ? TOPIC_DONE_COPY.line : next?.set.name ?? ""} onChange={(e) => onPatch({ text: e.target.value })} /></label>
      {done
        ? <div style={{ fontSize: 11.5, color: MUTED }}>One bar segment per exam topic; the finished ones fill amber→red and the newest charges on camera. The red pill says "{TOPIC_DONE_COPY.cta}".</div>
        : <div style={{ fontSize: 11.5, color: MUTED }}>The rubric cycles borrow → supplies → services on account → rent every ~3 s on camera. This slide opens a skippable segment{sel.segment === "skippable" ? "" : " — but the flag is missing on this one"}.</div>}
    </div>
  );
}

// ------------------------------------------------------- the rubric's face

/** The Editor panel for a rubric slide. Everything writes the whole `rubric` object through
 *  onPatch (debounced into the same commit as any other field). A slide that somehow has no
 *  rubric data gets one button: give it a fresh one — the stage is already showing the red block. */
function RubricEditor({ sel, onPatch }: { sel: BlastFrame; onPatch: (p: Partial<BlastFrame>) => void }) {
  const r = sel.rubric;
  if (!r) {
    return (
      <div className="flex flex-col" style={{ gap: 8 }}>
        <div style={{ fontSize: 12, color: RED }}>This rubric slide has no data.</div>
        <div><button style={chip(false, ORANGE)} onClick={() => onPatch({ rubric: emptyRubric() })}>Start a fresh A = L + E rubric</button></div>
      </div>
    );
  }
  const set = (p: Partial<NonNullable<BlastFrame["rubric"]>>) => onPatch({ rubric: { ...r, ...p } });
  const arrowText = (k: RubricKey) => r.arrows[k].map((d) => (d === "up" ? "↑" : "↓")).join("") || "·";
  const cellColor = (k: RubricKey) => (r.arrows[k].length ? (r.arrows[k].includes("up") ? GOLD : SKY) : MUTED);
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div className="flex flex-col" style={{ gap: 6 }}>
        <span style={subhead}>Mode</span>
        <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
          <button style={chip(r.mode === "ale", GOLD)} onClick={() => set({ mode: "ale" })}>{RUBRIC_MODE_LABEL.ale}</button>
          {/* Reserved: the debit / credit rubric. Not pickable until it draws. */}
          <button style={{ ...chip(false), opacity: 0.45, cursor: "not-allowed" }} disabled title="Coming later — the normal-balance (+/−) rubric">{RUBRIC_MODE_LABEL.dc}</button>
        </div>
        {r.mode !== "ale" && <div style={{ fontSize: 11.5, color: RED }}>This slide is in a mode that can't draw yet — pick A = L + E.</div>}
      </div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        <span style={subhead}>Boxes — click to cycle ↑ · ↓ · ↑↓ · blank (or click them on the slide)</span>
        <div className="flex" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {RUBRIC_KEYS.map((k, i) => (
            <span key={k} className="flex" style={{ gap: 6, alignItems: "center" }}>
              {i === 1 && <span style={{ color: MUTED, fontWeight: 700 }}>=</span>}
              {i === 2 && <span style={{ color: MUTED, fontWeight: 700 }}>+</span>}
              {i === 3 && <span style={{ color: MUTED, fontWeight: 700 }}>·</span>}
              <button style={{ ...chip(r.arrows[k].length > 0, cellColor(k)), minWidth: 44, textTransform: "none", letterSpacing: 0 }} title={`${k}: ${arrowText(k)}`}
                onClick={() => set({ arrows: cycleKey(r.arrows, k) })}>{k} {arrowText(k)}</button>
            </span>
          ))}
          <button style={{ ...chip(false), fontSize: 10.5 }} title="Blank every box" onClick={() => set({ arrows: emptyRubric().arrows })}>clear</button>
        </div>
      </div>
      <label style={{ fontSize: 11, color: MUTED }}>Transaction — the words on the slide
        <textarea style={{ ...field, minHeight: 48, marginTop: 4 }} value={r.text} placeholder="e.g. Paid $600 cash for rent" onChange={(e) => set({ text: e.target.value })} /></label>
      <div className="flex" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 11, color: MUTED }}>Amount $
          <input type="number" min={0} step={50} style={{ ...field, width: 110, marginTop: 4 }} value={r.amount || ""} placeholder="0"
            onChange={(e) => set({ amount: Math.max(0, Number(e.target.value) || 0) })} /></label>
        <div className="flex flex-col" style={{ gap: 4 }}>
          <span style={subhead}>Show</span>
          <div className="flex" style={{ gap: 6 }}>
            <button style={chip(r.show === "arrows", ORANGE)} onClick={() => set({ show: "arrows" })}>Arrows</button>
            <button style={chip(r.show === "amounts", ORANGE)} title="The amount beside each arrow, and the balance line — A = L + E + Rev − Exp" onClick={() => set({ show: "amounts" })}>Arrows + amounts</button>
          </div>
        </div>
      </div>
      <label style={{ fontSize: 11.5, color: CREAM, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={r.equityEffect} onChange={(e) => set({ equityEffect: e.target.checked })} />
        Show how Rev and Exp hit Equity (a faded arrow in E)
      </label>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: -4 }}>Leave it off until you've taught it. It's the "expenses up means equity down" moment.</div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        <span style={subhead}>Transactions — one click fills the text, the amount and the arrows</span>
        <div className="flex" style={{ gap: 5, flexWrap: "wrap" }}>
          {RUBRIC_PRESETS.map((p) => (
            <button key={p.id} style={{ ...chip(r.text === p.text, GOLD), textTransform: "none", letterSpacing: 0, fontSize: 10.5 }} title={p.text} onClick={() => set(applyPreset(r, p))}>{p.label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: MUTED }}>On camera, space reveals the boxes one at a time — A, then L, then E, then Rev/Exp. Here they're all shown.</div>
    </div>
  );
}

// --------------------------------------------------------- CEQ: it saves itself

/** Edit the card itself. The bank is the truth, so a save goes through the one door the
 *  review board already uses (applyCeqEdit) — the slide that films IS the card.
 *
 *  AUTOSAVE (2026-09-07). Lee: "Editing a ceq test should be automatic. No 'save to bank'
 *  needed … We definitely want to have it autosave, so I don't lose work." 800 ms after the
 *  last keystroke the draft goes to applyCeqEdit; a draft that is momentarily not saveable
 *  (two corrects while re-ticking, an empty new choice, an empty stem) just waits for the next
 *  change — it never errors at him. The "saving… / saved 12:04 / couldn't save" line took the
 *  Save button's place; Revert stays (the history is on the node, server side). The dirty
 *  before/after preview left with the button — dirty lasts under a second now, and the Shorten
 *  panel is the side-by-side. Every settled save also logs one edit-log row (manual, or
 *  shorten-edited within a minute of an applied Shorten) — "make note of the edits I'm making". */
function CeqEditor({ ceq, setId, shortenApplied, onSaved }: { ceq: BoothCeq; setId: string; shortenApplied: React.MutableRefObject<ShortenApplied>; onSaved: (d: CeqDraft, edits: number) => void }) {
  const base = useMemo(() => draftOf(ceq), [ceq]);
  const [d, setD] = useState<CeqDraft>(base);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "muted" | "ok" | "bad"; text: string } | null>(null);
  // The draft the last save sent. When `base` catches up with it (the deck's overrides re-read
  // the card) the fields are left alone — he may have typed on during the round trip. Any OTHER
  // base change (a revert, a bank reload) replaces the draft, as before.
  const lastSaved = useRef<CeqDraft | null>(null);
  useEffect(() => {
    if (lastSaved.current && sameDraft(base, lastSaved.current)) return;
    setD(base);
  }, [base]);
  const dirty = !sameDraft(d, base);
  const valid = draftValid(d, ceq.noteOnly);
  const setChoice = (i: number, p: Partial<CeqDraft["choices"][number]>) =>
    setD((v) => ({ ...v, choices: v.choices.map((c, k) => (k === i ? { ...c, ...p } : p.correct ? { ...c, correct: false } : c)) }));
  // DRAG TO REORDER (Lee, 2026-09-10: "a drag/drop reorder tool for answer choices"). The grip
  // is the handle; dropping on another row puts the dragged choice at that row's spot. Saves
  // like any other edit — the order is part of the card.
  const dragChoice = useRef<number | null>(null);
  const [overChoice, setOverChoice] = useState<number | null>(null);
  const dropChoice = (to: number) => {
    const from = dragChoice.current; dragChoice.current = null; setOverChoice(null);
    if (from == null || from === to) return;
    setD((v) => { const next = [...v.choices]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return { ...v, choices: next }; });
  };
  // The deck hands onSaved in as an inline arrow; read through a ref so a parent re-render never
  // rebuilds `save` and restarts the 800 ms clock under him.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  // A draft the server refused is not retried on its own — that would be a request every
  // second until he fixes it. The next keystroke makes a different draft, and that one goes.
  const failedFor = useRef<string | null>(null);

  const save = useCallback(async (snap: CeqDraft, from: CeqDraft) => {
    setBusy(true);
    setStatus({ tone: "muted", text: "saving…" });
    try {
      await applyCeqEdit({ data: {
        ceqNodeId: ceq.id,
        ...(snap.stem !== from.stem ? { stem: snap.stem } : {}),
        ...(!ceq.noteOnly && JSON.stringify(snap.choices) !== JSON.stringify(from.choices) ? { choices: snap.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback || null })) } : {}),
      } });
      lastSaved.current = snap;
      failedFor.current = null;
      onSavedRef.current(snap, ceq.edits + 1);
      refreshBank();
      setStatus({ tone: "ok", text: `saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` });
      void logCeqEdit({ data: { setId, target: ceq.id, kind: "ceq", source: sourceFor(shortenApplied.current, ceq.id), before: ceqFieldsOf(from), after: ceqFieldsOf(snap), who: getAdminWho() } });
    } catch (e) {
      failedFor.current = JSON.stringify(snap);
      setStatus({ tone: "bad", text: `couldn't save: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  }, [ceq.id, ceq.noteOnly, ceq.edits, setId, shortenApplied]);

  // THE DEBOUNCE: 800 ms of quiet, a saveable draft, nothing in flight → save. While a save is
  // in flight further typing just waits; when it lands, `busy` flips and this runs again.
  const failed = failedFor.current !== null && failedFor.current === JSON.stringify(d);
  useEffect(() => {
    if (!dirty || busy || valid !== true || failed) return;
    const t = setTimeout(() => void save(d, base), 800);
    return () => clearTimeout(t);
  }, [d, base, dirty, busy, valid, failed, save]);

  // REVERT (Lee, 2026-09-03: "I'm just nervous to use it. Would be great if we
  // could revert on this after the fact"): the card's words before the last
  // save come back — one step at a time, as many times as there were saves. The count is the
  // card's (ceq.edits, kept current by the deck's overrides), so a Shorten Apply counts too.
  const edits = ceq.edits;
  const revert = async () => {
    if (!window.confirm("Put back the words this card had before the last save?")) return;
    setBusy(true);
    try {
      const r = await revertCeqEdit({ data: { ceqNodeId: ceq.id } });
      const restored: CeqDraft = { stem: r.stem, choices: r.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback ?? "" })) };
      lastSaved.current = null;
      setD(restored);
      onSaved(restored, r.edits);
      refreshBank();
      setStatus({ tone: "ok", text: `↶ reverted — ${r.edits ? `${r.edits} earlier save${r.edits > 1 ? "s" : ""} left to undo` : "back to the original"}` });
    } catch (e) { setStatus({ tone: "bad", text: `couldn't revert: ${e instanceof Error ? e.message : String(e)}` }); } finally { setBusy(false); }
  };

  // What the line under "Edit the card" says: a draft waiting on a fix, the save in flight, or
  // the last outcome. A momentarily unsaveable draft reads muted, never red.
  const line = dirty && valid !== true ? { tone: "muted" as const, text: `will save once you ${valid}` } : dirty && !busy && !failed ? { tone: "muted" as const, text: "saving…" } : status;
  return (
    <div>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={eyebrow}>Edit the card</span>
        <span style={{ fontSize: 11, color: MUTED }}>saves itself</span>
        {line && <span style={{ fontSize: 11, color: line.tone === "bad" ? RED : line.tone === "ok" ? MINT : MUTED }}>{line.text}</span>}
        {edits > 0 && (
          <button style={{ ...chip(false), marginLeft: "auto" }} disabled={busy || dirty} title={`Undo the last save on this card (${edits} saved edit${edits > 1 ? "s" : ""} can be undone, one at a time)`} onClick={() => void revert()}>
            {busy ? "…" : `↶ Revert last save · ${edits}`}
          </button>
        )}
      </div>
      <label style={{ fontSize: 11, color: MUTED }}>{ceq.noteOnly ? "The summary (one line per point)" : "Stem"}
        <textarea style={{ ...field, minHeight: 64, marginTop: 4 }} value={d.stem} onChange={(e) => setD((v) => ({ ...v, stem: e.target.value }))} /></label>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Type __word__ to underline, ____ for a blank, ==word== to highlight.</div>
      {!ceq.noteOnly && (
        <div className="flex flex-col" style={{ gap: 6, marginTop: 8 }}>
          <div style={{ fontSize: 11, color: MUTED }}>Choices — tick the correct one</div>
          {d.choices.map((c, i) => (
            <div key={i} className="flex items-start" style={{ gap: 6, borderTop: `2px solid ${overChoice === i ? MINT : "transparent"}`, paddingTop: 2 }}
              onDragOver={(e) => { if (dragChoice.current != null) { e.preventDefault(); setOverChoice(i); } }}
              onDragLeave={() => setOverChoice((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropChoice(i); }}>
              <span draggable onDragStart={(e) => { dragChoice.current = i; e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragChoice.current = null; setOverChoice(null); }}
                title="Drag to reorder" style={{ cursor: "grab", color: MUTED, fontSize: 14, lineHeight: 1, marginTop: 8, userSelect: "none" }}>⋮⋮</span>
              <input type="radio" name={`correct-${ceq.id}`} checked={c.correct} onChange={() => setChoice(i, { correct: true })} title="Correct" style={{ marginTop: 9, accentColor: MINT }} />
              <div style={{ flex: 1 }}>
                <input style={field} value={c.text} onChange={(e) => setChoice(i, { text: e.target.value })} placeholder={`Choice ${String.fromCharCode(65 + i)}`} />
                <input style={{ ...field, fontSize: 11.5, color: MUTED, marginTop: 3 }} value={c.feedback} onChange={(e) => setChoice(i, { feedback: e.target.value })} placeholder="feedback (optional)" />
              </div>
              <button style={tiny} title="Remove this choice" disabled={d.choices.length <= 2} onClick={() => setD((v) => ({ ...v, choices: v.choices.filter((_, k) => k !== i) }))}>✕</button>
            </div>
          ))}
          <button style={{ ...chip(false), alignSelf: "flex-start" }} onClick={() => setD((v) => ({ ...v, choices: [...v.choices, { text: "", correct: false, feedback: "" }] }))}>＋ choice</button>
        </div>
      )}
      {/* 🎙 SAY THE FIX (2026-09-07) — Apply puts the proposal into the fields above, and the
          autosave writes it through applyCeqEdit like any edit of his. Never on its own. */}
      <SayTheFix setId={setId} label={ceq.label} current={d} onApply={(r) => setD({ stem: r.stem, choices: r.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback ?? "" })) })} />
    </div>
  );
}

// ------------------------------------------------------------ 🎙 say the fix

/** THE SPOKEN CORRECTION on a card (2026-09-07, USE-YOUR-WORDS-AUDIT.md #4). Lee talks ("choice
 *  B should say lender, and the stem's too long"); the Booth's edit brief (lib/ceq-edit-brief.ts)
 *  runs on the CURRENT fields + his words, re-briefing on the throttle while he talks; the
 *  answer is the full card, shown as CURRENT | PROPOSED with the correct choice in mint and what
 *  changed in gold. "Apply" hands the card to the caller — the Editor's fields (then the
 *  autosave) here, the Save-override path on the review board. The bank is the
 *  highest-consequence field on the line: the click stays. */
function SayTheFix({ setId, label, current, onApply }: {
  setId: string; label: string;
  current: { stem: string; choices: { text: string; correct: boolean; feedback?: string | null }[] };
  onApply: (r: CeqEditResult) => void;
}) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; result?: CeqEditResult; error?: string }>({ status: "idle" });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const currentRef = useRef(current);
  currentRef.current = current;
  const run = useLatestRun<string>(async (spoken, stale) => {
    const cur = currentRef.current;
    setState((s) => ({ status: "loading", result: s.result }));
    try {
      const m = buildCeqEditMessages({ stem: cur.stem, choices: cur.choices, spoken, label, styleNotes: styleNotesFor(ttState().doc, "memo") });
      const r = await microTwice(setId, "say the fix", m, 700, (t) => parseCeqEdit(t, cur), "The fix");
      if (!alive.current || stale()) return;
      setState({ status: "ready", result: r });
    } catch (e) {
      if (alive.current && !stale()) setState((s) => ({ status: "error", result: s.result, error: e instanceof Error ? e.message : String(e) }));
    }
  });
  const talk = useSpokenTake((take) => void run(take));
  const r = state.result;
  const row = (c: { text: string; correct: boolean }, i: number, changed: boolean) => (
    <div key={i} style={{ fontSize: 11.5, color: c.correct ? MINT : changed ? GOLD : CREAM, fontWeight: c.correct ? 700 : 400 }}>{String.fromCharCode(65 + i)}. {c.text}{c.correct ? " ✓" : ""}</div>
  );
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 8 }}>
      <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
        <button style={chip(talk.on, RED)} disabled={!talk.supported} title={talk.supported ? "Say what should change on this card — the fix drafts itself while you talk; Apply is still your click" : "Dictation needs Chrome or Edge"} onClick={talk.toggle}>
          {talk.on ? "■ stop" : "🎙 Say the fix"}
        </button>
        {state.status === "loading" && <span style={{ fontSize: 11, color: MUTED }}>drafting…</span>}
        {talk.on && !talk.take && !talk.interim && <span style={{ fontSize: 11, color: MUTED }}>listening — "choice B should say lender…"</span>}
      </div>
      {(talk.take || talk.interim) && <div style={{ fontSize: 11.5, color: MUTED, fontStyle: "italic", marginTop: 4 }}>“{talk.take}{talk.interim ? <span style={{ opacity: 0.6 }}> {talk.interim}</span> : null}”</div>}
      {r && (
        <div style={{ marginTop: 6 }}>
          <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ ...subhead, marginBottom: 3 }}>Current</div>
              <div style={{ fontSize: 12, color: CREAM, marginBottom: 3 }}>{current.stem}</div>
              {current.choices.map((c, i) => row(c, i, false))}
            </div>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ ...subhead, color: GOLD, marginBottom: 3 }}>Proposed</div>
              <div style={{ fontSize: 12, color: r.stemChanged ? GOLD : CREAM, marginBottom: 3 }}>{r.stem}</div>
              {r.choices.map((c, i) => row(c, i, r.choicesChanged && (current.choices[i]?.text !== c.text || current.choices[i]?.correct !== c.correct)))}
            </div>
          </div>
          {r.note && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{r.note}</div>}
          <div className="flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button style={chip(true, MINT)} title="Put this in the fields — it saves the same way your own edits do" onClick={() => { onApply(r); setState({ status: "idle" }); talk.stop(); }}>✓ Apply</button>
            <button style={chip(false)} onClick={() => { setState({ status: "idle" }); talk.stop(); }}>✕ Dismiss</button>
          </div>
        </div>
      )}
      {state.status === "error" && <div style={{ fontSize: 11.5, color: RED, marginTop: 4 }}>⚠ {state.error}</div>}
    </div>
  );
}

// ------------------------------------------------------------ 🎙 say it · 🪄 tighten

/** A slide's words, drawn the way the card reads them — title bold, first line, the lines with
 *  their nesting — for the CURRENT | PROPOSED columns. */
function SlideWords({ f, gold }: { f: SlideTextFields; gold?: boolean }) {
  const empty = !(f.title || f.text || f.lines?.length);
  return (
    <div style={{ padding: "8px 10px", fontSize: 12, lineHeight: 1.4, color: CREAM, border: `1px solid ${gold ? GOLD : EDGE}`, borderRadius: 8, minHeight: 40 }}>
      {empty && <span style={{ color: MUTED }}>(empty)</span>}
      {f.title && <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 3 }}>{renderInline(f.title)}</div>}
      {f.text && <div style={{ color: f.title ? MUTED : CREAM, marginBottom: 3 }}>{renderInline(f.text)}</div>}
      {(f.lines ?? []).map((l, i) => {
        const depth = /^\t*/.exec(l)?.[0].length ?? 0;
        return <div key={i} style={{ display: "flex", gap: 6, marginLeft: depth * 14 }}><span style={{ color: GOLD }}>{depth ? "◦" : "•"}</span><span>{renderInline(l.replace(/^\t+/, ""))}</span></div>;
      })}
    </div>
  );
}

/** 🎙 SAY IT (2026-09-07, USE-YOUR-WORDS-AUDIT.md #2, #3, #9, #16). He talks about the slide —
 *  a correction, a sharper phrase, a whole take — and the slide-text brief (lib/slide-text-brief.ts)
 *  returns the words in the cram register with their nesting, re-briefing on the throttle while
 *  he talks; CURRENT | PROPOSED under the fields, "Use this" patches through onPatch like a
 *  keystroke would. ✂ shortens the proposed lines one by one with the rehearsal review's line
 *  brief (pass 1, concise). 🪄 TIGHTEN TO THE LINES — the last word — proposes the slide's words
 *  from the kept prompter lines + keys + the card; a "Tighten all" proposal arrives as `seed`
 *  and waits here the same way. Nothing is applied without his click. */
function SayItPanel({ sel, kind, setId, context, seed, onSeedSettled, onPatch }: {
  sel: BlastFrame; kind: SlideTextKind; setId: string;
  context: (f: BlastFrame) => SlideBriefContext;
  seed?: SlideTextResult; onSeedSettled: () => void;
  onPatch: (p: Partial<BlastFrame>) => void;
}) {
  const current = slideTextFieldsOf(sel) ?? {};
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; result?: SlideTextResult; from?: "say" | "tighten" | "all"; error?: string; shortening?: boolean }>(
    () => (seed ? { status: "ready", result: seed, from: "all" } : { status: "idle" }),
  );
  // A "Tighten all" proposal that lands while this slide is open shows up the same way.
  useEffect(() => { if (seed) setState({ status: "ready", result: seed, from: "all" }); }, [seed]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const selRef = useRef(sel);
  selRef.current = sel;
  const hasLines = (sel.prompter?.length ?? 0) > 0;

  const run = useLatestRun<{ spoken: string } | { tighten: true }>(async (arg, stale) => {
    const f = selRef.current;
    const cur = slideTextFieldsOf(f) ?? {};
    const isTighten = "tighten" in arg;
    setState((s) => ({ status: "loading", result: s.result, from: s.from }));
    try {
      const ctx = context(f);
      const m = isTighten
        ? buildTightenToLinesMessages({ kind, current: cur, prompter: f.prompter ?? [], prompterKeys: f.prompterKeys, transition: f.prompterTransition, card: ctx.card, picture: ctx.picture })
        : buildSlideTextMessages({ kind, current: cur, spoken: arg.spoken, card: ctx.card, talkthrough: ctx.talkthrough, picture: ctx.picture, setName: ctx.setName });
      const r = await microTwice(setId, isTighten ? "tighten to the lines" : "say it", m, 500, (t) => parseSlideText(t, kind), isTighten ? "The tightening" : "The slide's words");
      if (!alive.current || stale()) return;
      // An already-tight slide comes back as itself; the panel says "same words as now" and
      // leaves "Use this" off, rather than hiding that the pass ran.
      setState({ status: "ready", result: r, from: isTighten ? "tighten" : "say" });
    } catch (e) {
      if (alive.current && !stale()) setState((s) => ({ status: "error", result: s.result, from: s.from, error: e instanceof Error ? e.message : String(e) }));
    }
  });
  const talk = useSpokenTake((take) => void run({ spoken: take }));

  /** ✂ on the proposed lines: the rehearsal review's line brief, pass 1 (concise), one call per
   *  line in order; nesting is kept by stripping the tabs before and putting them back after. */
  const shortenLines = async () => {
    const r = state.result;
    if (!r?.lines?.length || state.shortening) return;
    setState((s) => ({ ...s, shortening: true, error: undefined }));
    try {
      const ctx = context(selRef.current);
      const lines: string[] = [];
      for (const l of r.lines) {
        const tabs = /^\t*/.exec(l)?.[0] ?? "";
        const m = buildShortenLineMessages({ line: l.slice(tabs.length), pass: 1, card: ctx.card, register: "cheat-code", picture: ctx.picture });
        const out = await microTwice(setId, "shorten line", m, 200, parseShortenedLine, "The shorter line");
        lines.push(tabs + out.line);
      }
      if (!alive.current) return;
      setState((s) => (s.result === r ? { ...s, shortening: false, result: { ...r, lines, note: [r.note, "✂ lines shortened"].filter(Boolean).join(" · ") } } : { ...s, shortening: false }));
    } catch (e) {
      if (alive.current) setState((s) => ({ ...s, shortening: false, status: "error", error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const settle = () => { setState({ status: "idle" }); talk.stop(); if (state.from === "all") onSeedSettled(); };
  const use = () => { const r = state.result; if (!r) return; onPatch(slideTextPatchOf(kind, r)); settle(); };
  const r = state.result;
  const unchanged = !!r && sameSlideText(current, r);
  const busy = state.status === "loading" || !!state.shortening;
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 8 }}>
      <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
        <button style={chip(talk.on, RED)} disabled={!talk.supported} title={talk.supported ? "Talk about this slide — a correction, a sharper phrase, the whole thing — and the words draft themselves while you talk" : "Dictation needs Chrome or Edge"} onClick={talk.toggle}>
          {talk.on ? "■ stop" : "🎙 Say it"}
        </button>
        {hasLines && (
          <button style={chip(state.from === "tighten" && !!r)} disabled={busy} title={`Propose the slide's words from the ${sel.prompter!.length} kept prompter line${sel.prompter!.length > 1 ? "s" : ""} — shorter, matching what you'll say`} onClick={() => void run({ tighten: true })}>🪄 Tighten to the lines</button>
        )}
        {state.status === "loading" && <span style={{ fontSize: 11, color: MUTED }}>drafting…</span>}
        {talk.on && !talk.take && !talk.interim && <span style={{ fontSize: 11, color: MUTED }}>listening…</span>}
      </div>
      {(talk.take || talk.interim) && <div style={{ fontSize: 11.5, color: MUTED, fontStyle: "italic", marginTop: 4 }}>“{talk.take}{talk.interim ? <span style={{ opacity: 0.6 }}> {talk.interim}</span> : null}”</div>}
      {r && (
        <div style={{ marginTop: 6 }}>
          {state.from === "all" && <div style={{ fontSize: 11, color: GOLD, marginBottom: 4 }}>🪄 from Tighten all — waiting for your click</div>}
          <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}><div style={{ ...subhead, marginBottom: 3 }}>Current</div><SlideWords f={current} /></div>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}><div style={{ ...subhead, color: GOLD, marginBottom: 3 }}>Proposed</div><SlideWords f={r} gold /></div>
          </div>
          {(r.note || unchanged) && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{unchanged ? "Same words as now — nothing to change." : r.note}</div>}
          <div className="flex" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button style={{ ...chip(true, MINT), opacity: unchanged || busy ? 0.5 : 1 }} disabled={unchanged || busy} title="Write these words onto the slide — it saves like any edit" onClick={use}>✓ Use this</button>
            {!!r.lines?.length && <button style={chip(false)} disabled={busy} title="Shorten the proposed lines, one by one (concise pass)" onClick={() => void shortenLines()}>{state.shortening ? "shortening…" : "✂ shorten the lines"}</button>}
            <button style={chip(false)} disabled={busy} onClick={settle}>✕ Dismiss</button>
          </div>
        </div>
      )}
      {state.status === "error" && <div style={{ fontSize: 11.5, color: RED, marginTop: 4 }}>⚠ {state.error}</div>}
    </div>
  );
}


// ------------------------------------------------------------- ✂ Shorten

/** THE SHORTEN PANEL (2026-09-07). Lee: "AI that will make the stem more simple/concise,
 *  choices too, and make choices standardized if possible, it's easier to scan and teach …
 *  Showing these side by side is cool." BEFORE (the card as it is) | AFTER (the proposal, its
 *  one gold word rendered), the note on what was cut, then Apply / Try again / Close. Apply
 *  writes through the deck's applyShorten — the same doors the autosave uses. "Try again"
 *  re-runs with the last pass shown and a nudge to go tighter. Escape closes. Runs once on
 *  mount: the newest edit-log pairs first (his own hand as examples), then the micro lane;
 *  the price goes to the cost ledger, fire-and-forget. */
function ShortenPanel({ req, setId, topicName, onApply, onClose }: {
  req: ShortenRequest; setId: string; topicName: string;
  onApply: (r: ShortenResult) => Promise<void>; onClose: () => void;
}) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error" | "applying"; result?: ShortenResult; error?: string }>({ status: "loading" });
  const examples = useRef<readonly EditExample[] | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // The request is rebuilt whenever the plan commits (the frame object changes identity) — read
  // it through a ref so ONE call goes out on mount and "Try again" sees the current words,
  // rather than a call per keystroke while the panel is up beside the fields.
  const reqRef = useRef(req);
  reqRef.current = req;

  const run = useCallback(async (previous: ShortenFields | null) => {
    const current = reqRef.current;
    setState((s) => ({ status: "loading", result: s.result }));
    try {
      if (!examples.current) examples.current = await recentEditExamples({ data: { limit: 5 } }).catch(() => []);
      const m = buildShortenMessages({ ...current, examples: examples.current, previous });
      // One quiet retry on an unparseable answer — the model's problem, not Lee's.
      let result: ShortenResult | null = null;
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 700 } });
        void logCostEvent({ data: { setId, kind: "ai", usd: r.usage.costUsd, model: r.model, label: "shorten" } });
        result = parseShorten(r.text, current);
      }
      if (!alive.current) return;
      if (!result) throw new Error("The shortening didn't come back clean, twice — try again.");
      setState({ status: "ready", result });
    } catch (e) {
      if (alive.current) setState((s) => ({ status: "error", result: s.result, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [setId]);
  useEffect(() => { void run(null); }, [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const apply = async () => {
    if (!state.result) return;
    const r = state.result;
    setState({ status: "applying", result: r });
    try { await onApply(r); }
    catch (e) { if (alive.current) setState({ status: "error", result: r, error: `couldn't apply: ${e instanceof Error ? e.message : String(e)}` }); }
  };

  const r = state.result;
  const busy = state.status === "loading" || state.status === "applying";
  const before: ShortenFields = req;
  const col = (label: string, gold: boolean, fields: ShortenFields | null) => (
    <div style={{ flex: "1 1 190px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: gold ? GOLD : MUTED, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ border: `1px solid ${gold ? GOLD : EDGE}`, borderRadius: 8, overflow: "hidden", minHeight: 48 }}>
        {fields ? (req.kind === "ceq"
          ? <SetCard id={`shorten-${gold ? "after" : "before"}`} stem={fields.stem ?? ""} choices={fields.choices ?? []} topic={topicName} scale={0.36} />
          : <CalloutWords f={fields} />)
          : <div style={{ padding: 10, fontSize: 11.5, color: MUTED }}>{state.status === "loading" ? "shortening…" : "—"}</div>}
      </div>
    </div>
  );
  return (
    <div role="dialog" aria-label="Shorten this slide" style={{ border: `1px solid ${GOLD}55`, background: "rgba(252,163,17,0.05)", borderRadius: 10, padding: "8px 10px", marginBottom: 10 }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={eyebrow}>✂ Shorten</span>
        <span style={{ fontSize: 11, color: MUTED }}>cram, not teach — one gold word</span>
        <button style={{ ...tiny, marginLeft: "auto" }} title="Close (Esc)" onClick={onClose}>✕</button>
      </div>
      <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
        {col("Before", false, before)}
        {col("After", true, r ?? null)}
      </div>
      {r?.note && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{r.note}</div>}
      {state.status === "error" && <div style={{ fontSize: 11.5, color: RED, marginTop: 6 }}>⚠ {state.error}</div>}
      <div className="flex" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button style={{ ...chip(true, MINT), opacity: r && !busy ? 1 : 0.5 }} disabled={!r || busy} title="Write this — it saves the same way your own edits do" onClick={() => void apply()}>
          {state.status === "applying" ? "applying…" : "✓ Apply"}
        </button>
        <button style={chip(false)} disabled={busy} title="Another pass, tighter" onClick={() => void run(r ?? null)}>{state.status === "loading" ? "shortening…" : "↻ Try again"}</button>
        <button style={chip(false)} disabled={state.status === "applying"} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** A callout's words the way the card reads them — title bold, first line, the bullets — with
 *  the ==highlight== painted, so the AFTER column shows the gold word. */
function CalloutWords({ f }: { f: ShortenFields }) {
  return (
    <div style={{ padding: "8px 10px", fontSize: 12, lineHeight: 1.4, color: CREAM }}>
      {f.title && <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 3 }}>{renderInline(f.title)}</div>}
      {f.text && <div style={{ color: MUTED, marginBottom: 3 }}>{renderInline(f.text)}</div>}
      {(f.bullets ?? []).map((b, i) => <div key={i} style={{ display: "flex", gap: 6 }}><span style={{ color: GOLD }}>•</span><span>{renderInline(b)}</span></div>)}
    </div>
  );
}
