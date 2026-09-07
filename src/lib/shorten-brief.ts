// THE SHORTEN BRIEF — Lee, 2026-09-07: "Editor in any CEQ card or callout needs a 'shorten'
// button. Shorten could also be thought of as standardize … AI that will make the stem more
// simple/concise, choices too, and make choices standardized if possible, it's easier to scan
// and teach … Some rules I'm thinking of that come to mind, is removing redundancy, unnecessary
// words. Only leaving what's essential to getting the 'blast off' point across. CRAMMING this,
// not teaching it. What's the quick trick I can share? What's the 1 or 2 words (ideally only
// one) word I can highlight in this example that gets the point across for how to get this
// correct."
//
// Same shape as the rehearsal and illustration briefs: a pure build…Messages(req) for the micro
// lane and a parse…(text) that defends the answer. The one thing that makes it "get smarter
// over time" (his words) is the FEW-SHOT: the edit log (edit-log.functions.ts) hands back the
// newest pairs of Lee's OWN edits — and, strongest of all, the edits he made OVER a Shorten he
// had just applied — rendered as before → after so the model copies his hand, not a generic
// notion of brevity. In-context guidance, not fine-tuning; nothing reachable here does that.
//
// THE HIGHLIGHT is the whole point of the card: ONE word (two at most) marked ==like this== in
// the stem (or a callout's title / line) — inline-md.tsx paints it gold. If the model names the
// word but forgets the marks, the parser puts them on the first occurrence itself.

export type ShortenKind = "ceq" | "callout";

/** The words of a card or a callout — what goes in, what comes out, what the log stores. */
export interface ShortenFields {
  stem?: string;
  choices?: { text: string; correct: boolean }[];
  title?: string;
  text?: string;
  bullets?: string[];
}

/** One past edit, as the brief renders it. "manual" = Lee edited by hand; "shorten-edited" =
 *  he was offered `before` by Shorten and wrote `after` instead — the strongest signal. */
export interface EditExample { kind: ShortenKind; source: "manual" | "shorten-edited"; before: ShortenFields; after: ShortenFields }

export interface ShortenRequest extends ShortenFields {
  kind: ShortenKind;
  /** The edit log's newest pairs — few-shot. */
  examples?: readonly EditExample[];
  /** "Try again": the last proposal, with a nudge to go tighter still. */
  previous?: ShortenFields | null;
}

export interface ShortenResult extends ShortenFields {
  /** The one word (two at most) the highlight marks, bare. */
  highlight: string;
  /** One line on what was cut. */
  note: string;
}

export const SHORTEN_SYSTEM = [
  "You shorten and STANDARDIZE one card of a Survive Accounting Short — a cram card students scan for a few seconds on a phone. You are CRAMMING this, not teaching it.",
  "CUT: redundancy, unnecessary words, throat-clearing, anything that isn't essential to getting the blast-off point across. What's the quick trick? Say only that.",
  "STANDARDIZE THE CHOICES so they are parallel and scannable: the same grammatical shape, the same length band, no repeated lead-in words (pull a shared opener into the stem instead). Keep them in the SAME ORDER and the SAME COUNT.",
  "THE HIGHLIGHT: pick THE ONE word (two at most — ideally one) that tells you how to get this right, and mark it in the stem as ==word== (for a callout, in the title or one line). Exactly one highlight. Put the bare word in \"highlight\" too.",
  "NEVER CHANGE what the question tests or which choice is correct. Keep every number, every date, every term of art exactly as given. Keep __word__ underlines and ____ blanks that are already there.",
  "A card with no choices is a summary card: one short line per point, same rules.",
  "Return ONLY a JSON object. For a card: {\"stem\": str, \"choices\": [{\"text\": str, \"correct\": bool}], \"highlight\": str, \"note\": str}. For a callout: {\"title\": str, \"text\": str, \"bullets\": [str], \"highlight\": str, \"note\": str}. \"note\" is ONE line on what was cut.",
  "If EXAMPLES are given, they are real pairs of Lee's own edits — copy his hand: how much he cuts, how he phrases a choice, what he highlights. An example that says he was OFFERED a shortening and WROTE HIS OWN instead is the strongest signal of all: the offered one missed; what he wrote is the target.",
].join("\n");

