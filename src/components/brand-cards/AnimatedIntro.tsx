// ANIMATED INTRO — the music-synced opener. A big boiling bolt holds & loops through the
// music build, then on the beat DROP it flies into the "surv_ve" wordmark with a white
// flash; the slogan fades in at the last moment before the voiceover. End-state reuses
// SurviveWordmark + Rubik, so the intro matches OutroCard exactly (same font, same bolt,
// same boil). Every beat is anchored to `beatMs` (the drop) so it lines up with the intro
// music; `sloganMs` is the extra beat after the drop before the slogan appears. 1920x1080,
// transparent-capable, React only. Optional synced audio (plays on each playKey when soundOn).
import { useEffect, useRef } from "react";

import { Stage, SurviveWordmark, BoltBoil, BRAND_CREAM } from "./bolt-boil";

const WORD = 230;      // wordmark cap-height (matches OutroCard)
const HERO = 460;      // opening bolt height (px on the 1080 stage) — the "screenshot 3" hero
const FLY = 300;       // ms the hero bolt takes to fly into the wordmark
const FLASH = 200;     // ms white flash at the drop

export function AnimatedIntro({
  slogan = "Cram videos by Lee Ingram",
  beatMs = 1820,
  sloganMs = 640,
  audioSrc,
  soundOn = false,
  scale = 1,
  transparent = false,
  playKey = 0,
}: {
  slogan?: string;
  /** When the beat drops in the music — the hero bolt flies in + flashes here. */
  beatMs?: number;
  /** Extra delay after the drop before the slogan fades in (the last beat before VO). */
  sloganMs?: number;
  audioSrc?: string;
  soundOn?: boolean;
  scale?: number;
  transparent?: boolean;
  playKey?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Restart the music in lock-step with the animation: the whole stage is keyed by playKey,
  // so it re-mounts and the CSS animations restart at 0 — reset + play the audio in the same
  // beat. play() runs inside the Play-button gesture, so autoplay policy allows it.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (soundOn && audioSrc) { try { a.currentTime = 0; void a.play().catch(() => {}); } catch { /* ignore */ } }
    else { try { a.pause(); } catch { /* ignore */ } }
  }, [playKey, soundOn, audioSrc]);

  const scaleEnd = +((WORD * 0.8) / HERO).toFixed(3); // hero shrinks to the wordmark-bolt size
  const css = `
@keyframes sa-ai-fly {
  0%   { transform: translate(0,0) scale(1); opacity: 1; }
  65%  { opacity: 1; }
  100% { transform: translate(${Math.round(WORD * 0.16)}px, ${Math.round(WORD * 0.06)}px) scale(${scaleEnd}); opacity: 0; }
}
@keyframes sa-ai-flash { 0% { opacity: 0; } 28% { opacity: 0.92; } 100% { opacity: 0; } }
@keyframes sa-ai-word { from { opacity: 0; transform: scale(0.965); } to { opacity: 1; transform: none; } }
@keyframes sa-ai-slogan { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.sa-ai-hero { animation: sa-ai-fly ${FLY}ms cubic-bezier(0.5,0,0.2,1) ${beatMs}ms both; }
.sa-ai-flash { animation: sa-ai-flash ${FLASH}ms ease-out ${beatMs}ms both; }
.sa-ai-word { opacity: 0; animation: sa-ai-word 150ms cubic-bezier(0.2,0,0,1) ${beatMs + 40}ms both; }
.sa-ai-slogan { opacity: 0; animation: sa-ai-slogan 240ms cubic-bezier(0.2,0.7,0.3,1) ${beatMs + sloganMs}ms both; }
@media (prefers-reduced-motion: reduce) {
  .sa-ai-hero, .sa-ai-flash { display: none; }
  .sa-ai-word, .sa-ai-slogan { animation: none; opacity: 1; transform: none; }
}`;

  return (
    <Stage scale={scale} transparent={transparent}>
      <style>{css}</style>
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="auto" />}
      <div key={playKey} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "'Rubik', system-ui, sans-serif" }}>
        {/* HERO — big boiling bolt, centred; holds & loops through the build, flies in on the drop */}
        <div className="sa-ai-hero" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <BoltBoil height={HERO} />
        </div>
        {/* white flash at the drop — full-strength, stage-centred over the bolt hand-off */}
        <div className="sa-ai-flash" style={{ position: "absolute", left: "50%", top: "50%", width: "58%", height: "72%", transform: "translate(-50%,-50%)", background: "radial-gradient(closest-side, #FFFFFF, rgba(255,255,255,0))", pointerEvents: "none", opacity: 0 }} />
        {/* locked wordmark + slogan — snap in ON the drop, under the flash */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div className="sa-ai-word"><SurviveWordmark size={WORD} /></div>
          <div className="sa-ai-slogan" style={{ marginTop: 48, fontWeight: 600, fontSize: Math.round(WORD * 0.28), color: BRAND_CREAM, lineHeight: 1 }}>{slogan}</div>
        </div>
      </div>
    </Stage>
  );
}
