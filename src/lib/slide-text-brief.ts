// THE SLIDE TEXT BRIEF — "Say it" on the Review Editor (2026-09-07). Lee: "'Use your words' is
// the fundamental value we are building into survive accounting and survive studios… Wherever
// we can click, talk, get suggestions." Every word that CREATES content on the Blast Off line
// was already spoken (the Booth, rehearsal, the Illustrator brief); every word that CORRECTS
// or FINISHES it was typed — the callout title, the lines under it, the cheat code, the
// intro's topic line, the outro's tagline (USE-YOUR-WORDS-AUDIT.md #2, #3, #9, #16). Now one
// 🎙 in the editor: he talks about the slide, the model returns the slide's words in the cram
// register — heading, first line, lines with their nesting — shown as a diff beside the
// current ones; "Use this" patches. Typing stays the fallback (edit the fields as before).
//
// THE LAST WORD (the audit's §3). Lee: "we've illustrated for it (which could mean I now may
// reference the illustration!), we've rehearsed it, maybe 2-3 rounds, and possibly found new
// things, and now we're at the final editing point. Maybe one last thing comes around to
// enhance our video… I want it all." By the time he films, the slide's text never saw the
// picture or the kept prompter lines. buildTightenToLinesMessages is that pass: the kept lines
// + keys + the card in, shorter slide words that MATCH what he'll say out. Same answer shape,
// same diff, same "Use this" — never applied on its own.
//
// Pure: the messages for the micro lane and the parser for the answer; the field bridges to a
// frame (slideTextFieldsOf / slideTextPatchOf) so the editor and the tests agree on which
// frame field is the heading. No React, no model call — the caller runs runMicro and logs the
// price.

/** The kinds whose words this brief writes. A set card is the bank's (ceq-edit-brief.ts). */
export const SLIDE_TEXT_KINDS = ["phrase", "tip", "cheat", "exhibit", "blank", "intro", "outro"] as const;
export type SlideTextKind = (typeof SLIDE_TEXT_KINDS)[number];
export const isSlideTextKind = (k: string): k is SlideTextKind => (SLIDE_TEXT_KINDS as readonly string[]).includes(k);

/** The words on a slide as the brief sees them. Which keys are PRESENT says what the kind has
 *  (like shorten-brief's ShortenFields): a cheat code has a title, a first line (text) and
 *  lines; a phrase or deep question has a title and lines; an exhibit, a blank, the intro and
 *  the outro have one text. Lines nest by leading tabs — the convention plan.ts's frameBullets
 *  and bullet-indent.ts read as depth. */
export interface SlideTextFields { title?: string; text?: string; lines?: string[] }

/** Which fields a kind has — the shape the parser confines the answer to. */
export function slideTextShape(kind: SlideTextKind): { title: boolean; text: boolean; lines: boolean } {
  if (kind === "cheat") return { title: true, text: true, lines: true };
  if (kind === "phrase" || kind === "tip") return { title: true, text: false, lines: true };
  return { title: false, text: true, lines: false };
}

/** A frame's words → the brief's fields. Structural: BlastFrame fits (plan.ts owns the type).
 *  Same mapping ReviewDeck's Shorten uses: a cheat's `title`/`body`/`bullets`; a phrase or
 *  tip's heading is `text` and its lines `bullets`; everything else is `text`. Empty lines are
 *  dropped, nesting kept. */
export function slideTextFieldsOf(f: { kind: string; title?: string; text?: string; body?: string; bullets?: string[] }): SlideTextFields | null {
  if (!isSlideTextKind(f.kind)) return null;
  const shape = slideTextShape(f.kind);
  const lines = (f.bullets ?? []).map(normalizeLine).filter((b) => b.replace(/^\t+/, "").length > 0);
  if (f.kind === "cheat") return { title: f.title ?? "", text: f.body ?? "", lines };
  if (shape.lines) return { title: f.text ?? "", lines };
  return { text: f.text ?? "" };
}

