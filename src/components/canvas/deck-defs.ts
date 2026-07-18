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

// ---- START HERE seed (item 5) ----------------------------------------------
// Lee's authoring roadmap as EMPTY named decks: per chapter a teaching deck + a
// Check deck (attached to that chapter's lesson), a Ch 3 normal-balance drill,
// and 4 category-filtered memo decks. He fills them as he authors — no card
// content is generated here. Idempotent: seeding twice adds nothing new.
export const START_HERE_CHAPTERS = [
  "A=L+E", "The Cycle", "Accounts & DR/CR", "Journal Entries", "Receivables & Posting",
  "Trial Balance", "Adjusting Entries", "Financial Statements", "Closing Entries", "Principles", "Wrap-up",
] as const;

/** filter value marking the normal-balance drill deck (item 6 generate hook). */
export const NORMAL_BALANCE_DRILL_FILTER = "drill:normal-balance";

/** The 4 memo decks: name → the memo CATEGORY tag they auto-collect (item 5). */
export const START_HERE_MEMO_DECKS: { name: string; category: string }[] = [
  { name: "Cheat Codes", category: "CHEAT CODES" },
  { name: "Exam Traps", category: "EXAM TRAPS" },
  { name: "Steps", category: "STEPS" },
  { name: "Other Tips", category: "OTHER TIPS" },
];

export interface SeedLesson { id: string; label: string }
/** A course chapter as the seed sees it (item 6 — derived from the live course,
 *  not hardcoded). `number` may be null for untidied chapters. */
export interface SeedChapter { number: number | null; name: string }

/** The chapters the seed builds decks for: the course's REAL chapters when a
 *  course is loaded, else the Foundations fallback list (Start Here offline). */
export function seedChapters(courseChapters: SeedChapter[] | null | undefined): SeedChapter[] {
  if (courseChapters && courseChapters.length > 0) return courseChapters;
  return START_HERE_CHAPTERS.map((name, i) => ({ number: i + 1, name }));
}

/** The lesson id for chapter N: match a lesson whose label carries "Ch N" / a
 *  leading number N, else one containing the chapter's short name. Null = no
 *  match (the deck is still created, just unattached). */
export function matchLessonForChapter(lessons: SeedLesson[], n: number, short: string): string | null {
  const byNum = lessons.find((l) => {
    const m = /(?:ch(?:apter)?\.?\s*|^\s*)(\d+)/i.exec(l.label);
    return m ? Number(m[1]) === n : false;
  });
  if (byNum) return byNum.id;
  const s = short.toLowerCase();
  return lessons.find((l) => l.label.toLowerCase().includes(s))?.id ?? null;
}

/** The chapter that should carry the normal-balance drill: the one whose name
 *  covers accounts / debits & credits, else null (drill goes loose). */
export function drillChapterNumber(chapters: SeedChapter[]): number | null {
  // whole-word so "Accounting" (the discipline) doesn't false-match the accounts chapter
  const hit = chapters.find((c) => /\baccounts\b|\bdebits?\b|\bcredits?\b|normal balance|dr\s*\/\s*cr/i.test(c.name));
  return hit?.number ?? null;
}

/** Build the empty Start Here decks that don't already exist (by name), derived
 *  from the course's REAL chapters (item 6 — no longer a hardcoded list; pass
 *  seedChapters(courseChapters) which falls back to Foundations offline). Returns
 *  the new defs + how many attached to a lesson vs left loose. */
export function seedStartHereDecks(existing: DeckDef[], chapters: SeedChapter[], lessons: SeedLesson[]): { toAdd: DeckDef[]; attached: number; unattached: string[] } {
  const have = new Set(existing.map((d) => d.name.trim().toLowerCase()));
  const toAdd: DeckDef[] = [];
  let attached = 0;
  const unattached: string[] = [];
  const mk = (name: string, patch: Partial<DeckDef>): void => {
    if (have.has(name.trim().toLowerCase())) return; // idempotent
    const base = newDeckDef(name, patch.payloadType ?? "cards");
    toAdd.push({ ...base, ...patch, name });
    have.add(name.trim().toLowerCase());
  };
  const drillN = drillChapterNumber(chapters);
  chapters.forEach((c, i) => {
    const n = c.number ?? i + 1;
    // "#N", never "Ch N": lessons are numbered by OUR order, not a textbook chapter
    // (students use different books) — see [[chapter-vocab-canvas]].
    const label = `#${n}`;
    const lessonId = matchLessonForChapter(lessons, n, c.name);
    if (lessonId) attached++; else unattached.push(label);
    mk(`${label} · ${c.name}`, { lessonId });
    mk(`${label} · Check`, { lessonId });
    if (n === drillN) mk(`${label} · Normal Balances`, { lessonId, runMode: "shuffle", filter: NORMAL_BALANCE_DRILL_FILTER });
  });
  // no chapter matched the accounts/DR-CR heuristic → still offer the drill, loose
  if (drillN === null) mk("Normal Balances", { lessonId: null, runMode: "shuffle", filter: NORMAL_BALANCE_DRILL_FILTER });
  for (const md of START_HERE_MEMO_DECKS) mk(md.name, { payloadType: "memos", filter: md.category, lessonId: null });
  return { toAdd, attached, unattached };
}

/** NORMAL-BALANCE DRILL (item 6) — one DR/CR question per account, correct side
 *  derived from the COA. A CEQ VARIANT (prompt + 2 choices + reveal) — no new card
 *  kind needed. Returns the per-account CEQ payloads; the caller wraps each into a
 *  tucked ceq node joined to the drill deck. */
export function normalBalanceCeqData(
  accounts: { name: string; normal: "debit" | "credit" }[],
  mkId: () => string,
): { prompt: string; choices: { id: string; text: string; correct: boolean }[] }[] {
  return accounts.map((a) => ({
    prompt: `Normal balance of ${a.name}?`,
    choices: [
      { id: mkId(), text: "Debit", correct: a.normal === "debit" },
      { id: mkId(), text: "Credit", correct: a.normal === "credit" },
    ],
  }));
}

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
