// TALK THE CAPTION — Cross-post's one greenfield field (docs/USE-YOUR-WORDS-AUDIT.md §3). Lee,
// 2026-09-07: "'Use your words' is the fundamental value… Wherever we can click, talk, get
// suggestions." And on this exact moment: "now we're at the final editing point. Maybe one last
// thing comes around to enhance our video… Every second matters."
//
// After film, before post: Lee talks ~20 seconds about the set and the model writes the title,
// caption and hashtags for every destination from what already exists — the set's card stems,
// the prompter lines he KEPT in rehearsal (his own words, proofread), the talkthrough notes —
// and what he just said. Nothing here is typed first; typing is the fallback (edit a card).
//
// THE REGISTER is Lee's, not a marketer's (memory: "no emoji/cringe in copy"): no emoji, no
// hype, no "you won't believe", no exclamation stacks — a real person who teaches accounting
// telling you what the short is about. Hashtags are plain lowercase words.
//
// Pure: the messages for the micro lane, the parser for its answer, and the normalizer the
// server fn shares (a stored row is defended the same way a model answer is).

export const CAPTION_DESTINATIONS = ["youtube", "instagram", "tiktok", "site"] as const;
export type CaptionDestination = (typeof CAPTION_DESTINATIONS)[number];

export interface DestinationCaption {
  /** YouTube: ≤ 70 chars. TikTok: the short hook line. Site: the one-line description's heading
   *  (usually the set's name). Instagram: caption-first, so this may be empty. */
  title: string;
  /** YouTube 2–3 lines; Instagram the whole post; TikTok 1–2 lines; site ONE line. */
  caption: string;
  /** Without the '#', lowercase, no spaces. YouTube/TikTok 3–5, Instagram 5–10, site none. */
  hashtags: string[];
}
export type PublishCaptions = Record<CaptionDestination, DestinationCaption>;

export const CAPTION_LIMITS: Record<CaptionDestination, { title: number; caption: number; hashtags: [number, number] }> = {
  youtube: { title: 70, caption: 400, hashtags: [3, 5] },
  instagram: { title: 80, caption: 1200, hashtags: [5, 10] },
  tiktok: { title: 100, caption: 300, hashtags: [3, 5] },
  site: { title: 120, caption: 200, hashtags: [0, 0] },
};

export const CAPTION_DEST_LABEL: Record<CaptionDestination, string> = {
  youtube: "YouTube Shorts", instagram: "Instagram Reels", tiktok: "TikTok", site: "SurviveAccounting.com",
};

export interface CaptionRequest {
  setName: string;
  topicName: string;
  /** The set's card stems (what the short actually covers). */
  stems: readonly string[];
  /** The prompter lines Lee kept in rehearsal — his words, the closest thing to the take. */
  keptLines: readonly string[];
  /** Talkthrough notes for the set (rehearsal-context.ts composes them per card). "" = none. */
  talkthrough: string;
  /** What he just said about the set — spoken (or typed). "" = write from the sources alone. */
  spoken: string;
  /** THE TAKE, transcribed from the filmed video (`bun run captions <take.mp4>` writes the .srt
   *  beside it). His actual words on camera — the strongest source there is. "" = not filmed
   *  yet, or the transcript hasn't been run. Raw SRT/VTT goes through transcriptText() first. */
  transcript?: string;
  /** A previous answer being revised: keep what wasn't talked about. */
  previous?: PublishCaptions | null;
}

export const CAPTION_SYSTEM = [
  "You write the posting copy for ONE short-form video by Lee, who teaches accounting students at Survive Accounting. The video is a Blast Off set: a handful of exam-style questions taught fast, on camera, in his own words.",
  "THE VOICE IS LEE'S. A real person talking, not a brand. Plain words. First person is fine (\"I\", \"we\"). NO emoji anywhere. No hype, no clickbait (\"you won't believe\", \"secret\", \"hack\", \"game-changer\"), no exclamation stacks, no all-caps words, no \"Ready to…?\" openers, no calls to smash anything. If a sentence sounds like an ad, cut it. What he SAID about the set (WHAT LEE SAID) outranks everything else — if he named the angle, that's the angle. When THE TAKE is given it is the video's own words: take the topic, the order and the phrasing from it, and prefer a title naming what a student actually hears in the first five seconds.",
  "Return ONLY a JSON object with exactly these four keys: {\"youtube\": {\"title\": str, \"caption\": str, \"hashtags\": [str]}, \"instagram\": {...same}, \"tiktok\": {...same}, \"site\": {...same}}.",
  "youtube: title ≤ 70 characters, the topic in plain words (no colon-tricks, no #Shorts in the title). caption 2–3 short lines (use \\n between lines) saying what the short teaches and who it's for. hashtags 3–5.",
  "instagram: caption-first — the caption is the post (2–4 short lines, \\n between), the title can be empty or a 4–8 word first line. hashtags 5–10 (accounting, the topic, students, the exam).",
  "tiktok: title is ONE short hook line (≤ 100 characters) in his voice — a line he'd say, not a slogan. caption 1–2 lines. hashtags 3–5.",
  "site: title = the set's name (or the topic if the set name is a code), caption = ONE line (≤ 200 characters) describing the short for the site's listing, hashtags = [].",
  "Hashtags: lowercase, letters and digits only, no '#', no spaces, no duplicates within a destination. Prefer specific ones (the topic, the concept) over generic ones; #accounting and #cpa are fine once.",
  "SEARCH: this is exam-prep video — students find it by typing the thing they are stuck on. Put the plain-language concept in the first 40 characters of the YouTube title (\"contra accounts\", \"normal balances\", \"is prepaid rent an asset\"), and let the caption's first line repeat it as a sentence. Never keyword-stuff, and never write a title he wouldn't say out loud.",
  "A REVISION: when PREVIOUS is given, change only what WHAT LEE SAID asks for and keep the rest as it was.",
].join("\n");

