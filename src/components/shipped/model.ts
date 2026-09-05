// SHIPPED — the build-in-public log. Pure helpers only: no React, no network, no Mux. The
// recorder, the confirm screen and the public pages all read what these return.
//
// Lee (2026-09-05): "a scrappy internal build-in-public recording tool… a lightweight ritual…
// Press R. Talk. Build. Stop. Publish. That's it." Keep this file exactly that small.

/** Spring Jan–May, Summer Jun–Jul, Fall Aug–Dec — basic and editable, per the brief. */
export function inferSemester(d: Date): string {
  const m = d.getMonth(); // 0-based
  const season = m <= 4 ? "Spring" : m <= 6 ? "Summer" : "Fall";
  return `${season} ${d.getFullYear()}`;
}

/** "September 5, 2026" — the header's date line. */
export function formatRecordDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

/** "the-title-of-a-thing" — lowercase, ascii, hyphens, never empty (falls back to "shipped"). */
export function slugifyTitle(title: string): string {
  const s = title.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "shipped";
}

/** A slug guaranteed not to collide with `taken` — "-2", "-3", … appended as needed. */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  const have = new Set(taken);
  if (!have.has(base)) return base;
  for (let n = 2; ; n++) { const s = `${base}-${n}`; if (!have.has(s)) return s; }
}

/** THE OUTRO GRID (Lee, 2026-09-05): "a configurable array of topics is enough" — what should I
 *  build next. Shown as the recorder's outro cue and as clickable buttons on a public entry. */
export const SHIPPED_TOPICS: readonly string[] = [
  "Building Survive Accounting",
  "AI tools I'm testing",
  "Making accounting shorts",
  "Campus expansion",
  "Greek chapter marketing",
  "Building with Claude Code",
  "Tutoring / course creation",
  "Entrepreneurship",
];

/** "Want to help build or promote Survive?" — a placeholder until a real destination exists
 *  (an application form, a Typeform, wherever Lee decides to send it). Configurable, not a
 *  system: change this one string when there's somewhere real to send people. */
export const SHIPPED_INVOLVEMENT_URL = "mailto:lee@surviveaccounting.com?subject=I%20want%20to%20help%20build%20Survive";

export const SHIPPED_URL = "https://surviveaccounting.com/shipped";

/** The outro's spoken cues, in the order Lee reads them. */
export const SHIPPED_OUTRO_LINES: readonly string[] = [
  "surviveaccounting.com/shipped",
  "Leave me a message",
  "Share with a friend",
  "Get involved",
];

export interface ShippedEntry {
  id: string;
  slug: string | null;
  title: string;
  topic: string | null;
  semester: string;
  recordedAt: string;
  durationSeconds: number | null;
  transcriptLive: string | null;
  transcriptMux: string | null;
  transcriptSource: "live" | "mux";
  notesHtml: string | null;
  notesPublic: boolean;
  muxUploadId: string | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  videoStatus: "uploading" | "processing" | "ready" | "errored";
  publishStatus: "draft" | "published";
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The transcript to show: Mux's, once it exists — it is generated from the real audio track
 *  and is not subject to a flaky browser session — otherwise the live draft. */
export function bestTranscript(e: Pick<ShippedEntry, "transcriptMux" | "transcriptLive">): string | null {
  return e.transcriptMux?.trim() || e.transcriptLive?.trim() || null;
}

/** A short line for the /shipped card — the first real sentence, not the whole thing. */
export function transcriptExcerpt(text: string | null, maxLen = 160): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  const cut = flat.slice(0, maxLen);
  return cut.slice(0, cut.lastIndexOf(" ")).trimEnd() + "…";
}

/** "4:32" / "0:47" — never negative, never NaN. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Mux's automatic thumbnail for a ready, public-policy asset — no server round trip needed. */
export function muxThumbnailUrl(playbackId: string, atSeconds = 1): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${atSeconds}`;
}

/** What a visitor may see: notes only when Lee marked them public; the Mux upload/asset ids
 *  and who recorded it are internal plumbing, never shown outside the admin surfaces. */
export function redactForPublic(e: ShippedEntry): ShippedEntry {
  return { ...e, notesHtml: e.notesPublic ? e.notesHtml : null, muxUploadId: null, muxAssetId: null, createdBy: null };
}

/** Parse a Mux-generated WebVTT track down to plain sentences — cue numbers, timestamps and
 *  blank lines dropped, consecutive duplicate lines (a common VTT artifact) collapsed. */
export function vttToPlainText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line) || /-->/i.test(line) || /^NOTE\b/.test(line)) continue;
    if (out[out.length - 1] !== line) out.push(line);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}
