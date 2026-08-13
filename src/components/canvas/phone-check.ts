// PHONE-LANDSCAPE CHECKS (pure, advisory) — most students watch on a phone held
// sideways. This models a realistic landscape-phone viewport, works out how big a
// frame's content actually renders there, and raises NON-BLOCKING warnings (text
// that would be too small, content near/over the edge, overlaps, weak contrast,
// cues off-screen). It never edits or blocks anything — purely informational.
//
// The frame is 16:9 and letterboxes to FIT inside the phone viewport, so the
// render scale is min(phoneW/frameW, phoneH/frameH). A 14px label on an 800px
// frame at a 0.6 card scale becomes 14 · 0.6 · renderScale on the phone.

/** A common landscape phone (logical CSS px). Roughly iPhone 14-class. */
export const PHONE_LANDSCAPE = { w: 844, h: 390 };

/** The smallest comfortably-readable rendered size on a phone. */
export const MIN_READABLE_PX = 14;

export interface PhoneEl {
  id: string;
  kind: string;
  /** Frame-space rectangle (px, frame origin at 0,0). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The element's effective on-frame text size (base × its card scale). */
  textPx: number;
  label?: string;
  /** Optional contrast pair for a low-contrast check. */
  fg?: [number, number, number];
  bg?: [number, number, number];
}

export type PhoneFlagLevel = "warn" | "info";
export interface PhoneFlag {
  level: PhoneFlagLevel;
  code: "text-too-small" | "off-frame" | "near-edge" | "overlap" | "low-contrast";
  message: string;
  elId?: string;
}

/** Fit-inside render scale of a 16:9 frame within the phone viewport. */
export function phoneRenderScale(frameW: number, frameH: number, phoneW = PHONE_LANDSCAPE.w, phoneH = PHONE_LANDSCAPE.h): number {
  if (frameW <= 0 || frameH <= 0) return 1;
  return Math.min(phoneW / frameW, phoneH / frameH);
}

function overlapArea(a: PhoneEl, b: PhoneEl): number {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ox * oy;
}

// WCAG relative luminance + contrast ratio (0..21).
function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface PhoneCheckInput {
  frameW: number;
  frameH: number;
  phoneW?: number;
  phoneH?: number;
  elements: PhoneEl[];
  /** Safe inset as a fraction of the frame (content should stay inside). */
  safeInset?: number;
  minReadablePx?: number;
}

/** Run every advisory check, warnings first. Deterministic + side-effect-free. */
export function phoneChecks(input: PhoneCheckInput): PhoneFlag[] {
  const { frameW, frameH, elements } = input;
  const phoneW = input.phoneW ?? PHONE_LANDSCAPE.w;
  const phoneH = input.phoneH ?? PHONE_LANDSCAPE.h;
  const safe = input.safeInset ?? 0.05;
  const minPx = input.minReadablePx ?? MIN_READABLE_PX;
  const scale = phoneRenderScale(frameW, frameH, phoneW, phoneH);
  const sx = safe * frameW;
  const sy = safe * frameH;
  const flags: PhoneFlag[] = [];

  for (const el of elements) {
    const label = el.label || el.kind;
    // text too small once rendered on the phone
    if (el.textPx > 0) {
      const rendered = el.textPx * scale;
      if (rendered < minPx) {
        flags.push({ level: "warn", code: "text-too-small", elId: el.id, message: `${label}: text ≈ ${rendered.toFixed(1)}px on a phone (aim ≥ ${minPx}px)` });
      }
    }
    // outside the frame entirely
    if (el.x < 0 || el.y < 0 || el.x + el.w > frameW || el.y + el.h > frameH) {
      flags.push({ level: "warn", code: "off-frame", elId: el.id, message: `${label}: extends outside the frame — it'll be cropped on camera` });
    } else if (el.x < sx || el.y < sy || el.x + el.w > frameW - sx || el.y + el.h > frameH - sy) {
      // inside the frame but into the phone-unsafe margin
      flags.push({ level: "warn", code: "near-edge", elId: el.id, message: `${label}: close to the edge — may clip in the phone-safe area` });
    }
    // low contrast (only when both colors are supplied)
    if (el.fg && el.bg) {
      const cr = contrastRatio(el.fg, el.bg);
      if (cr < 3) flags.push({ level: "warn", code: "low-contrast", elId: el.id, message: `${label}: low contrast (${cr.toFixed(1)}:1) — hard to read compressed` });
    }
  }

  // overlaps (informational) — flag a pair once when they cover a meaningful chunk
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i], b = elements[j];
      const ov = overlapArea(a, b);
      const smaller = Math.min(a.w * a.h, b.w * b.h);
      if (smaller > 0 && ov / smaller > 0.15) {
        flags.push({ level: "info", code: "overlap", message: `${a.label || a.kind} overlaps ${b.label || b.kind}` });
      }
    }
  }

  return flags.sort((x, y) => (x.level === y.level ? 0 : x.level === "warn" ? -1 : 1));
}

/** A base text size per card kind — the smallest meaningful text on that card
 *  (before the card's own scale). Used to estimate phone readability from node
 *  data without measuring the DOM. */
export function baseTextPxForKind(kind: string): number {
  switch (kind) {
    case "heading": return 30;
    case "note": case "text": case "memo": return 12.5;
    case "je": case "list": case "taccount": case "computation": case "schedule": case "ceq": case "formula": return 14;
    default: return 13;
  }
}
