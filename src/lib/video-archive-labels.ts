// video-archive-labels.ts — the PURE half of the archive labeler (client-safe, unit-tested).
// Enums, the prompt the AI gets, and the defensive parse of what it sends back. The server half
// (video-archive-labels.functions.ts) does the DB reads/writes and the model call.
//
// Labels turn ~1,300 legacy videos (title + transcript, nothing else) into a course library:
//   course_family · kind · chapter_number · source_ref (textbook item) · confidence · note

export const COURSE_FAMILIES = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const;
export type CourseFamily = (typeof COURSE_FAMILIES)[number];

export const VIDEO_KINDS = ["homework", "review", "cram"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];

export const COURSE_LABEL: Record<CourseFamily, string> = {
  intro_1: "Financial (Intro 1)",
  intro_2: "Managerial (Intro 2)",
  intermediate_1: "Intermediate 1",
  intermediate_2: "Intermediate 2",
};

/** The one line every gate returns when the columns are missing. Loud, names the file. */
export const LABELS_MIGRATION_HINT = "Run migration 20260917_1200_video_archive_labels.sql first";

/** Columns the gate watches for — any missing-schema error mentioning one of these means the migration is unapplied. */
export const LABEL_COLUMNS_RE = /kind|chapter_number|source_ref|position|playlist_key|label_source|label_confidence|label_note|labeled_at/i;

export const TRANSCRIPT_EXCERPT_CHARS = 1_800;
export const MAX_SOURCE_REF = 40;
export const MAX_NOTE = 500;
export const MAX_CHAPTER = 40;

export interface ParsedLabel {
  course_family: CourseFamily | null;
  kind: VideoKind | null;
  chapter_number: number | null;
  source_ref: string | null;
  confidence: number;
  note: string;
}

/** What one archive row contributes to the prompt. */
export interface LabelInput {
  title: string | null;
  duration_sec: number | null;
  transcript_text: string | null;
}

export const isCourseFamily = (v: unknown): v is CourseFamily =>
  typeof v === "string" && (COURSE_FAMILIES as readonly string[]).includes(v);
export const isVideoKind = (v: unknown): v is VideoKind =>
  typeof v === "string" && (VIDEO_KINDS as readonly string[]).includes(v);

const fmtDuration = (sec: number | null): string => {
  if (sec == null || !Number.isFinite(sec)) return "unknown";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")} (${Math.round(sec)}s)`;
};

export function buildLabelMessages(row: LabelInput): { system: string; user: string } {
  const system = [
    "You label legacy accounting tutoring videos so they can be filed into a course library. You get a title, a",
    "duration and the opening of the transcript. Reply with STRICT JSON only — one object, no prose, no fences:",
    '{"course_family": "...", "kind": "...", "chapter_number": 5, "source_ref": "E5.4", "confidence": 0.8, "note": "..."}',
    "",
    "course_family — exactly one of:",
    "  intro_1        = Financial Accounting (Wild-style textbook: QS / E / P items numbered chapter-dash, e.g.",
    "                   'QS 12-12', 'E 3-4', 'P 5-2A'; chapters 1-13; journal entries, adjusting entries, inventory,",
    "                   receivables, plant assets, liabilities, equity, cash flows, ratios).",
    "  intro_2        = Managerial Accounting (job order / process costing, CVP, budgeting, variances, relevant",
    "                   costing, capital budgeting).",
    "  intermediate_1 = Intermediate Accounting I, Kieso textbook (items like 'E5.4', 'P7.2', 'BE9.3';",
    "                   IA1 ≈ Kieso chapters 1-12: framework, statements, time value, cash, receivables,",
    "                   inventory, PP&E, depreciation, intangibles).",
    "  intermediate_2 = Intermediate Accounting II, Kieso (items like 'E17.18', 'P22.1B'; IA2 ≈ chapters 13-24:",
    "                   liabilities, bonds, equity, dilutive securities, investments, revenue, taxes, pensions,",
    "                   leases, changes/errors, cash flows, disclosure).",
    "",
    "kind — exactly one of:",
    "  homework = the video works one specific textbook item (a QS / E / P / BE problem). Put the item in source_ref,",
    "             normalized like the examples: Wild items 'QS 12-12' / 'E 5-4' / 'P 3-1A'; Kieso items 'E5.4' /",
    "             'P22.1B' / 'BE9.3'.",
    "  cram     = a short exam-focused run of one topic (typically under ~8 minutes, 'for the exam', 'you need to",
    "             know', speed-run feel). source_ref null.",
    "  review   = everything else: lecture-style explanation, chapter review, walkthrough of concepts. source_ref null.",
    "",
    "chapter_number — the textbook chapter as an integer, or null if you cannot tell. For Kieso IA2 keep the Kieso",
    "number (13-24), do not renumber.",
    "confidence — 0 to 1, how sure you are of course_family AND kind together. Be honest: a bare title with no",
    "transcript is rarely above 0.5.",
    "note — one short sentence on what tipped you (max 200 chars).",
    "Never invent a source_ref that is not in the title or transcript. If truly unsure, pick the best guess and lower confidence.",
  ].join("\n");

  const t = (row.transcript_text ?? "").replace(/\s+/g, " ").trim();
  const excerpt = t ? t.slice(0, TRANSCRIPT_EXCERPT_CHARS) + (t.length > TRANSCRIPT_EXCERPT_CHARS ? " …" : "") : "(no transcript)";
  const user = [
    `Title: ${row.title?.trim() || "(untitled)"}`,
    `Duration: ${fmtDuration(row.duration_sec)}`,
    `Transcript opening: ${excerpt}`,
  ].join("\n");
  return { system, user };
}

/** Pull the first JSON object out of a completion: fenced, padded with prose, or bare. */
function extractObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) return null;
  try {
    const v = JSON.parse(cleaned.slice(a, b + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const toInt = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\s*\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
};

/** Normalize a textbook ref: collapse whitespace, cap length, null when empty or a 'null'-ish word. */
export function cleanSourceRef(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || /^(null|none|n\/a|-|—)$/i.test(s)) return null;
  return s.slice(0, MAX_SOURCE_REF);
}

/**
 * Defensive parse of the model's reply. Returns null only when there is no JSON object at all.
 * Bad enum values become null (never a wrong label); a missing confidence is 0; a missing note is "".
 */
export function parseLabel(text: string): ParsedLabel | null {
  const obj = extractObject(text ?? "");
  if (!obj) return null;

  const course_family = isCourseFamily(obj.course_family) ? obj.course_family : null;
  const kind = isVideoKind(obj.kind) ? obj.kind : null;

  const ch = toInt(obj.chapter_number);
  const chapter_number = ch != null && ch >= 1 && ch <= MAX_CHAPTER ? ch : null;

  // A ref only makes sense on homework; a stray ref on a review/cram is dropped rather than filed.
  const source_ref = kind === "homework" ? cleanSourceRef(obj.source_ref) : null;

  let confidence = typeof obj.confidence === "number" ? obj.confidence : typeof obj.confidence === "string" ? Number(obj.confidence) : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(1, Math.max(0, confidence));

  const note = typeof obj.note === "string" ? obj.note.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) : "";

  return { course_family, kind, chapter_number, source_ref, confidence, note };
}
