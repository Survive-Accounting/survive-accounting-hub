// BOLT BADGE — the paired door icon. One component, two variants, guaranteed
// symmetrical: the ONLY differences between them are the glyph path and the
// tint. Sizing, padding, bolt rotation, bolt opacity and stroke weights are
// shared constants, so the two doors cannot drift apart the way two
// hand-drawn icons did.
//
// THREE LAYERS, back to front:
//   1. BOLT      the real Survive bolt as a backdrop — 1.4x the glyph box,
//                rotated off-vertical, low opacity, flat tint. A backdrop,
//                never a co-star.
//   2. KNOCKOUT  the glyph's own paths redrawn underneath at a heavier stroke
//                in the CARD's background colour. This is what makes the badge
//                look intentional rather than like two things overlapping.
//   3. GLYPH     the icon itself, simple silhouette only.
//
// MOTION. The boil is a pre-baked 4-frame flipbook (bolt-boil.tsx), not an SVG
// filter — there is no <filter> and no id anywhere, so the classic
// duplicate-filter-id collision cannot happen here. The real per-instance
// hazard is that `.sa-boil-f` is a GLOBAL class: left alone, hovering one badge
// would animate every badge on the page. It is gated by PROP instead —
// `boilFrame` pins a single static frame — so each instance's motion is its own
// and two badges can sit side by side behaving independently.
//
// It animates on hover and when scrolled into view, and holds still otherwise:
// two constantly-boiling icons on one screen is too busy. Reduced motion gets
// the static frame and nothing else.
import { useEffect, useRef, useState } from "react";
import { GraduationCap, House } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";

export type BoltGlyph = "cap" | "house";

/** SHARED GEOMETRY — the symmetry contract. Both variants read these; nothing
 *  below may be branched on `glyph`. */
const GLYPH_FRACTION = 0.46;   // glyph box as a fraction of the badge
const BOLT_SCALE = 1.4;        // bolt height relative to the glyph box
const BOLT_ROTATION = -12;     // degrees off vertical
const BOLT_OPACITY = 0.28;     // backdrop, not co-star
const GLYPH_STROKE = 1.9;      // lucide's 24-unit space
const KNOCKOUT_STROKE = 7;     // thick enough to carve the glyph out of the bolt
const BURST_MS = 1600;         // the beat an arriving door gets, then stillness

const GLYPHS: Record<BoltGlyph, typeof GraduationCap> = {
  cap: GraduationCap,
  // `landmark` was tried first and measurably lost. Its four columns sit 8.7px
  // apart at this size while the knockout is 7px wide, so the knockouts nearly
  // merged and erased the bolt through the middle half of the icon — and six
  // thin strokes read lighter than the cap's solid mass, so the doors were not
  // at equal optical weight. `house` is two paths and a real silhouette: the
  // knockout carves cleanly and the bolt survives around it.
  house: House,
};

export function BoltBadge({
  glyph,
  tint,
  size = 112,
  animated = true,
  /** The colour the knockout is carved in — must match the surface behind the
   *  badge, or the "cut out" reads as a grey halo. */
  background = "var(--bg-surface)",
}: {
  glyph: BoltGlyph;
  tint: string;
  size?: number;
  animated?: boolean;
  background?: string;
}) {
  const Glyph = GLYPHS[glyph];
  const box = Math.round(size * GLYPH_FRACTION);
  const boltHeight = Math.round(box * BOLT_SCALE);

  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [burst, setBurst] = useState(false);

  // SCROLLED INTO VIEW IS A BEAT, NOT A STATE. Tying motion to "is visible"
  // means a door sitting in the viewport boils forever — which is the exact
  // "two constantly-boiling icons" this is supposed to avoid, and it is what
  // happens on the homepage where both doors are on screen together. So
  // arriving fires one short burst and then it settles.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setBurst(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBurst(false), BURST_MS);
      io.unobserve(el); // one beat per arrival, not once per scroll wobble
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, []);

  // boilFrame undefined = the CSS flipbook runs. A number = one pinned frame,
  // held still. This is the per-instance gate.
  const moving = animated && (hover || burst);

  return (
    <span
      ref={ref}
      aria-hidden
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
      }}
    >
      {/* 1 — BOLT backdrop */}
      <span
        style={{
          position: "absolute",
          display: "block",
          transform: `rotate(${BOLT_ROTATION}deg)`,
          opacity: BOLT_OPACITY,
          pointerEvents: "none",
        }}
      >
        {/* cream="none" drops the keyline so the bolt reads as one flat tint. */}
        <BoltBoil height={boltHeight} red={tint} blue={tint} cream="none" boilFrame={moving ? undefined : 0} />
      </span>

      {/* 2 — KNOCKOUT. The SAME component at the same size, drawn first in the
          card colour at a heavy stroke, so the glyph is carved out of the bolt
          rather than laid on top of it. Identical geometry means it can never
          fall out of register with the glyph above. */}
      <span style={{ position: "absolute", display: "block", pointerEvents: "none" }}>
        <Glyph size={box} color={background} strokeWidth={KNOCKOUT_STROKE} absoluteStrokeWidth />
      </span>

      {/* 3 — GLYPH */}
      <span style={{ position: "relative", display: "block" }}>
        <Glyph size={box} color="var(--brand-cream)" strokeWidth={GLYPH_STROKE} absoluteStrokeWidth />
      </span>
    </span>
  );
}
