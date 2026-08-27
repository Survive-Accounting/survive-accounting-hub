// THE CYCLING LETTERS GLYPH — one system, two surfaces: the Greek Portal card's icon on
// /preview/home and the ΑΤΩ half of the demo page's mode toggle. Both read the SAME config
// (greek-portal-orgs.ts), so reordering Lee's outreach priority list reorders every animation
// at once.
//
// MOTION RULES (from the spec): the glyph animates, never its container. Desktop cycles on
// hover only (`active`); mobile — where hover does not exist — runs a slow ambient cycle.
// prefers-reduced-motion pins it to the first (highest-priority) org, still.
//
// Hover capability and reduced motion are read in EFFECTS, never during render — these pages
// SSR, and matchMedia at render time makes the server and a phone disagree on the first paint.
import { useEffect, useRef, useState } from "react";

import { BRAND_DISPLAY } from "@/components/canvas/brand";
import { GREEK_PORTAL_ORGS } from "@/components/site/portal-home/greek-portal-orgs";

const FADE_MS = 260;

export function GreekLettersGlyph({ active = false, ambient = false, intervalMs, fontSize = 34, color = "var(--accent)", className }: {
  /** Desktop: cycle while true (the card is hovered/focused). Ignored when `ambient`. */
  active?: boolean;
  /** Force the slow always-on cycle regardless of hover capability (the demo toggle uses this). */
  ambient?: boolean;
  /** Cycle cadence. Defaults: 2000ms while hover-cycling, 4000ms ambient. */
  intervalMs?: number;
  fontSize?: number;
  color?: string;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [reduced, setReduced] = useState(false);
  // null until the effect answers — no cycling before we know the device, so SSR paints the
  // resting state and the client agrees.
  const [hoverCapable, setHoverCapable] = useState<boolean | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    setHoverCapable(!!window.matchMedia?.("(hover: hover)").matches);
  }, []);

  const cycling = !reduced && (ambient ? true : hoverCapable === null ? false : hoverCapable ? active : true);
  const period = intervalMs ?? (ambient || hoverCapable === false ? 4000 : 2000);

  useEffect(() => {
    if (!cycling) return;
    const tick = () => {
      setFading(true);
      timer.current = window.setTimeout(() => {
        setIdx((i) => (i + 1) % GREEK_PORTAL_ORGS.length);
        setFading(false);
      }, FADE_MS);
    };
    const iv = window.setInterval(tick, period);
    return () => { window.clearInterval(iv); if (timer.current) window.clearTimeout(timer.current); };
  }, [cycling, period]);

  const org = GREEK_PORTAL_ORGS[idx] ?? GREEK_PORTAL_ORGS[0];
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        fontFamily: BRAND_DISPLAY,
        fontWeight: 900,
        fontSize,
        lineHeight: 1,
        letterSpacing: "0.04em",
        color,
        opacity: fading ? 0 : 1,
        transition: reduced ? "none" : `opacity ${FADE_MS}ms ease`,
        // Widest entry in the config is 3 letters; a fixed ch-width keeps the layout from
        // breathing as the glyph swaps between 2- and 3-letter orgs.
        minWidth: "3.3ch",
        textAlign: "center",
      }}
    >
      {org.letters}
    </span>
  );
}
