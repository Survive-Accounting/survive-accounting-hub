// FRAME BACKGROUND (frames/) — the shared atmosphere behind every frame. It REUSES the canvas
// WorldBackground (build once) and drives its motion directly via `animate`, so the same layer
// works outside the canvas too — e.g. as a DOM layer in the Mux player, where there's no
// `.film-mode` ancestor to gate the motion. Sits at the very back; never competes with text.
// prefers-reduced-motion is honoured by WorldBackground (motion → 0 → static).
import { WorldBackground } from "@/components/canvas/WorldBackground";

// Three brand gradients (+ plain), each drawing attention differently — mapped onto existing
// world presets (worlds.ts). 'plain' skips the world for a flat navy.
export type FrameBgVariant = "orbital" | "nebula" | "deep" | "plain";

const WORLD_BY_VARIANT: Record<Exclude<FrameBgVariant, "plain">, string> = {
  orbital: "orbital-grid",  // a structured grid receding into the dark — depth + motion downward
  nebula: "distant-nebula", // a soft violet cloud off to a corner — colour + a wandering eye
  deep: "deep-space",       // vignette darkens the EDGES → attention pulled to the CENTER
};

/** The pickable brand backgrounds (for the Branding Studio). */
export const FRAME_BG_VARIANTS: { id: FrameBgVariant; name: string }[] = [
  { id: "deep", name: "Deep (center)" },
  { id: "orbital", name: "Orbital" },
  { id: "nebula", name: "Nebula" },
  { id: "plain", name: "Plain" },
];

export function FrameBackground({ variant = "orbital", intensity = 0.3, animate = true, onBlack = false }: {
  variant?: FrameBgVariant;
  intensity?: number; // 0-1; WorldBackground keeps it in a muted band
  animate?: boolean;
  /** The glow pools and fades to the page's own black instead of filling the box with navy. */
  onBlack?: boolean;
}) {
  if (variant === "plain") return <div className="pointer-events-none absolute inset-0" style={{ background: "var(--brand-navy)", zIndex: 0 }} aria-hidden />;
  return <WorldBackground worldId={WORLD_BY_VARIANT[variant]} intensity={intensity} animate={animate} onBlack={onBlack} />;
}
