// SELF-AUTHORED (CC0) canvas SFX generator. Synthesizes three short cues with
// plain oscillator + noise math and writes 16-bit PCM mono WAVs to public/sfx/.
// Nothing is sampled or copied — the output is original and public-domain, so
// it is always safe to bundle. Swap the files in public/sfx/ to re-skin; the
// canvas reads them by the filenames in src/components/canvas/sfx.ts.
//
//   run:  node scripts/gen-sfx.mjs   (or bun scripts/gen-sfx.mjs)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");

const clamp = (x) => Math.max(-1, Math.min(1, x));
const sine = (t, f) => Math.sin(2 * Math.PI * f * t);
// soft attack/decay envelope
const env = (t, dur, atk = 0.006, rel = 0.05) => {
  if (t < atk) return t / atk;
  if (t > dur - rel) return Math.max(0, (dur - t) / rel);
  return 1;
};

function toWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(clamp(samples[i]) * 32767 * 0.85), 44 + i * 2);
  return buf;
}

function render(dur, fn) {
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = fn(i / SR);
  return s;
}

// 1) KEYPAD — a soft mechanical "tick": tight click (noise burst) + a quick,
//    bright sine that decays fast. Reads as a keystroke, not a beep.
const keypad = render(0.06, (t) => {
  const click = (Math.random() * 2 - 1) * Math.exp(-t * 320) * 0.5;
  const body = sine(t, 1650) * Math.exp(-t * 90) * 0.35;
  return (click + body) * env(t, 0.06, 0.001, 0.02);
});

// 2) ADVANCE_SWOOSH — a subtle airy sweep: filtered-ish noise with a rise→fall
//    swell plus a gentle descending sine so it reads as "next".
const swoosh = render(0.26, (t) => {
  const swell = Math.sin((Math.PI * t) / 0.26); // 0→1→0
  // crude lowpass on noise via running average of two samples' worth of phase
  const noise = (Math.random() * 2 - 1) * 0.5;
  const glide = sine(t, 520 - 300 * (t / 0.26)) * 0.22;
  return (noise * 0.6 + glide) * swell * env(t, 0.26, 0.02, 0.09);
});

// 3) CRAM_LAUNCH — a rising whoosh that lifts into a short bright triad, paired
//    with the launch zoom. Bigger + more triumphant, still not harsh.
const cram = render(0.9, (t) => {
  const rise = Math.min(1, t / 0.55);
  const whoosh = (Math.random() * 2 - 1) * 0.4 * rise * (t < 0.6 ? 1 : Math.max(0, (0.9 - t) / 0.3));
  const sweep = sine(t, 180 + 620 * rise) * 0.18 * (t < 0.6 ? 1 : 0);
  // triad hit in the back third
  let hit = 0;
  if (t > 0.55) {
    const u = t - 0.55;
    const e = Math.exp(-u * 6);
    hit = (sine(t, 523.25) + sine(t, 659.25) + sine(t, 783.99)) * 0.11 * e;
  }
  return (whoosh + sweep + hit) * env(t, 0.9, 0.01, 0.12);
});

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "keypad.wav"), toWav(keypad));
writeFileSync(join(OUT, "swoosh.wav"), toWav(swoosh));
writeFileSync(join(OUT, "cram-launch.wav"), toWav(cram));
console.log("wrote keypad.wav, swoosh.wav, cram-launch.wav →", OUT);
