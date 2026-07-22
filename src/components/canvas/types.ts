// Present Canvas — card data model. Every card is a React Flow node whose `data` is one of
// these shapes (discriminated by `kind`). Edits mutate this node data ONLY (scene-local) —
// they never write back to scenario docs. Scenes serialize the whole node array.
import type { Node } from "@xyflow/react";

export type CardKind =
  | "je"
  | "schedule"
  | "computation"
  | "taccount"
  | "ceq"
  | "memorize"
  | "note"
  | "video"
  | "list"
  | "image"
  | "legend"
  | "formula"
  | "heading"
  | "text"
  | "examcue"
  | "ceqtease"
  | "cycle"
  | "memo"
  | "outline"
  | "paygate"
  | "signupgate"
  | "asklee"
  | "submitproblem"
  | "shareinvite";

/** NODE CATEGORIES (design elements run):
 *  - card: teaching content — full contract (deck, flip-help, modes).
 *  - element: design furniture (headings, text, gates) — NEVER in the deck,
 *    no flip-help, no teaching settings; chrome = clone · × · pos-lock · resize.
 *  - bridge: placeholder feature cards (Ask Lee, …) — deckable like cards,
 *    flip-help off, no backend yet. */
export type NodeCategory = "card" | "element" | "bridge";

export const KIND_CATEGORY: Record<CardKind, NodeCategory> = {
  je: "card",
  schedule: "card",
  computation: "card",
  taccount: "card",
  ceq: "card",
  memorize: "card",
  note: "card",
  video: "card",
  list: "card",
  image: "card",
  legend: "card",
  outline: "card",
  formula: "card",
  heading: "element",
  text: "element",
  examcue: "element",
  ceqtease: "element",
  cycle: "element",
  memo: "element",
  paygate: "element",
  signupgate: "element",
  asklee: "bridge",
  submitproblem: "bridge",
  shareinvite: "bridge",
};

export const isElementKind = (k: string | undefined): boolean => KIND_CATEGORY[k as CardKind] === "element";

/** Shared across every card, merged into node.data. */
export interface CardBase {
  kind: CardKind;
  title?: string; // header label; falls back to a per-kind default
  /** DECK MEMBERSHIP — separate from presence. A member can be dealt (visible
   *  on canvas) or tucked (hidden in the deck). Loose cards are non-members. */
  deckMember?: boolean;
  /** Member presence: true = tucked away in the deck, false/absent = dealt. */
  tucked?: boolean;
  /** CUE SHEET PHASE 2: hidden-until-cued. Set on a memo in a cue-driven frame so
   *  its memo cue reveals it at its sequenced spot (offCanvas hides cueHidden
   *  nodes; RF hides their arrows too). Only used in cue mode — never in derived. */
  cueHidden?: boolean;
  /** LEGACY (schema_version 1): both meant "in deck + hidden". Migrated to
   *  deckMember+tucked on load; never written by new saves. */
  minimized?: boolean;
  staged?: boolean;
  /** Deck position (lower = dealt earlier). Set on joining; reordered in the panel. */
  stageOrder?: number;
  /** PRINCIPLE TAGS (0093) — principle slugs Lee attaches manually while
   *  authoring (e.g. "revenue-recognition"). Cards AND memos carry them; the
   *  Ch 9 filter pulls every node tagged a principle. Never auto-assigned. */
  principleTags?: string[];
  /** LESSON-SCOPED DECKS (PROMPT C): the lesson this entry belongs to —
   *  stamped at join time from the card's lesson parent; null = the "Loose"
   *  group. The deck panel groups by this; the space-walk advances lesson →
   *  lesson. Absent (legacy) = derived from parentId on read (lessonIdOf). */
  deckLessonId?: string | null;
  /** Canvas position remembered when the card entered the deck — deal returns it there. */
  deckPos?: { x: number; y: number };
  /** Category stamp for future deck filtering ("je:adjusting", "schedule", …). */
  deckCategory?: string;
  /** Dealt face down — renders the SURVIVE card back until flipped. */
  faceDown?: boolean;
  /** POSITION LOCK (B2): frozen in place (no drag) — edits still allowed.
   *  Distinct from the JE review-lock, which also freezes edits. */
  posLock?: boolean;
  /** ALT+CLICK CHROMELESS (Lee, #288): hide this card's header bar (title +
   *  settings + chrome) for a clean on-camera look. Alt+click the card toggles it. */
  hideChrome?: boolean;
  editMode?: boolean; // whole-card edit affordances on
  w?: number; // resize width/height (px), applied to the shell
  h?: number;
  /** NAMED DECK membership (P3): the id of the DeckDef this card/memo belongs to.
   *  Absent = not in any named deck (the legacy lesson-grouped roster still uses
   *  deckMember/deckLessonId). A named-deck member is also a deckMember. */
  deckId?: string;
  /** Assigned skeleton-grid slot index within its named deck (P4). */
  slotIndex?: number;
  /** FILMING SCALE (FF-2): visual size multiplier 0.25–1. Absent = 1 loose,
   *  ~0.6 inside a frame (the shot default, applied on render, not persisted
   *  until the user nudges it). Purely presentational — geometry is unchanged. */
  scale?: number;
}

/** Clamp/step a filming scale to the 25–100% band (FF-2). */
export const FRAME_CARD_SCALE = 0.6;
export const clampScale = (s: number): number => Math.max(0.25, Math.min(3, Math.round(s * 100) / 100));

// ---- JE ----
/** A line's floating annotation (PROMPT A): TEXT (lightbulb, prose "why") or
 *  CALC (calculator, tabular arithmetic like "500,000 × 8% × 6/12 = 20,000",
 *  multi-line, = aligned, mono). A line carries AT MOST ONE of each kind.
 *  Roadmap: calc memos will later draw from problem text (Solve-It). */