/** The brief's fields → the frame patch that writes them (the inverse of slideTextFieldsOf). */
export function slideTextPatchOf(kind: SlideTextKind, r: SlideTextFields): { title?: string; text?: string; body?: string; bullets?: string[] } {
  if (kind === "cheat") return { title: r.title ?? "", body: r.text ?? "", bullets: r.lines ?? [] };
  if (slideTextShape(kind).lines) return { text: r.title ?? "", bullets: r.lines ?? [] };
  return { text: r.text ?? "" };
}

/** The set card a slide sits beside — the stem + choices with the correct one marked — so the
 *  words can be checked against it (the TEACH rule). Structurally the rehearsal brief's card. */
export interface SlideCard { stem: string; choices: { text: string; correct: boolean }[]; calloutTitle?: string; calloutLines?: string[] }

export interface SlideTextRequest {
  kind: SlideTextKind;
  /** The slide's words right now — what a correction applies to. */
  current: SlideTextFields;
  /** What Lee said about the slide, out loud, verbatim — a correction, a new phrasing, a take. */
  spoken: string;
  /** The set card this slide sits beside (the previous card in the running order), if any. */
  card?: SlideCard;
  /** What Lee said and stamped about that card in Step 1 (rehearsal-context.ts). */
  talkthrough?: string;
  /** The slide's picture, one line (rehearsal-brief.ts pictureLineFor). */
  picture?: string;
  /** The set's name — what a blank intro line falls back to. */
  setName?: string;
}

export interface SlideTextResult extends SlideTextFields {
  /** One line on what changed, the model's own. */
  note: string;
}

const KIND_FIELDS: Record<SlideTextKind, string> = {
  cheat: "A CHEAT CODE slide: \"title\" = the cheat code's name (≤ 6 words, e.g. \"The Paycheck Test\"), \"text\" = the one-line rule under it, \"lines\" = more lines under that (0–4).",
  phrase: "A MEMORIZE THIS slide: \"title\" = the thing to memorize (≤ 6 words), \"lines\" = what sits under it (0–5, one idea each, nested where a line belongs under another).",
  tip: "A DEEP QUESTION slide: \"title\" = the question, as Lee asks it (≤ 10 words), \"lines\" = the answer's beats (0–5).",
  exhibit: "An EXHIBIT slide: \"text\" = the caption under the exhibit — one line, the way Lee says it on camera.",
  blank: "A BLANK slide: \"text\" = the words on the bare frame — a line or two, the way Lee says it on camera.",
  intro: "THE INTRO: \"text\" = the topic line (a few words; the set's name is what it falls back to).",
  outro: "THE OUTRO: \"text\" = the closing tagline (the standard one is \"Cram what's on your exam.\").",
};

function shapeSpec(kind: SlideTextKind): string {
  const s = slideTextShape(kind);
  const keys = [s.title ? "\"title\": str" : "", s.text ? "\"text\": str" : "", s.lines ? "\"lines\": [str]" : "", "\"note\": str"].filter(Boolean);
  return `Return ONLY a JSON object: {${keys.join(", ")}}. "note" is ONE line on what you changed.`;
}

const REGISTER_RULES = [
  "CRAM, NOT TEACH: this is a card students scan for a few seconds on a phone. A heading of a few words; each line ≤ 8 words, one idea; nothing decorative. Lee's own words and word choices wherever they already work — never fancier or more formal than he said it.",
  "NESTING: a line that belongs under the one above starts with one tab character per level (\"\\t\" in the JSON). Keep the nesting the current lines have unless he changes it.",
  "MARKS: keep ==word== highlights, __word__ underlines and ____ blanks that are already there. Add a ==highlight== only when he asks for one (\"highlight external\").",
  "THE CARD, when given, is the set card this slide sits beside — the words must help a student get THAT question right: the correct answer, or the cheat code that finds it. Never a line that teaches nothing.",
  "THE SLIDE'S PICTURE, when given, is drawn beside the words. A line MAY point at it (\"see the paycheck?\") when that lands the answer faster; never describe it for its own sake, and never mention a picture that isn't given.",
  "TALKTHROUGH NOTES, when given, are what Lee said and stamped about this card when he first talked the set through — if they hold a sharper phrase, bring THAT in.",
];

