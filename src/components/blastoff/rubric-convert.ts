// THE A = L + E CARDS AS RUBRIC SLIDES. Lee (2026-09-11): "For all the A = L + E ones, I think
// we don't do the MCQ version. We just have transaction where it says 'Transaction'. Same
// skin/UI we see for MCQ, but only the transaction, and we'll play with the rubric to get the
// answer." And: "shorten the question stems for A = L + E … Let's do: Lee invests $10K cash into
// Survive Co in exchange for common stock. Effect on A = L + E?" — with "Effect on A = L + E"
// moved above the rubric (the slide's heading), so the transaction is the sentence alone.
//
// Pure. The convert never deletes a card: the set owns its cards (reconcile would put a removed
// one straight back), so the MCQ slide is SKIPPED — greyed in the spine, walked past on film —
// and the rubric slide goes in right after it carrying the card's id (ceqId), so the question
// counter still counts it and it stays traceable. A cut after the MCQ moves to the rubric slide
// so the split still ends where it did; Lee's teleprompter lines come across as a copy. The BANK
// card is untouched: the shortened wording lives on the slide, not in what students practise.
//
// The arrows are read from the card's correct answer ("Assets ↑ and Equity ↑", "One asset ↑ and
// another asset ↓", "No part of the equation changes" → NE), so space reveals the answer; an
// answer that doesn't read leaves the boxes blank for Lee to fill.
//
// Module-scope callables are function declarations (the render-path TDZ rule).
import { newFrameId, type BlastFrame } from "./plan";
import { RUBRIC_HEADING, RUBRIC_KEYS, emptyArrows, type RubricArrow, type RubricArrows, type RubricKey, type RubricSpec } from "./rubric";

export interface AleCard {
  id: string;
  stem: string;
  noteOnly?: boolean;
  choices: readonly { text: string; correct?: boolean }[];
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** An A = L + E question: its stem asks about the equation. */
export function isAleStem(stem: string): boolean {
  return /A\s*=\s*L\s*\+\s*E/i.test(stem);
}

/** The stem's sentences, each keeping its end punctuation. */
function sentences(s: string): string[] {
  return (norm(s).match(/[^.?!]+[.?!]+|[^.?!]+$/g) ?? []).map((x) => x.trim()).filter(Boolean);
}

/** $10,000 → $10K — whole thousands only, so $1,500 and $800 read as they are. */
export function shortMoney(s: string): string {
  return s.replace(/\$(\d{1,3}(?:,\d{3})+|\d+)(?!\d)/g, (m: string, digits: string) => {
    const n = Number(digits.replace(/,/g, ""));
    return n >= 1000 && n % 1000 === 0 ? `$${n / 1000}K` : m;
  });
}

/** The transaction from a card's stem: the sentences asking about the equation go (the slide
 *  asks that above the boxes), and so does a "From X's perspective" lead-in; money shortens. */
export function shortTransaction(stem: string): string {
  const all = sentences(stem);
  const keep = all.filter((s) => !isAleStem(s) && !/^from .+?'s perspective\b/i.test(s));
  return shortMoney((keep.length ? keep : all).join(" "));
}

/** The heading over the boxes: the question's own qualifier when it matters ("immediate"). */
export function headingFor(stem: string): string {
  const q = sentences(stem).find((s) => isAleStem(s)) ?? "";
  return /\bimmediate\b/i.test(q) ? "Immediate effect on A = L + E?" : RUBRIC_HEADING;
}

/** The first dollar amount in the stem, as a number (0 when there is none). */
export function amountOf(stem: string): number {
  const m = stem.match(/\$(\d{1,3}(?:,\d{3})+|\d+)(?!\d)/);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

/** Which box a word names. */
function keyOf(word: string): RubricKey | null {
  if (/^assets?$/.test(word)) return "A";
  if (/^liabilit(?:y|ies)$/.test(word)) return "L";
  if (/^equity$/.test(word)) return "E";
  if (/^revenues?$/.test(word)) return "Rev";
  if (/^expenses?$/.test(word)) return "Exp";
  return null;
}

/** The arrows an answer choice describes, or null when it doesn't read as one. */
export function arrowsFromAnswer(text: string): RubricArrows | null {
  const t = norm(text).toLowerCase();
  const out = emptyArrows();
  if (/\bno (?:part|effect|change)\b|nothing changes/.test(t)) {
    out.A = ["ne"]; out.L = ["ne"]; out.E = ["ne"];
    return out;
  }
  for (const m of t.matchAll(/\b(assets?|liabilit(?:y|ies)|equity|revenues?|expenses?)\s*(↑|↓)/g)) {
    const key = keyOf(m[1]);
    if (!key) continue;
    const d: RubricArrow = m[2] === "↑" ? "up" : "down";
    if (!out[key].includes(d)) out[key] = [...out[key], d];
  }
  return RUBRIC_KEYS.some((k) => out[k].length) ? out : null;
}

/** The rubric a card becomes. */
export function rubricFromCard(card: AleCard): RubricSpec {
  const correct = card.choices.find((c) => c.correct)?.text ?? "";
  return {
    mode: "ale",
    text: shortTransaction(card.stem),
    amount: amountOf(card.stem),
    arrows: arrowsFromAnswer(correct) ?? emptyArrows(),
    show: "arrows",
    equityEffect: false,
  };
}

/** The slides a convert would turn: live (not skipped) set-card slides whose card is an A = L + E
 *  question and has no rubric slide yet. Idempotent by construction. */
export function aleCandidates(frames: readonly BlastFrame[], cards: readonly AleCard[]): BlastFrame[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const done = new Set(frames.filter((f) => f.kind === "rubric" && f.ceqId).map((f) => f.ceqId as string));
  return frames.filter((f) => {
    if (f.kind !== "ceq" || f.skipped || !f.ceqId || done.has(f.ceqId)) return false;
    const c = byId.get(f.ceqId);
    return !!c && !c.noteOnly && isAleStem(c.stem);
  });
}

export interface AleConvert { frames: BlastFrame[]; converted: string[]; newIds: string[] }

/** Turn the candidates (or only `onlyFrameId`) into rubric slides: skip the MCQ, insert the
 *  rubric right after it. */
export function convertAleCards(frames: readonly BlastFrame[], cards: readonly AleCard[], onlyFrameId?: string): AleConvert {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const targets = new Set(aleCandidates(frames, cards).filter((f) => !onlyFrameId || f.id === onlyFrameId).map((f) => f.id));
  const out: BlastFrame[] = [];
  const converted: string[] = [];
  const newIds: string[] = [];
  for (const f of frames) {
    if (!targets.has(f.id)) { out.push(f); continue; }
    const card = byId.get(f.ceqId as string) as AleCard;
    const heading = headingFor(card.stem);
    const r: BlastFrame = {
      id: newFrameId("rubric"),
      kind: "rubric",
      ceqId: f.ceqId,
      rubric: rubricFromCard(card),
      ...(heading !== RUBRIC_HEADING ? { title: heading } : {}),
      ...(f.prompter ? { prompter: [...f.prompter] } : {}),
      ...(f.prompterKeys ? { prompterKeys: [...f.prompterKeys] } : {}),
      ...(f.prompterTransition ? { prompterTransition: f.prompterTransition } : {}),
      ...(f.prompterMarks ? { prompterMarks: { ...f.prompterMarks } } : {}),
      ...(f.cutAfter ? { cutAfter: true as const } : {}),
    };
    const { cutAfter: _cut, ...rest } = f;
    out.push({ ...rest, skipped: true }, r);
    converted.push(f.id);
    newIds.push(r.id);
  }
  return { frames: out, converted, newIds };
}
