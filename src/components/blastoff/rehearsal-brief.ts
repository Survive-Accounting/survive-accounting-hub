// THE REHEARSAL BRIEF — Lee, 2026-09-06: "I can run through it and just talk out what I plan
// to say... generate a suggested line for each slide... start teaching the AI what my style
// is." Same shape as the illustration and fast-track briefs this session: say it in your own
// words, the AI turns it into the actual thing (here, a teleprompter line), Lee confirms or
// revises. The one new piece is FEW-SHOT STYLE LEARNING — past decisions (teleprompter_feedback,
// via rehearsal.functions.ts) ride along as real examples of Lee's own phrasing, so the
// suggestion actually improves as he keeps more of them. This is genuine in-context guidance,
// not model fine-tuning — nothing reachable from this app does that.
//
// TWO LINES, NOT ONE (2026-09-06, third pass). Lee: "Rehearsal review: it should just show each
// slide one at a time, suggested prompt. I think cleaned up version of 'what you said' then
// Suggested improvement. I pick either or write mine in." So one call returns both: `said` is
// his transcript with the filler gone and nothing added; `suggested` is the improvement — and
// "makes sense for suggestions to bring out anything from talkthrough that would be good", so
// the TALKTHROUGH NOTES (rehearsal-context.ts) feed that one. The revise-with-a-note loop is
// gone ("I pick either or write mine in" — one click), so the previous/revision fields went too.
//
// THE BRIEF MUST SEE THE CARD (2026-09-07). Lee, on a suggestion that only shortened his
// rambling: "it must not be referencing the actual CEQ itself, because neither what I said nor
// what the suggested said actual teaches anything… I do want the app to be smart enough to not
// suggest something that doesn't teach anything." So the request now carries the CARD — the
// stem and the choices with the correct one marked (or a callout's title and lines) — and the
// system prompt has a TEACH rule: the line must let a student get THIS question right. Two
// registers, the model's call, named in the answer — Lee: "SOMETIMES, a cram answer is still
// teaching a bit. Sometimes though, it's just: cheat code, answer, move on." — plus an optional
// TRANSITION into the next slide ("the lines could be useful to also build in TRANSITIONS… as
// simple as move on, but also finding connecting points between slides that increase the
// flow"), and KEYWORDS: "a quick bullet list, or even just a handful of single words, that
// capture the main point of what the line is saying (e.g. Internal = inside)… so I can scan a
// teleprompter and get what I need." The rejected suggestion rides with an edited example —
// "if I write in my own, it's a big signal that there's a possible improvement here."
//
// Pure: the messages for the micro lane and the parser for its answer.

export interface StyleExample {
  /** What Lee actually said, roughly. */
  raw: string;
  /** The line he actually kept. */
  final: string;
  /** The suggestion he was offered and turned down (only when he wrote his own instead) —
   *  "he was offered X and wrote Y instead" is the strongest style guidance there is. */
  rejected?: string;
}

/** What the slide actually asks — so a line can be checked against it (the TEACH rule). */
export interface RehearsalCard {
  stem: string;
  choices: { text: string; correct: boolean }[];
  /** A callout frame (memorize this / cheat code / deep question): its heading and lines. */
  calloutTitle?: string;
  calloutLines?: string[];
}

export interface RehearsalBriefRequest {
  /** What the slide itself says — the stem, the bullets, whatever grounds the line. */
  slideLabel: string;
  slideContext: string;
  /** The card behind the slide, when there is one — the stem + choices with the correct one
   *  marked, or a callout's title + lines. Without it the model can only paraphrase. */
  card?: RehearsalCard;
  /** The slide that comes next, for the hand-off. */
  nextSlide?: { label: string; context: string };
  /** Lee's raw, unedited rehearsal speech for this one slide. */
  rawTranscript: string;
  /** What Lee said and stamped about this card during the original Talkthrough
   *  (rehearsal-context.ts). Absent/empty for frames that have no card. */
  talkthrough?: string;
  /** Past decisions, the ones most worth copying first. */
  styleExamples?: readonly StyleExample[];
}