/** MEMO SEMANTICS (memos-as-objects, Phase 1): the teaching ROLE of a memo,
 *  used for memo-deck filtering (Cheat Codes / Exam Traps / Calculations / Tips)
 *  and its box accent. Distinct from the STRUCTURAL `kind` (text vs calc) that
 *  drives rendering — a 'calc' memoKind is the only one that renders tabular. */
export type MemoKind = "note" | "calc" | "trap" | "tip" | "cheat";

export interface JeMemo {
  id: string;
  kind: "text" | "calc";
  text: string;
  /** OPTIONAL NAME (Phase 1): a short title shown above the body; also the memo's
   *  label in a memo deck. */
  title?: string;
  /** SEMANTIC ROLE (Phase 1): note|calc|trap|tip|cheat — memo-deck bucket + accent.
   *  Absent (legacy) → derived from `kind` (calc→'calc', else 'note'). */
  memoKind?: MemoKind;
  /** FREE TAG (Phase 1): author's category for deck filtering. */
  category?: string;
  /** Floating box offset in NODE space (rows-local) — travels with the cluster. */
  pos?: { x: number; y: number };
  /** Box shown (persisted so an arranged board reloads arranged). */
  open?: boolean;
  /** DEFAULT-POINTER target (J3): the id of the SAME-card line this memo's
   *  in-card leader points to. Undefined = its own line (the guaranteed default,
   *  J2). Re-targeted by dropping the memo's dot on another block in this card.
   *  Cross-card arrows are ordinary RF edges from the memo's dot, not this. */
  point?: string;
}

export interface JeLine {
  id: string;
  account: string;
  dr: number | null;
  cr: number | null;
  /** Explicit column; legacy lines derive it from which amount is set (see sideOf). */
  side?: "dr" | "cr";
  /** MEMOS (source of truth since PROMPT A): up to one text + one calc.
   *  Read through memosOf()/textMemoOf() in je-logic — those fall back to the
   *  legacy label fields so pre-migration lines keep working. */
  memos?: JeMemo[];
  /** LEGACY single text memo — scenario docs still populate this on spawn and
   *  read it back on save-to-library (doc.lines[].label is the doc-side truth).
   *  memosOf() migrates it lazily; scene-io migrates it persistently on load. */
  label?: string;
  /** LEGACY floating memo box offset — superseded by memos[].pos. */
  memoPos?: { x: number; y: number };
  /** LEGACY memo visibility — superseded by memos[].open. */
  memoOpen?: boolean;
  hidden?: boolean; // stepper hide
  /** GUIDED AMOUNT ECHO (item 1): this amount was auto-committed by autoBalance to
   *  make the entry balance — DERIVED, not hand-typed. Editable (typing clears the
   *  flag); recomputed when other amounts change. Never set in PRACTICE. */
  echo?: boolean;
  /** Alternate wrong version + one feedback sentence (distractor flip). */
  trap?: { account?: string; dr?: number | null; cr?: number | null; feedback: string };
  flipped?: boolean; // showing the trap version
}
export interface JeCard extends CardBase {
  kind: "je";
  /** The transaction description — IS the card header. */
  caption: string;
  /** Optional transaction date (ISO yyyy-mm-dd). When set, the description
   *  renders prefixed "Jan 15 · …". Removable in the gear. */
  date?: string;
  entryType?: "standard" | "adjusting" | "closing";
  /** GUIDED (picker + chips, free reveal) or PRACTICE (free-type, reveal gated
   *  behind an attempt). Absent = the canvas default preset. Blind retired in v3. */
  mode?: "guided" | "practice";
  lines: JeLine[];
  /** The ANSWER KEY: full correct lines (with memos) when known — stamped by the
   *  scenario picker and practice copies. Powers reveal-correct + the flip Hint. */
  solution?: JeLine[];
  /** REVIEW LOCK (A3): no drag, no inline edit, no socket drag. The answer-key
   *  state — clone offers a practice copy. Superset of posLock. */
  reviewLock?: boolean;
  /** Card-flip help (A2): showing the back face (stuck? panel). Undoable. */
  helpOpen?: boolean;
  /** Student used reveal-correct (V2): in PRACTICE the balance chip stays
   *  hidden until attempt+reveal — then it appears as feedback. Reset clears. */
  revealUsed?: boolean;
  /** The JE↔scenario mapping: je_scenarios row this card was spawned from or
   *  saved to (content reset). Re-saving a linked card offers update vs new. */
  scenarioId?: string;
  accountBank?: string[]; // autocomplete pool (unioned with the COA)
  /** LEGACY (v≤2): reveal flag / labels column — ignored since v3 (amounts are
   *  always ???-until-valued; memos ride the lightbulbs). Kept for old scenes. */
  showAmounts?: boolean;
  showLabels?: boolean;
  /** Per-card overrides on top of the canvas default preset (see je-logic). */
  settings?: Partial<import("./je-logic").JeSettings>;
}

// ---- Schedule (generic table engine + presets) ----
export type SchedulePreset = "generic" | "amortization" | "depreciation" | "fifo" | "bankrec" | "incomestmt" | "balancesheet";
export interface ScheduleCell {
  v: string; // raw text (numbers stored as strings, formatted on display)
  hidden?: boolean; // per-cell reveal
  bad?: boolean; // failed the Check (subtle underline)
}
export interface ScheduleCard extends CardBase {
  kind: "schedule";
  preset: SchedulePreset;
  headers: string[];
  rows: ScheduleCell[][];
  numericCols?: boolean[]; // right-align + comma-format
  runningTotals?: boolean;
  footerCheck?: boolean;
  /** Amortization Check params (collapsible param row). */
  bond?: { face: number; statedRateAnnual: number; marketRateAnnual: number; paymentsPerYear: number; termYears: number; method: "effective" | "straight" };
}

