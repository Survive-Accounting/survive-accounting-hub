// THE GREEK HOUSE MARK — the right-hand door's icon on the homepage AND the chapter page.
//
// WHY IT MOVES, AND WHY SLOWLY. The left door already has the boiling bolt, which is fast and
// loud. A second fast thing beside it turns the row into a competition and neither reads. So the
// house is still and only its FLAG moves — one lazy wave on a ~6s cycle, the pace of a flag on a
// porch, not an animation. It is the difference between a building that is occupied and a
// building that is a picture of a building.
//
// TWO VARIANTS, ONE DRAWING:
//   "home"    — the house. You are looking at a chapter from outside: this is a way in.
//   "chapter" — the same house with the GPA arrow climbing behind it. You are already inside;
//               what this door does is make the number go up for everyone in there.
// The house geometry is byte-identical between them on purpose — the chapter page is the
// homepage that knows which house you came from, and the icon should say that before the copy does.
//
// Drawn in the bolt's hand-drawn language: jagged pediment with a lightning bite, zigzag columns,
// round caps, cream strokes, accent-token highlights. Nothing here is a real chapter's letters.
//
// LEE: this is the placeholder that holds the slot until your reference illustration lands. The
// motion contract (flag only, ~6s, reduced-motion-safe) is the part worth keeping.
import * as React from "react";

/** Both variants' motion. Included by the stylesheets that mount these icons. */
export const GREEK_HOUSE_CSS = `
@keyframes sa-flag-wave {
  0%   { transform: skewY(-2.5deg) scaleY(0.97); }
  50%  { transform: skewY(3.5deg) scaleY(1.03); }
  100% { transform: skewY(-2.5deg) scaleY(0.97); }
}
@keyframes sa-gpa-climb {
  0%   { transform: translateY(2.5px); opacity: 0.55; }
  55%  { transform: translateY(-2.5px); opacity: 1; }
  100% { transform: translateY(2.5px); opacity: 0.55; }
}
.sa-flag { transform-box: fill-box; transform-origin: left center; animation: sa-flag-wave 6.2s ease-in-out infinite; }
.sa-gpa-arrow { transform-box: fill-box; transform-origin: center bottom; animation: sa-gpa-climb 5.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .sa-flag, .sa-gpa-arrow { animation: none; }
}
`;

export function GreekHouseMark({ height = 96, variant = "home" }: {
  height?: number;
  /** "chapter" adds the climbing GPA arrow behind the house; the house itself is unchanged. */
  variant?: "home" | "chapter";
}) {
  const w = Math.round(height * (104 / 96));
  const cream = "var(--brand-cream)";
  return (
    <svg viewBox="0 0 104 96" width={w} height={height} fill="none" aria-hidden style={{ display: "block" }}>
      {/* THE GPA ARROW — chapter page only. Behind the house, so the house stays the subject and
          the arrow is what is happening TO it. */}
      {variant === "chapter" && (
        <g className="sa-gpa-arrow">
          <path d="M74 58 L82 46 L90 50 L98 30"
            stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M89 27 L99 28 L98 38"
            stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* THE FLAGPOLE — static. Only the cloth moves. */}
      <path d="M46 6 L46 30" stroke={cream} strokeWidth={4} strokeLinecap="round" />

      {/* THE FLAG — the one living thing on this side of the row. */}
      <path className="sa-flag" d="M47 8 L74 13 L47 21 Z"
        fill="var(--cta-chapter-bg)" stroke={cream} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* PEDIMENT with the lightning bite out of its slope — same bite the homepage temple had. */}
      <path d="M10 46 L38 27 L44 33 L54 23 L86 46 Z"
        stroke={cream} strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="49" cy="39" r="3" fill="var(--accent)" />

      {/* ARCHITRAVE, four zigzag columns, two steps. */}
      <path d="M16 52 L80 52" stroke={cream} strokeWidth={4.5} strokeLinecap="round" />
      {[27, 40, 53, 66].map((x) => (
        <path key={x} d={`M${x} 58 L${x - 2} 65 L${x + 2} 68 L${x} 75`}
          stroke={cream} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <path d="M20 81 L76 81" stroke={cream} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M12 88 L84 88" stroke={cream} strokeWidth={4.5} strokeLinecap="round" />
    </svg>
  );
}
