// THE THUMBNAIL SYSTEM — one composition, two outputs (Lee, 2026-09-11):
//
//   SITE    the poster inside /learn's 9:16 short card. The card already prints the lesson title
//           over the bottom of the picture, so the art carries none: a small series label, one
//           strong visual, a small campus bolt in the corner. No URL, no ticker, no course code.
//   SOCIAL  the 1080×1920 cover for Reels / TikTok / Shorts: the same art plus the title in the
//           lower third and a small wordmark, every critical word inside the profile-grid crops.
//
// Four content variants (STANDARD · CHEAT_CODE · MEMORIZE · DEEP_QUESTION) share the layout and
// differ only by a badge and its accent. A campus recolours the bolt, the accent dot, the hairline
// and the glow — never the composition.
//
// Everything here is arithmetic: the boxes, the title's line-breaking and sizing (handed a measure
// function, so tests need no canvas), the series label, the pictures' placement, the filenames and
// the numbering of the cram path. The drawing is components/brand-kit/ThumbnailArt.tsx.
import type { PlanTakeRow } from "@/lib/blastoff.functions";
import type { BoothTopic } from "@/lib/talkthrough.functions";

import type { Measure } from "./measure";

export const THUMB_W = 1080;
export const THUMB_H = 1920;

/** The social cover: what every destination's upload flow asks for. */
export const SOCIAL_EXPORT = { w: 1080, h: 1920, type: "image/png" } as const;
/** The site poster: the card is ~152×270 CSS px (fluid up to a column), so 720×1280 covers a 3×
 *  phone screen with room to spare, and WebP keeps it a fraction of the PNG. */
export const SITE_EXPORT = { w: 720, h: 1280, type: "image/webp", quality: 0.86 } as const;

export type ThumbMode = "site" | "social";

export const THUMB_VARIANTS = ["STANDARD", "CHEAT_CODE", "MEMORIZE", "DEEP_QUESTION"] as const;
export type ThumbVariant = (typeof THUMB_VARIANTS)[number];

export const VISUAL_TYPES = ["frame", "illustration", "concept"] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

/** The concept graphics, drawn from a line of typed content. "bolt" is the campus bolt itself. */
export const CONCEPT_KINDS = ["stat", "equation", "list", "vs", "bolt"] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];
export const CONCEPT_HINT: Record<ConceptKind, { label: string; placeholder: string }> = {
  stat: { label: "Big number", placeholder: "5 | TYPES" },
  equation: { label: "Equation", placeholder: "A = L + E" },
  list: { label: "List", placeholder: "Assets\nLiabilities\nEquity\nRevenues\nExpenses" },
  vs: { label: "This vs that", placeholder: "Cash | Accrual" },
  bolt: { label: "The bolt", placeholder: "" },
};

/** A picture and its natural size (the size decides the crop). `src` is a data: URL for anything
 *  picked on this machine, or a bank URL for an illustration. */
export interface KitImage { src: string; w: number; h: number }

export interface ThumbSpec {
  exam: number;
  /** "3" → "EXAM 1 · 03"; "Easy Points" → "EXAM 1 · EASY POINTS"; "" → "EXAM 1". */
  part: string;
  /** Replaces the series label outright when set (the social template's free eyebrow). */
  eyebrow: string;
  /** Social only: the small line over the title — the series a video belongs to ("TYPES OF ACCOUNTS"). */
  kicker: string;
  /** Social only. A line break forces one. */
  title: string;
  /** Social only: the largest the title may be set. A series sets it to the size its hardest title
   *  fits at, so five covers in a row read at one size. null = as large as this title fits. */
  titleCap: number | null;
  /** Social only, optional. */
  subtitle: string;
  variant: ThumbVariant;
  visualType: VisualType;
  frame: KitImage | null;
  /** 1 = the frame just fills the card. */
  frameZoom: number;
  /** -1 shows the top of an overhanging frame, 1 the bottom. */
  frameY: number;
  illustration: KitImage | null;
  illustrationZoom: number;
  concept: { kind: ConceptKind; text: string };
  ground: "navy" | "black";
  /** A soft campus-coloured glow behind the visual (not behind a frame) and the site bolt. */
  glow: boolean;
  /** The social cover's sign-off. */
  socialMark: "wordmark" | "bolt";
}

