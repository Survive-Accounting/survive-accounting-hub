// LEE, HAND-DRAWN — the portrait for the bio slide.
//
// Lee (2026-09-04): "can we try to bring the svg of me handdrawn out for the
// bio slide? Put it over the black background and maybe use the lime color
// from the /learn dashboard? I want to be able to toggle this on and off.
// Try to make it a quick animation."
//
// The drawing (lee-portrait.svg, his Inkscape export) is 516 filled shapes in
// stroke order — each pen stroke became a filled path — so a stroke-dashoffset
// "draw" is not available. Instead every shape appears in that same order, a
// few milliseconds apart, and the whole face inks itself in about a second and
// a half: it reads as the drawing being made. The fill is `currentColor`, so
// the colour is one prop; the default is the /learn lime.
import { useEffect, useRef } from "react";

import { LEARN } from "@/components/learn/learn-theme";

import portraitSvg from "./lee-portrait.svg?raw";

/** The drawing's own aspect (an A4 page: 210 × 297). */
export const PORTRAIT_RATIO = 297 / 210;
/** How long the whole drawing takes to ink itself, in ms. */
export const PORTRAIT_INK_MS = 1500;

const INK_CSS = `
@keyframes sa-ink-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
.sa-portrait path { opacity: 0; transform-origin: center; animation: sa-ink-in 140ms ease-out forwards; animation-delay: var(--ink, 0ms); }
.sa-portrait.sa-portrait-still path { opacity: 1; animation: none; }
@media (prefers-reduced-motion: reduce) { .sa-portrait path { opacity: 1; animation: none; } }
`;

export function LeePortrait({ width, color = LEARN.lime, animate = true, style }: {
  /** The drawing's width in px; the height follows the page. */
  width: number;
  color?: string;
  /** Ink it in over ~1.5 s (once, on mount); false = already drawn. */
  animate?: boolean;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Stagger the shapes in stroke order — the delay per path is the one thing
  // CSS cannot do from a static sheet, so it is set here after mount.
  useEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    const paths = el.querySelectorAll("path");
    const step = PORTRAIT_INK_MS / Math.max(1, paths.length);
    paths.forEach((p, i) => { (p as SVGPathElement).style.setProperty("--ink", `${Math.round(i * step)}ms`); });
  }, [animate]);
  return (
    <div ref={ref} className={`sa-portrait${animate ? "" : " sa-portrait-still"}`} aria-label="Lee Ingram, hand-drawn"
      style={{ width, height: Math.round(width * PORTRAIT_RATIO), color, lineHeight: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: `<style>${INK_CSS}</style>${portraitSvg.replace("<svg ", '<svg style="width:100%;height:100%;display:block" ')}` }} />
  );
}
