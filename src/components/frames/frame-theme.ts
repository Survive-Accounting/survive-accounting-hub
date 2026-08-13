// FRAME THEME (frames/) — one place the frame palette becomes CSS variables. Frames read
// var(--brand-navy) / var(--bolt-primary) / … so a SCHOOL variant recolours a whole frame
// subtree by overriding ONLY --bolt-primary / --bolt-secondary / --accent. The structural
// palette (navy / cream / muted) keeps house defaults and never changes per school.
import type { CSSProperties } from "react";

import { boltColorById } from "@/components/canvas/brand";
import { BRAND_BLUE, BRAND_CREAM, BRAND_NAVY, BRAND_RED } from "@/components/brand-cards/bolt-boil";

export interface FrameTheme {
  navy?: string;          // --brand-navy
  cream?: string;         // --brand-cream
  boltPrimary?: string;   // --bolt-primary
  boltSecondary?: string; // --bolt-secondary
  muted?: string;         // --text-muted
  accent?: string;        // --accent
}

export const DEFAULT_FRAME_THEME: Required<FrameTheme> = {
  navy: BRAND_NAVY,
  cream: BRAND_CREAM,
  boltPrimary: BRAND_RED,
  boltSecondary: BRAND_BLUE,
  muted: "rgba(226,232,240,0.6)",
  accent: "#FCA311",
};

/** The theme as CSS custom properties — apply as inline style on a frame's root; every frame
 *  and every bolt inside reads them (BoltBoil falls back through --bolt-primary/-secondary). */
export function frameThemeVars(theme?: FrameTheme): CSSProperties {
  const t = { ...DEFAULT_FRAME_THEME, ...(theme ?? {}) };
  return {
    ["--brand-navy" as never]: t.navy,
    ["--brand-cream" as never]: t.cream,
    ["--bolt-primary" as never]: t.boltPrimary,
    ["--bolt-secondary" as never]: t.boltSecondary,
    ["--text-muted" as never]: t.muted,
    ["--accent" as never]: t.accent,
  } as CSSProperties;
}

/** School variant → theme: only the bolt colours + accent change (structure stays house).
 *  `id` matches a BOLT_PRESETS / SEC_SCHOOLS id (brand.tsx). */
export function schoolFrameTheme(id?: string | null): FrameTheme {
  if (!id) return {};
  const c = boltColorById(id);
  return { boltPrimary: c.c1, boltSecondary: c.c2, accent: c.c1 };
}