// ---- Computation ----
export interface CompStep { id: string; label: string; formulaText?: string; value?: string; hidden?: boolean }
export interface ComputationCard extends CardBase {
  kind: "computation";
  narration?: string;
  steps: CompStep[];
}

// ---- T-account ----
export interface TAccountEntry { id: string; label?: string; amount: number | null }
export interface TAccountCard extends CardBase {
  kind: "taccount";
  account: string;
  debits: TAccountEntry[];
  credits: TAccountEntry[];
}

// ---- CEQ ----
export interface CeqChoice {
  id: string;
  text: string;
  correct?: boolean;
  feedback?: string;
  /** LIVE-TEACHING resolution (choreo Item 6): the choice has been Enter-resolved
   *  (locked in). Its result is c.correct ? green : red+strike. Persists + coexists
   *  with other resolved choices; Enter again clears it. Transient teaching state,
   *  round-trips in the scene JSON (no DB column). */
  resolved?: boolean;
}
export interface CeqCard extends CardBase {
  kind: "ceq";
  prompt: string;
  choices: CeqChoice[];
  revealedAnswer?: boolean;
  /** CORRECT-ANSWER SOUND (Lee): play the confirm SFX when the right choice is
   *  picked on THIS question in film. Default ON (undefined ⇒ plays); toggle off
   *  per card. */
  confirmSfx?: boolean;
  /** STEM KEYPAD SOUND (choreo Item 5): play the keypad cue as the stem types out
   *  on deal/frame-entry in film. Unlike text/heading keypad (default off), a CEQ
   *  defaults ON (plays unless === false) — the deal IS a type-out. */
  keypadSfx?: boolean;
  /** LIVE-TEACHING emphasis pointer (choreo Item 6): the choice id currently amber-
   *  emphasised while the CEQ is focused. Reveals nothing on its own. Transient. */
  emphasis?: string;
  /** AUTO-TAGS (choreo Item 7): accumulated in film, e.g. "CEQ_DISTRACTOR" the first
   *  time a wrong choice is Enter-resolved on camera. Metadata only, queryable later. */
  tags?: string[];
  /** WIDTH PRESET (redesign Item 6): standard (default) or wide. The only per-card
   *  design knob. A manual resize (w) still wins if set. */
  wide?: boolean;
}

// ---- Memorize ----
export interface MemorizeCard extends CardBase {
  kind: "memorize";
  itemKind: "formula" | "mnemonic" | "watchout" | "tip";
  body: string;
}

// ---- Note ----
export interface NoteCard extends CardBase {
  kind: "note";
  /** Plain text (kept in sync for outlines/search; legacy scenes only have this). */
  body: string;
  /** TipTap rich content; wins over body when present. */
  bodyHtml?: string;
  /** Card-level font step (Ctrl+Shift+> / <). */
  fontSize?: number;
  color: number; // index into NOTE_COLORS
}

// ---- Video ----
export interface VideoCard extends CardBase {
  kind: "video";
  playbackId: string;
  /** Placeholder title while no playbackId — lets Lee lay out the path with
   *  empty video slots ("Intro: the accounting equation"). */
  plannedTitle?: string;
  /** Lee's production note ("what this video will be") — NOT student-facing. */
  internalNote?: string;
}

// ---- Image (pasted/uploaded picture, stored in the canvas-media bucket) ----
export interface ImageCard extends CardBase {
  kind: "image";
  url: string; // empty until uploaded/linked
  fit: "cover" | "contain";
  caption?: string;
}

// ---- Legend (trading card: Pacioli, companies, key concepts — the collectible) ----
/** One STORY SLIP (V2): a 1–2 sentence beat the space-walk reveals in order. */
export interface LegendSlip { id: string; text: string; hidden?: boolean }
export interface LegendCard extends CardBase {
  kind: "legend";
  name: string;
  year: string; // CONTEXT chip (year / ticker / "Founded 1976" / empty)
  imageUrl: string; // portrait window (canvas-media)
  typeLine: string; // "Legend · Father of accounting"
  slips: LegendSlip[]; // ordered STORY SLIPS — each a reveal step (space-walk)
  flavor: string; // italic closer — reveals LAST, after all slips
  flavorHidden?: boolean; // reveal gate for the flavor line
  setLabel: string; // collection number ("Legends · 001") — authoring only, hidden in film
  facts?: string[]; // LEGACY (pre-V2) — migrated to slips on load
  cornerChip?: string; // LEGACY — the DR=CR stat, removed from the V2 render
}

// ---- Equation lens (A = L + E arrows) — see equation-derive.ts -----------------
/** Which bucket a formula segment represents (drives derivation). ale preset
 *  uses assets/liabilities/equity (rev/exp fold into equity); the re preset uses
 *  revenues/expenses (income-statement lens). */
export type EqComponent = "assets" | "liabilities" | "equity" | "revenues" | "expenses";
/** A component's direction: ↑ up · ↓ down · ↑↓ both · — none. */
export type EqDir = "up" | "down" | "both" | "none";
/** Effect-card preset: A=L+E (balance sheet) or Revenues/Expenses (income). */
export type EqPreset = "ale" | "re";
/** A DEBIT/CREDIT sign for the Rubric lens. */
export type RubricSign = "+" | "-";

