// CINEMA BACKSTAGE (screen-space) — the authoring stage as a lit studio: a deep
// dark-red field with the chosen /anim loop woven in and GLOWING (screen blend +
// a brightness lift so even the dark space loop reads), a soft red bloom, a slow
// breathing core + parallax drift, and a light vignette. The blank scaffold area
// above reads as a stained-glass window onto this glow. Authoring-only (parent
// renders it only when backstage === "cinema" && !film). Fixed +
// pointer-events-none so it never intercepts canvas gestures.
import { useEffect, useRef } from "react";

const CSS = `
@keyframes sa-cinema-breathe { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.95; transform: scale(1.07); } }
@keyframes sa-cinema-drift { 0% { transform: translate3d(-2%, -1%, 0) scale(1.04); } 50% { transform: translate3d(2%, 1.5%, 0) scale(1.08); } 100% { transform: translate3d(-2%, -1%, 0) scale(1.04); } }
`;

/** Map any loop name (incl. the LEGACY "space intro (1).mp4" names) to the real,
 *  hyphenated base in public/anim — the files were renamed, so the old names 404. */
function animBase(file?: string): string {
  const f = (file ?? "").toLowerCase();
  if (f.includes("car")) return "/anim/car-intro";
  if (f.includes("space")) return "/anim/space-intro";
  return "/anim/dream-intro"; // colourful default — glows best over the red
}

export function BackstageStage({ video }: { video?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const base = animBase(video);
  // Muted autoplay is allowed, but nudge play() on mount/src-change in case a
  // stricter context (or the in-app preview) leaves it paused.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    const go = () => v.play().catch(() => {});
    go();
    v.addEventListener("canplay", go, { once: true });
    return () => v.removeEventListener("canplay", go);
  }, [base]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0, background: "radial-gradient(130% 120% at 50% 36%, #4a121f 0%, #2a0910 50%, #120406 100%)" }}>
      <style>{CSS}</style>
      {/* the animation, glowing over the red — brightness/saturation lift so the
          dark loops still read; a slow parallax drift keeps it alive */}
      <video
        ref={ref}
        key={base}
        className="absolute h-[116%] w-[116%] object-cover"
        style={{ left: "-8%", top: "-8%", opacity: 0.62, mixBlendMode: "screen", filter: "brightness(1.5) saturate(1.35) contrast(1.05)", animation: "sa-cinema-drift 40s ease-in-out infinite" }}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      >
        <source src={`${base}.webm`} type="video/webm" />
        <source src={`${base}.mp4`} type="video/mp4" />
      </video>
      {/* additive crimson bloom (screen, not multiply) — glow, never darken */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(55% 45% at 50% 40%, rgba(255,58,86,0.16), transparent 72%)", mixBlendMode: "screen", animation: "sa-cinema-breathe 9s ease-in-out infinite" }} />
      {/* fine top sheen + a lighter vignette so the center animation still reads */}
      <div className="absolute inset-x-0 top-0 h-1/3" style={{ background: "linear-gradient(to bottom, rgba(255,130,150,0.07), transparent)" }} />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 220px 40px rgba(0,0,0,0.62)" }} />
    </div>
  );
}
