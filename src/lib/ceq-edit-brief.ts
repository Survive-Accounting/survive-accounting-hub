// THE CEQ EDIT BRIEF — "say the fix" (2026-09-07). Lee: "'Use your words' is the fundamental
// value we are building into survive accounting and survive studios… Wherever we can click,
// talk, get suggestions." The Booth has drafted a card edit off a spoken EDIT stamp since B2
// (talkthrough-pass.ts: buildMicroEditMessages / parseMicroEdit — his verbatim words are the
// spec, the model returns what changed, null for what didn't). This module is that brief's
// home for the rest of the line: the Review Editor's card fields and the review board's
// override card get a 🎙 Say the fix — he talks ("choice B should say lender, and the stem's
// too long"), the same brief runs, and the answer comes back as a FULL card (the parts he
// didn't mention echoed from the current one) with exactly one correct marked, shown as a
// diff. Apply stays a click: the bank is the highest-consequence field on the line (the
// audit, "USE-YOUR-WORDS-AUDIT.md" #4/#10).
//
// The stamp brief itself is NOT copied here — the queue (talkthrough-review.ts) and the pass's
// tests still own it in talkthrough-pass.ts; this module builds on it, and re-exports the
// Booth's two names so the Booth imports from one place (no behaviour change there). Pure: no
// React, no model call — the callers run the micro lane and log the price.
import {
  buildMicroEditMessages as buildStampEditMessages, parseMicroEdit,
  type MicroEditContext, type MicroEditProposal,
} from "@/components/canvas/talkthrough-pass";

export { parseMicroEdit, type MicroEditContext, type MicroEditProposal };
/** The Booth's name for the stamp brief — unchanged; it imports it from here since 2026-09-07. */
export const buildMicroEditMessages = buildStampEditMessages;

export interface CeqEditChoice { text: string; correct: boolean; feedback?: string | null }

export interface CeqEditRequest {
  /** The card as it stands — the fields as the editor shows them right now, not the bank's copy. */
  stem: string;
  choices: CeqEditChoice[];
  /** What Lee said should change, verbatim — a correction, a rewording, "make B the lender". */
  spoken: string;
  /** "Q7 · Unearned → earned" style label, for the brief's own reference. */
  label?: string;
  /** The Booth's stamp when there is one; a spoken fix from the editor has none → the model
   *  applies the words to whichever parts they name. */
  stamp?: MicroEditContext["stamp"];
  /** B7 style notes (styleNotesFor(doc, "memo")), one line each. */
  styleNotes?: readonly string[];
}

/** The Booth's brief, fed from the editor: the current words, the spoken fix, no stamp →
 *  "apply the instruction to whichever parts it names". One line more than the stamp brief:
 *  the fix may be partial, and a part he didn't mention must come back null (unchanged) rather
 *  than reworded for its own sake — the diff must show only what he asked for. */
export function buildCeqEditMessages(req: CeqEditRequest): { system: string; user: string } {
  const spoken = req.spoken.trim();
  const m = buildStampEditMessages({
    stamp: req.stamp ?? "edit_other",
    ceq: { id: "", label: req.label ?? "", stem: req.stem, choices: req.choices.map((c) => ({ text: c.text, correct: c.correct, ...(c.feedback ? { feedback: c.feedback } : {}) })) },
    instruction: spoken,
    styleNotes: [...(req.styleNotes ?? [])],
  });
  const system = req.stamp ? m.system : [
    m.system,
    "ONLY WHAT HE ASKED FOR: Lee said this out loud while looking at the card; treat it as the whole of the change. A part he didn't mention comes back null (unchanged) — never reword the stem because you were passed it, never re-letter the choices. If he names a choice by letter (\"B\", \"the second one\") or by its words, that is the one. If he says which one is right, mark exactly that one correct. Keep every number, date and term of art he didn't change.",
  ].join("\n\n");
  return { system, user: m.user };
}

/** The full card the diff shows: what the model changed, the rest echoed from `current`. */
export interface CeqEditResult {
  stem: string;
  choices: CeqEditChoice[];
  /** One line on what changed and why, the model's own. */
  note: string;
  stemChanged: boolean;
  choicesChanged: boolean;
}

/** The model's answer, defended against the card it edited: a stem it left null is the
 *  current one; choices it left null are the current ones; a returned list must hold at least
 *  two and EXACTLY one correct (parseMicroEdit refuses otherwise). A returned choice keeps the
 *  current feedback by position when the model sent none — the feedback lines aren't the fix's
 *  to lose. Null when nothing usable came back, or when the answer changed nothing at all (the
 *  caller says "didn't come back clean" and retries once). */
export function parseCeqEdit(text: string, current: Pick<CeqEditRequest, "stem" | "choices">): CeqEditResult | null {
  const p = parseMicroEdit(text);
  if (!p) return null;
  const stem = p.proposedStem ?? current.stem;
  const choices: CeqEditChoice[] = p.proposedChoices
    ? p.proposedChoices.map((c, i) => ({ text: c.text, correct: c.correct, feedback: c.feedback ?? current.choices[i]?.feedback ?? null }))
    : current.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback ?? null }));
  if (choices.length && choices.filter((c) => c.correct).length !== 1) return null;
  const stemChanged = stem.trim() !== current.stem.trim();
  const choicesChanged = JSON.stringify(choices.map((c) => [c.text.trim(), c.correct])) !== JSON.stringify(current.choices.map((c) => [c.text.trim(), c.correct]));
  if (!stemChanged && !choicesChanged) return null;
  return { stem, choices, note: p.note, stemChanged, choicesChanged };
}
