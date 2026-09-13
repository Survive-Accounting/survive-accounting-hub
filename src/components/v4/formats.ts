// QUESTION FORMATS (v4) — the card design that doesn't assume multiple choice.
//
// Lee, 2026-09-13: "I want more than multiple choice. The first one is 'select all that apply' (e.g.
// pick the current assets from a list full of tricky distractors), and later ones could be sorting
// into buckets and matching. For now, the card design just shouldn't assume multiple choice, so these
// formats can be added without redoing everything."
//
// A card's `format` names one of these; absent = multiple choice, so every existing card is already
// valid. Everything v4 does with a question — the editor, the completeness check, what the AI is told
// to write — asks the registry, never the choices directly. Buckets and matching add an entry here
// (plus their own fields) without touching the rest.
//
// Pure: no React, no network.

export const QUESTION_FORMATS = ["mc", "select_all"] as const;
export type QuestionFormat = (typeof QUESTION_FORMATS)[number];

export interface Choice { text: string; correct: boolean; feedback?: string | null }

/** What the registry needs to know about a card. */
export interface FormatCard { format?: string | null; stem: string; choices: readonly Choice[] }

export interface FormatSpec {
  id: QuestionFormat;
  label: string;
  /** One word the editor and the list use. */
  short: string;
  /** Pick one (radio) or pick many (checkboxes) when marking the answer. */
  multiCorrect: boolean;
  /** What's wrong with a card before it can go live — empty = ready. */
  problems: (card: FormatCard) => string[];
  /** What the AI is told this format is, in one line. */
  aiLine: string;
}

function baseProblems(card: FormatCard): string[] {
  const out: string[] = [];
  if (!card.stem.trim()) out.push("The question has no words.");
  const filled = card.choices.filter((c) => c.text.trim());
  if (filled.length < 2) out.push("It needs at least two answer choices.");
  const seen = new Set<string>();
  for (const c of filled) { const k = c.text.trim().toLowerCase(); if (seen.has(k)) { out.push(`"${c.text.trim()}" is listed twice.`); break; } seen.add(k); }
  return out;
}

export const FORMATS: Record<QuestionFormat, FormatSpec> = {
  mc: {
    id: "mc", label: "Multiple choice", short: "MC", multiCorrect: false,
    aiLine: "mc — one correct answer among 3-5 choices",
    problems: (card) => {
      const out = baseProblems(card);
      const correct = card.choices.filter((c) => c.text.trim() && c.correct).length;
      if (correct !== 1) out.push(correct === 0 ? "Mark the correct answer." : "Multiple choice has exactly one correct answer — switch to Select all, or unmark the extras.");
      return out;
    },
  },
  select_all: {
    id: "select_all", label: "Select all that apply", short: "Select all", multiCorrect: true,
    aiLine: "select_all — \"select all that apply\": 4-8 choices, at least 2 correct and at least 1 tricky wrong one",
    problems: (card) => {
      const out = baseProblems(card);
      const filled = card.choices.filter((c) => c.text.trim());
      const correct = filled.filter((c) => c.correct).length;
      if (correct < 2) out.push("Select all needs at least two correct answers.");
      if (filled.length - correct < 1) out.push("Select all needs at least one wrong answer to catch the guessers.");
      return out;
    },
  },
};

/** The card's format — anything unknown reads as multiple choice, never as a crash. */
export function formatOf(card: Pick<FormatCard, "format">): FormatSpec {
  return card.format && (QUESTION_FORMATS as readonly string[]).includes(card.format) ? FORMATS[card.format as QuestionFormat] : FORMATS.mc;
}

export const cardProblems = (card: FormatCard): string[] => formatOf(card).problems(card);

/** Switching format keeps every choice; going to MC keeps only the first correct mark. */
export function switchFormat(choices: readonly Choice[], to: QuestionFormat): Choice[] {
  if (FORMATS[to].multiCorrect) return choices.map((c) => ({ ...c }));
  let kept = false;
  return choices.map((c) => { if (c.correct && !kept) { kept = true; return { ...c }; } return { ...c, correct: false }; });
}

/** Marking a choice correct, the format's way: MC moves the mark, Select all toggles it. */
export function markCorrect(choices: readonly Choice[], index: number, format: QuestionFormat): Choice[] {
  if (FORMATS[format].multiCorrect) return choices.map((c, i) => (i === index ? { ...c, correct: !c.correct } : c));
  return choices.map((c, i) => ({ ...c, correct: i === index }));
}