function renderFields(f: ShortenFields): string {
  const lines: string[] = [];
  if (f.stem !== undefined) lines.push(`Stem: ${f.stem.trim() || "(empty)"}`);
  for (const c of f.choices ?? []) lines.push(`${c.correct ? "  [CORRECT] " : "  [ ] "}${c.text.trim()}`);
  if (f.title !== undefined) lines.push(`Title: ${f.title.trim() || "(empty)"}`);
  if (f.text !== undefined && f.text.trim()) lines.push(`Text: ${f.text.trim()}`);
  for (const b of f.bullets ?? []) if (b.trim()) lines.push(`  - ${b.trim()}`);
  return lines.join("\n");
}

function renderExample(e: EditExample, i: number): string {
  const head = e.source === "shorten-edited"
    ? `Example ${i + 1} — Shorten offered this ${e.kind === "ceq" ? "card" : "callout"}, and Lee wrote his own instead:`
    : `Example ${i + 1} — Lee's own edit of a ${e.kind === "ceq" ? "card" : "callout"}:`;
  return `${head}\nBEFORE:\n${renderFields(e.before)}\nAFTER:\n${renderFields(e.after)}`;
}

export function buildShortenMessages(req: ShortenRequest): { system: string; user: string } {
  const examples = (req.examples ?? []).slice(0, 5).map(renderExample).join("\n\n");
  const current: ShortenFields = req.kind === "ceq"
    ? { stem: req.stem ?? "", choices: req.choices ?? [] }
    : { title: req.title ?? "", ...(req.text !== undefined ? { text: req.text } : {}), bullets: req.bullets ?? [] };
  const user = [
    `THE ${req.kind === "ceq" ? "CARD" : "CALLOUT"} (the correct choice is marked):\n${renderFields(current)}`,
    req.previous ? `YOUR LAST PASS (Lee asked for another — go TIGHTER: fewer words again, and check the highlight is the one word that gets it right):\n${renderFields(req.previous)}` : "",
    examples ? `EXAMPLES (Lee's own past edits — match his hand):\n${examples}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: SHORTEN_SYSTEM, user };
}

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
// The same closed-pair rule inline-md.tsx renders by: a lone "=" inside is fine, "==" closes.
const HL = /==((?:[^=]|=(?!=))+?)==/;
const hasMark = (s: string): boolean => HL.test(s);
const stripMarks = (s: string): string => s.replace(new RegExp(HL.source, "g"), "$1");
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Put ==marks== on the first occurrence of `word` in the first of `texts` that holds it, when
 *  none of them is marked already. Returns the texts, marked. Exported for the test. */
export function markHighlight(texts: string[], word: string): string[] {
  const w = word.trim();
  if (!w || texts.some(hasMark)) return texts;
  const re = new RegExp(`(^|[^A-Za-z0-9=])(${escapeRe(w)})(?![A-Za-z0-9=])`, "i");
  const out = [...texts];
  for (let i = 0; i < out.length; i++) {
    if (re.test(out[i])) { out[i] = out[i].replace(re, "$1==$2=="); return out; }
  }
  return out;
}

/** The model's JSON, defended against the request it answered: same number of choices, the
 *  correct one exactly where it was (the model may not move it), no marks inside choices, one
 *  highlight in the stem (added from `highlight` if the marks are missing). Null when there is
 *  nothing usable — the caller says "didn't come back clean". */
export function parseShorten(text: string, req: ShortenRequest): ShortenResult | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  const highlight = stripMarks(clean(j.highlight, 60));
  const note = clean(j.note, 240);
  if (req.kind === "ceq") {
    const want = req.choices ?? [];
    const got = Array.isArray(j.choices) ? j.choices : [];
    if (got.length !== want.length) return null;
    const choices = got.map((c, i) => {
      const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { text: stripMarks(clean(x.text, 2000)), correct: want[i].correct };
    });
    if (choices.some((c) => !c.text)) return null;
    const stem0 = clean(j.stem, 8000);
    if (!stem0) return null;
    const [stem] = markHighlight([stem0], highlight);
    return { stem, choices, highlight, note };
  }
  const title0 = clean(j.title, 2000);
  const text0 = clean(j.text, 4000);
  const bullets0 = Array.isArray(j.bullets) ? j.bullets.map((b) => clean(b, 2000)).filter(Boolean) : [];
  if (!title0 && !text0 && !bullets0.length) return null;
  const [title, text1, ...bullets] = markHighlight([title0, text0, ...bullets0], highlight);
  return { title, ...(req.text !== undefined ? { text: text1 } : {}), bullets, highlight, note };
}