/** A three-minute short transcribes to roughly 2,500 characters; 8,000 carries a long one whole
 *  and still leaves the micro lane room to answer. */
export const TRANSCRIPT_CAP = 8000;

/** An SRT, a VTT, or plain pasted text — reduced to the words. Cue numbers, timecode lines, the
 *  WEBVTT header and cue tags all go, and a line repeated back-to-back (what rolling captions do)
 *  collapses to one. Safe on anything: plain prose comes back as itself. */
export function transcriptText(raw: string): string {
  const out: string[] = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^WEBVTT/i.test(t) || /^(NOTE|STYLE|REGION)\b/i.test(t)) continue;
    if (/^\d+$/.test(t)) continue; // an SRT cue number
    if (/^[\d:.,]+\s*-->/.test(t)) continue; // a timecode line
    const clean = t.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (out[out.length - 1] === clean) continue; // a rolling-caption repeat
    out.push(clean);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

const cap = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function buildCaptionMessages(req: CaptionRequest): { system: string; user: string } {
  const stems = req.stems.map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const lines = req.keptLines.map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const user = [
    `THE SET: ${req.setName || "(unnamed)"} — topic: ${req.topicName || "(unknown)"}`,
    (req.transcript ?? "").trim() ? `THE TAKE — transcribed from the filmed video, his actual words on camera:\n${cap((req.transcript ?? "").trim(), TRANSCRIPT_CAP)}` : "",
    req.spoken.trim() ? `WHAT LEE SAID ABOUT IT (spoken, may be rough):\n${cap(req.spoken.trim(), 2000)}` : "WHAT LEE SAID ABOUT IT: nothing yet — write from the sources below.",
    lines.length ? `THE LINES HE KEPT FOR THE TAKE (his words, in order):\n${lines.map((l) => `- ${cap(l, 240)}`).join("\n")}` : "THE LINES HE KEPT FOR THE TAKE: none saved.",
    stems.length ? `THE CARDS THE SHORT COVERS:\n${stems.map((s) => `- ${cap(s, 240)}`).join("\n")}` : "",
    req.talkthrough.trim() ? `TALKTHROUGH NOTES:\n${cap(req.talkthrough.trim(), 1800)}` : "",
    req.previous ? `PREVIOUS:\n${JSON.stringify(req.previous)}` : "",
  ].filter(Boolean).join("\n\n");
  return { system: CAPTION_SYSTEM, user };
}

// Emoji and the pictographic block — the one thing the register rule can be enforced on.
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
export const stripEmoji = (s: string): string => s.replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").trim();

const oneLine = (s: string): string => s.replace(/\s*\n+\s*/g, " ").trim();

/** A hashtag list, defended: '#' stripped, lowercased, non-alphanumerics dropped, deduped,
 *  capped at the destination's maximum. A model that returned "#Accounting Exam" gives
 *  "accountingexam". */
export function normalizeHashtags(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw) || max <= 0) return [];
  const out: string[] = [];
  for (const h of raw) {
    if (typeof h !== "string") continue;
    const tag = h.replace(/#/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tag && tag.length <= 40 && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeOne(raw: unknown, dest: CaptionDestination): DestinationCaption | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lim = CAPTION_LIMITS[dest];
  const title = typeof r.title === "string" ? stripEmoji(oneLine(r.title)).slice(0, lim.title) : "";
  const captionRaw = typeof r.caption === "string" ? stripEmoji(r.caption).slice(0, lim.caption) : "";
  const caption = dest === "site" ? oneLine(captionRaw) : captionRaw.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  const hashtags = normalizeHashtags(r.hashtags, lim.hashtags[1]);
  if (!title && !caption) return null;
  return { title, caption, hashtags };
}

/** A stored or returned captions document, defended: every destination present (a missing one
 *  becomes empty), every string in the register (no emoji), every list capped. null only when
 *  nothing at all is usable — a row with just a YouTube title still parses. */
export function normalizeCaptions(raw: unknown): PublishCaptions | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out = {} as PublishCaptions;
  let any = false;
  for (const d of CAPTION_DESTINATIONS) {
    const one = normalizeOne(r[d], d);
    if (one) any = true;
    out[d] = one ?? { title: "", caption: "", hashtags: [] };
  }
  return any ? out : null;
}

/** The model's JSON, defended the same way. */
export function parseCaptions(text: string): PublishCaptions | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return normalizeCaptions(JSON.parse(m[0])); } catch { return null; }
}

/** What the copy button puts on the clipboard for one destination: title, caption, then the
 *  hashtags on their own line with the '#' back on. Empty parts are skipped. */
export function captionClipboardText(c: DestinationCaption): string {
  const tags = c.hashtags.map((h) => `#${h}`).join(" ");
  // An Instagram title that already opens the caption isn't repeated.
  const title = c.caption && c.caption.startsWith(c.title) ? "" : c.title;
  return [title, c.caption, tags].map((p) => p.trim()).filter(Boolean).join("\n\n");
}

/** True when a captions document has something to show for any destination. */
export const hasCaptions = (c: PublishCaptions | null | undefined): boolean =>
  !!c && CAPTION_DESTINATIONS.some((d) => !!(c[d].title || c[d].caption));
