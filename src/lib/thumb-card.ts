// THE THUMBNAIL — the pure half of /api/thumb/<setId> (the route renders it).
//
// Lee, 2026-09-09, after finishing the first Blast Off short: "Thumbnails too that I can download
// that it generates?" A short is found by its cover before a word of it is heard, and the cover
// that earns a tap on exam-prep video is THE QUESTION — the thing a stuck student recognises as
// their own problem. So the card is one hook line, set as large as it will go, over the topic it
// belongs to. No face, no arrows, no yellow circles: the register is the same one CAPTION_SYSTEM
// holds to (memory: "no emoji/cringe in copy").
//
// Everything here is deterministic and untouched by the network — the wrapping in particular,
// because satori does not fit text to a box. We measure, break and size the lines ourselves and
// hand satori one div per line, so what the ladder decides is exactly what renders.

/** 9:16 is the cover every destination shows: the Shorts shelf, the Reels grid, the TikTok
 *  profile. 16:9 is the second slot YouTube fills — search results and the subscriptions feed. */
export const THUMB_RATIOS = ["9x16", "16x9"] as const;
export type ThumbRatio = (typeof THUMB_RATIOS)[number];
export const THUMB_SIZE: Record<ThumbRatio, { w: number; h: number }> = {
  "9x16": { w: 1080, h: 1920 },
  "16x9": { w: 1280, h: 720 },
};
export const isThumbRatio = (v: unknown): v is ThumbRatio =>
  typeof v === "string" && (THUMB_RATIOS as readonly string[]).includes(v);

/** Three grounds, so a channel grid of twenty shorts doesn't read as one repeated tile. The
 *  names are what the button says; the colours are the house palette, unchanged. */
export const THUMB_GROUNDS = ["navy", "gold", "cream"] as const;
export type ThumbGround = (typeof THUMB_GROUNDS)[number];
export const isThumbGround = (v: unknown): v is ThumbGround =>
  typeof v === "string" && (THUMB_GROUNDS as readonly string[]).includes(v);

export interface ThumbSkin { bg: string; ink: string; accent: string; boltA: string; boltB: string }
const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311";
export const THUMB_SKIN: Record<ThumbGround, ThumbSkin> = {
  navy: { bg: NAVY, ink: CREAM, accent: GOLD, boltA: GOLD, boltB: "#C97C08" },
  gold: { bg: GOLD, ink: NAVY, accent: NAVY, boltA: NAVY, boltB: "#0A1327" },
  cream: { bg: CREAM, ink: NAVY, accent: GOLD, boltA: GOLD, boltB: "#C97C08" },
};

// ─────────────────────────────────────────────────────────────────── the hook text

/** A stem carries the editor's text markers (`**bold**`, `==highlight==`, `~~strike~~`, `__u__`)
 *  and they must never reach the card as literal punctuation. Also collapses whitespace and
 *  drops a trailing choice list, which some stems append. */