export function slideTextSystem(kind: SlideTextKind): string {
  return [
    "You write the words ON one slide of a Survive Accounting Short from what Lee just SAID about it, out loud, while looking at it.",
    KIND_FIELDS[kind],
    "WHAT HE SAID is the spec. It may be a correction (\"drop the second line\", \"call it the paycheck test\"), a sharper way of saying it, or a whole take. The slide comes back as he means it NOW: apply a correction to the current words and leave every part he didn't touch exactly as it is; a whole take replaces the words. Never add a thought he didn't say.",
    ...REGISTER_RULES,
    shapeSpec(kind),
  ].join("\n");
}

function renderFields(f: SlideTextFields): string {
  const out: string[] = [];
  if (f.title !== undefined) out.push(`Title: ${f.title.trim() || "(empty)"}`);
  if (f.text !== undefined) out.push(`Text: ${f.text.trim() || "(empty)"}`);
  if (f.lines !== undefined) {
    if (!f.lines.length) out.push("Lines: (none)");
    for (const l of f.lines) { const tabs = /^\t*/.exec(l)?.[0].length ?? 0; out.push(`${"  ".repeat(tabs + 1)}- ${l.replace(/^\t+/, "").trim()}`); }
  }
  return out.join("\n");
}

function renderCard(card: SlideCard): string {
  const lines: string[] = [];
  if (card.stem.trim()) lines.push(`Q: ${card.stem.trim()}`);
  for (const c of card.choices) lines.push(`${c.correct ? "  [CORRECT] " : "  [ ] "}${c.text.trim()}`);
  if (card.calloutTitle?.trim()) lines.push(card.calloutTitle.trim());
  for (const l of card.calloutLines ?? []) if (l.trim()) lines.push(`  - ${l.trim()}`);
  return lines.join("\n");
}

export function buildSlideTextMessages(req: SlideTextRequest): { system: string; user: string } {
  const card = req.card ? renderCard(req.card) : "";
  const user = [
    `THE SLIDE NOW:\n${renderFields(req.current)}`,
    req.kind === "intro" && req.setName?.trim() ? `THE SET'S NAME: ${req.setName.trim()}` : "",
    card ? `THE CARD (the correct choice is marked):\n${card}` : "",
    req.picture?.trim() ? `THE SLIDE'S PICTURE: ${req.picture.trim()}` : "",
    req.talkthrough?.trim() ? `TALKTHROUGH NOTES:\n${req.talkthrough.trim()}` : "",
    `WHAT LEE SAID ABOUT IT (verbatim):\n"${req.spoken.trim()}"`,
  ].filter(Boolean).join("\n\n");
  return { system: slideTextSystem(req.kind), user };
}

// --------------------------------------------------------- the last word: tighten to the lines

export interface TightenRequest {
  kind: SlideTextKind;
  current: SlideTextFields;
  /** The kept prompter lines for this slide (frame.prompter) — what he will SAY over it. */
  prompter: readonly string[];
  /** Their scannable keys (frame.prompterKeys), when the review made them. */
  prompterKeys?: readonly string[];
  /** The hand-off into the next slide (frame.prompterTransition), when kept. */
  transition?: string;
  card?: SlideCard;
  picture?: string;
}

