// THE BONUS TAB and THE INTERACTIVE RUBRIC — pure rules, no React, no DOM.
//
// Lee (2026-09-16, the student-flow wireframes): a set screen with Watch · Practice · Bonus, where Bonus is a
// third tab "only for sets that have it; Know Your Accounts will, A = L + E will, new sets won't until you add
// something." The bonus is derived from what is already in the set's film plan, never authored twice:
//   · "ale"   — the set has rubric slides: every transaction, arrows only ("no dollar amounts"), to memorize.
//   · "types" — the set is the Know Your Accounts kind (a Types of Accounts slide, or a bank of "What type of
//               account is X?" questions): the five types, every account, every cheat code lit.
// And the practice questions that have a rubric slide are answered ON the rubric — tap the arrows, no numbers
// to type — graded at the end (learn-bonus's rubricMatches).
//
// Locked until 80% on the whole set's practice (lib/practice-score.ts passed()). Nothing here reads storage.
import type { RubricArrow, RubricArrows, RubricKey } from "@/components/blastoff/rubric";

export type BonusKind = "ale" | "types";

/** The least of a plan frame these rules read. */
export interface BonusFrame {
  id: string;
  kind: string;
  skipped?: boolean;
  ceqId?: string;
  rubric?: { mode?: string; text?: string; amount?: number; arrows?: Partial<Record<RubricKey, RubricArrow[]>> };
  types?: unknown;
}

/** A rubric question's key, or one transaction of the ALE bonus. */
export interface RubricKeyData { text: string; amount: number; arrows: RubricArrows }

const KEYS: readonly RubricKey[] = ["A", "L", "E", "Rev", "Exp"];
export function fullArrows(a: Partial<Record<RubricKey, RubricArrow[]>> | undefined): RubricArrows {
  return { A: [...(a?.A ?? [])], L: [...(a?.L ?? [])], E: [...(a?.E ?? [])], Rev: [...(a?.Rev ?? [])], Exp: [...(a?.Exp ?? [])] };
}
function hasAny(a: RubricArrows): boolean { return KEYS.some((k) => a[k].length > 0); }

/** The kind of "what type of account is X?" question a Know Your Accounts bank is made of. */
const TYPE_Q = /what\s+type\s+of\s+account/i;
const TYPE_Q_MIN = 5;

/** What a set's bonus is, from its plan frames and its question stems. null = no bonus, no tab. */
export function bonusKindOf(frames: readonly BonusFrame[], prompts: readonly string[]): BonusKind | null {
  const live = frames.filter((f) => !f.skipped);
  if (live.some((f) => f.kind === "rubric" && (f.rubric?.mode ?? "ale") === "ale" && !!f.rubric?.text?.trim() && hasAny(fullArrows(f.rubric?.arrows)))) return "ale";
  if (live.some((f) => f.kind === "types")) return "types";
  if (prompts.filter((p) => TYPE_Q.test(p)).length >= TYPE_Q_MIN) return "types";
  return null;
}

/** "Lee invests $10K cash…" → "Lee invests cash…" — the bonus rows carry no amounts (Lee: "arrows only"). */
export function stripAmounts(text: string): string {
  return text
    .replace(/\$\s?[\d,]+(?:\.\d+)?\s?[kKmM]?\b\s*(?:worth\s+of\s+|of\s+)?/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/** EVERY TRANSACTION in the set, in plan order, once each (the same one filmed twice — a callback — is one
 *  row), arrows only. A frame with no words or no arrows is not a transaction. */
export function aleRowsOf(frames: readonly BonusFrame[]): { id: string; text: string; arrows: RubricArrows }[] {
  const seen = new Set<string>();
  const out: { id: string; text: string; arrows: RubricArrows }[] = [];
  for (const f of frames) {
    if (f.skipped || f.kind !== "rubric" || (f.rubric?.mode ?? "ale") !== "ale") continue;
    const text = stripAmounts(f.rubric?.text ?? "");
    const arrows = fullArrows(f.rubric?.arrows);
    if (!text || !hasAny(arrows)) continue;
    const k = text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: f.id, text, arrows });
  }
  return out;
}

/** THE KEY for a question: the rubric slide filmed for that card. Several slides can share a card (the Rev↑
 *  telling and the E↑ telling of the same sale); the one that shows the Rev / Exp flow is preferred, because
 *  that is the one that teaches "revenue up means equity up". null = the question is plain multiple choice. */
