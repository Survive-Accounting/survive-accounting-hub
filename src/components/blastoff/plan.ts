// THE BLAST OFF PLAN — the ordered list of frames Lee films for one set.
//
// WHAT A PLAN IS (corrected 2026-08-31): the set's OWN frames, in the order
// they will be filmed, plus whatever Lee inserted between them.
//
// The first version of this file invented an intro, a "found on your exam" and
// an outro for every set, and filtered the set's note-only cards OUT. That was
// wrong twice over: the sets ALREADY ship authored intro/outro cards (they are
// note-only CEQ nodes, e.g. `ceq-e1s-1-3-intro`), so every sync wrote a second
// pair of bookends that duplicated them and sorted ahead of the questions.
// Lee's verdict on the generated ones: "forget found on your exam, it's wrong."
//
// So: nothing here is generated any more. A frame is either a card the set
// already owns (kind "ceq" — questions AND authored notes alike, referenced by
// its canvas node id) or a card Lee inserted here (phrase / cheat / tip /
// exhibit / blank). The canvas is the renderer; this is only the running order.
//
// Pure: no React, no network. The route renders what these functions return.

/** EVERY frame kind, as one list. The Zod schema in blastoff.functions.ts is
 *  derived from this rather than retyped — the spine kinds were once added to
 *  the type and not the schema, and every set with a real spine failed to load. */
export const BLAST_FRAME_KINDS = [
  "open", "intro", "bio", "outro",                         // the standard spine ("open" = the cold open, 2026-09-03)
  "ceq",                                                   // a card the set owns
  "phrase", "cheat", "tip", "exhibit", "blank",            // what Lee inserts
  // 2026-09-08: TRICKY — the fourth callout Lee asked for back in the September strategy
  // brainstorm ("memorize this · cheat code · tricky · deep question") and then noticed was
  // missing: "Also, I'm not seeing a '+Tricky' type slide. Haven't we discussed this?" It maps
  // to the canvas's existing red `distractor` callout, whose LABEL is now "TRICKY QUESTION" —
  // one card, one colour, no sixth near-duplicate kind. (Lee renamed it hours later: "Change
  // Tricky to Tricky Question" — the key stays `tricky`.)
  "tricky",
  // 2026-09-09: FOUND ON YOUR EXAM, as a callout Lee CHOOSES. He retired it the day before as
  // an automatic chip on every note-only card ("'Found on your exam' [is] being retired as a
  // default for now") — the objection was to it appearing unasked, not to the words. Asked for
  // by name the next morning: "memorize this, cheat code, tricky question, go deeper, and add a
  // new one: Found on your exam." It draws in the canvas's own FOUND_META (gold).
  "found",
  // 2026-09-04: the bolt detour (black + the bolt animation, nothing else —
  // Lee's OBS camera backdrop and ad bed) and the three ads.
  "bolt", "ad",
  // 2026-09-07: THE MAP (a "cluster" in code) — an interactive exhibit on the vertical surface,
  // walked shot by shot with space inside one frame (cluster/cluster-spec.ts).
  "cluster",
  // 2026-09-08: THE SLOGAN SLIDE. Lee: "I think main thing I'm wanting is more slides to use
  // that captured the best stuff I've discussed recently … do the three slogan slides. B to an
  // A is the picture, yes. Others just text." The whole 9:16 frame: black, the bolt alive
  // behind, the line set huge (brand-cards/SloganCard.tsx). The words come from
  // brand-cards/slogans.ts, never retyped — he says them out loud.
  "slogan",
  // 2026-09-11: THE EQUATION RUBRIC — the A = L + E block (rubric.ts, RubricFrame.tsx). Lee's
  // first priority for the end-of-topic work: "the A = L + E rubric first (he needs it on the
  // cram path)." Its data rides on the frame as `rubric`; the spacebar reveals its arrows box
  // by box on the film surface.
  "rubric",
  // 2026-09-11: THE END-OF-TOPIC FRAMES (EndOfTopicFrames.tsx, end-of-topic.ts). Topic Complete
  // — the charge bar and the "go practice" card — and Up Next — the next topic teased with the
  // rubric cycling. Both full-frame, both say what the bank says, never what was typed.
  "topic_done", "up_next",
  // 2026-09-11: SURVIBES (SurvibesFrame.tsx, survibes.ts) — the logo flips on: the bolt strikes,
  // "ve" becomes "bes", the room lights up, the camera and a large captions box take the frame,
  // and props pop in on the spacebar. Full-frame; its captions box is the rail's own branch.
  "survibes",
  // 2026-09-11: ASK YOURSELF — Lee: "Add a callout type for 'Ask Yourself' where I'll suggest
  // prompted questions that help them get the answer." A callout like the other five: the
  // heading is the question, the lines under it the prompts. Canvas kind "ask-yourself" (teal).
  "ask",
  // 2026-09-11: THE EXAM OUTLINE (OutlineFrame.tsx, exam-outline.ts) — the roadmap for the first
  // video in a topic: the exam's topics as a strip, one open at a time with ‹ ›, its videos listed.
  "outline",
  // 2026-09-11: TYPES OF ACCOUNTS (TypesFrame.tsx, account-types.ts) — Lee's old teaching slide,
  // vertical: tabs A · L · E · Rev · Exp · Contra, the accounts under each, four toggles.
  "types",
] as const;

export type BlastFrameKind = (typeof BLAST_FRAME_KINDS)[number];