export function tightenSystem(kind: SlideTextKind): string {
  return [
    "Lee will SAY the KEPT LINES below on camera over this one slide of a Survive Accounting Short — two rehearsal rounds settled them. Rewrite the slide's words so they MATCH what he says: shorter, the same key words in the same order (THE KEYS, when given), nothing on the slide he won't say — except a number, a date or a term of art THE CARD needs.",
    KIND_FIELDS[kind],
    "ONLY TAKE AWAY OR ALIGN. Never add a thought the lines don't carry. The same number of lines or fewer — never more. A line the kept lines never touch is cut, unless the card needs it.",
    "ALREADY TIGHT: if the slide already matches the lines and can't lose a word, return it unchanged and say so in the note.",
    ...REGISTER_RULES,
    shapeSpec(kind),
  ].join("\n");
}

export function buildTightenToLinesMessages(req: TightenRequest): { system: string; user: string } {
  const card = req.card ? renderCard(req.card) : "";
  const keys = (req.prompterKeys ?? []).map((k) => k.trim()).filter(Boolean);
  const user = [
    `THE SLIDE NOW:\n${renderFields(req.current)}`,
    `THE KEPT LINES (what Lee will say over it):\n${req.prompter.map((l) => l.trim()).filter(Boolean).map((l) => `- ${l}`).join("\n")}`,
    keys.length ? `THE KEYS (the scan of those lines, in order): ${keys.join(" · ")}` : "",
    req.transition?.trim() ? `THE HAND-OFF into the next slide: ${req.transition.trim()}` : "",
    card ? `THE CARD (the correct choice is marked):\n${card}` : "",
    req.picture?.trim() ? `THE SLIDE'S PICTURE: ${req.picture.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: tightenSystem(req.kind), user };
}

// ------------------------------------------------------------------------------ the answer

const TITLE_CAP = 200;
const TEXT_CAP = 1200;
const LINE_CAP = 240;
const LINES_CAP = 8;
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** One line as the frame stores it: leading depth as tabs (a model — or a paste — that
 *  indents with two-space groups, or writes "- " / "• " bullets, is read the same way);
 *  the words trimmed. Exported for the test and for slideTextFieldsOf. */
export function normalizeLine(raw: string): string {
  let s = raw.replace(/\r/g, "");
  let depth = 0;
  for (;;) {
    if (s.startsWith("\t")) { depth += 1; s = s.slice(1); continue; }
    if (s.startsWith("  ")) { depth += 1; s = s.slice(2); continue; }
    break;
  }
  s = s.trim().replace(/^(?:[-•*]|\d+[.)])(?:\s+|$)/, "").trim();
  return "\t".repeat(depth) + s;
}

/** The model's JSON, confined to the kind's shape: fields the kind doesn't have are dropped,
 *  lines normalized (tabs for depth), capped, empty ones gone. Null when nothing usable came
 *  back — every present field empty — so the caller retries once, then says so. */
export function parseSlideText(text: string, kind: SlideTextKind): SlideTextResult | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  const s = slideTextShape(kind);
  const out: SlideTextResult = { note: clean(j.note, 240) };
  if (s.title) out.title = clean(j.title, TITLE_CAP);
  if (s.text) out.text = clean(j.text, TEXT_CAP);
  if (s.lines) {
    const raw = Array.isArray(j.lines) ? j.lines : Array.isArray(j.bullets) ? j.bullets : [];
    out.lines = raw.map((l) => (typeof l === "string" ? normalizeLine(l.slice(0, LINE_CAP)) : "")).filter((l) => l.replace(/^\t+/, "").length > 0).slice(0, LINES_CAP);
  }
  if (!(out.title || out.text || out.lines?.length)) return null;
  return out;
}

/** Same words, same nesting → nothing to propose (the diff would be empty). */
export function sameSlideText(a: SlideTextFields, b: SlideTextFields): boolean {
  const norm = (f: SlideTextFields) => JSON.stringify({ t: (f.title ?? "").trim(), x: (f.text ?? "").trim(), l: (f.lines ?? []).map(normalizeLine).filter((l) => l.replace(/^\t+/, "").length > 0) });
  return norm(a) === norm(b);
}
