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
  | "heading";

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
}

// ---- JE ----
export interface JeLine {
  id: string;
  account: string;
  dr: number | null;
  cr: number | null;
  /** Explicit column; legacy lines derive it from which amount is set (see sideOf). */
  side?: "dr" | "cr";
  /** The line's MEMO (lightbulb). Same field the scenario docs populate. */
  label?: string;
  hidden?: boolean; // stepper hide
  /** Alternate wrong version + one feedback sentence (distractor flip). */
  trap?: { account?: string; dr?: number | null; cr?: number | null; feedback: string };
  flipped?: boolean; // showing the trap version
}
export interface JeCard extends CardBase {
  kind: "je";
  /** The transaction description — IS the card header. */
  caption: string;
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
  /** Display text; a trailing "[sub]" renders as a smaller bracketed sub-label. */
  text: string;
  level: 1 | 2; // H1 ~48px / H2 ~28px at zoom 1
}

// ---- List (reveal list: 5 account types, the accounting cycle, …) ----
export interface ListRow {
  id: string;
  text: string;
  /** Optional debit/credit chip (the debit-credit-rubric video re-uses the same cards). */
  chip?: "DR" | "CR";
  hidden?: boolean; // stepper hide
}
export interface ListCard extends CardBase {
  kind: "list";
  /** One-word/one-line definition under the title. */
  definition?: string;
  rows: ListRow[];
  /** Chips off by default; toggled per card. */
  showChips: boolean;
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
  | HeadingCard;

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
  /** One lesson per region is HOME: welcome heading, intro video, Ask Lee, nav.
   *  Renders a home badge + a placeholder menu slot (nav menu = roadmap). */
  home?: boolean;
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
}

let _seq = 0;
export function cardId(kind: string): string {
  _seq += 1;
  return `${kind}-${Date.now().toString(36)}-${_seq}`;
}