export function defaultThumbSpec(p: Partial<ThumbSpec> = {}): ThumbSpec {
  return {
    exam: 1, part: "", eyebrow: "", kicker: "", title: "", titleCap: null, subtitle: "",
    variant: "STANDARD", visualType: "concept",
    frame: null, frameZoom: 1, frameY: 0,
    illustration: null, illustrationZoom: 1,
    concept: { kind: "stat", text: "" },
    ground: "navy", glow: true, socialMark: "wordmark",
    ...p,
  };
}

/** "EXAM 1 · 03" for a number, "EXAM 1 · EASY POINTS" for a name, "EXAM 1" for nothing. */
export function seriesLabel(exam: number, part: string): string {
  const head = `EXAM ${exam}`;
  const p = part.trim();
  if (!p) return head;
  if (/^\d+$/.test(p)) return `${head} · ${p.padStart(2, "0")}`;
  return `${head} · ${p.toUpperCase()}`;
}

export function eyebrowOf(spec: Pick<ThumbSpec, "eyebrow" | "exam" | "part">): string {
  const e = spec.eyebrow.trim();
  return e ? e.toUpperCase() : seriesLabel(spec.exam, spec.part);
}

/** Why this can't be exported yet, or null. Exports never ship a placeholder. */
export function exportProblem(spec: ThumbSpec, mode: ThumbMode): string | null {
  if (spec.visualType === "frame" && !spec.frame) return "Pick a frame of the take first.";
  if (spec.visualType === "illustration" && !spec.illustration) return "Pick an illustration first.";
  if (spec.visualType === "concept" && spec.concept.kind !== "bolt" && !conceptParts(spec.concept.kind, spec.concept.text)) return "Type the concept first.";
  if (mode === "social" && !spec.title.trim()) return "The social cover needs its title.";
  return null;
}

// ── layout ───────────────────────────────────────────────────────────────────────────────────

export interface Box { x: number; y: number; w: number; h: number }

/** The profile-grid crops a cover has to survive: Instagram's grid and TikTok's profile show the
 *  centre 3:4 of a 9:16 cover; older grids and some embeds show the centre square. The title sits
 *  inside both; the series label and the wordmark inside the 3:4. */
export const GRID_CROPS: readonly { id: "3:4" | "1:1"; box: Box }[] = [
  { id: "3:4", box: { x: 0, y: 240, w: THUMB_W, h: 1440 } },
  { id: "1:1", box: { x: 0, y: 420, w: THUMB_W, h: 1080 } },
];

export const LAYOUT = {
  site: {
    pill: { x: 72, y: 72 },
    visual: { x: 60, y: 210, w: 960, h: 1400 },
    bolt: { h: 150, inset: 64 },
  },
  social: {
    pill: { x: 72, y: 284 },
    visual: { x: 90, y: 400, w: 900, h: 720 },
    title: { top: 1180, bottom: 1500, maxWidth: 900, maxSize: 150, minSize: 84, maxLines: 3, leading: 0.98 },
    kicker: { size: 46, tracking: 0.16, gap: 26 },
    subtitle: { size: 44, gap: 30 },
    accentLine: { w: 96, h: 8, gap: 40 },
    mark: { baseline: 1618, wordmark: 66, bolt: 120 },
  },
} as const;

/** THE SOCIAL LOWER THIRD, measured: kicker, title and subtitle share one band and are centred in
 *  it as a group; the title gets whatever height the other two leave. */
export function socialLowerThird(spec: Pick<ThumbSpec, "kicker" | "subtitle">) {
  const S = LAYOUT.social;
  const kickerH = spec.kicker.trim() ? S.kicker.size * 0.72 + S.kicker.gap : 0;
  const subtitleH = spec.subtitle.trim() ? S.subtitle.gap + S.subtitle.size * (0.72 + 0.22) : 0;
  return { top: S.title.top, bottom: S.title.bottom, kickerH, subtitleH, titleRoom: S.title.bottom - S.title.top - kickerH - subtitleH };
}

