// THE CHAPTER DOOR'S ICON — the right-hand door on the homepage AND the chapter page.
//
// ── WHAT THIS USED TO BE, AND WHY IT ISN'T ────────────────────────────────────────────────────
// A bespoke drawing: a chapter house with a jagged pediment, a lightning bite out of its slope,
// zigzag columns and a flag on a pole that waved on a ~6s loop. It was drawn in the bolt's
// hand-drawn language so it would sit beside the boiling bolt without clashing.
//
// Lee's call (2026-08-31): it reads as bad. Replaced with a plain, conventional icon from
// lucide-react — the set the rest of the site already uses. No flag. No bolts embedded in it.
// Nothing here is bespoke, which means nothing here has to be maintained as artwork, and when a
// real commissioned icon set lands this slot is a one-line swap rather than a redraw.
//
// TWO VARIANTS, ONE ICON:
//   "home"    — the building. You are looking at a chapter from outside: this is a way in.
//   "chapter" — the same building with a small climbing arrow beside it. You are already inside;
//               what this door does is make the GPA go up for everyone in there.
// The building is byte-identical between them on purpose — the chapter page is the homepage that
// knows which house you came from, and the icon should say that before the copy does.
//
// The arrow is `TrendingUp`, also lucide. It is INFORMATION, not decoration: it is the only thing
// on the chapter door that says which direction the number moves. It is not a flag and not a
// bolt, so it is not what was asked to go.
import * as React from "react";

import { Building2, TrendingUp } from "lucide-react";

/** Retained as an EMPTY export so the two stylesheets that inject it keep compiling. The house
 *  animation it used to carry (a flag waving on a 6.2s loop, a GPA arrow climbing on 5.2s) is
 *  gone with the drawing — a lucide glyph is still, which is the point of using one.
 *
 *  Kept rather than deleted because removing it means touching Marketing.tsx and TwoDoorHome.tsx
 *  to drop the import, and this pass is not supposed to widen into files it has no other reason
 *  to open. When the next pass touches those files, delete this and its two call sites. */
export const GREEK_HOUSE_CSS = "";

export function GreekHouseMark({ height = 96, variant = "home" }: {
  height?: number;
  /** "chapter" adds the climbing GPA arrow beside the building; the building is unchanged. */
  variant?: "home" | "chapter";
}) {
  const cream = "var(--brand-cream)";
  // strokeWidth is scaled DOWN as the icon grows. lucide draws at 24px with a 2px stroke; at 96px
  // that same 2 renders as a hairline sketch, and bumping it to a constant 2.5 makes the small
  // renders look like a marker drawing. One ratio keeps the weight looking the same at any size.
  const stroke = Math.max(1.5, 24 / height * 2.2);

  if (variant === "chapter") {
    return (
      <span
        aria-hidden
        style={{ display: "inline-flex", alignItems: "flex-start", gap: height * 0.06 }}
      >
        <Building2 size={height} strokeWidth={stroke} color={cream} absoluteStrokeWidth={false} />
        <TrendingUp size={height * 0.38} strokeWidth={stroke * 1.6} color="var(--accent)" />
      </span>
    );
  }

  return <Building2 aria-hidden size={height} strokeWidth={stroke} color={cream} style={{ display: "block" }} />;
}