// ---- Formula (horizontal chain: [Beginning inv] + [Purchases] = [Goods avail] …) ----
export interface FormulaSegment {
  id: string;
  label: string; // "Beginning inventory"
  value: string; // shown bold; "" renders the ??? placeholder
  hidden?: boolean; // stepper reveal
  /** ARROWS MODE: the A/L/E bucket this segment IS. Set → derivable + gradeable.
   *  Absent → a plain segment (numbers only; shows — in arrows mode). */
  component?: EqComponent;
  /** The answer arrow (manual, or auto-derived when the card is scenario-bound). */
  arrow?: EqDir;
  /** Arrow was manually set to differ from the bound scenario's derived value. */
  overridden?: boolean;
  /** PRACTICE: the student's set arrow (undefined = still blank). */
  attempt?: EqDir;
  /** RUBRIC lens (ER5) PRACTICE: the student's set +/- for the debit / credit
   *  side (undefined = still blank). Graded vs the static rubric of the type. */
  drAttempt?: RubricSign;
  crAttempt?: RubricSign;
  /** Per-memo attachments (M3) — floating boxes with pointer leaders. */
  memos?: JeMemo[];
}
export interface FormulaCard extends CardBase {
  kind: "formula";
  segments: FormulaSegment[];
  /** One operator between each pair of segments (length = segments.length - 1). */
  operators: string[];
  /** NUMBERS (values) · ARROWS (↑↓ effect) · RUBRIC (+/- per DR/CR) lens. */
  display?: "numbers" | "arrows" | "rubric";
  /** Effect-card preset (ER4): ale = A=L+E, re = Revenues/Expenses. Default ale. */
  preset?: EqPreset;
  /** ARROWS practice: components start blank, student sets, reveal grades. */
  arrowMode?: "guided" | "practice";
  /** PRACTICE: reveal pressed — grade each component's attempt vs its arrow. */
  graded?: boolean;
  /** Bound library scenario (je_scenarios) — auto-derives component arrows. */
  scenarioId?: string;
  /** Per-card memo attachments (M3) — whole-card floating boxes. */
  memos?: JeMemo[];
}

// ---- Heading (big display text: section titles on the whiteboard) ----
export interface HeadingCard extends CardBase {
  kind: "heading";
  /** Display text; a trailing "[sub]" renders as a smaller bracketed sub-label.
   *  Supports template tokens: {first_name} {university} {professor}
   *  {course_code} {exam_date} — stored raw, rendered substituted. */
  text: string;
  level: 1 | 2; // H1 ~48px / H2 ~28px at zoom 1
  /** TITLE POP (item 5): a dark scrim + strong text-shadow behind the text so a
   *  lesson title reads over a bright background loop. Scaffold-v2 hook titles
   *  ship with this on. */
  scrim?: boolean;
  /** TYPEWRITER ENTRANCE (item 11): in FILM mode, the text types itself in
   *  (~600ms) when its frame is entered — the lesson-title reveal. Per-element
   *  toggle; no effect outside film. */
  typewriter?: boolean;
  /** UNDERLINE: the neon draw-in bar under the text. Default ON; set false to
   *  hide it (toggle in the chrome). Undefined = shown (back-compat). */
  underline?: boolean;
  /** BIG TEXT (Lee): render in the heavy League Spartan wordmark voice — huge,
   *  tight, no underline by default — the "A = L + E" slab that sits on camera. */
  spartan?: boolean;
  /** OVER EVERYTHING: lift this element above all other canvas content AND the
   *  camera bubble, so a Big Text slab can sit on top of the presenter. */
  onTop?: boolean;
  /** FADED (Lee): render the text in a muted grey — a "shadowed out" / de-emphasized
   *  look (e.g. an old point you've moved past). Toggle in the chrome. */
  faded?: boolean;
  /** ALIGN (Lee): horizontal text alignment within the element box. Default
   *  "left"; "center" for centred titles / Big Text. Toggle in the chrome. */
  align?: "left" | "center";
  /** KEYPAD SFX (Lee): when on, revealing this element in FILM (its reveal-on-step
   *  / typewriter entrance) plays the keypad cue. Off by default; per-element. */
  keypadSfx?: boolean;
}

// ---- Text element (freeform markdown-lite block; ELEMENT category) ----
export interface TextElement extends CardBase {
  kind: "text";
  /** Raw text with markdown-lite (**bold**, *italic*, "- " bullets, line
   *  breaks) and template tokens (stored raw, rendered substituted). */
  body: string;
  color: number; // index into NOTE_COLORS accents
  /** FADED (Lee): render muted grey — a "shadowed out" de-emphasized look. */
  faded?: boolean;
  /** ALIGN (Lee): horizontal text alignment. Default "left"; "center". */
  align?: "left" | "center";
  /** KEYPAD SFX (Lee): reveal-in-film plays the keypad cue. Off by default. */
  keypadSfx?: boolean;
}

// ---- Gate elements (VISUAL PLACEHOLDERS — real gating is World v1) ----
export interface GateElement extends CardBase {
  kind: "paygate" | "signupgate";
  label: string; // editable banner text
}

// ---- Exam cue (Lee): a big emoji-illustration callout — a bouncing sheet of
//      paper + a label ("Your exam") — that HOOKS a common-exam-question frame by
//      signalling "you'll see this on the real exam". Design ELEMENT: resizable,
//      spotlightable, never in the deck. ----
export interface ExamCueElement extends CardBase {
  kind: "examcue";
  /** The callout line (default "Your exam"). */
  label: string;
  /** The emoji illustration that bounces (default 📄). */
  emoji?: string;
  /** Show the label text (default true). Turn off to show JUST the floating emoji. */
  showLabel?: boolean;
  /** Show the "you'll see this on the exam" tag (default true). */
  showTag?: boolean;
  /** Drop the background plate + border so it's JUST the bouncing emoji (+ any label
   *  / tag still enabled). Default false (plate shown). */
  noPlate?: boolean;
}

