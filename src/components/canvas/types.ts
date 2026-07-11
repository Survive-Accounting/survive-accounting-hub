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
  | "image";

/** Shared across every card, merged into node.data. */
export interface CardBase {
  kind: CardKind;
  title?: string; // header label; falls back to a per-kind default
  minimized?: boolean; // collapsed to the bottom tray
  /** Backstage: invisible on canvas, listed in the left rail, summoned in order. */
  staged?: boolean;
  /** Rail position (lower = earlier in the show). Set on stage; reordered in the rail. */
  stageOrder?: number;
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
  lines: JeLine[];
  accountBank?: string[]; // autocomplete pool (unioned with the COA)
  /** Legacy reveal flag; per-card settings.showAmounts wins when present. */
  showAmounts: boolean;
  showLabels: boolean; // legacy labels column (superseded by lightbulbs)
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
  body: string;
  color: number; // index into NOTE_COLORS
}

// ---- Video ----
export interface VideoCard extends CardBase {
  kind: "video";
  playbackId: string;
}

// ---- Image (pasted/uploaded picture, stored in the canvas-media bucket) ----
export interface ImageCard extends CardBase {
  kind: "image";
  url: string; // empty until uploaded/linked
  fit: "cover" | "contain";
  caption?: string;
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
  | ImageCard;

export type CardNode = Node<CardData & Record<string, unknown>>;

// ---- Zones (labeled translucent group boxes) ----
export interface ZoneBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
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