export const REHEARSAL_REGISTERS = ["teach", "cheat-code"] as const;
export type RehearsalRegister = (typeof REHEARSAL_REGISTERS)[number];

export interface RehearsalSuggestions {
  /** Lee's own words, cleaned — nothing added. Empty when the model only answered one line. */
  said: string;
  /** The improvement. */
  suggested: string;
  /** Which way the suggested line goes: a beat of why, or how-you-know-the-answer-move-on. */
  register: RehearsalRegister;
  /** A 2–6 word hand-off into the next slide, or null when none fits. */
  transition: string | null;
  /** 2–5 scannable fragments of the SUGGESTED line ("Internal = inside"). */
  keywords: string[];
}

export const REHEARSAL_SYSTEM = [
  "You turn Lee's raw, out-loud rehearsal speech for ONE slide of a Survive Accounting Short into teleprompter lines — his own words, tightened, not rewritten into someone else's voice.",
  "Return ONLY a JSON object: {\"said\": str, \"suggested\": str, \"register\": \"teach\"|\"cheat-code\", \"transition\": str|null, \"keywords\": [str]}.",
  "\"said\" = exactly what Lee said, CLEANED: cut filler (um, like, you know), repeated false starts and rambling asides; smooth the grammar; ≤ 30 words; ADD NOTHING — no new facts, no new phrasing that wasn't his.",
  "\"suggested\" = the improvement: the same thought, tightened to one or two short spoken sentences (≤ 30 words), still exactly how Lee would say it out loud. If TALKTHROUGH NOTES are given — what he said and stamped about this card when he first talked the set through — and they hold a sharper phrase or a better way of teaching it, bring THAT in; otherwise stay with his rehearsal words.",
  "TEACH — the one rule that matters most: a suggested line must let a student get THIS question right. It names the correct answer, or the cheat code that finds it, in Lee's cram register. Never a paraphrase of the stem. Never a line that teaches nothing. If Lee's speech never reached the answer, the suggested line still must — take it from THE CARD (the choice marked CORRECT, or the callout's lines).",
  "TWO REGISTERS — pick one and name it in \"register\". \"teach\": one beat of WHY, then the answer (e.g. \"External means anybody outside the company. Remember the cheat code: if they don't get a paycheck from the company, they're external.\"). \"cheat-code\": no why — just how you know the answer, then move on (e.g. \"External. Ask yourself who doesn't receive a paycheck. That's your answer. Next question.\"). Sometimes a cram answer still teaches a bit; sometimes it's just cheat code, answer, move on — choose whichever Lee's speech leans toward.",
  "\"transition\" = an optional 2–6 word spoken hand-off into the NEXT SLIDE when one is given — \"Next question.\", \"Same idea, flipped.\", a connecting phrase that carries the thread — or null when nothing natural fits. It is NOT part of \"suggested\"; keep it separate.",
  "\"keywords\" = 2–5 scannable fragments of the SUGGESTED line, in its order, each ≤ 6 words — the kind of thing a glance at a teleprompter gives back (\"Internal = inside\", \"no paycheck → external\", \"next question\"). Fragments of the line, not new content.",
  "KEEP IT LEE'S: use his own phrasing and word choices wherever they already work — never swap in fancier or more formal words than he used. If he said it awkwardly but the meaning is clear, smooth the grammar, don't rewrite the voice.",
  "GROUNDED IN THE SLIDE: a line should read naturally right after seeing this slide's own text — it can reference what's on screen, but never repeat the slide's bullets verbatim; it's what Lee SAYS about them, not a recap.",
  "SHORT-FORM PACING: a line that reads out loud in a few seconds, not a paragraph. If the rehearsal covered several ideas, pick the clearest single thread rather than cramming all of it in.",
  "If STYLE EXAMPLES are given, they are real past pairs of Lee's raw speech and the line he actually kept — match that same register and phrasing habits, not the specific words. An example that says he was OFFERED a line and WROTE his own instead is the strongest signal of all: the offered line missed; what he wrote is the target.",
].join("\n");