// ---- CEQ Tease (Lee): a horizontal banner that teases an exam-question FORMAT —
//      a floating exam icon on the left, the question text on the right, on an
//      OPAQUE rounded plate (covers the baked-in SURVIVE watermark). The text
//      auto-scales DOWN to fit the plate (the container wins, never the text).
//      Design ELEMENT: resizable, spotlightable, never in the deck. ----
export interface CeqTeaseElement extends CardBase {
  kind: "ceqtease";
  /** The teased question, e.g. 'What type of account is ___?'. */
  text: string;
  /** The floating exam icon (default 📝). */
  emoji?: string;
  w?: number;
  h?: number;
}

// ---- Cycle (Lee): the Accounting Cycle — a raised callout box (exam-cue vibe)
//      with N steps laid out evenly around an OVAL, connected by flow arrows that
//      close the loop. Add / remove / rename steps; the oval re-solves from the
//      step count so it always stays an even ring. Design ELEMENT: resizable,
//      spotlightable (whole-element "self" target), never in the deck. ----
export interface CycleStep {
  id: string;
  /** The step label, e.g. "Record JEs". */
  text: string;
}
export interface CycleElement extends CardBase {
  kind: "cycle";
  /** Center label (default "The Accounting Cycle"). */
  title?: string;
  /** Ordered steps around the ring (clockwise from top). */
  steps: CycleStep[];
  /** Arrow-segment indices Lee shift-clicked to the animated-dashed style. */
  dashedArrows?: number[];
  w?: number;
  h?: number;
}

// ---- Bridge placeholders (deckable cards; features arrive with World v1) ----
export interface BridgeCard extends CardBase {
  kind: "asklee" | "submitproblem" | "shareinvite";
}

// ---- Memo (memos-as-objects, Phase 1): a FIRST-CLASS floating annotation node.
//      Standalone or attached to any target via connection arrows (RF edges).
//      memoKind drives its accent + which memo deck it joins. ELEMENT category:
//      never in a CARD deck, but collectable into a MEMO deck (Phase 3). ----
export interface MemoCard extends CardBase {
  kind: "memo";
  /** note|calc|trap|tip|cheat — the memo-deck bucket + box accent. */
  memoKind: MemoKind;
  /** Optional name shown above the body; the memo's label in a memo deck. */
  title?: string;
  body: string;
  /** Free author tag for memo-deck filtering. */
  category?: string;
}

// ---- List (reveal list: 5 account types, the accounting cycle, …) ----
export interface ListRow {
  id: string;
  text: string;
  /** Optional debit/credit chip (the debit-credit-rubric video re-uses the same cards). */
  chip?: "DR" | "CR";
  hidden?: boolean; // stepper hide
  /** CONTRA FORM (P2): indent + prepend "Less: " — statement form for contra
   *  items (Equipment / Less: Accumulated Depreciation). */
  indent?: boolean;
  /** YOU-ARE-HERE: baked-in spotlight for the lesson-outline list — the current
   *  lesson's row renders emphasized (gold accent) so intros read "here we are". */
  youAreHere?: boolean;
}
export interface ListCard extends CardBase {
  kind: "list";
  /** One-word/one-line definition under the title. */
  definition?: string;
  /** DESCRIPTION (L4): a short paragraph under the title, inline-editable,
   *  reveal-able as its own stepper step (descHidden). */
  description?: string;
  descHidden?: boolean;
  rows: ListRow[];
  /** Chips off by default (Foundations teaches the 5 types before DR/CR). */
  showChips: boolean;
  /** NUMBERED (default) vs BULLETED rows (P2). */
  bulleted?: boolean;
  /** COURSE OUTLINE BIND (Lee): auto-fill rows from the scene's course chapters
   *  (in order, live). Manual rows still allowed below. */
  outlineBind?: boolean;
  /** LIVE COA PULL (P2): bind to one of the 5 account-type GROUPS (Assets, …)
   *  of the scene's course — rows auto-populate from that COA set, live, and
   *  precede any manual teaching rows. null/absent = manual only. */
  coaGroup?: string | null;
  /** MANUAL ORDER of the COA-pulled rows (Lee): account names in the desired
   *  order. Accounts not listed follow, in the COA's own order. Absent = COA order. */
  pullOrder?: string[];
  /** Hide the list's title heading — a cleaner "just the rows" list (Lee). */
  hideTitle?: boolean;
  /** PROGRESSIVE REVEAL (Lee): the space-walk reveals ONE row at a time, top to
   *  bottom (covers COA-pulled + outline + manual rows, which per-row `hidden`
   *  can't). `revealN` = how many are shown; `revealTotal` = the flat item count
   *  the render syncs so the walk knows when the card is done. Off ⇒ the classic
   *  per-row hidden behaviour. */
  progressiveReveal?: boolean;
  revealN?: number;
  revealTotal?: number;
}

export type CardData =
  | JeCard
  | ScheduleCard
  | ComputationCard
  | TAccountCard
  | CeqCard
  | MemorizeCard
  | NoteCard
  | VideoCard
  | ListCard
  | ImageCard
  | LegendCard
  | FormulaCard
  | HeadingCard
  | TextElement
  | ExamCueElement
  | CeqTeaseElement
  | CycleElement
  | MemoCard
  | GateElement
  | OutlineCard
  | BridgeCard;

// ---- Course Outline (the staircase) — DERIVED from a course's lessons ----------
/** A manual you-are-here override + a paid-gate override live here; everything
 *  else (lesson order, titles, count) is derived live from the course tree, never
 *  typed. `freeThrough` is the free/paid boundary (N free lessons) until a real
 *  per-chapter gate field exists. */