/** The social title's lines and size, inside the room the lower third leaves it and under its cap. */
export function fitSocialTitle(spec: Pick<ThumbSpec, "title" | "kicker" | "subtitle" | "titleCap">, measure: Measure): TitleLayout {
  const S = LAYOUT.social;
  const maxSize = spec.titleCap ? Math.max(S.title.minSize, Math.min(S.title.maxSize, Math.floor(spec.titleCap))) : S.title.maxSize;
  return layoutTitle(spec.title, measure, { ...S.title, maxSize, maxHeight: socialLowerThird(spec).titleRoom });
}

/** THE SERIES SIZE: the size the hardest title in a set fits at — the cap every cover in it shares. */
export function seriesTitleCap(specs: readonly Pick<ThumbSpec, "title" | "kicker" | "subtitle">[], measure: Measure): number | null {
  const sizes = specs.filter((s) => s.title.trim()).map((s) => fitSocialTitle({ ...s, titleCap: null }, measure).size);
  return sizes.length ? Math.min(...sizes) : null;
}

/** Rubik's cap height, as a share of the size — the title and every display line are placed by it. */
export const TITLE_CAP = 0.72;
/** The wordmark's tracking, used for every display line so the family reads as one. */
export const TITLE_TRACKING = -0.01;

export interface TitleLayout { lines: string[]; size: number; fits: boolean }

function wrapWords(text: string, size: number, measure: Measure, maxWidth: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || measure(next, size) <= maxWidth) cur = next;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

/** THE TITLE, as large as it will go: uppercase, Lee's own line breaks kept, greedy-wrapped inside
 *  the width, at the biggest size where every line fits, the lines are few enough and the block is
 *  short enough. `fits: false` = even the smallest size overflows — the editor says so. */
