// THE RETRO BY VOICE — the production pill's finish sheet ("What sucked, what would've been
// better?"), spoken (docs/USE-YOUR-WORDS-AUDIT.md #6). Lee, 2026-09-07: "'Use your words' is
// the fundamental value… Wherever we can click, talk, get suggestions."
//
// Lee talks the retro at the end of a step; the model returns ONE line for the step's note and
// a few TAGGED bottlenecks ("waiting on Recraft", "re-recorded slide 4 ×3") so Step 5's
// consultant (improve-brief.ts) reads tags, not prose — the same tag on three runs is a pattern,
// three paragraphs aren't. The tags also go into production_time_log's note as "[tag] note"
// (retroLogNote) so the old bottleneck report sees them too.
//
// The PAUSE reason is deliberately NOT here: a spoken reason is already the artifact (#19) —
// mic only, no model.
//
// Pure: the messages for the micro lane and the parser for its answer.

export interface RetroRequest {
  /** The step's display label ("Editor", "Rehearse & Film"). */
  step: string;
  /** Every task on the step with its pause-adjusted minutes — what the minutes actually went to. */
  taskMinutes: readonly { label: string; minutes: number; status: string }[];
  /** The step's pauses: the task they hit, the reason he gave, the seconds lost. */
  pauses: readonly { taskLabel: string | null; reason: string; seconds: number }[];
  /** What he said (or typed). */
  spoken: string;
}

export interface Retro {
  /** One line, his words tightened — the step's note. */
  note: string;
  /** 0–5 short bottleneck tags, each a thing that cost time, specific enough to recur. */
  tags: string[];
}

export const RETRO_TAG_MAX = 5;
export const RETRO_TAG_LEN = 48;
export const RETRO_NOTE_LEN = 240;

export const RETRO_SYSTEM = [
  "You turn Lee's spoken retro on ONE production step of a Blast Off short (Survive Accounting) into a note and tags for a process log. Lee's own framing of the question: \"What sucked, what would've been better?\"",
  "Return ONLY a JSON object: {\"note\": str, \"tags\": [str]}.",
  "note: ONE line (≤ 200 characters), his words tightened, first person, no emoji, no softening — if he said something sucked, it sucked. Keep any number he gave (\"three takes\", \"twenty minutes\").",
  "tags: 0–5 short bottleneck tags, each ≤ 6 words, lowercase except product names, naming ONE thing that cost time — a tool he waited on (\"waiting on Recraft\"), a redo (\"re-recorded slide 4 ×3\"), a setup step (\"OBS scene reset\"), a distraction. A tag must be specific enough that the same tag on a later run would mean the same problem happened again. No tag for a thing that went fine. Use the task minutes and pauses below as evidence — if the minutes went somewhere he didn't mention, a tag may still name it, but only when the numbers are clear.",
  "If he said nothing useful (\"fine\", \"nothing\"), note is his words as-is and tags is [].",
].join("\n");

const fmtMin = (m: number): string => (m < 1 ? "<1 min" : `${Math.round(m)} min`);

export function buildRetroMessages(req: RetroRequest): { system: string; user: string } {
  const tasks = req.taskMinutes.map((t) => `- ${t.label}: ${fmtMin(t.minutes)}${t.status === "skipped" ? " (skipped)" : ""}`);
  const pauses = req.pauses.map((p) => `- ${p.taskLabel ? `on "${p.taskLabel}"` : "between tasks"}, ${Math.round(p.seconds / 60)} min${p.reason ? ` — "${p.reason}"` : ""}`);
  const user = [
    `THE STEP: ${req.step}`,
    `WHAT LEE SAID:\n${req.spoken.trim().slice(0, 2000) || "(nothing)"}`,
    tasks.length ? `THE MINUTES:\n${tasks.join("\n")}` : "",
    pauses.length ? `PAUSES:\n${pauses.join("\n")}` : "PAUSES: none.",
  ].filter(Boolean).join("\n\n");
  return { system: RETRO_SYSTEM, user };
}

const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const clean = (s: string): string => s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();

/** A tag list, defended: strings only, cleaned, deduped case-insensitively, capped in length
 *  and count. Brackets are dropped so a tag can't break the "[tag] note" log form. */
export function normalizeRetroTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = clean(t).replace(/[[\]]/g, "").slice(0, RETRO_TAG_LEN).trim();
    if (tag && !out.some((x) => x.toLowerCase() === tag.toLowerCase())) out.push(tag);
    if (out.length >= RETRO_TAG_MAX) break;
  }
  return out;
}

/** The model's JSON, defended: a one-line note (his words when the model gave none) and the tags. */
export function parseRetro(text: string, spoken = ""): Retro | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: { note?: unknown; tags?: unknown };
  try { j = JSON.parse(m[0]); } catch { return null; }
  const note = (typeof j.note === "string" ? clean(j.note) : "").slice(0, RETRO_NOTE_LEN) || clean(spoken).slice(0, RETRO_NOTE_LEN);
  const tags = normalizeRetroTags(j.tags);
  if (!note && tags.length === 0) return null;
  return { note, tags };
}

/** "[waiting on Recraft] [re-recorded slide 4 ×3] the note" — the production_time_log form,
 *  so the consultant (and a grep) can read tags without parsing prose. No tags → the note alone. */
export function retroLogNote(note: string | null | undefined, tags: readonly string[] | null | undefined): string | null {
  const t = (tags ?? []).map((x) => `[${x}]`).join(" ");
  const n = (note ?? "").trim();
  const out = [t, n].filter(Boolean).join(" ");
  return out || null;
}
