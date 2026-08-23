// THE ANIMATED CAMPUS BOLT.
//
// One brand bolt, two school colours, and the next campus CHARGING upward through it — then
// stopping dead so the school can be read. Movement, rest, movement, rest. See useBoltRotation for
// the beat and bolt-config for the two numbers (CHARGE_MS, DWELL_MS) that set it.
//
// GEOMETRY IS FIXED ARTWORK (bolt-geometry.ts → brand.tsx). ONE path, BOLT_OUTER, is the interior
// clip, the visible white outline AND the glow, so they cannot disagree. BOLT_RIGHT supplies the
// internal zig-zag divider, untouched.
//
// PAINT ORDER — exactly the order the ticket asks for, top of the file = back of the stack:
//   1. shadow + glow      blurred copies of the silhouette; static, never move
//   2. LEFT lane          the primary colour, clipped to the WHOLE silhouette
//   3. RIGHT lane         the secondary/accent, masked to BOLT_RIGHT, painted OVER the left
//   4. WHITE OUTLINE      a stroke of BOLT_OUTER, LAST, over everything
//
// WHY THERE IS NO GAP AT THE OUTLINE: the fill is clipped to the silhouette and the outline is a
// stroke CENTRED on that same silhouette, so half the stroke always lies on top of the fill. The
// navy can never appear between them because there is nothing between them.
//
// WHY THERE IS NO SEAM AT THE DIVIDER: the left lane paints the ENTIRE interior, so there is always
// colour underneath the divider; the right lane is then laid on top through a mask that is
// BOLT_RIGHT filled AND stroked by SEAM_OVERLAP, dilating the region by a fraction of a unit so
// anti-aliasing has colour on both sides of every edge pixel. The divider's geometry is unchanged.
//
// WHY IT DOES NOT LOOK LIKE SCAN LINES: there are no bands. Each campus is ONE parallelogram filled
// with ONE gradient whose tone wave has RIBBON_COUNT broad crests, so the smallest moving feature
// is a large fraction of the bolt. What you see is a sheen driving through a colour, plus the
// leaning edge where one campus hands over to the next.
//
// THE PHASE IS ON THE DOM, NOT IN REACT. useBoltRotation writes data-phase="charge"|"rest" onto
// the host, and the stylesheet does the rest: the caption fades out for the charge and back in for
// the rest, and the idle float runs during rest only. No render is needed to change either.
//
// Motion is two transform writes per frame DURING THE CHARGE and nothing at all during the dwell.
// React re-renders twice per campus (the queue, the caption), and not otherwise.
import { useEffect, useMemo, useRef, useState } from "react";

import { BRAND_DISPLAY } from "@/components/canvas/brand";
import {
  CAPTION_FADE_MS,
  CHARGE_EASE,
  DEFAULT_BOLT_TUNING,
  GLOW_COLOR,
  IDLE_FLOAT_MS,
  REDUCED_MOTION_DWELL_MS,
  REDUCED_MOTION_FADE_MS,
  SHADOW_BLUR,
  SHADOW_DY,
  SHADOW_OPACITY,
  type BoltTuning,
} from "./bolt-config";
import {
  BOLT_OUTER,
  BOLT_RIGHT,
  BOLT_VIEWBOX,
  PANEL_SLOTS,
  VB,
  panelGradientAxis,
  panelPoints,
  ribbonStops,
} from "./bolt-geometry";
import { getBoltPalette, shade, type BoltCampus } from "./bolt-palette";
import { useBoltRotation } from "./useBoltRotation";

export type { BoltCampus } from "./bolt-palette";

export type AnimatedCampusBoltProps = {
  /** The campuses to flow through, IN THE ORDER THEY SHOULD PLAY. Order them with
   *  `orderCampuses()` from bolt-campuses.ts — this component plays what it is given. */
  campuses: BoltCampus[];
  /** Run the conveyor. false = a static two-colour bolt on the first campus. Default true. */
  autoplay?: boolean;
  /** Show the plate under the bolt ("for ACCT 2110 · AUBURN"). Default true. */
  showLabel?: boolean;
  /** Makes the bolt a button. Receives the campus the plate is naming at the moment of the click. */
  onActivate?: (campus: BoltCampus) => void;
  className?: string;
  ariaLabel?: string;
  /** Fires when the visually dominant campus changes — what the plate is naming. The lab reads it
   *  for its diagnostics; production surfaces are welcome to ignore it. */
  onCampusChange?: (campus: BoltCampus) => void;
  /** A whisper of a label revealed on hover/focus, saying what the click does ("Start studying ↓").
   *  Ignored unless the bolt is clickable, and hidden entirely on touch. Omit for no hint. */
  hint?: string;
  /** TUNING OVERRIDES — the lab's control panel. Production passes nothing. */
  tuning?: Partial<BoltTuning>;
};