export function rubricForCeq(frames: readonly BonusFrame[], ceqId: string): RubricKeyData | null {
  const mine = frames.filter((f) => !f.skipped && f.kind === "rubric" && f.ceqId === ceqId && (f.rubric?.mode ?? "ale") === "ale" && !!f.rubric?.text?.trim());
  if (!mine.length) return null;
  const flow = mine.find((f) => { const a = fullArrows(f.rubric?.arrows); return a.Rev.length > 0 || a.Exp.length > 0; });
  const f = flow ?? mine[0];
  const arrows = fullArrows(f.rubric?.arrows);
  if (!hasAny(arrows)) return null;
  return { text: (f.rubric?.text ?? "").trim(), amount: Number(f.rubric?.amount ?? 0) || 0, arrows };
}

/** One box's state as a word: "" · up · down · both (↑↓ and NE are the same thing — no net effect). */
export type BoxState = "" | "up" | "down" | "both";
export function boxState(a: readonly RubricArrow[]): BoxState {
  if (a.includes("ne")) return "both";
  const up = a.includes("up"), down = a.includes("down");
  return up && down ? "both" : up ? "up" : down ? "down" : "";
}

/** EQUITY, ALL IN: E's own arrows when it has any; else what Rev and Exp do to it (Rev↑ → E↑, Exp↑ → E↓,
 *  Rev↓ → E↓, Exp↓ → E↑; both ways at once → both). So "Rev ↑" and "E ↑" grade the same, which is the point. */
export function equityEffect(a: RubricArrows): BoxState {
  const own = boxState(a.E);
  if (own) return own;
  const rev = boxState(a.Rev), exp = boxState(a.Exp);
  let up = false, down = false;
  if (rev === "up") up = true; else if (rev === "down") down = true; else if (rev === "both") { up = true; down = true; }
  if (exp === "up") down = true; else if (exp === "down") up = true; else if (exp === "both") { up = true; down = true; }
  return up && down ? "both" : up ? "up" : down ? "down" : "";
}

/** The three things an A = L + E answer must get right. */
export function effectiveOf(a: RubricArrows): { A: BoxState; L: BoxState; E: BoxState } {
  return { A: boxState(a.A), L: boxState(a.L), E: equityEffect(a) };
}

/** Right when assets, liabilities and the net effect on equity all agree with the key. */
export function rubricMatches(answer: RubricArrows, key: RubricArrows): boolean {
  const x = effectiveOf(answer), y = effectiveOf(key);
  return x.A === y.A && x.L === y.L && x.E === y.E;
}

/** Anything has been tapped. */
export function rubricTouched(a: RubricArrows): boolean { return hasAny(a); }

/** "A↑ E↑" · "A↑↓" · "A↑ Rev↑ (E↑)" — a row's movement in one breath. */
export function arrowsLine(a: RubricArrows): string {
  const glyph = (s: BoxState) => (s === "up" ? "↑" : s === "down" ? "↓" : s === "both" ? "↑↓" : "");
  const parts: string[] = [];
  const A = boxState(a.A), L = boxState(a.L), E = boxState(a.E), Rev = boxState(a.Rev), Exp = boxState(a.Exp);
  if (A) parts.push(`A${glyph(A)}`);
  if (L) parts.push(`L${glyph(L)}`);
  if (E) parts.push(`E${glyph(E)}`);
  if (Rev) parts.push(`Rev${glyph(Rev)}`);
  if (Exp) parts.push(`Exp${glyph(Exp)}`);
  if (!E && (Rev || Exp)) { const d = equityEffect(a); if (d) parts.push(`(E${glyph(d)})`); }
  return parts.join(" ");
}

/** A CHEAT CODE on the Types of Accounts slide — Lee's convention on the slide itself: the word in quotes
 *  ("Receivables", "Prepaids", "Payables", "Unearned"), an "Anything …" rule, or the one he shouts (COST OF
 *  GOODS SOLD!). Gold on the bonus map; everything else is an account. */
export function isCheatCode(item: string): boolean {
  const s = item.trim();
  return /[“”"]/.test(s) || /^anything\b/i.test(s) || /!$/.test(s);
}

/** ≈ minutes for N questions at the pace a student actually answers these (about 16 s each). */
export function practiceMinutes(questions: number): number {
  return Math.max(1, Math.round((questions * 16) / 60));
}
