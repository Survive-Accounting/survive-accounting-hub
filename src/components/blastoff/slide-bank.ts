// THE SLIDE BANK — a shelf of slides to come back to. Pure, plus the browser storage it lives in.
//
// Lee (2026-09-11): "Let me CTRL X or CTRL C a slide and paste it in a bank. This could just be
// like a copy/paste field in the top right above the spine. I can click into this bank to access a
// slide I may want to return to later."
//
// Ctrl+C and Ctrl+X in the Editor put the selected slides here as well as on the clipboard; the
// shelf (SlideBank.tsx) lists them newest first, and a click pastes one back after the selected
// slide. It is KEPT IN THIS BROWSER (localStorage), across sets — not in the set's saved plan, so it
// never races the plan's autosave; the cost is that the other machine has its own shelf.
//
// A SET CARD can only go back into its own set: it points at that set's card, and pasted anywhere
// else it would be "no longer in the set". Everything else — a callout, a slogan, a rubric, an
// outline — pastes into any set.
//
// Module-scope callables are function declarations (the render-path TDZ rule).
import type { BlastFrame } from "./plan";

export interface BankItem {
  /** `<setId>::<frameId>` — banking the same slide again refreshes it instead of stacking it. */
  id: string;
  setId: string;
  setName: string;
  /** What the slide is ("Memorize this", a card's summary label…) and a line of its words. */
  label: string;
  snippet: string;
  frame: BlastFrame;
  savedAt: string;
}

export type BankAdd = Omit<BankItem, "id" | "savedAt">;

export const BANK_KEY = "sa-slide-bank";
export const BANK_MAX = 40;
/** Fired on every save, so every shelf on the page re-reads. */
export const BANK_EVENT = "sa-slide-bank-change";

export function bankItemId(setId: string, frameId: string): string {
  return `${setId}::${frameId}`;
}

/** New slides on top; one already banked moves to the top, refreshed; the shelf keeps BANK_MAX. */
export function addToBank(items: readonly BankItem[], adds: readonly BankAdd[], now = new Date()): BankItem[] {
  const fresh: BankItem[] = adds.map((a) => ({ ...a, frame: { ...a.frame, skipped: undefined }, id: bankItemId(a.setId, a.frame.id), savedAt: now.toISOString() }));
  const ids = new Set(fresh.map((f) => f.id));
  return [...fresh, ...items.filter((it) => !ids.has(it.id))].slice(0, BANK_MAX);
}

export function removeFromBank(items: readonly BankItem[], id: string): BankItem[] {
  return items.filter((it) => it.id !== id);
}

/** Why this slide can't be pasted into this set, or null when it can. */
export function pasteBlocker(item: BankItem, setId: string): string | null {
  if (item.frame.kind === "ceq" && item.setId !== setId) return `A set card from "${item.setName}" can only go back into that set.`;
  return null;
}

function isItem(v: unknown): v is BankItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const f = o.frame as Record<string, unknown> | undefined;
  return typeof o.id === "string" && typeof o.setId === "string" && !!f && typeof f.id === "string" && typeof f.kind === "string";
}

/** The shelf as stored, or empty when there is none (or storage is off). */
export function loadBank(): BankItem[] {
  try {
    const raw = window.localStorage.getItem(BANK_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter(isItem) : [];
  } catch { return []; }
}

/** Store the shelf and tell every shelf on the page. False when the browser won't store it. */
export function saveBank(items: readonly BankItem[]): boolean {
  try {
    window.localStorage.setItem(BANK_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(BANK_EVENT));
    return true;
  } catch { return false; }
}
