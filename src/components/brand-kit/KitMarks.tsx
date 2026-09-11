// THE BRAND MARKS, INSIDE AN SVG COMPOSITION — the real bolt (brand.tsx's <Bolt>, the one every
// surface of the app draws) nested in a positioned <svg>, and the "surv[bolt]ve" wordmark laid out
// with SurviveWordmark's own numbers (lib/brand-kit/wordmark.ts). Static on purpose: exports are
// stills, so the mark is the dry geometry rather than a frame of the boil.
import { createContext, useContext } from "react";

import { DEFAULT_BOLT_SPEC } from "@/components/brand-cards/bolt-boil";
import { Bolt, BOLT_RATIO } from "@/components/canvas/brand";
import { boltRectCentered } from "@/lib/brand-kit/geometry";
import { measureText } from "@/lib/brand-kit/measure";
import { KIT } from "@/lib/brand-kit/tokens";
import { WORDMARK, wordmarkLayout } from "@/lib/brand-kit/wordmark";

interface BoltPaint { c1: string; c2: string; keyline?: string; opacity?: number }

/** LIVE ART (Lee, 2026-09-11: "boiling animation on hover"). Inside a live composition every bolt
 *  also carries the four boil frames (bolt-boil.tsx's DEFAULT_BOLT_SPEC — the same boil as the rest
 *  of the site), shown only while the art is hovered. At rest — and in every export, which has no
 *  hover — the dry bolt shows, so a live preview is still a correct export source. */
export const KitLiveContext = createContext(false);

export const KIT_LIVE_CSS = "@keyframes kit-boil{0%{opacity:1}24.99%{opacity:1}25%{opacity:0}100%{opacity:0}}"
  + ".kit-boil-f{opacity:0}"
  + ".kit-live:hover .kit-dry{opacity:0}"
  + ".kit-live:hover .kit-boil-f{animation:kit-boil .5s linear infinite}"
  + "@media (prefers-reduced-motion: reduce){.kit-live:hover .kit-dry{opacity:1}.kit-live:hover .kit-boil-f{animation:none}}";

function BoltInk({ c1, c2, keyline }: { c1: string; c2: string; keyline: string }) {
  const live = useContext(KitLiveContext);
  if (!live) return <Bolt c1={c1} c2={c2} keyline={keyline} />;
  const spec = DEFAULT_BOLT_SPEC;
  const mono = c1.toLowerCase() === c2.toLowerCase();
  return (
    <>
      <g className="kit-dry"><Bolt c1={c1} c2={c2} keyline={keyline} /></g>
      <svg viewBox={spec.viewBox} width="100%" height="100%" overflow="visible" aria-hidden>
        {spec.frames.map((f, i) => (
          <g key={i} className="kit-boil-f" style={{ animationDelay: `${(-0.125 * i).toFixed(3)}s` }}>
            <path d={f.outer} fill={c1} stroke={keyline} strokeWidth={f.sw} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
            {!mono && <path d={f.seam} fill={c2} />}
          </g>
        ))}
      </svg>
    </>
  );
}

/** The bolt in the rect (x, y, h × ratio, h) — `h` is the viewBox height, as everywhere else. */
export function KitBolt({ x, y, h, c1, c2, keyline = KIT.keyline, opacity }: BoltPaint & { x: number; y: number; h: number }) {
  return (
    <svg x={x} y={y} width={h * BOLT_RATIO} height={h} overflow="visible" opacity={opacity}>
      <BoltInk c1={c1} c2={c2} keyline={keyline} />
    </svg>
  );
}

/** The bolt with its INK `inkH` tall, centred on (cx, cy) — for a mark that must sit on its own
 *  centre rather than its viewBox's (the avatar, the concept bolt). */
export function KitBoltCentered({ cx, cy, inkH, c1, c2, keyline = KIT.keyline, opacity }: BoltPaint & { cx: number; cy: number; inkH: number }) {
  const r = boltRectCentered(cx, cy, inkH);
  return (
    <svg x={r.x} y={r.y} width={r.w} height={r.h} overflow="visible" opacity={opacity}>
      <BoltInk c1={c1} c2={c2} keyline={keyline} />
    </svg>
  );
}

function wordmarkMetrics(size: number) {
  const m = (t: string) => measureText(t, size, 900, KIT.display, WORDMARK.tracking);
  return wordmarkLayout(size, m("surv"), m("ve"));
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
