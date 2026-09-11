// THE SOCIAL KIT — the account-setup assets (Lee, 2026-09-11): ONE master avatar for Instagram,
// TikTok and YouTube, the YouTube banner, and the numbers that keep both honest at the sizes the
// platforms actually show them. Pure; the drawing is components/brand-kit/SocialArt.tsx.
import { BOLT_RATIO } from "@/components/canvas/brand";

import { boltReach } from "./geometry";

export interface Rect { x: number; y: number; w: number; h: number }

export function centeredRect(W: number, H: number, w: number, h: number): Rect {
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

// ── the avatar ───────────────────────────────────────────────────────────────────────────────

export const AVATAR = { size: 2048, filename: "survive-accounting-avatar.png" } as const;

/** The bolt's INK height as a share of the square. The default leaves the reach of the mark about
 *  a seventh of the radius clear of a circular crop; the page prints the exact clearance for
 *  whatever the slider says, and turns red below AVATAR_MIN_CLEARANCE. */
export const AVATAR_FILL = { min: 0.4, max: 0.76, step: 0.01, default: 0.66 } as const;
export const AVATAR_MIN_CLEARANCE = 0.06;

export function avatarClearance(fill: number, size: number = AVATAR.size) {
  const radius = size / 2;
  const reach = boltReach(fill * size);
  return { radius, reach, clearance: radius - reach, share: (radius - reach) / radius };
}

/** Reference text only — never baked into any image. */
export const PLATFORMS = [
  { id: "instagram", label: "Instagram", name: "Survive Accounting | Exam Prep" },
  { id: "tiktok", label: "TikTok", name: "Survive Accounting" },
  { id: "youtube", label: "YouTube", name: "Survive Accounting" },
] as const;

// ── the YouTube banner ───────────────────────────────────────────────────────────────────────

export const BANNER = { w: 2560, h: 1440, filename: "survive-accounting-youtube-banner.png" } as const;

/** YouTube's banner guidance (Help Center, "Manage your channel banner"): upload 2560×1440; the
 *  centred 1235×338 is the "safe area for text and logos", visible on every screen. Beyond it,
 *  desktop shows up to 2560×423, tablet 1855×423, mobile 1546×423, and a TV the whole image. */
export const BANNER_SAFE: Rect = centeredRect(BANNER.w, BANNER.h, 1235, 338);

export const BANNER_VIEWS: readonly { id: "desktop" | "tablet" | "mobile" | "tv"; label: string; rect: Rect }[] = [
  { id: "desktop", label: "Desktop", rect: centeredRect(BANNER.w, BANNER.h, 2560, 423) },
  { id: "tablet", label: "Tablet", rect: centeredRect(BANNER.w, BANNER.h, 1855, 423) },
  { id: "mobile", label: "Mobile", rect: centeredRect(BANNER.w, BANNER.h, 1546, 423) },
  { id: "tv", label: "TV", rect: { x: 0, y: 0, w: BANNER.w, h: BANNER.h } },
];

/** Lee's copy, verbatim. No "Like Reels for exam prep" here — the YouTube identity stands on its
 *  own and doesn't name another platform. */
export const BANNER_COPY = {
  tagline: ["Cram what's on your exam.", "Skip everything else."],
  cta: "EXAM 1 IS FREE",
  url: "SURVIVEACCOUNTING.COM",
} as const;

/** The type sizes of the centred stack, in banner pixels. */
export const BANNER_TYPE = {
  wordmark: 128,
  accounting: 30, accountingTracking: 0.34,
  tagline: 42, taglineLeading: 1.16,
  cta: 25, ctaTracking: 0.12, ctaPillH: 50,
  gaps: [18, 24, 22] as const,
} as const;

/** Where each line of the stack sits, centred in the safe area. Font-metric shares are Rubik's and
 *  Inter's (cap ≈ 0.7 em, descender ≈ 0.22 em); the wordmark's extent is its bolt (wordmark.ts). */
export function bannerStack() {
  const T = BANNER_TYPE;
  const wmTop = -T.wordmark * (0.8 - 0.13); // the bolt's top above the baseline (WORDMARK boltScale − drop)
  const wmBottom = T.wordmark * 0.13;
  const accCap = T.accounting * 0.7;
  const tagCap = T.tagline * 0.72;
  const tagDesc = T.tagline * 0.22;
  const height = (wmBottom - wmTop) + T.gaps[0] + accCap + T.gaps[1] + tagCap + T.tagline * T.taglineLeading + tagDesc + T.gaps[2] + T.ctaPillH;
  const top = BANNER_SAFE.y + (BANNER_SAFE.h - height) / 2;
  const wordmarkBaseline = top - wmTop;
  const accountingBaseline = wordmarkBaseline + wmBottom + T.gaps[0] + accCap;
  const tagline1 = accountingBaseline + T.gaps[1] + tagCap;
  const tagline2 = tagline1 + T.tagline * T.taglineLeading;
  const ctaTop = tagline2 + tagDesc + T.gaps[2];
  return { top, bottom: ctaTop + T.ctaPillH, height, wordmarkBaseline, accountingBaseline, taglineBaselines: [tagline1, tagline2] as const, ctaTop };
}

/** THE FAINT TRAIL behind the banner: six campus colourways, three a side, fading outward, every
 *  one of them outside the safe area so no bolt ever sits behind a word. Lee's examples, left to
 *  right: red/navy, purple/gold, orange/white, crimson/white, blue/orange, green/gold — resolved
 *  through the school table (colorwayFor), never retyped. */
export const BANNER_TRAIL_IDS = ["ole-miss", "lsu", "tennessee", "alabama", "florida", "oregon"] as const;

export interface TrailBolt { id: string; cx: number; cy: number; h: number; opacity: number; box: Rect }

export function bannerTrail(): TrailBolt[] {
  const mid = BANNER.w / 2, cy = BANNER.h / 2;
  // Outermost first, so the ids read left to right across the banner.
  const steps = [
    { dx: 1160, h: 240, opacity: 0.09 },
    { dx: 950, h: 270, opacity: 0.14 },
    { dx: 750, h: 300, opacity: 0.2 },
  ];
  const place = (cx: number, h: number) => ({ x: cx - (h * BOLT_RATIO) / 2, y: cy - h / 2, w: h * BOLT_RATIO, h });
  const left = steps.map((s) => ({ cx: mid - s.dx, h: s.h, opacity: s.opacity }));
  const right = [...steps].reverse().map((s) => ({ cx: mid + s.dx, h: s.h, opacity: s.opacity }));
  return [...left, ...right].map((p, i) => ({ id: BANNER_TRAIL_IDS[i], cx: p.cx, cy, h: p.h, opacity: p.opacity, box: place(p.cx, p.h) }));
}

// ── previews ─────────────────────────────────────────────────────────────────────────────────

/** The design-review grid of campus bolts. */
export const CAMPUS_CHECK_IDS = ["ole-miss", "lsu", "tennessee", "alabama", "arkansas", "georgia"] as const;

export const SOCIAL_COVER_FILENAME = "survive-accounting-social-cover.png";