export interface BlastFrame {
  id: string;
  kind: BlastFrameKind;
  /** kind "ceq" — the canvas node id of the set's own card (question or note). */
  ceqId?: string;
  /** phrase / tip / blank body. */
  text?: string;
  /** cheat code. */
  title?: string;
  body?: string;
  /** exhibit frame — which shipped exhibit. */
  exhibitRef?: string;
  /** Which ad this frame is (kind "ad"). */
  ad?: AdKind;
  /** An ad frame's own address (kind "ad"); the ad's default when absent. The ad's
   *  label / headline / lines ride in `text` / `title` / `bullets` (2026-09-04: "let
   *  the ad's text be editable"). */
  url?: string;
  /** THE BIO SLIDE's hand-drawn portrait (kind "bio"): drawn on over the black
   *  in the /learn lime. Absent = on. */
  portrait?: "on" | "off";
  /** THE CAMERA on this slide (2026-09-05): home (bottom-left circle) · corner
   *  (small, top-right) · hero (big, top-centre) · top (a big circle, centred —
   *  pass 2) · free (camPos / camSize) · off. Absent = the default in
   *  capture/webcam-spots.ts (home on card slides, off on the brand slides,
   *  the bolt and the ads). */
  cam?: "home" | "corner" | "hero" | "top" | "left" | "free" | "off";
  /** Free spot: top-left as fractions of the phone; size as a fraction of its width. */
  camPos?: { x: number; y: number };
  camSize?: number;
  /** Talkthrough bank item this came from, when picked rather than typed. */
  bankItemId?: string;
  /** THE REVIEW STEP (Lee, 2026-09-03: "quickly remove a CEQ slide"). A card
   *  the set owns cannot leave the plan — reconcile would put it straight
   *  back — so removing it here SKIPS it: it stays in the list, greyed, and
   *  film mode walks past it. Un-skip to film it again. Inserts are simply
   *  removed. */
  skipped?: boolean;
  /** BULLETS under the callout (Lee, 2026-09-03: "Memorize this / Internal
   *  Users / Management / Budgets, costs, forecasts…"). The main phrase is
   *  highlighted; these sit under it. Empty lines are ignored at render. */
  bullets?: string[];
  /** THE BACKDROP (Lee, 2026-09-03): the bolt-zoom behind this slide. Absent =
   *  the default rule (backdropFor); "zoom" forces it on, "off" forces it off. */
  backdrop?: "zoom" | "off";
  /** THE COLD OPEN's look (kind "open"): which of the six animations, and how
   *  far to push the psychedelic end (0..1; Lee: 0.1). */
  variant?: string;
  psych?: number;
  /** HOW THIS CALLOUT IS DRAWN (2026-09-08). Lee: "I want a way to have a memorize this, cheat
   *  code slide, deep ideas, tricky in two formats… either it's in the current format, or it's
   *  more emphatic where it's a slide just like the slogan one. Bolt in background. BIG letters.
   *  Same style as that. So I add the slide then choose the mode. The reason is that some of my
   *  slides are so short that they can fill up the whole screen."
   *
   *  Absent (or "card") = the detour card on a stage, as it always was. "big" = the whole 9:16,
   *  black, bolt behind, heading enormous (brand-cards/BigCallout.tsx). Only the four callout
   *  kinds read it — see canGoBig. */
  display?: "card" | "big";
  /** A CUT AFTER THIS SLIDE (2026-09-09). Lee: "if I could just mark the split from the spine
   *  versus a new interface… have a scissor icon for cutting there." The running order is the
   *  truth, so the split lives ON it: every run between cuts is one Short. Marking is free and
   *  reversible — nothing moves until the knife is applied — and the spine can collapse a run
   *  ("would be a huge help if I could collapse a split group"). */
  cutAfter?: true;
  /** The name of the video this slide HEADS — meaningful only on the first slide of a run
   *  between cuts. Post shows it instead of "Split N". */
  takeName?: string;
  /** THE CAMPUS BANNER on this slide (Lee: "let me add this banner at any time
   *  on future slides … toggle-able on and off"). OFF unless "on", on every kind — Lee,
   *  2026-09-11: "default to campus banner off. We're going to only use it on some promo videos." */
  banner?: "on" | "off";
  /** THE TELEPROMPTER COLUMN (Lee, 2026-09-03: "a third slide to the right
   *  of the current one … the teleprompter … THESE SUGGESTED PHRASES ARE
   *  ME"). The lines Lee kept for this slide — his own transcript words,
   *  proofread — shown beside the slide in film mode. */
  prompter?: string[];
  /** THE KEYWORD PROMPTER (Lee, 2026-09-07: "a quick bullet list, or even just a handful of
   *  single words, that capture the main point of what the line is saying (e.g. Internal =
   *  inside)… so I can scan a teleprompter and get what I need. If I am really stuck, then I
   *  can just read verbatim"). 2–5 scannable fragments of the kept line, set by the rehearsal
   *  review beside `prompter`; /v3/teleprompter's keywords mode shows these instead. */
  prompterKeys?: string[];
  /** THE HAND-OFF (Lee, 2026-09-07: "the lines could be useful to also build in TRANSITIONS…
   *  as simple as move on, but also finding connecting points between slides"). A 2–6 word
   *  spoken bridge into the next slide, when the review offered one and Lee kept a line. */
  prompterTransition?: string;
  /** THE TIMING MARKS (Lee, 2026-09-07: "I can even highlight pieces of a line that are like
   *  when the transition takes place. A big part of my teaching style that hits so hard is my
   *  TIMING for moving a slide at the perfect emphasis moment… transition phrase is yellow but
   *  the word itself is orange"). `phrase` = the run of the kept line that hands off into the
   *  next slide (yellow); `word` = the one word inside it to change the slide ON (orange).
   *  Both are substrings of the line — markRanges finds them; one that isn't paints nothing. */
  prompterMarks?: PrompterMarks;
  /** THE MAP (2026-09-07): the whole interactive exhibit — nodes, edges, shots — lives on the
   *  frame (cluster/cluster-spec.ts). Type-only import: plan.ts is on the canvas render path
   *  and must not pull zod onto it. */
  cluster?: ClusterSpec;
  /** THE OPTIONAL ILLUSTRATION (polish pass, 2026-09-05). Absent = never asked; null = Lee
   *  cleared it; a value = an idea banked or a picture made. See illustration.ts. A slide
   *  with none keeps every pixel of the negative space it has today. */
  illustration?: FrameIllustration | null;
  /** THE EQUATION RUBRIC (2026-09-11, kind "rubric"): mode, the transaction, the amount, the
   *  arrows per box, arrows-or-amounts, the equity-effect toggle (rubric.ts RubricSpec). A
   *  rubric frame without one is drawn as a loud red "no data" block, never a blank. */
  rubric?: RubricSpec;
  /** A SKIPPABLE SEGMENT STARTS HERE (2026-09-11, the Up Next frame). The student player's
   *  "Skip to <next topic>" (Prompt 5, after site publish exists) needs to know where the tease
   *  begins; the frame that opens it carries the flag. Additive; no other value yet. */
  segment?: "skippable";
  /** THE EXAM OUTLINE's words (2026-09-11, kind "outline"): Lee's edits, by topic id and set id —
   *  "A lot of times I like to change the way we're describing them internally." Absent = the
   *  defaults (a topic's name; a video's question stem, exam-outline.ts defaultSetLabel). */
  outline?: { topics?: Record<string, string>; sets?: Record<string, string> };
  /** THE NOTE ON A SET CARD (2026-09-11, kind "ceq", card-note.ts): a box over the card, its words,
   *  its spot and size as fractions of the phone, and whether the choices dim behind it. Lee: "I
   *  will use this to define something in the question stem... like what prepaid insurance is." */
  note?: CardNoteSpec;
  /** THE TYPES OF ACCOUNTS slide's settings and his words (2026-09-11, kind "types",
   *  account-types.ts TypesSpec). Absent = his old slide with the defaults. */
  types?: TypesSpec;
}