export function layoutTitle(raw: string, measure: Measure, o: { maxWidth: number; maxHeight: number; maxSize: number; minSize: number; maxLines: number; leading: number }): TitleLayout {
  const paras = raw.toUpperCase().split(/\n/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!paras.length) return { lines: [], size: o.maxSize, fits: true };
  const blockH = (n: number, s: number) => s * TITLE_CAP + (n - 1) * s * o.leading;
  for (let size = o.maxSize; size >= o.minSize; size -= 2) {
    const lines = paras.flatMap((p) => wrapWords(p, size, measure, o.maxWidth));
    if (lines.length <= o.maxLines && lines.every((l) => measure(l, size) <= o.maxWidth) && blockH(lines.length, size) <= o.maxHeight) {
      return { lines, size, fits: true };
    }
  }
  return { lines: paras.flatMap((p) => wrapWords(p, o.minSize, measure, o.maxWidth)), size: o.minSize, fits: false };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A picture filling `box` edge to edge (cropped, never letterboxed), scaled by `zoom` about the
 *  centre and slid vertically by `y` (-1 = its top edge, 1 = its bottom) within the overhang. */
export function coverRect(img: { w: number; h: number }, box: Box, zoom = 1, y = 0): Box {
  const s = Math.max(box.w / img.w, box.h / img.h) * Math.max(1, zoom);
  const w = img.w * s, h = img.h * s;
  const slack = h - box.h;
  return { x: box.x + (box.w - w) / 2, y: box.y - slack / 2 - clamp(y, -1, 1) * (slack / 2), w, h };
}

/** A picture whole inside `box`, centred, scaled by `zoom` (above 1 the box clips it). */
export function containRect(img: { w: number; h: number }, box: Box, zoom = 1): Box {
  const s = Math.min(box.w / img.w, box.h / img.h) * Math.max(0.2, zoom);
  const w = img.w * s, h = img.h * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// ── concept content ──────────────────────────────────────────────────────────────────────────

export type ConceptParts =
  | { kind: "stat"; value: string; caption: string }
  | { kind: "equation"; tokens: { text: string; op: boolean }[] }
  | { kind: "list"; items: string[] }
  | { kind: "vs"; a: string; b: string }
  | { kind: "bolt" };

const OPERATOR = /^[=+\-−×÷<>≠]$/;

/** What the typed line means for each concept graphic; null when there's nothing to draw. */
export function conceptParts(kind: ConceptKind, text: string): ConceptParts | null {
  if (kind === "bolt") return { kind: "bolt" };
  const t = text.trim();
  if (!t) return null;
  if (kind === "stat") {
    const bar = t.split("|");
    if (bar.length > 1) return { kind: "stat", value: bar[0].trim(), caption: bar.slice(1).join(" ").trim().toUpperCase() };
    const m = /^([\d$%.,]+)\s+(.+)$/.exec(t);
    return m ? { kind: "stat", value: m[1], caption: m[2].toUpperCase() } : { kind: "stat", value: t, caption: "" };
  }
  if (kind === "equation") {
    const tokens = t.replace(/([=+−×÷<>≠])/g, " $1 ").replace(/\s-\s/g, " - ").split(/\s+/).filter(Boolean)
      .map((s) => ({ text: s, op: OPERATOR.test(s) }));
    return tokens.length ? { kind: "equation", tokens } : null;
  }
  if (kind === "list") {
    const items = t.split(/\n|,|;/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
    return items.length ? { kind: "list", items } : null;
  }
  const pair = t.includes("|") ? t.split("|") : t.split(/\s+vs\.?\s+/i);
  const [a, b] = pair.map((s) => s.trim().toUpperCase());
  return pair.length === 2 && a && b ? { kind: "vs", a, b } : null;
}

// ── names and numbers ────────────────────────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

/** survive-exam-1-03-assets-cover-arkansas.png · …-site-arkansas.webp */
export function thumbFilename(spec: Pick<ThumbSpec, "exam" | "part" | "title">, colorwayId: string, mode: ThumbMode): string {
  const part = spec.part.trim();
  const bits = [`exam-${spec.exam}`, part ? slugify(/^\d+$/.test(part) ? part.padStart(2, "0") : part) : "", slugify(spec.title)].filter(Boolean);
  return `survive-${bits.join("-")}-${mode === "social" ? "cover" : "site"}-${colorwayId}.${mode === "social" ? "png" : "webp"}`;
}

export interface NumberableRow { key: string; set: { lane?: string }; topic: { kind?: string } }

/** THE CRAM PATH'S NUMBERS — the "03" in "EXAM 1 · 03" is a video's place on the path: every cram
 *  video (no lane; offshoots and pitches carry one) outside the strategy topic, counted from 1 in
 *  the bank's own topic → set → split order. Offshoots and pitches get no number; their label is a
 *  name instead. */
export function cramNumbers(rows: readonly NumberableRow[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const r of rows) {
    if (r.set.lane || r.topic.kind === "strategy") continue;
    out.set(r.key, ++n);
  }
  return out;
}

export interface VideoRow {
  /** The publish key: the set id, or "<setId>#N" from the second split on — as /v3/post keys it. */
  key: string;
  setId: string; setName: string; topicName: string;
  takeIndex: number; takeCount: number;
  /** The split's name, else the set's — what a cover calls the video. */
  title: string;
  cram: number | null;
}

/** One row per VIDEO, in bank order — the same flattening /v3/post does (a set with no cuts is one
 *  video keyed on its own id), numbered along the cram path. */
export function videoRows(topics: readonly BoothTopic[], takesBySet: ReadonlyMap<string, readonly PlanTakeRow[]>): VideoRow[] {
  const flat = topics.flatMap((t) => t.sets.flatMap((s) => {
    const takes = takesBySet.get(s.id) ?? [];
    const list = takes.length ? takes : [{ name: "" }];
    return list.map((tk, i) => ({
      key: i === 0 ? s.id : `${s.id}#${i + 1}`,
      set: s, topic: t, takeIndex: i, takeCount: list.length, takeName: tk.name,
    }));
  }));
  const nums = cramNumbers(flat);
  return flat.map((r) => ({
    key: r.key, setId: r.set.id, setName: r.set.name, topicName: r.topic.name,
    takeIndex: r.takeIndex, takeCount: r.takeCount,
    title: r.takeName.trim() || r.set.name,
    cram: nums.get(r.key) ?? null,
  }));
}