export interface OutlineCard extends CardBase {
  kind: "outline";
  /** Course to render; falls back to the scene's course when absent. */
  courseId?: string | null;
  /** Free/paid gate: lessons 1..freeThrough are free (full colour), the rest paid. */
  freeThrough?: number;
  /** SNAKE layout (V2): steps flow L→R, wrap and reverse (boustrophedon), auto-
   *  fitting steps-per-row to the card width + lesson count; `grid` is the
   *  fallback. `staircase` is legacy (older scenes) — read as `snake`. */
  layout?: "snake" | "grid" | "staircase";
  /** Manual steps-per-row; null/absent = auto-fit. */
  stepsPerRow?: number | null;
  /** YOU-ARE-HERE: 1-based lesson to emphasise; absent = auto-detect from the frame. */
  hereOverride?: number | null;
  /** Legacy diagonal controls (ignored by the snake renderer; kept so pre-V2
   *  scenes still parse). */
  origin?: "bl" | "br" | "tl" | "tr";
  rise?: number;
}

export type CardNode = Node<CardData & Record<string, unknown>>;

// ---- Path primitives (Part B vocabulary) -----------------------------------
// WORLD (the canvas) → REGION (course/chapter territory — today's "zone" node;
// full rename parked, see docs/CANVAS-ROADMAP.md) → LESSON (heading + cards in
// a hugging highlighted box) → CARD. GATE = free/paid boundary (roadmap).

// ---- Zones (labeled translucent group boxes — the REGION tier) ----
export interface ZoneBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Teaching path position (1, 2, 3…). When set, the deck's default deal order
   *  and the space-walk visit this zone's cards in path order. Null = unordered. */
  pathOrder?: number | null;
}

// ---- Lessons (the finer grouping tier: one taught section) ----
export interface LessonBox {
  label: string; // manual label; a contained heading's text wins for display
  w: number;
  h: number;
  /** Teaching path position within the region. */
  pathOrder?: number | null;
  /** CHECK GATE (L1): a red-tinted "this is where I get tested" lesson — the
   *  visual seed of the free/paid gate (roadmap). */
  check?: boolean;
  /** BEAT GUIDES (L2): show the Hook · Teach · Model-Practice · Check dividers
   *  inside the band (soft guides, not containers). */
  beats?: boolean;
  /** SCRIPT EDITOR V2: this lesson's collapse state in the script modal. Absent =
   *  default (only the current lesson expanded). Persists in the scene. */
  scriptOpen?: boolean;
  /** VISUAL WORLDS (Phase 2) — the lesson's DEFAULT world: any frame with no
   *  `world` of its own inherits these. Additive/nullable, in the scene JSON. */
  worldDefault?: string;
  worldDefaultIntensity?: number;
  worldDefaultMotion?: number;
  /** PER-BEAT WORLD DEFAULTS — a subtle differentiation between Hook / Teach /
   *  Model·Practice / Cram within a lesson. Resolution order for a frame:
   *  own `world` → this beat's default → the lesson `worldDefault` → none.
   *  Keyed by beat ("hook" | "teach" | "model_practice" | "cram"). Additive. */
  worldByBeat?: Partial<Record<string, { world?: string; intensity?: number; motion?: number }>>;
  /** CRAM LAUNCH SFX (Lee): which frame in this lesson fires the cram-launch cue.
   *  "auto" (or absent) = the first CRAM-beat frame in column-major order;
   *  "off" = never; any other value = that frame id (override "elsewhere"). */
  cramSfx?: "auto" | "off" | string;
  // NOTE: the old per-lesson `home` flag was dropped (L3) — Home is now just the
  // top outline entry + a Home element (welcome heading + Ask Lee) in the region.
}

// ---- Frames (the SHOT tier: WORLD › REGION › LESSON › FRAME › CARD) ----
// A FRAME is one screen / one shot / one sitting — a bounded 16:9 stage inside a
// lesson holding cards. A lesson's frames form a GRID: the BEAT is a COLUMN
// (Hook · Teach · Model-Practice · Cram), subIndex is the ROW within it.
/** The 4 beat COLUMNS. Legacy scenes may carry "none" (folded to hook) or the old
 *  4th-column value "check" (folded to "cram" on load — see migrateCheckToCram). */
export type Beat = "hook" | "teach" | "model_practice" | "cram";
export type FrameBeat = Beat | "none";
/** CARD MARKS (script editor V2): the cards Lee INTENDS to build in this frame —
 *  planning intent, NOT a card. Typed as "@Kind" in the beats field; each carries
 *  an optional note and can be LINKED to a real card once built. `kind` is a card
 *  kind plus the two non-node marks "deck" / "background". Order = array index. */
export type MarkKind = CardKind | "deck" | "background";
export interface CardMark {
  id: string;
  kind: MarkKind;
  /** Free note right after the mark ("— COA-bound, Assets"). */
  note?: string;
  /** Once built, the id of the card on this frame this mark refers to (else null). */
  linkedCardId?: string | null;
}
/** SCRIPT (script editor): what Lee SAYS in this frame — the teleprompter's
 *  source. entry = the opening line, beats = the talking points (multiline,
 *  bullets), exit = the closing line / handoff into the next frame. */
export interface FrameScript {
  entry?: string;
  beats?: string;
  exit?: string;
  /** CARD MARKS (V2): the build checklist for this frame. */
  marks?: CardMark[];
  /** JOURNAL: free-text workshop space (rich HTML — bold + bullets) where Lee
   *  riffs on ideas for the frame. Never rendered on camera. */
  journal?: string;
  /** SCRIPT STATE (Phase 3): the WRITING status of this frame's script. Additive +
   *  nullable — absent is DERIVED ("empty" when blank, else "draft"), so old
   *  scenes read unchanged and nothing is rewritten until Lee sets a state. */
  scriptState?: "draft" | "review" | "final";
}
/** TAKE BOARD: the frame's filming state. Absent = unfilmed. */
export type FilmStatus = "unfilmed" | "filmed" | "retake";

