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
  | "video";

/** Shared across every card, merged into node.data. */
export interface CardBase {
  kind: CardKind;
  title?: string; // header label; falls back to a per-kind default
  minimized?: boolean; // collapsed to the bottom tray
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
  label?: string;
  hidden?: boolean; // stepper hide
  /** Alternate wrong version + one feedback sentence (distractor flip). */
  trap?: { account?: string; dr?: number | null; cr?: number | null; feedback: string };
  flipped?: boolean; // showing the trap version
}
export interface JeCard extends CardBase {
  kind: "je";
  caption: string;
  lines: JeLine[];
  accountBank?: string[]; // autocomplete pool
  showAmounts: boolean;
  showLabels: boolean;
}

// ---- Schedule (generic table engine + presets) ----
export type SchedulePreset = "generic" | "amortization" | "depreciation" | "fifo" | "bankrec";
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

export type CardData =
  | JeCard
  | ScheduleCard
  | ComputationCard
  | TAccountCard
  | CeqCard
  | MemorizeCard
  | NoteCard
  | VideoCard;

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
  bg?: BgMode;
}

export type BgMode = "flat" | "grid" | "video";

let _seq = 0;
export function cardId(kind: string): string {
  _seq += 1;
  return `${kind}-${Date.now().toString(36)}-${_seq}`;
}