function renderCard(card: RehearsalCard): string {
  const lines: string[] = [];
  if (card.stem.trim()) lines.push(`Q: ${card.stem.trim()}`);
  for (const c of card.choices) lines.push(`${c.correct ? "  [CORRECT] " : "  [ ] "}${c.text.trim()}`);
  if (card.calloutTitle?.trim()) lines.push(`${card.calloutTitle.trim()}`);
  for (const l of card.calloutLines ?? []) if (l.trim()) lines.push(`  - ${l.trim()}`);
  return lines.join("\n");
}

function renderExample(e: StyleExample, i: number): string {
  const rejected = e.rejected?.trim();
  return rejected && rejected !== e.final.trim()
    ? `Example ${i + 1} — Lee said: "${e.raw}" → he was offered: "${rejected}" → he wrote instead: "${e.final}"`
    : `Example ${i + 1} — Lee said: "${e.raw}" → he kept: "${e.final}"`;
}

export function buildRehearsalMessages(req: RehearsalBriefRequest): { system: string; user: string } {
  const examples = (req.styleExamples ?? []).slice(0, 5).map(renderExample).join("\n");
  const talkthrough = req.talkthrough?.trim() ?? "";
  const card = req.card ? renderCard(req.card) : "";
  const next = req.nextSlide;
  const user = [
    `SLIDE: ${req.slideLabel}`,
    `SLIDE CONTEXT: ${req.slideContext || "(none)"}`,
    card ? `THE CARD (what the student must get right; the correct choice is marked):\n${card}` : "",
    next ? `NEXT SLIDE: ${next.label}${next.context ? ` — ${next.context}` : ""}` : "",
    `LEE'S RAW REHEARSAL SPEECH:\n${req.rawTranscript.trim()}`,
    talkthrough ? `TALKTHROUGH NOTES (what Lee said and stamped about this card when he first talked the set through):\n${talkthrough}` : "",
    examples ? `STYLE EXAMPLES (Lee's own past kept lines):\n${examples}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: REHEARSAL_SYSTEM, user };
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 400) : "");
const KEYWORD_CAP = 5;
const cleanKeywords = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((k) => (typeof k === "string" ? k.trim().slice(0, 60) : "")).filter(Boolean).slice(0, KEYWORD_CAP) : [];

/** The model's JSON, defended: both lines, or null when there's no usable suggestion at all.
 *  A legacy `{line}` answer (the one-line brief this replaced) is taken as the suggestion; a
 *  legacy two-field answer gets the 2026-09-07 fields at their safe defaults (register "teach",
 *  no transition, no keywords). */
export function parseRehearsalSuggestions(text: string): RehearsalSuggestions | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { said?: unknown; suggested?: unknown; line?: unknown; register?: unknown; transition?: unknown; keywords?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const said = clean(j.said);
  const suggested = clean(j.suggested) || clean(j.line);
  if (!suggested && !said) return null;
  const register: RehearsalRegister = j.register === "cheat-code" ? "cheat-code" : "teach";
  const transition = clean(j.transition).slice(0, 80) || null;
  return { said, suggested: suggested || said, register, transition, keywords: cleanKeywords(j.keywords) };
}

// ------------------------------------------------------------------ keywords for a kept line
// When Lee keeps a line the model didn't write (his own cleaned words, or an edit of the
// suggestion), the keywords it sent belong to a different line — one tiny follow-up call makes
// the scannable fragments for the line he actually kept.

export const KEYWORD_SYSTEM = [
  "You turn ONE teleprompter line into 2–5 scannable fragments a presenter can glance at and get the whole line back — the main point, in the line's own order and words (\"Internal = inside\", \"no paycheck → external\", \"next question\").",
  "Each fragment ≤ 6 words. Fragments of the line, never new content. Return ONLY a JSON object: {\"keywords\": [str]}.",
].join("\n");

export function buildKeywordMessages(line: string): { system: string; user: string } {
  return { system: KEYWORD_SYSTEM, user: `THE LINE:\n${line.trim()}` };
}

/** The keywords answer, defended; [] when nothing usable came back. */
export function parseKeywords(text: string): string[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try { return cleanKeywords((JSON.parse(m[0]) as { keywords?: unknown }).keywords); } catch { return []; }
}