/** One recorded action in a frame's cue recording (see FrameBox.recordedCues). */
export interface RecCue {
  id: string;
  kind: "deal" | "reveal" | "memo" | "spot" | "super" | "advance";
  cardId?: string;
  targetId?: string; // spot/super/reveal: the emphasis/row target within the card
  memoId?: string;
  revealCount?: number; // reveal cues: steps visible AFTER this cue
  label: string;  // captured human label (e.g. "Owner invests cash")
  target: string; // captured human target (e.g. "line 2")
  /** spot cues only: when this cue plays, enter as a SUPER-spotlight (Lee's toggle). */
  superOnEntry?: boolean;
}

export interface FrameBox {
  title?: string;
  /** 16:9 aspect-locked (h = round(w * 9 / 16)). */
  w: number;
  h: number;
  /** SCRIPT: entry line / beats / exit line (teleprompter + script modal). */
  script?: FrameScript;
  /** TAKE BOARD: unfilmed (absent) | filmed | retake. Authoring chrome only. */
  filmStatus?: FilmStatus;
  /** PUBLISH PIPELINE: this frame's keeper take is the lesson's INTRO (filmed with
   *  the radio chain, never body-processed). Hook f1 by convention; the flag lets
   *  Lee override. Auphonic loudness-matches it to the body without reprocessing. */
  introTake?: boolean;
  /** The beat COLUMN this frame sits in (grid model). */
  beat?: FrameBeat;
  /** 0-based ROW within its beat column (grid model). */
  subIndex?: number;
  /** POSITION LOCK (item 2): frames ship LOCKED (no drag) so they stop getting
   *  nudged; the frame hover-chrome lock toggles it. Load migrates undefined→true. */
  posLock?: boolean;
  /** DIRECTOR NOTE (scaffold v2): Lee's on-set reminder for this shot — filming
   *  chrome, hidden in film, never student-facing. */
  note?: string;
  /** SOUNDS ON ENTRY (Lee) — per-frame, any combination, edited in the frame
   *  header's Sounds popover:
   *   • swooshSfx — the advance swoosh (default on, off on the cram-launch frame)
   *   • cramLaunchSfx — the cram launch (default = the lesson's first cram frame)
   *   • keypadOnEntry — a keypad cue when the frame is entered (default off) */
  swooshSfx?: boolean;
  cramLaunchSfx?: boolean;
  keypadOnEntry?: boolean;
  /** STACK DEAL (Lee): this frame's deck deals ONE card at a time in the SAME
   *  spot (the frame centre), each Space re-tucking the one underneath —
   *  flashcard drilling. Shift+Space flips back. Default off (grid deal). */
  stackDeal?: boolean;
  /** LAUNCH TRANSITION (item 9): this frame plays the punchy zoom-push when the
   *  space-walk advances OUT of it (the "Ready to cram?" → Check liftoff). */
  launch?: boolean;
  /** INTERSTITIAL (item 9): a scaffold-inserted breath frame (Ready to cram?) —
   *  tagged so re-stamps don't duplicate it. */
  interstitial?: boolean;
  /** CUE SHEET PHASE 2: an explicit ordered list of cue ids the space-walk
   *  performs before falling back to the DERIVED order. Present ⇒ this frame is in
   *  cue-driven mode (Lee reordered/interleaved its sequence). Absent ⇒ the
   *  derived precedence (deal-order + reveal-order) runs, exactly as before. */
  cueOrder?: string[];
  /** CUE RECORDER (Lee): a RECORDED action sequence for this frame. When present it
   *  OVERRIDES the derived/cueOrder space-walk — Space plays these in order.
   *  Captured live in record mode (spotlights + reveals + deals); fully editable
   *  (delete / reorder / per-spotlight "super on entry"). Additive; scene JSON. */
  recordedCues?: RecCue[];
  /** LEGACY flat index (pre-grid) — migrated to (beat, subIndex) on load. */
  order?: number | null;
  /** BACKGROUND ANIMATION (author-facing filming aid): a looping video from
   *  FRAME_BG_LOOPS plays behind all cards. `bgSrc` is the loop id (empty = the
   *  slot is ready but unset); `bgOpacity` 0–1 (slider); `bgPlaying` = the frame's
   *  hover play/pause (Lee plays before a take, pauses on action). Persist in scene. */
  bgSrc?: string;
  bgOpacity?: number;
  bgPlaying?: boolean;
  /** BACKGROUND SCRIM (Lee): a black wash OVER the bg loop (0–1) so cards read on
   *  top of a busy backdrop (e.g. dim the SURVIVE logo loop). Sits above the video,
   *  below the cards. 0/absent = no scrim. */
  bgScrim?: number;
  /** BACKGROUND FRAMING (compose without re-cutting the file): `bgFit` = fill
   *  (cover) vs fit (contain); `bgZoom` % (scale, default 100) pushes focal content
   *  bigger; `bgAnchor` is a 9-point anchor that pins both object-position AND the
   *  zoom origin, so anchor=top + zoom keeps the wordmark in the top third and
   *  crops the bottom. Persist per frame. */
  bgFit?: "cover" | "contain";
  bgZoom?: number;
  bgAnchor?: FrameBgAnchor;
  /** VISUAL WORLDS (Phase 2) — a rendered atmosphere preset (see worlds.ts) that
   *  sits BEHIND the cards, alongside/instead of a video loop. All additive +
   *  nullable, stored in the scene JSON (no migration). `world` empty ⇒ fall back
   *  to the lesson's worldDefault, then to no world. */
  world?: string;
  worldIntensity?: number; // 0..0.6
  worldMotion?: number;    // 0..1
  worldSeed?: number;
  /** VISUAL MIX (Phase 8) — an optional lightweight tag for the read-only lesson
   *  summary ("stage", "statement", "diagram", …). Purely informational; unset
   *  frames are simply "untagged" in the summary. */
  visualType?: string;
  /** REHEARSAL (PROMPT 3): the last rehearsal's actual spoken seconds — stored so
   *  the storyboard row shows "practiced Ns" next to the estimate. No take is
   *  created; purely a self-timing aid. */
  lastRehearsalS?: number;
  /** CUE LOG (PROMPT 4): the PENDING log of SPACE-press wall-clock times (epoch-ms)
   *  from the last film-mode visit, kept on the frame until an OBS clip is dropped
   *  and the presses are aligned into per-beat cut boundaries. Rides the scene
   *  JSON (additive); cleared once a take's segments are aligned. */
  cueLog?: { startedAtMs: number; pressesMs: number[] };
  /** CINEMATIC ZOOM (camera-only, film-mode) — both default OFF, per-frame:
   *  `ambientPush` = a slow Ken-Burns push-in on frame entry (stage/scenery);
   *  `spotlightPush` = the camera eases toward a Spotlight target (dolly-in),
   *  eases back out when Spotlight clears. Never move nodes; reset on frame exit.
   *  Speed/intensity are scene-level (sceneSettings). */
  ambientPush?: boolean;
  spotlightPush?: boolean;
}
export type FrameBgAnchor =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right";
/** Frame default size — 16:9, sized so 4 fit in a lesson filmstrip while staying
 *  legible: entering a frame zooms it to fill 1080p (a ~420px JE renders large). */