export function cleanHook(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/==(.+?)==/gs, "$1")
    .replace(/~~(.+?)~~/gs, "$1")
    .replace(/~(\S(?:[^~\n]*?\S)?)~/g, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/_{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** THE DEFAULT HOOK, in the order of what a student would recognise: the first card's question,
 *  else the set's own name, else the topic. Long stems are cut at a sentence or clause rather
 *  than mid-word — a cover that trails off mid-thought reads as broken, not as a tease. */
export function defaultHook(setName: string, topicName: string, stems: readonly string[]): string {
  const first = cleanHook(stems.find((s) => s.trim()) ?? "");
  const pick = first || cleanHook(setName) || cleanHook(topicName);
  return trimToHook(pick);
}

/** At most `max` characters, broken at the last sentence end, then the last clause, then the last
 *  word — and only ellipsised when the text offers no break at all. A cut has to leave enough
 *  behind to still be a hook, hence MIN_HOOK. Returns "" for "" — never a lone ellipsis. */
const MIN_HOOK = 12;
export function trimToHook(text: string, max = 68): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  // A sentence keeps its terminator — "Is cash an asset?" is the hook, "Is cash an asset" isn't.
  const sentence = head.match(/^.*[.?!](?=\s)/s)?.[0].trim() ?? "";
  if (sentence.length >= MIN_HOOK) return sentence;
  const clause = (head.match(/^.*[,;:—-](?=\s)/s)?.[0] ?? "").replace(/[,;:—-]$/, "").trim();
  if (clause.length >= MIN_HOOK) return clause;
  const word = head.replace(/\s\S*$/, "").trim();
  if (word.length >= MIN_HOOK && word.length <= max) return word;
  return `${head.slice(0, max - 1).trim()}…`;
}

// ─────────────────────────────────────────────────────────── measuring and fitting

/** Rubik Black advance widths, in em, close enough to break lines by. Satori outlines the real
 *  face, so this only has to be right enough that a fitted line never overruns its box — which
 *  is why every unknown character takes the generous default. */
export function charEm(ch: string): number {
  if (ch === " ") return 0.29;
  if ("il1|!.,:;'".includes(ch)) return 0.34;
  if ("ftrIJ()[]-".includes(ch)) return 0.44;
  if ("MW".includes(ch)) return 0.98;
  if ("mw".includes(ch)) return 0.92;
  if (ch >= "A" && ch <= "Z") return 0.72;
  if (ch >= "0" && ch <= "9") return 0.62;
  return 0.6;
}

/** The width of a string at font-size 1. */
export function textEm(s: string): number {
  let w = 0;
  for (const ch of s) w += charEm(ch);
  return w;
}

/** Greedy word wrap to a pixel width at a given size. A single word wider than the box gets its
 *  own line and overruns — the ladder's job is to make sure that never happens, and a hard break
 *  mid-word would read worse than the rare tight line. */
export function wrapLines(text: string, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textEm(next) * size <= width || !line) line = next;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

export interface HookFit { size: number; lines: string[] }

/** THE SAFETY FACTOR. charEm approximates a real typeface, and the first render proved it runs
 *  about 2% light on lowercase Rubik Black — "Which describes internal users?" overran the safe
 *  column by 17px at 1080 wide. Rather than tune the table to one sample, every fit is measured
 *  against a slightly narrower box, so an underestimate has somewhere to go. */
export const FIT_SAFETY = 0.95;

/** THE LADDER. Largest size whose wrap fits the box in both directions; if nothing fits, the
 *  smallest rung, wrapped, so the card still renders. Lines are what the route draws — the
 *  caller never re-wraps. */
export function fitHook(text: string, box: { width: number; height: number }, opts?: { sizes?: readonly number[]; lineHeight?: number; safety?: number }): HookFit {
  const sizes = opts?.sizes ?? [200, 176, 154, 134, 118, 104, 92, 82, 72, 64];
  const lh = opts?.lineHeight ?? 1.06;
  const width = box.width * (opts?.safety ?? FIT_SAFETY);
  const t = text.trim();
  if (!t) return { size: sizes[sizes.length - 1], lines: [] };
  for (const size of sizes) {
    const lines = wrapLines(t, size, width);
    const tallest = lines.length * size * lh;
    const widest = Math.max(...lines.map((l) => textEm(l) * size));
    if (tallest <= box.height && widest <= width) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  return { size, lines: wrapLines(t, size, width) };
}

// ───────────────────────────────────────────────────────────────────── the eyebrow

/** The gold line above the hook: the topic, in caps, cut before it can wrap. */
export function eyebrowText(topicName: string, setName: string, max = 34): string {
  const t = cleanHook(topicName) || cleanHook(setName);
  const up = t.toUpperCase();
  return up.length <= max ? up : `${up.slice(0, max - 1).trimEnd()}…`;
}

/** The download's filename: kebab, ascii, always ending .png. */
export function thumbFilename(setName: string, ratio: ThumbRatio): string {
  const slug = cleanHook(setName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "short"}-thumb-${ratio}.png`;
}
