// CINEMA BACKSTAGE (screen-space) — the authoring stage as a lit studio: a deep
// dark-red field with the chosen /anim loop woven in at low opacity (screen blend
// so it GLOWS rather than sits flat), pulled back into red by a multiply wash, a
// slow breathing center glow, and a heavy vignette so the whole canvas reads as a
// stage the frames float above. Authoring-only (the parent renders it only when
// backstage === "cinema" && !film) — film keeps the flat navy stage. Fixed +
// pointer-events-none so it never intercepts canvas gestures.
const CSS = `
@keyframes sa-cinema-breathe { 0%,100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.06); } }
@keyframes sa-cinema-drift { 0% { transform: translate3d(-2%, -1%, 0); } 50% { transform: translate3d(2%, 1%, 0); } 100% { transform: translate3d(-2%, -1%, 0); } }
`;

export function BackstageStage({ video }: { video?: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0, background: "radial-gradient(130% 120% at 50% 38%, #45101c 0%, #2a0910 48%, #150406 100%)" }}>
      <style>{CSS}</style>
      {/* the animation, glowing over the red — a slow parallax drift keeps it alive */}
      {video && (
        <video
          className="absolute h-[112%] w-[112%] object-cover"
          style={{ left: "-6%", top: "-6%", opacity: 0.3, mixBlendMode: "screen", filter: "saturate(1.25) contrast(1.06)", animation: "sa-cinema-drift 34s ease-in-out infinite" }}
          src={video ? `/anim/${video}` : undefined}
          autoPlay
          muted
          loop
          playsInline
        />
      )}
      {/* pull everything into DARK RED (multiply wash) */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(100% 100% at 50% 44%, rgba(150,16,34,0.30), rgba(18,4,7,0.72))", mixBlendMode: "multiply" }} />
      {/* breathing crimson core glow — the "innovative" living light */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(42% 34% at 50% 40%, rgba(255,64,86,0.16), transparent 68%)", animation: "sa-cinema-breathe 9s ease-in-out infinite" }} />
      {/* fine top sheen + heavy vignette so the edges fall to black */}
      <div className="absolute inset-x-0 top-0 h-1/3" style={{ background: "linear-gradient(to bottom, rgba(255,120,140,0.06), transparent)" }} />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 260px 70px rgba(0,0,0,0.8)" }} />
    </div>
  );
}