export const FRAME_W = 800;
export const FRAME_H = 450; // 16:9
export const FRAME_BG_DEFAULT_OPACITY = 0.35;
export const FRAME_BG_DEFAULT_ZOOM = 100; // percent (100 = native fit)
/** 9-point anchor → CSS position keyword (used for BOTH object-position and the
 *  zoom transform-origin, so a zoomed loop grows away from the anchored edge). */
export const FRAME_BG_ANCHOR_CSS: Record<FrameBgAnchor, string> = {
  "top-left": "left top", top: "center top", "top-right": "right top",
  left: "left center", center: "center center", right: "right center",
  "bottom-left": "left bottom", bottom: "center bottom", "bottom-right": "right bottom",
};
/** The trimmed, audio-stripped loop library (public/anim/*.webm|mp4). `id` is what
 *  `FrameBox.bgSrc` stores; the FrameNode picks webm first, mp4 fallback. */
export const FRAME_BG_LOOPS: { id: string; label: string; base: string }[] = [
  { id: "car", label: "Car", base: "/anim/car-intro" },
  { id: "dream", label: "Dream", base: "/anim/dream-intro" },
  { id: "space", label: "Space", base: "/anim/space-intro" },
];

/** Grouping-tier nodes (region/zone + lesson + frame) — never cards: excluded
 *  from the deck, quick-copy, snap guides, grid placement, and auto-fit. */
export const isContainerType = (t: string | undefined): boolean => t === "zone" || t === "lesson" || t === "frame";

// ---- Named decks (P3) — first-class deck OBJECTS -----------------------------
// A deck is a named, reusable object: whole CARDS or MEMO objects, dealt in
// sequence or shuffled, optionally pinned to a lesson and laid on a slot GRID
// (skeleton preview, P4). Cards/memos JOIN a named deck via `deckId` on their
// data. Mirrors the canvas_decks table (migration 0090); scenes carry the defs.
export type DeckPayloadType = "cards" | "memos";
export type DeckRunMode = "sequence" | "shuffle";
/** A fixed slot on the canvas a dealt item locks into (P4 skeleton grid). */
export interface DeckSlot { x: number; y: number }
export interface DeckDef {
  id: string;
  name: string;
  payloadType: DeckPayloadType;
  /** Card-kind (cards) or memoKind/category (memos) to auto-include, or null. */
  filter?: string | null;
  runMode: DeckRunMode;
  lessonId?: string | null;
  /** DECK ↔ FRAME (F3): a deck attached to a FRAME lays its skeleton grid INSIDE
   *  that frame's bounds — a lesson's Check frame holds its CEQ deck + grid. */
  frameId?: string | null;
  /** Skeleton-grid slots, in deal order (P4). Empty = no grid (free layout). */
  slots?: DeckSlot[];
  /** When true, `slots` are FRAME-LOCAL (relative to `frameId`'s top-left) and the
   *  members are reparented INTO the frame — the in-frame hook grid. The skeleton
   *  layer offsets these by the frame origin. Absent/false ⇒ slots are absolute
   *  (legacy free-canvas grid), rendered as-is. */
  slotsLocal?: boolean;
  /** Show ghosted skeletons for undealt slots (P4). Default true. */
  showSkeletons?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ---- Scene (serialized layout) ----
export interface SceneDoc {
  id?: string;
  name: string;
  chapter_id?: string | null;
  nodes: CardNode[];
  zones: ZoneBox[];
  viewport: { x: number; y: number; zoom: number };
  waypoints?: unknown; // reserved for v1.1 student map — unused now
  // "flat" | "grid" | "video|<file>|<opacity 0-100>" — see decodeBg in the canvas route
  bg?: string;
  /** NAMED DECKS (P3): the scene's deck definitions. Membership is per-card via
   *  data.deckId; the deck library (canvas_decks) makes them reusable across scenes. */
  decks?: DeckDef[];
}

let _seq = 0;
export function cardId(kind: string): string {
  _seq += 1;
  return `${kind}-${Date.now().toString(36)}-${_seq}`;
}