export interface BlastPlan {
  frames: BlastFrame[];
  updatedAt: string;
  /** THE SLIDE TEMPLATE (2026-09-05, layout.ts): pass1 = the slides that
   *  filmed first, pass2 = the vertical template. Absent = pass1. */
  layout?: "pass1" | "pass2";
}

/** Frames Lee inserted here, as opposed to cards the set already owns. Only
 *  these can be deleted from a plan — removing a card the set owns would mean
 *  not filming it, which is a set edit, not a running-order edit. */
export const INSERT_KINDS: readonly BlastFrameKind[] = ["phrase", "cheat", "tip", "tricky", "found", "exhibit", "blank", "bolt", "ad", "cluster", "slogan", "rubric", "topic_done", "up_next", "survibes", "ask", "outline", "types"];

/** THE ADS (Lee, 2026-09-04: "similar ones we have in /learn already — for
 *  sharing with fraternity and sorority, for campus reps, for sending in
 *  syllabi"). The copy lives in AdSlide.tsx; a frame only says which one. */
export { AD_KINDS, isAdKind, type AdKind } from "./ad-kinds";
import type { ClusterSpec } from "./cluster/cluster-spec";
import type { AdKind } from "./ad-kinds";
import type { FrameIllustration } from "./illustration";
import type { RubricSpec } from "./rubric";
import type { TypesSpec } from "./account-types";
import type { CardNoteSpec } from "./card-note";

/** Frames that ARE the whole 9:16 slide (no card on a stage): the brand
 *  slides, the bolt detour and the ads. The bio is standard but it is a card. */
export const FULL_FRAME_KINDS: readonly BlastFrameKind[] = ["open", "intro", "outro", "bolt", "ad", "cluster", "slogan", "topic_done", "up_next", "survibes", "outline"];
export const isFullFrame = (k: BlastFrameKind): boolean => FULL_FRAME_KINDS.includes(k);

/** THE FOUR CALLOUTS that can be drawn either way (2026-09-08, `BlastFrame.display`). The
 *  brand slides are always full-frame and a set card never is, so neither takes a choice. */
export const BIG_CALLOUT_KINDS: readonly BlastFrameKind[] = ["phrase", "cheat", "tip", "tricky", "found", "ask"];
export const canGoBig = (k: BlastFrameKind): boolean => BIG_CALLOUT_KINDS.includes(k);

/** Is THIS FRAME drawn big? A `display` on a kind that has no big form is ignored rather than
 *  honoured — an old plan, or a kind change on an existing slide, must never make a set card
 *  try to render as a brand slide. */
export const isBigCallout = (f: BlastFrame): boolean => f.display === "big" && canGoBig(f.kind);

/** Does this FRAME own the whole 9:16 — by its kind, or by being a callout turned big? The
 *  frame-level question; `isFullFrame` answers the kind-level one and stays the right call
 *  wherever only a kind is at hand. */
export const framesFullFrame = (f: BlastFrame): boolean => isFullFrame(f.kind) || isBigCallout(f);

export const isInsert = (k: BlastFrameKind): boolean => INSERT_KINDS.includes(k);

/** THE STANDARD SPINE. Every Blast Off opens the same way and closes the same
 *  way — intro, then the set, then the bio slot, then the sign-off. Lee, on
 *  finding them missing: "We want to have the same standardized frames set up
 *  for each blast-off."
 *
 *  These are GUARANTEED, not pinned: reconcile puts a missing one back at its
 *  canonical spot, but never drags one Lee has deliberately moved. And they
 *  cannot be deleted — a Blast Off without a sign-off is a mistake, not a
 *  choice. The bio slot is deliberately its own frame rather than part of the
 *  outro: same position every video means it can later hold the chapter ask or
 *  the rep ask instead, filmed once and dropped in at the edit. */
export const STANDARD_KINDS = ["open", "intro", "bio", "outro"] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];

export const isStandard = (k: BlastFrameKind): k is StandardKind =>
  (STANDARD_KINDS as readonly string[]).includes(k);

