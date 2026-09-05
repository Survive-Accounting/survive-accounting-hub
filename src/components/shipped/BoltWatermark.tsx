// A BIG, STATIC bolt — the fixed brand silhouette (BOLT_OUTER/BOLT_VIEWBOX from brand.tsx),
// flat white, low opacity, NEVER animated. Lee, 2026-09-05 (the Notepad): "a BIG static Survive
// bolt very faintly visible behind the writing area as a watermark… should NOT animate…
// should never interfere with readability." Reused as-is for the Recorder's outro backdrop.
import { BOLT_OUTER, BOLT_VIEWBOX } from "@/components/canvas/brand";

// Plain, unpositioned — the caller places it (each use case centers it differently). Never
// self-positioning, so it can be dropped into a flex-centered stack or an absolute layer alike.
export function BoltWatermark({ size, opacity = 0.06, color = "#F4EFE6", style }: { size: number; opacity?: number; color?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox={BOLT_VIEWBOX}
      width={size}
      height={size}
      aria-hidden
      style={{ pointerEvents: "none", opacity, ...style }}
    >
      <path d={BOLT_OUTER} fill={color} />
    </svg>
  );
}
