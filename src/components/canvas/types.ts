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
  | "memo"
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
  formula: "card",
  heading: "element",
  text: "element",
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
  /** LEGACY (schema_version 1): both meant "in deck + hidden". Migrated to
   *  deckMember+tucked on load; never written by new saves. */
  minimized?: boolean;
  staged?: boolean;
  /** Deck position (lower = dealt earlier). Set on joining; reordered in the panel. */
  stageOrder?: number;
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
  editMode?: boolean; // whole-card edit affordances on
  w?: number; // resize width/height (px), applied to the shell
  h?: number;
  /** NAMED DECK membership (P3): the id of the DeckDef this card/memo belongs to.
   *  Absent = not in any named deck (the legacy lesson-grouped roster still uses
   *  deckMember/deckLessonId). A named-deck member is also a deckMember. */
  deckId?: string;
  /** Assigned skeleton-grid slot index within its named deck (P4). */
  slotIndex?: number;
}

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
export interface CeqChoice { id: string; text: string; correct?: boolean; feedback?: string }
export interface CeqCard extends CardBase {
  kind: "ceq";
  prompt: string;
  choices: CeqChoice[];
  revealedAnswer?: boolean;
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
export interface LegendCard extends CardBase {
  kind: "legend";
  name: string;
  year: string; // gold chip next to the name ("1494")
  imageUrl: string; // portrait window (canvas-media)
  typeLine: string; // "Legend · Father of accounting"
  facts: string[]; // 1–3 fact lines in the cream rules box
  flavor: string; // italic flavor line
  setLabel: string; // footer ("Legends · 001")
  cornerChip: string; // editable corner stat (default "DR = CR")
}

// ---- Formula (horizontal chain: [Beginning inv] + [Purchases] = [Goods avail] …) ----
export interface FormulaSegment {
  id: string;
  label: string; // "Beginning inventory"
  value: string; // shown bold; "" renders the ??? placeholder
  hidden?: boolean; // stepper reveal
}
export interface FormulaCard extends CardBase {
  kind: "formula";
  segments: FormulaSegment[];
  /** One operator between each pair of segments (length = segments.length - 1). */
  operators: string[];
}

// ---- Heading (big display text: section titles on the whiteboard) ----
export interface HeadingCard extends CardBase {
  kind: "heading";
  /** Display text; a trailing "[sub]" renders as a smaller bracketed sub-label.
   *  Supports template tokens: {first_name} {university} {professor}
   *  {course_code} {exam_date} — stored raw, rendered substituted. */
  text: string;
  level: 1 | 2; // H1 ~48px / H2 ~28px at zoom 1
}

// ---- Text element (freeform markdown-lite block; ELEMENT category) ----
export interface TextElement extends CardBase {
  kind: "text";
  /** Raw text with markdown-lite (**bold**, *italic*, "- " bullets, line
   *  breaks) and template tokens (stored raw, rendered substituted). */
  body: string;
  color: number; // index into NOTE_COLORS accents
}

// ---- Gate elements (VISUAL PLACEHOLDERS — real gating is World v1) ----
export interface GateElement extends CardBase {
  kind: "paygate" | "signupgate";
  label: string; // editable banner text
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
}
export interface ListCard extends CardBase {
  kind: "list";
  /** One-word/one-line definition under the title. */
  definition?: string;
  rows: ListRow[];
  /** Chips off by default (Foundations teaches the 5 types before DR/CR). */
  showChips: boolean;
  /** NUMBERED (default) vs BULLETED rows (P2). */
  bulleted?: boolean;
  /** LIVE COA PULL (P2): bind to one of the 5 account-type GROUPS (Assets, …)
   *  of the scene's course — rows auto-populate from that COA set, live, and
   *  precede any manual teaching rows. null/absent = manual only. */
  coaGroup?: string | null;
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
  | MemoCard
  | GateElement
  | BridgeCard;

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
  // NOTE: the old per-lesson `home` flag was dropped (L3) — Home is now just the
  // top outline entry + a Home element (welcome heading + Ask Lee) in the region.
}

// ---- Frames (the SHOT tier: WORLD › REGION › LESSON › FRAME › CARD) ----
// A FRAME is one screen / one shot / one sitting — a bounded 16:9 stage inside a
// lesson holding cards (parented, like a lesson holds cards). A lesson is an
// ORDERED LIST OF FRAMES; the beat is a TAG on a frame, not a container.
export type FrameBeat = "hook" | "teach" | "model_practice" | "check" | "none";
export interface FrameBox {
  title?: string;
  /** 16:9 aspect-locked (h = round(w * 9 / 16)). */
  w: number;
  h: number;
  beat?: FrameBeat;
  /** Position within its lesson's frame list (1, 2, 3…). */
  order?: number | null;
}
/** Frame default size — legible at 1080p (cards ~300px read clearly inside). */
export const FRAME_W = 1120;
export const FRAME_H = 630; // 16:9

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
  /** Skeleton-grid slots, in deal order (P4). Empty = no grid (free layout). */
  slots?: DeckSlot[];
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