/** Inserts become the canvas's OWN callout kinds — a cheat-code frame is the same
 *  card the canvas has always drawn for a cheat code. ONE mapping, imported by both
 *  the Blast Off preview and the sync that writes the frame, so what Lee arranges
 *  and what the canvas renders cannot drift apart. "blank" is deliberately absent:
 *  it is a bare frame (callout hidden), not a kind of callout. */
export const INSERT_CALLOUT: Partial<Record<BlastFrameKind, string>> = {
  cheat: "cheat-code",
  phrase: "memorize-this",
  tip: "deeper-idea",
  // 2026-09-08: TRICKY reuses the canvas distractor card (red) — relabelled "TRICKY" there.
  tricky: "distractor",
  // 2026-09-09: Lee asked for it back by name, as a kind he picks — the canvas card already
  // has the skin (FOUND_META, gold).
  found: "found-on-exam",
  // 2026-09-11: Ask yourself — the canvas's new teal callout.
  ask: "ask-yourself",
};

export const FRAME_LABEL: Record<BlastFrameKind, string> = {
  open: "Cold open",
  intro: "Intro",
  bio: "Bio slot",
  outro: "Outro",
  ceq: "Set card",
  // Lee's 09-03 standard kinds, one to one with the canvas callouts.
  phrase: "Memorize this",
  cheat: "Cheat code",
  // Lee, 2026-09-06: "Deep Question seems a bit better" — it tells the student what to DO (stop
  // and reason it out), where "Deeper idea" didn't. The internal kind stays "tip" everywhere.
  // Lee, 2026-09-08: "Deep question should be 'Go deeper'." Third name for this kind, same key.
  tip: "Go deeper",
  // Lee, 2026-09-08: "I am not seeing a '+Tricky' type slide. Haven't we discussed this?" We had.
  tricky: "Tricky question",
  found: "Found on your exam",
  exhibit: "Exhibit",
  blank: "Blank",
  bolt: "Bolt detour",
  ad: "Ad",
  cluster: "Map",
  slogan: "Slogan",
  rubric: "Rubric",
  topic_done: "Topic complete",
  up_next: "Up next",
  survibes: "Survibes",
  ask: "Ask yourself",
  outline: "Exam outline",
  types: "Types of accounts",
};

