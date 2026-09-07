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
// Pure: the messages for the micro lane and the parser for its answer.

export interface StyleExample {
  /** What Lee actually said, roughly. */
  raw: string;
  /** The line he actually kept. */
  final: string;
}

export interface RehearsalBriefRequest {
  /** What the slide itself says — the stem, the bullets, whatever grounds the line. */
  slideLabel: string;
  slideContext: string;
  /** Lee's raw, unedited rehearsal speech for this one slide. */
  rawTranscript: string;
  /** What Lee said and stamped about this card during the original Talkthrough
   *  (rehearsal-context.ts). Absent/empty for frames that have no card. */
  talkthrough?: string;
  /** Past decisions, the ones most worth copying first. */
  styleExamples?: readonly StyleExample[];
}

export interface RehearsalSuggestions {
  /** Lee's own words, cleaned — nothing added. Empty when the model only answered one line. */
  said: string;
  /** The improvement. */
  suggested: string;
}

export const REHEARSAL_SYSTEM = [
  "You turn Lee's raw, out-loud rehearsal speech for ONE slide of a Survive Accounting Short into teleprompter lines — his own words, tightened, not rewritten into someone else's voice.",
  "Return ONLY a JSON object: {\"said\": str, \"suggested\": str}.",
  "\"said\" = exactly what Lee said, CLEANED: cut filler (um, like, you know), repeated false starts and rambling asides; smooth the grammar; ≤ 30 words; ADD NOTHING — no new facts, no new phrasing that wasn't his.",
  "\"suggested\" = the improvement: the same thought, tightened to one or two short spoken sentences (≤ 30 words), still exactly how Lee would say it out loud. If TALKTHROUGH NOTES are given — what he said and stamped about this card when he first talked the set through — and they hold a sharper phrase or a better way of teaching it, bring THAT in; otherwise stay with his rehearsal words.",
  "KEEP IT LEE'S: use his own phrasing and word choices wherever they already work — never swap in fancier or more formal words than he used. If he said it awkwardly but the meaning is clear, smooth the grammar, don't rewrite the voice.",
  "GROUNDED IN THE SLIDE: a line should read naturally right after seeing this slide's own text — it can reference what's on screen, but never repeat the slide's bullets verbatim; it's what Lee SAYS about them, not a recap.",
  "SHORT-FORM PACING: a line that reads out loud in a few seconds, not a paragraph. If the rehearsal covered several ideas, pick the clearest single thread rather than cramming all of it in.",
  "If STYLE EXAMPLES are given, they are real past pairs of Lee's raw speech and the line he actually kept — match that same register and phrasing habits, not the specific words.",
].join("\n");

export function buildRehearsalMessages(req: RehearsalBriefRequest): { system: string; user: string } {
  const examples = (req.styleExamples ?? []).slice(0, 5).map((e, i) => `Example ${i + 1} — Lee said: "${e.raw}" → he kept: "${e.final}"`).join("\n");
  const talkthrough = req.talkthrough?.trim() ?? "";
  const user = [
    `SLIDE: ${req.slideLabel}`,
    `SLIDE CONTEXT: ${req.slideContext || "(none)"}`,
    `LEE'S RAW REHEARSAL SPEECH:\n${req.rawTranscript.trim()}`,
    talkthrough ? `TALKTHROUGH NOTES (what Lee said and stamped about this card when he first talked the set through):\n${talkthrough}` : "",
    examples ? `STYLE EXAMPLES (Lee's own past kept lines):\n${examples}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: REHEARSAL_SYSTEM, user };
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, 400) : "");

/** The model's JSON, defended: both lines, or null when there's no usable suggestion at all.
 *  A legacy `{line}` answer (the one-line brief this replaced) is taken as the suggestion. */
export function parseRehearsalSuggestions(text: string): RehearsalSuggestions | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { said?: unknown; suggested?: unknown; line?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const said = clean(j.said);
  const suggested = clean(j.suggested) || clean(j.line);
  if (!suggested && !said) return null;
  return { said, suggested: suggested || said };
}