export function AnimatedCampusBolt({
  campuses,
  autoplay = true,
  showLabel = true,
  onActivate,
  className,
  ariaLabel = "Cram Exam 1 Free",
  onCampusChange,
  hint,
  tuning: tuningOverride,
}: AnimatedCampusBoltProps) {
  const t: BoltTuning = useMemo(
    () => ({ ...DEFAULT_BOLT_TUNING, ...tuningOverride }),
    [tuningOverride],
  );

  // prefers-reduced-motion is read in an effect, never during render: these surfaces are
  // server-rendered, and asking matchMedia while rendering makes the server and a reduced-motion
  // client disagree about the very first paint.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener?.("change", read);
    return () => mq.removeEventListener?.("change", read);
  }, []);

  // IDS ARE DERIVED, NOT GENERATED. useId() produced different values on the server and the client
  // here once before (the hero sits under a lazy route boundary and React's tree-position ids did
  // not line up across it), and every page with a hero logged a hydration mismatch. The id only has
  // to be unique per bolt on one page, so it is hashed from what the bolt IS.
  const uid = useMemo(() => {
    const seedStr = `${ariaLabel}|${campuses.map((c) => c.id).join(",")}`;
    let h = 0;
    for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }, [ariaLabel, campuses]);

  const hostRef = useRef<HTMLElement>(null);
  const { panels, labelCampus, leftLaneRef, rightLaneRef, running } = useBoltRotation(campuses, {
    autoplay,
    reduced,
    chargeMs: t.chargeMs,
    dwellMs: t.dwellMs,
    panelSpan: t.panelSpan,
    ease: CHARGE_EASE,
    captionSwapProgress: t.captionSwapProgress,
    reducedDwellMs: REDUCED_MOTION_DWELL_MS,
    hostRef,
  });

  const notifyRef = useRef(onCampusChange);
  notifyRef.current = onCampusChange;
  const labelId = labelCampus?.id;
  useEffect(() => {
    if (labelCampus) notifyRef.current?.(labelCampus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelId]);

  if (!campuses.length || !labelCampus) return null;

  const id = {
    clip: `acb-clip-${uid}`,
    mask: `acb-mask-${uid}`,
    glow: `acb-glow-${uid}`,
    shadow: `acb-shadow-${uid}`,
    grad: (lane: "l" | "r", slot: number) => `acb-g${lane}${slot}-${uid}`,
  };

  const paletteOf = (c: BoltCampus) =>
    getBoltPalette(c, { useLightFallback: t.useLightFallback, useDarkFallback: t.useDarkFallback });

  const stops = ribbonStops(t.ribbonCount);
  const toneMix = (tone: 0 | 1 | -1) =>
    tone === 1 ? t.ribbonToneLight : tone === -1 ? -t.ribbonToneDeep : 0;

  /** One campus panel per slot, per lane. Slot index decides WHERE it sits; the campus decides
   *  what colour it is. Both lanes draw the identical geometry and share one transform, so the two
   *  halves of the bolt can never drift apart — they are two views of the same moving object. */
  const lane = (side: "l" | "r") =>
    panels.map((campus, i) => (
      <polygon
        key={i}
        points={panelPoints(i, t.panelSpan, t.ribbonAngle)}
        fill={`url(#${id.grad(side, i)})`}
      />
    ));

  const flat = paletteOf(panels[0] ?? labelCampus);

  const boltSvg = (
    <svg
      viewBox={BOLT_VIEWBOX}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id={id.clip}>
          <path d={BOLT_OUTER} />
        </clipPath>
        {/* THE DIVIDER, dilated by SEAM_OVERLAP so anti-aliasing has colour on both sides of every
            edge pixel. Fill AND stroke, both white: the mask's luminance is the region. */}
        <mask
          id={id.mask}
          maskUnits="userSpaceOnUse"
          x={VB.x - 40}
          y={VB.y - 40}
          width={VB.w + 80}
          height={VB.h + 80}
        >
          <path
            d={BOLT_RIGHT}
            fill="#FFFFFF"
            stroke="#FFFFFF"
            strokeWidth={t.seamOverlap}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </mask>
        <filter id={id.glow} x="-60%" y="-40%" width="220%" height="180%">
          <feGaussianBlur stdDeviation={t.glowBlur} />
        </filter>
        <filter id={id.shadow} x="-60%" y="-40%" width="220%" height="180%">
          <feGaussianBlur stdDeviation={SHADOW_BLUR} />
        </filter>
        {!reduced &&
          (["l", "r"] as const).map((side) =>
            panels.map((campus, i) => {
              const p = paletteOf(campus);
              const base = side === "l" ? p.leftColor : p.rightColor;
              const axis = panelGradientAxis(i, t.panelSpan, t.ribbonAngle);
              return (
                <linearGradient
                  key={`${side}${i}`}
                  id={id.grad(side, i)}
                  gradientUnits="userSpaceOnUse"
                  {...axis}
                >
                  {stops.map((s, j) => (
                    <stop key={j} offset={s.offset} stopColor={shade(base, toneMix(s.tone))} />
                  ))}
                </linearGradient>
              );
            }),
          )}
      </defs>

      {/* 1 ─ SHADOW + GLOW. Blurred copies of the silhouette, painted first and never moved, so the
             browser rasterises them once. The glow is the identity anchor: it does not flow. */}
      <g className="acb-shadow">
        <path
          d={BOLT_OUTER}
          fill="#000000"
          filter={`url(#${id.shadow})`}
          transform={`translate(0 ${SHADOW_DY})`}
        />
      </g>
      <g className="acb-glow">
        <path d={BOLT_OUTER} fill={GLOW_COLOR} filter={`url(#${id.glow})`} />
      </g>

      {/* 2 + 3 ─ THE FILL, clipped to the exact silhouette so the colour reaches the very edge. */}
      <g clipPath={`url(#${id.clip})`}>
        {reduced ? (
          <>
            <path className="acb-flat" d={BOLT_OUTER} fill={flat.leftColor} />
            <g mask={`url(#${id.mask})`}>
              <path className="acb-flat" d={BOLT_OUTER} fill={flat.rightColor} />
            </g>
          </>
        ) : (
          <>
            <g ref={leftLaneRef}>{lane("l")}</g>
            <g mask={`url(#${id.mask})`}>
              <g ref={rightLaneRef}>{lane("r")}</g>
            </g>
          </>
        )}
      </g>

      {/* 4 ─ THE WHITE OUTLINE, LAST. Centred on the silhouette: half of it frames the bolt, half
             covers the fill's own anti-aliased edge. Visible white ≈ outlineWidth / 2. */}
      <path
        className="acb-outline"
        d={BOLT_OUTER}
        fill="none"
        stroke="var(--acb-outline-color)"
        strokeWidth={t.outlineWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );

  // NO `key` ON THE PLATE, deliberately. Keying it on the campus remounted the caption every time
  // the school changed, which restarted a CSS entrance animation and made the words pop on their
  // own schedule — the "caption changes independently of the bolt" problem. The caption is now
  // faded by the PHASE (see the stylesheet) and its text is swapped in place while it is invisible,
  // so the bolt and the words are one movement.
  const plate =
    showLabel && (labelCampus.code || labelCampus.name) ? (
      <span className="acb-plate" style={{ fontFamily: BRAND_DISPLAY }}>
        <span className="acb-plate-for">for </span>
        {labelCampus.code ? <span className="acb-plate-em">{labelCampus.code}</span> : null}
        {labelCampus.code && labelCampus.name ? <span className="acb-plate-dot"> · </span> : null}
        {labelCampus.name ? (
          <span className="acb-plate-em">{labelCampus.name.toUpperCase()}</span>
        ) : null}
      </span>
    ) : null;

  const hostStyle = {
    ["--acb-glow-o" as string]: String(t.glowOpacity),
    ["--acb-glow-hover-o" as string]: String(t.glowHoverOpacity),
    ["--acb-shadow-o" as string]: String(SHADOW_OPACITY),
    ["--acb-fade" as string]: `${REDUCED_MOTION_FADE_MS}ms`,
    ["--acb-caption-fade" as string]: `${CAPTION_FADE_MS}ms`,
    // The float belongs to the ROTATION. A pinned single-campus bolt (a campus page) is a static
    // mark and must not drift; only a bolt that is actually cycling gets idle life.
    ["--acb-float-px" as string]: `${running ? t.idleFloatPx : 0}px`,
    ["--acb-float-ms" as string]: `${IDLE_FLOAT_MS}ms`,
    WebkitTapHighlightColor: "transparent",
  } as React.CSSProperties;

  // The hint is a hover affordance, so it only exists where hovering can do something.
  const hintText = onActivate ? hint : undefined;

  const inner = (
    <>
      <span className="acb-bolt">{boltSvg}</span>
      {plate}
      {hintText ? (
        <span className="acb-hint" aria-hidden>
          {hintText}
        </span>
      ) : null}
    </>
  );

  if (!onActivate) {
    return (
      <div
        ref={hostRef as React.RefObject<HTMLDivElement>}
        className={`acb-host ${className ?? ""}`}
        style={hostStyle}
        data-phase="rest"
        data-running={running ? "1" : "0"}
        role="img"
        aria-label={ariaLabel}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      ref={hostRef as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={() => onActivate(labelCampus)}
      aria-label={ariaLabel}
      className={`acb-host acb-pressable ${hintText ? "acb-hinted" : ""} ${className ?? ""}`}
      style={hostStyle}
      data-phase="rest"
      data-running={running ? "1" : "0"}
    >
      {inner}
    </button>
  );
}

/** Slots exported for tests and the lab's diagnostics. */
export { PANEL_SLOTS };

/** Component-local stylesheet. Inject once on whichever page mounts a bolt. Everything tunable is
 *  read from a CSS custom property the component sets from the tuning object, so the lab's sliders
 *  can move it live without a re-render. */
export const ANIMATED_CAMPUS_BOLT_CSS = `
.acb-host {
  --acb-outline-color: #FFFFFF;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 0;
  background: none;
  padding: 0;
}
.acb-pressable { cursor: pointer; transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
.acb-pressable:hover { transform: scale(1.04); }
.acb-pressable:active { transform: scale(1.01); transition-duration: 90ms; }
.acb-pressable:focus-visible { outline: 3px solid var(--accent, #FCA311); outline-offset: 10px; border-radius: 14px; }

.acb-bolt { display: block; width: 100%; pointer-events: none; }
.acb-bolt svg { display: block; overflow: visible; }

.acb-glow { opacity: var(--acb-glow-o, 0.45); transition: opacity 600ms ease; }
.acb-shadow { opacity: var(--acb-shadow-o, 0.5); }
.acb-pressable:hover .acb-glow, .acb-pressable:focus-visible .acb-glow { opacity: var(--acb-glow-hover-o, 0.62); }

/* Reduced motion swaps campuses by cross-fading the two flat fills. */
.acb-flat { transition: fill var(--acb-fade, 700ms) ease; }

/* IDLE LIFE — during the DWELL only, and only while the bolt is actually rotating.
   One slow float of --acb-float-px and back. It is on .acb-bolt, not on the host, so it can never
   fight the host's hover scale; both are transforms on separate elements. */
@keyframes acb-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50%      { transform: translate3d(0, calc(var(--acb-float-px, 0px) * -1), 0); }
}
.acb-host[data-phase="rest"] .acb-bolt {
  animation: acb-float var(--acb-float-ms, 5200ms) ease-in-out infinite;
}
/* The charge is the motion; the float steps out of its way and hands back a clean transform. */
.acb-host[data-phase="charge"] .acb-bolt { animation: none; transform: translate3d(0, 0, 0); }

/* THE PLATE — the words live under the bolt, never inside it.
   Its opacity is driven by the PHASE, which is how the caption and the bolt stay one event: it
   fades out as the charge starts, its text is swapped while it is invisible, and it fades back in
   as the charge resolves. The new school's NAME is therefore never on screen over the old school's
   COLOURS. */
.acb-plate {
  margin-top: 16px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--brand-cream, #F5EFE6);
  white-space: nowrap;
  transition: opacity var(--acb-caption-fade, 190ms) ease;
}
.acb-host[data-phase="charge"] .acb-plate { opacity: 0; }
.acb-plate-for { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.55; text-transform: none; }
.acb-plate-em { opacity: 0.92; }
.acb-plate-dot { opacity: 0.45; }

/* HOVER HINT — a whisper of a label, absolutely positioned so it can never move the layout, and
   only on devices that can actually hover. It says what the click does; it is not a CTA. */
/* The space is RESERVED whenever a hint exists, so revealing it can never nudge the caption, the
   change-school control or anything below the hero. It costs 16px of empty box; it buys a hover
   state that does not move the page. */
.acb-hinted { padding-bottom: 16px; }
.acb-hint {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--accent, #FCA311);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}
@media (hover: hover) {
  .acb-pressable:hover .acb-hint, .acb-pressable:focus-visible .acb-hint { opacity: 0.9; }
}

@media (prefers-reduced-motion: reduce) {
  .acb-pressable, .acb-pressable:hover, .acb-pressable:active { transform: none; }
  .acb-host[data-phase="rest"] .acb-bolt { animation: none; }
  .acb-plate { transition: none; }
}
`;
