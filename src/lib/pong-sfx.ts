// ACCOUNTING PONG — sound. Synthesized with WebAudio the way canvas/sfx.ts does
// it (one lazy AudioContext, never a licensed file): swoosh = band-passed noise
// burst 120 ms; plop = 90 Hz sine with a 6 ms noise click, 180 ms decay; rim =
// 2.4 kHz tick 40 ms; heat accents = rising notes. One toggle, remembered in
// localStorage; the context is only created inside a user gesture (browser
// audio rules), so the first tap is what switches the sound on.

const KEY = "sa.pong.sound";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let enabled: boolean | null = null;

export function soundEnabled(): boolean {
  if (enabled == null) {
    try { enabled = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) !== "off" : true; }
    catch { enabled = true; }
  }
  return enabled;
}

export function setSoundEnabled(v: boolean): void {
  enabled = v;
  try { localStorage.setItem(KEY, v ? "on" : "off"); } catch { /* private window */ }
}

/** Only call from a user gesture (tap/click) — that is what unlocks audio. */
function ac(): AudioContext | null {
  if (typeof window === "undefined" || !soundEnabled()) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const len = Math.floor(c.sampleRate * 0.25);
  noise = c.createBuffer(1, len, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function env(c: AudioContext, peak: number, attack: number, decay: number, at = c.currentTime): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(c.destination);
  return g;
}

function burst(c: AudioContext, opts: { dur: number; peak: number; filter?: BiquadFilterType; freq?: number; q?: number; at?: number }): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const at = opts.at ?? c.currentTime;
  const g = env(c, opts.peak, 0.008, opts.dur, at);
  if (opts.filter) {
    const f = c.createBiquadFilter();
    f.type = opts.filter;
    f.frequency.value = opts.freq ?? 1200;
    f.Q.value = opts.q ?? 1;
    src.connect(f); f.connect(g);
  } else {
    src.connect(g);
  }
  src.start(at);
  src.stop(at + opts.dur + 0.05);
}

function tone(c: AudioContext, opts: { freq: number; to?: number; dur: number; peak: number; type?: OscillatorType; at?: number }): void {
  const o = c.createOscillator();
  o.type = opts.type ?? "sine";
  const at = opts.at ?? c.currentTime;
  o.frequency.setValueAtTime(opts.freq, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur);
  const g = env(c, opts.peak, 0.004, opts.dur, at);
  o.connect(g);
  o.start(at);
  o.stop(at + opts.dur + 0.05);
}

export const pongSfx = {
  /** The ball leaves the hand. */
  swoosh(): void {
    const c = ac(); if (!c) return;
    burst(c, { dur: 0.12, peak: 0.35, filter: "bandpass", freq: 1400, q: 0.8 });
  },
  /** Ball lands in the cup. */
  plop(): void {
    const c = ac(); if (!c) return;
    tone(c, { freq: 110, to: 78, dur: 0.18, peak: 0.6 });
    burst(c, { dur: 0.006, peak: 0.25, filter: "highpass", freq: 2000 });
  },
  /** Ball clips the rim. */
  rim(): void {
    const c = ac(); if (!c) return;
    tone(c, { freq: 2400, dur: 0.04, peak: 0.3 });
    burst(c, { dur: 0.01, peak: 0.12, filter: "highpass", freq: 3000 });
  },
  /** Heat accent: two rising notes at 2×, three at 3×. */
  heat(level: 2 | 3): void {
    const c = ac(); if (!c) return;
    const notes = level === 3 ? [523, 659, 988] : [523, 784];
    notes.forEach((f, i) => tone(c, { freq: f, dur: 0.14, peak: 0.28, type: "triangle", at: c.currentTime + i * 0.09 }));
  },
  /** Life lost — a short falling womp. */
  womp(): void {
    const c = ac(); if (!c) return;
    tone(c, { freq: 220, to: 150, dur: 0.16, peak: 0.3, type: "triangle" });
    tone(c, { freq: 165, to: 110, dur: 0.22, peak: 0.28, type: "triangle", at: c.currentTime + 0.12 });
  },
  /** Round cleared. */
  ding(): void {
    const c = ac(); if (!c) return;
    tone(c, { freq: 880, dur: 0.12, peak: 0.25, type: "triangle" });
    tone(c, { freq: 1318, dur: 0.22, peak: 0.22, type: "triangle", at: c.currentTime + 0.08 });
  },
};
