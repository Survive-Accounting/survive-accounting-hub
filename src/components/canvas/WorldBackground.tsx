// VISUAL WORLDS (renderer) — draws a preset's atmosphere behind a frame's cards.
// Pure CSS + SVG (gradients, a seeded star field, one faint wireframe layer, an
// optional scrim). NO heavy 3D, NO canvas loop. Everything is pointer-events:none
// and sits at the very back of the frame, so cards, chrome and the spotlight
// overlay (a fixed z-[70] layer) all read on top untouched.
//
// Intensity scales overall opacity (kept in a muted band by clampWorldIntensity).
// Motion is slow and OFF whenever the OS asks for reduced motion.
import { useEffect, useMemo, useState } from "react";

import { clampWorldIntensity, clampWorldMotion, seededStars, worldById, type WorldPreset } from "./worlds";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

const WORLD_CSS = `
@keyframes sa-world-tw { 0%,100% { opacity: var(--tw-lo); } 50% { opacity: var(--tw-hi); } }
@keyframes sa-world-drift { from { transform: translate3d(0,0,0); } to { transform: translate3d(-1.2%, -0.8%, 0); } }
`;

function Wireframe({ w, stroke, opacity }: { w: WorldPreset; stroke: string; opacity: number }) {
  const common = { stroke, fill: "none", strokeWidth: 0.4, opacity } as const;
  switch (w.wireframe) {
    case "grid":
      return (
        <g {...common}>
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`v${i}`} x1={12.5 * i} y1={55} x2={50 + (12.5 * i - 50) * 2.4} y2={100} />
          ))}
          {Array.from({ length: 5 }, (_, i) => {
            const y = 55 + (i * i) * 2.2;
            return <line key={`h${i}`} x1={0} y1={y} x2={100} y2={y} />;
          })}
        </g>
      );
    case "orbit":
      return (
        <g {...common}>
          <ellipse cx={82} cy={74} rx={30} ry={9} />
          <ellipse cx={82} cy={74} rx={20} ry={6} />
          <circle cx={82} cy={74} r={7} fill={stroke} fillOpacity={0.14} stroke="none" />
          <circle cx={64} cy={80} r={4} fill={stroke} fillOpacity={0.12} stroke="none" />
        </g>
      );
    case "geometry":
      return (
        <g {...common}>
          <polygon points="70,58 92,66 86,88 66,86 60,70" />
          <polygon points="70,58 86,88 66,86" />
          <line x1={70} y1={58} x2={66} y2={86} />
          <circle cx={78} cy={74} r={16} />
        </g>
      );
    case "horizon":
      return (
        <g {...common}>
          <line x1={0} y1={82} x2={100} y2={82} />
          <line x1={0} y1={88} x2={100} y2={88} strokeWidth={0.25} />
        </g>
      );
    case "signal": {
      const nodes = [[74, 22], [88, 34], [80, 46], [64, 30], [92, 18]] as const;
      return (
        <g {...common}>
          {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.9} fill={stroke} stroke="none" fillOpacity={0.5} />)}
          <path d={`M${nodes[0][0]},${nodes[0][1]} L${nodes[1][0]},${nodes[1][1]} L${nodes[2][0]},${nodes[2][1]}`} strokeWidth={0.25} />
          <path d={`M${nodes[3][0]},${nodes[3][1]} L${nodes[0][0]},${nodes[0][1]} L${nodes[4][0]},${nodes[4][1]}`} strokeWidth={0.25} />
        </g>
      );
    }
    default:
      return null;
  }
}

function scrimStyle(w: WorldPreset, intensity: number): React.CSSProperties | null {
  const a = Math.min(0.7, 0.35 + intensity);
  switch (w.scrim) {
    case "bottom":
      return { background: `linear-gradient(to top, rgba(4,7,16,${a}) 0%, transparent 45%)` };
    case "radial":
      return { background: `radial-gradient(120% 90% at 50% 40%, transparent 45%, rgba(4,7,16,${a}) 100%)` };
    case "vignette":
      return { background: `radial-gradient(130% 100% at 50% 50%, transparent 55%, rgba(3,5,12,${a}) 100%)` };
    default:
      return null;
  }
}

/** The world layer for a frame. Fills its (relative) parent; renders nothing for
 *  an unknown id. */
export function WorldBackground({ worldId, intensity, motion, seed }: {
  worldId: string;
  intensity?: number;
  motion?: number;
  seed?: number;
}) {
  const w = worldById(worldId);
  const reduced = usePrefersReducedMotion();
  const inten = clampWorldIntensity(intensity, w?.defaultIntensity ?? 0.3);
  const mot = reduced ? 0 : clampWorldMotion(motion, w?.motionIntensity ?? 0.15);
  const sd = typeof seed === "number" ? seed : 1;

  const stars = useMemo(() => {
    if (!w) return [];
    const count = Math.round(w.stars * (0.5 + inten));
    return seededStars(w.id, sd, count);
  }, [w, inten, sd]);

  if (!w) return null;
  const p = w.palette;
  const scrim = scrimStyle(w, inten);
  // slow drift only when motion is meaningful
  const driftDur = mot > 0 ? `${Math.round(60 - mot * 30)}s` : "0s";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0.55 + inten * 0.75, zIndex: 0 }} aria-hidden>
      <style>{WORLD_CSS}</style>
      {/* base graded navy + an OFF-center soft glow at the focal point */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(90% 80% at ${w.focalPoint.x * 100}% ${w.focalPoint.y * 100}%, ${p.glow} 0%, ${p.base2} 42%, ${p.base} 100%)`,
        }}
      />
      {/* star field (+ faint wireframe), optionally drifting very slowly */}
      <div
        className="absolute"
        style={{
          inset: "-2%",
          animation: mot > 0 ? `sa-world-drift ${driftDur} ease-in-out infinite alternate` : undefined,
        }}
      >
        <svg viewBox="0 0 100 56.25" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
          <Wireframe w={w} stroke={p.accent} opacity={0.22 + inten * 0.25} />
          {stars.map((s, i) => (
            <circle
              key={i}
              cx={s.x * 100}
              cy={s.y * 56.25}
              r={s.r * (0.18 + inten * 0.12)}
              fill={s.tw > 0.7 ? p.accent : "#C9D6F5"}
              style={
                mot > 0
                  ? ({
                      opacity: 0.35 + s.tw * 0.4,
                      // twinkle a subset, staggered by index
                      ...(s.tw > 0.55
                        ? {
                            animation: `sa-world-tw ${(3 + s.tw * 4).toFixed(1)}s ease-in-out ${(i % 7) * 0.3}s infinite`,
                            // CSS custom props for the keyframe
                            ["--tw-lo" as string]: `${0.2 + s.tw * 0.2}`,
                            ["--tw-hi" as string]: `${0.5 + s.tw * 0.4}`,
                          }
                        : {}),
                    } as React.CSSProperties)
                  : { opacity: 0.3 + s.tw * 0.4 }
              }
            />
          ))}
        </svg>
      </div>
      {scrim && <div className="absolute inset-0" style={scrim} />}
    </div>
  );
}
