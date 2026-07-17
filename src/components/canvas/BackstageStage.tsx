// CINEMA BACKSTAGE (screen-space) — the authoring stage as a lit studio: a deep
// dark-red field with a soft crimson bloom that slowly breathes, a fine top sheen
// and a vignette. The blank scaffold area above reads as a stained-glass window
// onto this glow. Authoring-only (parent renders it only when
// backstage === "cinema" && !film). Fixed + pointer-events-none so it never
// intercepts canvas gestures.
//
// The looping BACKGROUND VIDEO was removed — its playback made the canvas clunky.
// The `video` prop is kept for API stability but ignored.

const CSS = `
@keyframes sa-cinema-breathe { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.06); } }
`;

export function BackstageStage({ video: _video }: { video?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0, background: "radial-gradient(130% 120% at 50% 36%, #4a121f 0%, #2a0910 50%, #120406 100%)" }}>
      <style>{CSS}</style>
      {/* additive crimson bloom (screen, not multiply) — glow, never darken */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(55% 45% at 50% 40%, rgba(255,58,86,0.16), transparent 72%)", mixBlendMode: "screen", animation: "sa-cinema-breathe 10s ease-in-out infinite" }} />
      {/* fine top sheen + a soft vignette */}
      <div className="absolute inset-x-0 top-0 h-1/3" style={{ background: "linear-gradient(to bottom, rgba(255,130,150,0.07), transparent)" }} />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 220px 40px rgba(0,0,0,0.62)" }} />
    </div>
  );
}
