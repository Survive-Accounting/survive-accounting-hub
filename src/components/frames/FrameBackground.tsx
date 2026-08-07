// FRAME BACKGROUND (frames/) — the shared atmosphere behind every frame. It REUSES the canvas
// WorldBackground (build once) and drives its motion directly via `animate`, so the same layer
// works outside the canvas too — e.g. as a DOM layer in the Mux player, where there's no
// `.film-mode` ancestor to gate the motion. Sits at the very back; never competes with text.
// prefers-reduced-motion is honoured by WorldBackground (motion → 0 → static).
import { WorldBackground } from "@/components/canvas/WorldBackground";

export type FrameBgVariant = "orbital" | "dark-dotted" | "plain";

// Map the frame variants onto existing world presets (worlds.ts). 'plain' skips the world.
const WORLD_BY_VARIANT: Record<Exclude<FrameBgVariant, "plain">, string> = {
  orbital: "orbital-grid",
  "dark-dotted": "deep-space",
};

export function FrameBackground({ variant = "orbital", intensity = 0.3, animate = true }: {
  variant?: FrameBgVariant;
  intensity?: number; // 0-1; WorldBackground keeps it in a muted band
  animate?: boolean;
}) {
  if (variant === "plain") return <div className="pointer-events-none absolute inset-0" style={{ background: "var(--brand-navy)", zIndex: 0 }} aria-hidden />;
  return <WorldBackground worldId={WORLD_BY_VARIANT[variant]} intensity={intensity} animate={animate} />;
}
