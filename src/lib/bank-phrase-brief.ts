// THE BANK PICKER BY VOICE (docs/USE-YOUR-WORDS-AUDIT.md #7). Lee, 2026-09-07: "'Use your
// words' is the fundamental value… Wherever we can click, talk, get suggestions."
//
// The insert picker's "Not banked yet" box is where a phrase Lee improvised on camera tonight
// gets written BACK to the bank so it's on the list next time (BankPicker.tsx). He says the
// phrase and why; this returns the two fields — the title "In Lee's words" and the "Why /
// when" — in his register, filled in for him to confirm with the same Enter as before. A tiny
// brief; the model tidies, it doesn't invent.
//
// Pure: the messages for the micro lane and the parser for its answer.

import type { BlastFrameKind } from "@/components/blastoff/plan";

export type BankPhraseKind = Extract<BlastFrameKind, "phrase" | "cheat" | "tip">;

export interface BankPhraseRequest {
  kind: BankPhraseKind;
  setName: string;
  /** What he said — the phrase and, usually, why it works. */
  spoken: string;
}

export interface BankPhrase {
  /** The phrase itself (phrase), the rule (cheat), the tip — as he'd say it on camera. */
  title: string;
  /** Why / when. "" when he gave no why. */
  body: string;
}

export const BANK_PHRASE_TITLE_LEN = 120;
export const BANK_PHRASE_BODY_LEN = 240;

const KIND_LINE: Record<BankPhraseKind, string> = {
  phrase: "kind = MEMORIZE THIS: title is the phrase students should memorize, word for word as he'd say it on camera (≤ 12 words). body is why it works or when to use it, one line, or \"\" if he gave none.",
  cheat: "kind = CHEAT CODE: title is the rule in one line (≤ 14 words) — the shortcut itself. body is the why / when: one line, when the rule applies and what it saves.",
  tip: "kind = DEEP QUESTION / TIP: title is the tip or the question in one line (≤ 14 words). body is the one-line answer or the reason, or \"\" if he gave none.",
};

export const BANK_PHRASE_SYSTEM = [
  "You tidy ONE thing Lee (Survive Accounting) just said into a bank entry: a title and a body. He teaches accounting students, on camera, in plain words — keep his words; fix only the mess of speech (false starts, \"um\", repeats). Do not add a fact he didn't say. No emoji, no hype, no quotation marks around the title.",
  "Return ONLY a JSON object: {\"title\": str, \"body\": str}.",
].join("\n");

export function buildBankPhraseMessages(req: BankPhraseRequest): { system: string; user: string } {
  const user = [
    KIND_LINE[req.kind],
    `THE SET: ${req.setName || "(unnamed)"}`,
    `WHAT HE SAID:\n${req.spoken.trim().slice(0, 1500)}`,
  ].join("\n\n");
  return { system: BANK_PHRASE_SYSTEM, user };
}

const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const clean = (s: string): string => s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim().replace(/^["“”']+|["“”']+$/g, "").trim();

/** The model's JSON, defended: a non-empty title, an optional body, both one line. */
export function parseBankPhrase(text: string): BankPhrase | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { title?: unknown; body?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const title = typeof j.title === "string" ? clean(j.title).slice(0, BANK_PHRASE_TITLE_LEN) : "";
  if (!title) return null;
  const body = typeof j.body === "string" ? clean(j.body).slice(0, BANK_PHRASE_BODY_LEN) : "";
  return { title, body };
}
