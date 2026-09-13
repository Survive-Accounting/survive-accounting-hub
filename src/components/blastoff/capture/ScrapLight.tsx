// THE SCRAP LIGHT (2026-09-13) — the main /film window's signal that an F3 registered.
//
// Lee: "If I hit F3, on the /film page, show something on that screen so I'm aware that I've scrapped
// a take and that it registered. Like a red X, then once I start talking again it turns to green
// light? This is only on the /film page. NOT the popout. I have the film popout open and the /film
// page next to it on the right."
//
// The pop-out owns the scrap (capture/scrap.tsx) and says what's happening through localStorage
// (FILM_SCRAP_STATE_KEY). This window draws:
//   scrapping → a big red ✗ ("SCRAPPED — say why · F3 restarts")
//   restarted → amber "restart when ready", and listens on ITS OWN mic for your voice
//   voice     → a green light for a moment, then gone.
// Esc in the pop-out clears it. The pop-out itself never draws any of this — it's the recording.
import { useEffect, useRef, useState } from "react";

export const FILM_SCRAP_STATE_KEY = "sa-film-scrap-state";
export type ScrapPhase = "scrapping" | "restarted" | "cancelled";
interface ScrapStateSignal { setId: string; phase: ScrapPhase; at: number }

/** The pop-out's side: say where the scrap is. */
export function signalScrapState(setId: string, phase: ScrapPhase): void {
  try { localStorage.setItem(FILM_SCRAP_STATE_KEY, JSON.stringify({ setId, phase, at: Date.now() } satisfies ScrapStateSignal)); } catch { /* the light just won't show */ }
}

type Light = "off" | "red" | "amber" | "green";
const VOICE_RMS = 0.045;
const VOICE_HOLD_MS = 220;
const GREEN_MS = 2600;
const AMBER_GIVE_UP_MS = 60_000;

export function ScrapLight({ setId }: { setId: string }) {
  const [light, setLight] = useState<Light>("off");
  const [micNote, setMicNote] = useState<string | null>(null);
  const lightRef = useRef(light); lightRef.current = light;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== FILM_SCRAP_STATE_KEY || !e.newValue) return;
      let sig: ScrapStateSignal | null = null;
      try { sig = JSON.parse(e.newValue) as ScrapStateSignal; } catch { return; }
      if (!sig || sig.setId !== setId || Math.abs(Date.now() - sig.at) > 5000) return;
      setLight(sig.phase === "scrapping" ? "red" : sig.phase === "restarted" ? "amber" : "off");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setId]);

  // AMBER LISTENS: this window's own mic, only while waiting for the restart; the first sustained
  // sound above a speaking level turns the light green.
  useEffect(() => {
    if (light !== "amber") return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let loudSince = 0;
    let stopped = false;
    const giveUp = window.setTimeout(() => { if (!stopped) setLight("off"); }, AMBER_GIVE_UP_MS);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          if (stopped) return;
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const now = performance.now();
          if (rms > VOICE_RMS) { if (!loudSince) loudSince = now; if (now - loudSince > VOICE_HOLD_MS && lightRef.current === "amber") { setLight("green"); return; } }
          else loudSince = 0;
          raf = requestAnimationFrame(tick);
        };
        setMicNote(null);
        tick();
      } catch (e) {
        setMicNote(`mic unavailable here (${e instanceof Error ? e.message : "blocked"}) — the light stays amber`);
      }
    })();
    return () => { stopped = true; window.clearTimeout(giveUp); cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); void ctx?.close(); };
  }, [light]);

  useEffect(() => {
    if (light !== "green") return;
    const t = window.setTimeout(() => setLight("off"), GREEN_MS);
    return () => window.clearTimeout(t);
  }, [light]);

  if (light === "off") return null;
  const tone = light === "red" ? { bg: "rgba(190,30,40,0.94)", edge: "#FF5A5F", glyph: "✗", head: "SCRAPPED", sub: "say why · walk to the restart slide · F3 restarts" }
    : light === "amber" ? { bg: "rgba(140,90,10,0.94)", edge: "#F59E0B", glyph: "●", head: "RESTART WHEN READY", sub: micNote ?? "the light goes green when you start talking" }
    : { bg: "rgba(20,120,70,0.94)", edge: "#3BF5A0", glyph: "●", head: "ROLLING", sub: "you're back on" };
  return (
    <div data-sa-film-chrome role="status" aria-live="assertive" style={{
      position: "fixed", top: 18, right: 18, zIndex: 90, display: "flex", alignItems: "center", gap: 14,
      background: tone.bg, border: `2px solid ${tone.edge}`, borderRadius: 18, padding: "12px 18px",
      boxShadow: `0 0 40px ${tone.edge}66`, color: "#FFF", fontFamily: "'Rubik', system-ui, sans-serif", pointerEvents: "none",
    }}>
      <span style={{ fontSize: 54, lineHeight: 1, fontWeight: 900, color: light === "red" ? "#FFF" : tone.edge, textShadow: `0 0 18px ${tone.edge}` }}>{tone.glyph}</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.08em" }}>{tone.head}</span>
        <span style={{ fontSize: 12.5, opacity: 0.9, maxWidth: 260 }}>{tone.sub}</span>
      </span>
    </div>
  );
}
