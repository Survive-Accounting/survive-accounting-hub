// Named-deck (P3) pure helpers — DeckDef list CRUD + membership, no React/RF.
// A DeckDef is a first-class deck object (see types.ts); cards/memos join via
// data.deckId. Mirrors the canvas_decks table (migration 0090).
import { cardId, type DeckDef, type DeckPayloadType, type DeckRunMode } from "./types";

export function newDeckDef(name: string, payloadType: DeckPayloadType = "cards"): DeckDef {
  const now = new Date().toISOString();
  return {
    id: cardId("deck"),
    name: name.trim() || (payloadType === "memos" ? "Memo deck" : "New deck"),
    payloadType,
    filter: null,
    runMode: "sequence",
    lessonId: null,
    slots: [],
    showSkeletons: true,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (d: DeckDef): DeckDef => ({ ...d, updatedAt: new Date().toISOString() });

export function addDeck(defs: DeckDef[], deck: DeckDef): DeckDef[] {
  return [...defs, deck];
}

export function updateDeck(defs: DeckDef[], id: string, patch: Partial<DeckDef>): DeckDef[] {
  return defs.map((d) => (d.id === id ? touch({ ...d, ...patch }) : d));
}

export function removeDeck(defs: DeckDef[], id: string): DeckDef[] {
  return defs.filter((d) => d.id !== id);
}

/** Duplicate a deck definition (fresh id, "· copy" name). Membership does NOT
 *  clone — the copy starts empty; the caller re-homes items if desired. */
export function duplicateDeck(defs: DeckDef[], id: string): { defs: DeckDef[]; newId: string | null } {
  const src = defs.find((d) => d.id === id);
  if (!src) return { defs, newId: null };
  const now = new Date().toISOString();
  const copy: DeckDef = { ...src, id: cardId("deck"), name: `${src.name} · copy`, slots: [...(src.slots ?? [])], createdAt: now, updatedAt: now };
  return { defs: [...defs, copy], newId: copy.id };
}

/** The nodes belonging to a named deck, in deal (stageOrder) order. */
export function deckMembersOf<T extends { data?: { deckId?: string; stageOrder?: number } }>(nodes: T[], deckId: string): T[] {
  return nodes
    .filter((n) => n.data?.deckId === deckId)
    .sort((a, b) => (a.data?.stageOrder ?? 0) - (b.data?.stageOrder ?? 0));
}

export function deckById(defs: DeckDef[] | undefined, id: string | undefined | null): DeckDef | undefined {
  if (!id || !defs) return undefined;
  return defs.find((d) => d.id === id);
}

export const DECK_RUN_MODES: DeckRunMode[] = ["sequence", "shuffle"];

// ---- skeleton grid (P4) -----------------------------------------------------
export interface GridOpts {
  originX: number;
  originY: number;
  cols?: number;
  cellW?: number;
  cellH?: number;
  gapX?: number;
  gapY?: number;
}

/** A near-square grid of `count` slot positions in reading order (row-major).
 *  Deterministic — the deck deals items into these fixed spots, and undealt
 *  slots show a skeleton. Pure so the layout is unit-testable. */
export function gridSlots(count: number, opts: GridOpts): { x: number; y: number }[] {
  if (count <= 0) return [];
  const cols = Math.max(1, opts.cols ?? Math.ceil(Math.sqrt(count)));
  const cellW = opts.cellW ?? 320;
  const cellH = opts.cellH ?? 200;
  const gapX = opts.gapX ?? 40;
  const gapY = opts.gapY ?? 40;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    out.push({ x: opts.originX + c * (cellW + gapX), y: opts.originY + r * (cellH + gapY) });
  }
  return out;
}

/** Fisher–Yates shuffle of [0..n) with an injectable RNG (deterministic tests). */
export function shuffledOrder(n: number, rnd: () => number = Math.random): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
