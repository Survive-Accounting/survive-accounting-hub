// THE REHEARSAL BRIEF — Lee, 2026-09-06: "I can run through it and just talk out what I plan
// to say... generate a suggested line for each slide... start teaching the AI what my style
// is." Same shape as the illustration and fast-track briefs this session: say it in your own
// words, the AI turns it into the actual thing (here, a teleprompter line), Lee confirms or
// revises. The one new piece is FEW-SHOT STYLE LEARNING — the highest-rated past decisions
// (teleprompter_feedback, via rehearsal.functions.ts) ride along as real examples of Lee's own
// phrasing, so the suggestion actually improves as he rates more of them. This is genuine
// in-context guidance, not model fine-tuning — nothing reachable from this app does that.
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
  /** Highest-rated past decisions, oldest style guidance to newest. */
  styleExamples?: readonly StyleExample[];
  /** A previous suggestion being revised, and what to change. */
  previous?: string | null;
  revision?: string | null;
}

export const REHEARSAL_SYSTEM = [
  "You turn Lee's raw, out-loud rehearsal speech for ONE slide of a Survive Accounting Short into ONE clean teleprompter line — his own words, tightened, not rewritten into someone else's voice.",
  "Return ONLY a JSON object: {\"line\": str (the teleprompter line — one or two short spoken sentences, ≤ 30 words, exactly how Lee would actually say it out loud)}.",
  "KEEP IT LEE'S: use his own phrasing and word choices from the transcript wherever they already work — cut filler (um, like, you know, repeated false starts), cut rambling asides, but never swap in fancier or more formal words than he used. If he said it awkwardly but the meaning is clear, smooth the grammar, don't rewrite the voice.",
  "GROUNDED IN THE SLIDE: the line should read naturally right after seeing this slide's own text — it can reference what's on screen, but never repeat the slide's bullets verbatim; it's what Lee SAYS about them, not a recap.",
  "SHORT-FORM PACING: a line that reads out loud in a few seconds, not a paragraph. If the rehearsal covered several ideas, pick the clearest single thread rather than cramming all of it in.",
  "If STYLE EXAMPLES are given, they are real past pairs of Lee's raw speech and the line he actually kept, rated highly — match that same register and phrasing habits, not the specific words.",
  "A REVISION: when a previous line and a change note are given, apply the note and keep the rest.",
].join("\n");

export function buildRehearsalMessages(req: RehearsalBriefRequest): { system: string; user: string } {
  const examples = (req.styleExamples ?? []).slice(0, 5).map((e, i) => `Example ${i + 1} — Lee said: "${e.raw}" → he kept: "${e.final}"`).join("\n");
  const user = [
    `SLIDE: ${req.slideLabel}`,
    `SLIDE CONTEXT: ${req.slideContext || "(none)"}`,
    `LEE'S RAW REHEARSAL SPEECH:\n${req.rawTranscript.trim()}`,
    examples ? `STYLE EXAMPLES (Lee's own past highly-rated lines):\n${examples}` : "",
    req.previous ? `PREVIOUS LINE:\n${req.previous}` : "",
    req.revision ? `CHANGE REQUESTED: ${req.revision.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: REHEARSAL_SYSTEM, user };
}

/** The model's JSON, defended: one non-empty line, or null. */
export function parseRehearsalSuggestion(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { line?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const line = typeof j.line === "string" ? j.line.trim() : "";
  return line ? line.slice(0, 400) : null;
}
