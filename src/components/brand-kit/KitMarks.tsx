// THE BRAND MARKS, INSIDE AN SVG COMPOSITION — the real bolt (brand.tsx's <Bolt>, the one every
// surface of the app draws) nested in a positioned <svg>, and the "surv[bolt]ve" wordmark laid out
// with SurviveWordmark's own numbers (lib/brand-kit/wordmark.ts). Static on purpose: exports are
// stills, so the mark is the dry geometry rather than a frame of the boil.
import { Bolt, BOLT_RATIO } from "@/components/canvas/brand";
import { boltRectCentered } from "@/lib/brand-kit/geometry";
import { measureText } from "@/lib/brand-kit/measure";
import { KIT } from "@/lib/brand-kit/tokens";
import { WORDMARK, wordmarkLayout } from "@/lib/brand-kit/wordmark";

interface BoltPaint { c1: string; c2: string; keyline?: string; opacity?: number }

/** The bolt in the rect (x, y, h × ratio, h) — `h` is the viewBox height, as everywhere else. */
export function KitBolt({ x, y, h, c1, c2, keyline = KIT.keyline, opacity }: BoltPaint & { x: number; y: number; h: number }) {
  return (
    <svg x={x} y={y} width={h * BOLT_RATIO} height={h} overflow="visible" opacity={opacity}>
      <Bolt c1={c1} c2={c2} keyline={keyline} />
    </svg>
  );
}

/** The bolt with its INK `inkH` tall, centred on (cx, cy) — for a mark that must sit on its own
 *  centre rather than its viewBox's (the avatar, the concept bolt). */
export function KitBoltCentered({ cx, cy, inkH, c1, c2, keyline = KIT.keyline, opacity }: BoltPaint & { cx: number; cy: number; inkH: number }) {
  const r = boltRectCentered(cx, cy, inkH);
  return (
    <svg x={r.x} y={r.y} width={r.w} height={r.h} overflow="visible" opacity={opacity}>
      <Bolt c1={c1} c2={c2} keyline={keyline} />
    </svg>
  );
}

function wordmarkMetrics(size: number) {
  const m = (t: string) => measureText(t, size, 900, KIT.display, WORDMARK.tracking);
  return wordmarkLayout(size, m("surv"), m("ve"));
}

export function wordmarkWidth(size: number): number {
  return wordmarkMetrics(size).width;
}

/** "surv[bolt]ve". `x` is the left edge — or the centre, with anchor "middle"; `baseline` is the
 *  type's baseline. The letters are cream; the bolt takes the campus colours. */
export function KitWordmark({ x, baseline, size, ink = KIT.cream, c1 = KIT.boltLit, c2 = KIT.boltShade, keyline = KIT.keyline, anchor = "start" }: {
  x: number; baseline: number; size: number; ink?: string; c1?: string; c2?: string; keyline?: string; anchor?: "start" | "middle";
}) {
  const L = wordmarkMetrics(size);
  const x0 = anchor === "middle" ? x - L.width / 2 : x;
  const type = { fontFamily: KIT.display, fontWeight: 900, fontSize: size, letterSpacing: size * WORDMARK.tracking };
  return (
    <g transform={`translate(${x0} ${baseline})`}>
      <text x={0} y={0} fill={ink} style={type}>surv</text>
      <g transform={`rotate(${WORDMARK.lean} ${L.pivotX} ${L.pivotY})`}>
        <KitBolt x={L.boltX} y={L.boltY} h={L.boltH} c1={c1} c2={c2} keyline={keyline} />
      </g>
      <text x={L.veX} y={0} fill={ink} style={type}>ve</text>
    </g>
  );
}