let seq = 0;
export const newFrameId = (kind: BlastFrameKind): string =>
  `bf-${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** A card the set owns, as the bank hands it over — already in stageOrder. */
export interface PlanCeq { id: string; label: string; stem: string; noteOnly?: boolean; draft?: boolean }

/** Cards that belong in a running order: everything the set owns except drafts,
 *  which are unfinished and must never reach a take. Note-only cards DO belong —
 *  they are the set's own intro, outro and breath frames. */
const filmable = (ceqs: readonly PlanCeq[]): PlanCeq[] => ceqs.filter((c) => !c.draft);

/** The spine a set films if Lee changes nothing: its own cards, bank order. */
export function generatePlan(ceqs: readonly PlanCeq[], now = new Date()): BlastPlan {
  return {
    frames: [
      { id: newFrameId("open"), kind: "open" as const },
      { id: newFrameId("intro"), kind: "intro" as const },
      ...filmable(ceqs).map((c) => ({ id: newFrameId("ceq"), kind: "ceq" as const, ceqId: c.id })),
      { id: newFrameId("bio"), kind: "bio" as const },
      { id: newFrameId("outro"), kind: "outro" as const },
    ],
    updatedAt: now.toISOString(),
  };
}

/** RECONCILE a stored plan against the set as it is NOW.
 *  · a card added to the set appears, next to its bank neighbour, so it gets filmed
 *  · a card removed from the set drops out, so Lee never films a ghost
 *  · everything Lee inserted or reordered is preserved exactly where he put it
 *
 *  A new card lands after the card that precedes it in BANK order rather than at
 *  the end, so a question added in the middle of a set does not jump behind the
 *  set's own outro.
 */
export function reconcilePlan(plan: BlastPlan | null | undefined, ceqs: readonly PlanCeq[], now = new Date()): BlastPlan {
  if (!plan?.frames?.length) return generatePlan(ceqs, now);
  const bank = filmable(ceqs);
  const live = new Set(bank.map((c) => c.id));

  // Drop refs to cards the set no longer has; keep every insert untouched.
  const frames = plan.frames.filter((f) => f.kind !== "ceq" || (f.ceqId != null && live.has(f.ceqId)));
  const have = new Set(frames.filter((f) => f.kind === "ceq").map((f) => f.ceqId));

  bank.forEach((c, bankIdx) => {
    if (have.has(c.id)) return;
    // Nearest earlier bank card that IS already placed decides where this goes.
    let anchor = -1;
    for (let b = bankIdx - 1; b >= 0 && anchor < 0; b--) {
      const prev = bank[b].id;
      if (have.has(prev)) anchor = frames.findIndex((f) => f.kind === "ceq" && f.ceqId === prev);
    }
    frames.splice(anchor + 1, 0, { id: newFrameId("ceq"), kind: "ceq", ceqId: c.id });
    have.add(c.id);
  });

  // THE SPINE IS GUARANTEED. A plan written before these existed, or one where a
  // frame was lost, gets the missing piece back at its canonical spot — the
  // intro leading, the bio and sign-off closing. One that Lee already moved is
  // left exactly where he put it.
  if (!frames.some((f) => f.kind === "intro")) frames.unshift({ id: newFrameId("intro"), kind: "intro" });
  // THE COLD OPEN (2026-09-03) leads everything — a plan from before it gets it.
  if (!frames.some((f) => f.kind === "open")) frames.unshift({ id: newFrameId("open"), kind: "open" });
  if (!frames.some((f) => f.kind === "bio")) frames.push({ id: newFrameId("bio"), kind: "bio" });
  if (!frames.some((f) => f.kind === "outro")) frames.push({ id: newFrameId("outro"), kind: "outro" });

  return { frames, updatedAt: now.toISOString() };
}

/** Move a frame one step. Everything is movable now — the set's own intro is
 *  just a card, and if Lee wants a cheat code to open the rip that is his call. */
export function moveFrame(frames: readonly BlastFrame[], from: number, to: number): BlastFrame[] {
  const next = [...frames];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(to, next.length - 1));
  if (target === from) return next;
  const [f] = next.splice(from, 1);
  next.splice(target, 0, f);
  return next;
}

/** MOVE A BLOCK (2026-09-09, the multi-select — Lee's notes: range select, group drag).
 *  `ids` leave the list in the order they sit in the running order — a non-contiguous
 *  pick becomes one contiguous block — and the block goes in BEFORE the frame that was at `to`
 *  (so `to` means "in front of this one", and `to === frames.length` means "at the end"). When
 *  the frame at `to` is itself in the block, the block lands where it already is: dropping a
 *  selection onto itself changes nothing. Ids not in the list are ignored, an empty pick is the
 *  identity, and the result is always a fresh array. */
export function moveMany(frames: readonly BlastFrame[], ids: readonly string[], to: number): BlastFrame[] {
  const want = new Set(ids);
  const block = frames.filter((f) => want.has(f.id));
  if (!block.length) return [...frames];
  const rest = frames.filter((f) => !want.has(f.id));
  // The first frame at or after `to` that stays behind is the one the block goes in front of.
  let anchor: BlastFrame | undefined;
  for (let k = Math.max(0, to); k < frames.length && !anchor; k++) if (!want.has(frames[k].id)) anchor = frames[k];
  const at = anchor ? rest.indexOf(anchor) : rest.length;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** Drop a new frame in after `afterIndex`. */
export function insertFrame(frames: readonly BlastFrame[], frame: BlastFrame, afterIndex: number): BlastFrame[] {
  const next = [...frames];
  next.splice(Math.max(0, Math.min(afterIndex + 1, next.length)), 0, frame);
  return next;
}

/** Remove an inserted frame. A card the set owns cannot be removed from here —
 *  it stays, because the set still has it and it still has to be filmed. */
export const removeFrame = (frames: readonly BlastFrame[], id: string): BlastFrame[] =>
  frames.filter((f) => (f.id === id ? !isInsert(f.kind) : true));

// ---- THE REVIEW STEP's verbs (2026-09-03) ----------------------------------

/** "Remove" as Lee means it: an insert goes; a card the set owns is SKIPPED
 *  (kept in the list, greyed, not filmed). The spine — intro, bio, outro —
 *  can be skipped too: a rip that opens on a cheat code is his call. */
export function dropFrame(frames: readonly BlastFrame[], id: string): BlastFrame[] {
  const f = frames.find((x) => x.id === id);
  if (!f) return [...frames];
  if (isInsert(f.kind)) return removeFrame(frames, id);
  // A DUPLICATE OF A SET CARD IS REALLY DELETABLE (2026-09-08). Lee: "Let me delete a card. I'm
  // adding more to return to them faster at the end of a video sometimes." He duplicates a card
  // so he can come back to it before the outro — and then the copy could not be removed, only
  // skipped, because this function treated every `ceq` frame as irreplaceable. It is not the
  // FRAME that reconcile insists on, it is the CARD: as long as another frame still points at
  // the same ceqId, this one can simply go. The last frame for a card still only skips.
  // (Filtered directly: removeFrame only ever drops inserts, so routing this through it removed
  // nothing — fixed 2026-09-11 alongside the extra-bio case below.)
  if (f.kind === "ceq" && f.ceqId && frames.some((x) => x.id !== id && x.ceqId === f.ceqId)) return frames.filter((x) => x.id !== id);
  // AN EXTRA SPINE SLIDE GOES TOO (2026-09-11). Lee: "include a + bio slide." A second bio (or
  // any spine slide there are two of — every split carries its own) can simply be removed while
  // another stays; the last one still only skips, as reconcile would put it back.
  if (isStandard(f.kind) && frames.some((x) => x.id !== id && x.kind === f.kind)) return frames.filter((x) => x.id !== id);
  return frames.map((x) => (x.id === id ? { ...x, skipped: true } : x));
}

/** Can this slide simply go (dropFrame removes rather than skips)? An insert, a second copy of a
 *  set card, or an extra spine slide while another of its kind stays. */
export function canRemove(frames: readonly BlastFrame[], f: BlastFrame): boolean {
  if (isInsert(f.kind)) return true;
  if (f.kind === "ceq" && !!f.ceqId && frames.some((x) => x.id !== f.id && x.ceqId === f.ceqId)) return true;
  return isStandard(f.kind) && frames.some((x) => x.id !== f.id && x.kind === f.kind);
}

/** THE BOLT ZOOM BEHIND A SLIDE (2026-09-11, Lee: "I want bolt zoom animation as a toggle option
 *  in slides. For background."). `backdrop: "zoom"` turns it on. It can sit behind a slide that
 *  doesn't paint the whole frame itself — a card on the phone's black — and behind the end-of-topic
 *  pair, whose shell is see-through. The brand slides, the slogan, a big callout and the map draw
 *  their own. */
export function canZoomBehind(f: BlastFrame): boolean {
  return !framesFullFrame(f) || f.kind === "topic_done" || f.kind === "up_next" || f.kind === "outline";
}

/** THE STANDARD OPENER (2026-09-09), in Lee's words and in his own draft's order: "Hero camera,
 *  Survive, [topic name], surviveaccounting.com, campus banner underneath. 'This is a cram
 *  video—not a lecture.' slogan slide next. Then bio slide, then a blank 'found on your exam'
 *  callout. This will be the standard structure of every video, so it saves time when I split
 *  somewhere that I can just have this by default."
 *
 *  `name` is what the opener announces — the piece's own name after a split, the set's name
 *  otherwise. The found card is deliberately BLANK: it is the question the video answers, and
 *  only Lee knows it. */
export function standardOpener(name: string, cram: string): BlastFrame[] {
  return [
    { id: newFrameId("intro"), kind: "intro", text: name },
    { id: newFrameId("slogan"), kind: "slogan", text: cram },
    { id: newFrameId("bio"), kind: "bio", cam: "corner" },
    { id: newFrameId("found"), kind: "found", text: "" },
  ];
}

/** CUT HERE — mark the end of one video, and give both sides their bookends (2026-09-09).
 *  Lee: "If I cut somewhere, it can automatically append the outro slide to the end, and an
 *  intro slide to the next group." So the cut lands with a sign-off in front of it and the
 *  standard opener behind it, and the running order reads as two finished videos rather than
 *  one list with a line through it. Un-cutting only removes the mark; the slides it added are
 *  his now, and deleting them silently would throw away edits. */
export function cutAfterFrame(frames: readonly BlastFrame[], id: string, opener: BlastFrame[]): BlastFrame[] {
  const i = frames.findIndex((f) => f.id === id);
  if (i < 0) return [...frames];
  if (frames[i].cutAfter) return frames.map((f) => (f.id === id ? { ...f, cutAfter: undefined } : f));
  const outro: BlastFrame = { id: newFrameId("outro"), kind: "outro" };
  // The sign-off closes THIS video, and carries the mark; the opener starts the next one.
  const before = frames.slice(0, i + 1);
  const after = frames.slice(i + 1);
  return [...before, { ...outro, cutAfter: true as const }, ...opener, ...after];
}

// ── TAKES ─────────────────────────────────────────────────────────────────────────────────────
// A cut splits the running order into separate videos. Lee, 2026-09-09: "I only did account
// classification > assets. Not the full thing… if we make splits, just in post it could maybe say
// split 1, split 2… I'll name it what I need to. I'd also like to name it from the edit side."
//
// So a TAKE is one run of slides between two cuts, and it owns a name. The name lives on the run's
// HEAD frame, because that frame is what a run is anchored to: reordering inside a run doesn't
// move it, and adding a cut makes a new head for the new run. Everywhere else takeName is ignored.

export interface PlanTake {
  /** 0-based, in running order. */
  index: number;
  /** What Lee called it, or "" — takeLabel() is what a surface shows. */
  name: string;
  /** The head frame's id: where the name is stored, and what a rename targets. */
  headId: string;
  frames: BlastFrame[];
}

/** Split a running order into its takes. Always at least one take, even for an empty plan — a set
 *  with no cuts is one video, and every caller wants to treat that the same way. */
export function planTakes(frames: readonly BlastFrame[]): PlanTake[] {
  const out: PlanTake[] = [];
  let run: BlastFrame[] = [];
  const push = () => {
    const head = run[0];
    out.push({ index: out.length, name: (head?.takeName ?? "").trim(), headId: head?.id ?? "", frames: run });
    run = [];
  };
  for (const f of frames) {
    run.push(f);
    if (f.cutAfter) push();
  }
  if (run.length || !out.length) push();
  return out;
}

/** What a surface calls a take: his name, else its number. */
export const takeLabel = (t: PlanTake): string => t.name || `Split ${t.index + 1}`;

/** THE EMPTY RUN (2026-09-09). A cut lands with a sign-off above it and the standard opener
 *  below, so two cuts in a row — or a cut under a run whose cards were all skipped — leave a
 *  take of intro + bio + outro and no question at all. Nothing warned: the live
 *  account-classification plan carried exactly that (a run named "Liabilities" with zero
 *  cards, while the real liabilities run sat unnamed under it). This names them; the spine
 *  shows the chip and offers to remove the cut. It never fixes the plan on its own. A set with
 *  no cuts and no cards is one empty take, which is the honest answer. */
export function emptyTakes(frames: readonly BlastFrame[]): PlanTake[] {
  return planTakes(frames).filter((t) => !t.frames.some((f) => f.kind === "ceq"));
}

/** THE RUN THAT COVERS THESE CARDS. Post knows which of a set's cards belong to one split, and
 *  needs the SLIDES for them — the prompter lines it captions from live on brand slides too, so
 *  filtering by ceqId alone would drop the opener and the callouts that belong to that video.
 *  Generic over the frame shape: the stored plan's rows are not BlastFrame, but they are cut and
 *  numbered the same way. Nothing matches → every frame, which is the no-cuts answer anyway. */
export function runFor<F extends { ceqId?: string; cutAfter?: true }>(frames: readonly F[], ceqIds: readonly string[]): F[] {
  if (!ceqIds.length) return [...frames];
  const want = new Set(ceqIds);
  const runs: F[][] = [];
  let run: F[] = [];
  for (const f of frames) {
    run.push(f);
    if (f.cutAfter) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.find((r) => r.some((f) => f.ceqId && want.has(f.ceqId))) ?? [...frames];
}

/** Rename a take by its head frame. An empty name clears it back to "Split N". */
export function nameTake(frames: readonly BlastFrame[], headId: string, name: string): BlastFrame[] {
  const clean = name.trim().slice(0, 80);
  return frames.map((f) => (f.id === headId ? { ...f, takeName: clean || undefined } : f));
}

/** Skip ↔ film again. */
export const toggleSkip = (frames: readonly BlastFrame[], id: string): BlastFrame[] =>
  frames.map((x) => (x.id === id ? { ...x, skipped: !x.skipped } : x));

/** A copy right after the original, with its own id. A duplicated CEQ frame
 *  films the same card twice (a callback, a recap) — the set is untouched. */
export function duplicateFrame(frames: readonly BlastFrame[], id: string): BlastFrame[] {
  const i = frames.findIndex((x) => x.id === id);
  if (i < 0) return [...frames];
  const src = frames[i];
  return insertFrame(frames, copyOfFrame(src), i);
}

/** THE ONE COPY of a frame — its own id, its own arrays. Exported (2026-09-09) so the spine's
 *  paste uses this and not a second cloning path. */
export function copyOfFrame(src: BlastFrame): BlastFrame {
  return { ...src, id: newFrameId(src.kind), prompter: src.prompter ? [...src.prompter] : undefined, prompterKeys: src.prompterKeys ? [...src.prompterKeys] : undefined, prompterMarks: src.prompterMarks ? { ...src.prompterMarks } : undefined, illustration: src.illustration ? { ...src.illustration } : src.illustration };
}

/** PASTE (2026-09-09, Ctrl+V on the spine): copies of `src`, in their order, right after
 *  `afterIndex` — fresh ids through copyOfFrame, and the CUT and the take's NAME left behind. A
 *  pasted block is slides, not structure: a copied outro that carried a cut must not cut the
 *  destination in two, and a copied head must not rename the run it lands in. The pasted ids
 *  come back with the frames so the caller can select them. */
export function pasteAfter(frames: readonly BlastFrame[], src: readonly BlastFrame[], afterIndex: number): { frames: BlastFrame[]; ids: string[] } {
  const copies = src.map((f) => { const { cutAfter: _cut, takeName: _name, ...rest } = copyOfFrame(f); return rest; });
  const next = [...frames];
  next.splice(Math.max(0, Math.min(afterIndex + 1, next.length)), 0, ...copies);
  return { frames: next, ids: copies.map((c) => c.id) };
}

/** CLONE TO THE END (2026-09-08). Lee: "Clone slide to move to end" — and why, in his own
 *  words: "I'm adding more to return to them faster at the end of a video sometimes." So the
 *  copy does not land next to the original where he would have to drag it the length of the
 *  deck; it goes straight to the back of the running order, in front of nothing.
 *
 *  BEFORE THE SIGN-OFF, though. The bio slot and the outro are the close, and a callback card
 *  landing after "Start cramming free" is a card nobody sees — so the copy goes in ahead of the
 *  trailing spine frames rather than literally last. */
export function cloneFrameToEnd(frames: readonly BlastFrame[], id: string): BlastFrame[] {
  const src = frames.find((x) => x.id === id);
  if (!src) return [...frames];
  let end = frames.length - 1;
  while (end >= 0 && (frames[end].kind === "outro" || frames[end].kind === "bio")) end -= 1;
  return insertFrame(frames, copyOfFrame(src), end);
}

// ---- THE TIMING MARKS (2026-09-07) -----------------------------------------
// Lee: "It's like being a page turner book. The end of each slide is pulling you into the next
// one, whenever possible." The marks say WHERE in the line that pull is (the phrase, yellow) and
// the exact word he flips the slide on (orange). Pure text → ranges; the painters (prompter-
// marks.ts) and the prompter windows only ever read what these return.

export interface PrompterMarks {
  /** The transition phrase — a substring of the line. */
  phrase?: string;
  /** The cue word — a substring of the phrase (or, failing that, of the line). */
  word?: string;
}

export interface MarkRange { start: number; end: number; tone: "phrase" | "word" }

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where `needle` sits in `hay[from, to)`: a whole-word match first (so a cue word "on" never
 *  lands inside "money"), then any match; exact case first, then case-insensitive (the model
 *  and Lee do not always agree on a capital). -1 when it isn't there at all. */
export function findMark(hay: string, needle: string, from = 0, to = hay.length): number {
  const n = needle.trim();
  if (!n) return -1;
  const window = hay.slice(0, to);
  for (const flags of ["u", "iu"]) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, `g${flags}`);
    re.lastIndex = from;
    const m = re.exec(window);
    if (m) return m.index;
  }
  const exact = window.indexOf(n, from);
  if (exact >= 0) return exact;
  return window.toLowerCase().indexOf(n.toLowerCase(), from);
}

/** The character ranges to paint on `line`: the phrase (yellow) and the cue word (orange) —
 *  the word wins where they overlap, so the phrase is split around it. Sorted, non-overlapping.
 *  The word is looked for INSIDE the phrase first (that is where it belongs), then anywhere in
 *  the line. A mark that isn't a substring of the line paints nothing. */
export function markRanges(line: string, marks: PrompterMarks | null | undefined): MarkRange[] {
  const phrase = marks?.phrase?.trim() ?? "";
  const word = marks?.word?.trim() ?? "";
  let p: MarkRange | null = null;
  if (phrase) { const i = findMark(line, phrase); if (i >= 0) p = { start: i, end: i + phrase.length, tone: "phrase" }; }
  let w: MarkRange | null = null;
  if (word) {
    let i = p ? findMark(line, word, p.start, p.end) : -1;
    if (i < 0) i = findMark(line, word);
    if (i >= 0) w = { start: i, end: i + word.length, tone: "word" };
  }
  if (!p) return w ? [w] : [];
  if (!w) return [p];
  if (w.end <= p.start || w.start >= p.end) return [p, w].sort((a, b) => a.start - b.start);
  const out: MarkRange[] = [];
  if (p.start < w.start) out.push({ start: p.start, end: w.start, tone: "phrase" });
  out.push(w);
  if (w.end < p.end) out.push({ start: w.end, end: p.end, tone: "phrase" });
  return out;
}

/** The marks that still fit `line` — a shortened or edited line keeps whichever of its marks
 *  survived the cut and drops the rest. undefined when nothing is left. */
export function pruneMarks(line: string, marks: PrompterMarks | null | undefined): PrompterMarks | undefined {
  const ranges = markRanges(line, marks);
  const out: PrompterMarks = {};
  if (ranges.some((r) => r.tone === "phrase")) out.phrase = marks?.phrase?.trim();
  if (ranges.some((r) => r.tone === "word")) out.word = marks?.word?.trim();
  return normalizeMarks(out);
}

/** `{}` and blanks → undefined, so a cleared mark leaves no field on the frame. */
export const normalizeMarks = (marks: PrompterMarks | null | undefined): PrompterMarks | undefined => {
  const phrase = marks?.phrase?.trim();
  const word = marks?.word?.trim();
  if (!phrase && !word) return undefined;
  return { ...(phrase ? { phrase } : {}), ...(word ? { word } : {}) };
};

/** The frame with its marks set (or, given none, cleared). Nothing else changes. */
export function withMarks(frame: BlastFrame, marks: PrompterMarks | null | undefined): BlastFrame {
  const m = normalizeMarks(marks);
  const { prompterMarks: _drop, ...rest } = frame;
  return m ? { ...rest, prompterMarks: m } : rest;
}

/** What actually films: every frame that is not skipped. Capture, the
 *  question counter and the send-to-film handoff all read THIS, never the
 *  raw list, so a skipped card can never sneak into a take. */
export const filmFrames = (frames: readonly BlastFrame[]): BlastFrame[] => frames.filter((f) => !f.skipped);

/** Write one frame's fields; the rest of the plan is untouched. */
export const patchFrame = (frames: readonly BlastFrame[], id: string, patch: Partial<BlastFrame>): BlastFrame[] =>
  frames.map((x) => (x.id === id ? { ...x, ...patch } : x));

/** Write the SAME fields onto every frame of one kind (2026-09-05: "resize it from its fixed
 *  spot and it would apply to any other slides using that setting" — the fast-track cycle for a
 *  camera-size tweak costs real time and money; this is the free, immediate alternative). A
 *  frame that already has its OWN individual override for one of these fields is left alone —
 *  Lee's earlier deliberate per-slide choice always wins over a later bulk one. */
export const patchFramesOfKind = (frames: readonly BlastFrame[], kind: BlastFrameKind, patch: Partial<BlastFrame>): BlastFrame[] =>
  frames.map((x) => (x.kind === kind && !Object.keys(patch).some((k) => (x as unknown as Record<string, unknown>)[k] !== undefined) ? { ...x, ...patch } : x));

/** THE DETOUR CARD'S WORDS. An insert films as a dark card between the bright
 *  CEQ cards, and the thing that makes it read at short-form speed is ONE
 *  highlighted key phrase: a cheat code's rule, a phrase itself. Lee's own
 *  ==marks== win when he typed any; otherwise the phrase is marked here, once,
 *  so the Blast Off preview and the frame the sync writes cannot disagree.
 *  A tip stays plain — it is an aside, not a rule. */
export function insertStem(f: BlastFrame): string {
  // NO AUTOMATIC HIGHLIGHT any more (Lee, 2026-09-03, second look: "let's just
  // have that be bold like a heading. Don't highlight it. This way I can
  // highlight it if I wanted, or highlight something else"). The title IS the
  // card's bold heading; his own ==marks== still render if he types them.
  if (f.kind === "cheat") return f.title?.trim() ?? "";
  if (f.kind === "exhibit") return f.text?.trim() || (f.exhibitRef ? `Exhibit: ${f.exhibitRef}` : "Exhibit");
  return f.text?.trim() ?? "";
}

/** THE BACKDROP RULE (Lee, 2026-09-03): "have it run for a cold open, and then
 *  it keeps going until the opening summary slide, then cuts out at the next
 *  move forward … then we FOCUS up." So: the cold open frame is the animation
 *  itself; every frame after it up to and including the FIRST summary card
 *  (the set's first note-only card) keeps it running — quietly behind the
 *  intro, inside the white wordmark on the summary — and the next frame is
 *  clean. A frame's own `backdrop` ("zoom" | "off") overrides the rule. */
export type BackdropMode = "open" | "backdrop" | "knockout";
export function backdropFor(frames: readonly BlastFrame[], index: number, isNoteOnly: (ceqId: string) => boolean): BackdropMode | null {
  const f = frames[index];
  if (!f) return null;
  if (f.kind === "open") return "open";
  const summary = f.kind === "ceq" && !!f.ceqId && isNoteOnly(f.ceqId);
  if (f.backdrop === "off") return null;
  if (f.backdrop === "zoom") return summary ? "knockout" : "backdrop";
  const openAt = frames.findIndex((x) => x.kind === "open" && !x.skipped);
  if (openAt < 0 || index < openAt) return null;
  // Everything between the open and the first summary card, inclusive.
  for (let i = openAt + 1; i < frames.length; i++) {
    const x = frames[i];
    if (x.skipped) continue;
    const isSummary = x.kind === "ceq" && !!x.ceqId && isNoteOnly(x.ceqId);
    if (i === index) return isSummary ? "knockout" : "backdrop";
    if (isSummary) return null;               // the summary came earlier — we are past the focus point
  }
  return null;
}

/** The lines under the heading, uniform for all three kinds: a cheat code's
 *  body is simply its first line, then the bullets. Trimmed, blanks dropped.
 *
 *  NESTING (2026-09-06, Lee: "let me tab over to nest bullets into another indention under"):
 *  a leading tab character on a bullet is the depth marker — Tab in the editor (ReviewDeck)
 *  inserts one per level, Shift+Tab removes one. Only the LEADING run of tabs is meaningful and
 *  is kept here; everything else is trimmed exactly as before, so a plain (depth-0) bullet's
 *  behavior is unchanged. CalloutCard.tsx's parseBulletLine reads this same convention to render
 *  the hierarchy — the two must never disagree about what a leading tab means. */
export const frameBullets = (f: BlastFrame): string[] =>
  [...(f.kind === "cheat" && f.body ? [f.body] : []), ...(f.bullets ?? [])]
    .map((b) => { const tabs = /^\t+/.exec(b)?.[0] ?? ""; return tabs + b.slice(tabs.length).trim(); })
    .filter((b) => b.replace(/^\t+/, "").length > 0);

/** How many real takes this plan is — what Lee is about to talk through. */
export const frameCount = (plan: BlastPlan): number => filmFrames(plan.frames).length;
