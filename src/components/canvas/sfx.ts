// CANVAS SFX ENGINE (Lee: reveal & transition sounds). A module singleton so any
// card node or the route can fire a cue without threading a context. Four events
// map to swappable files under /sfx/. The bundled set is Lee's own MP3s
// (keypad/swoosh/cram-launch/confirm); scripts/gen-sfx.mjs can regenerate CC0
// placeholder WAVs if a file is ever missing. All playback respects a global
// mute, per-event volume, and prefers-reduced-motion; callers gate FILM-only
// (silent while authoring unless previewing).
//
// Web Audio only (no <audio> churn): one lazy AudioContext (needs a user gesture,
// always present while filming — keys/clicks), decoded buffers cached by filename.

export type SfxEvent = "keypad" | "swoosh" | "cramLaunch" | "confirm" | "chaching" | "vinylScratch";

export interface SfxConfig {
  /** Global mute — silences every event. */
  muted: boolean;
  /** Per-event gain. NOT capped at 1 — see MAX_GAIN. A GainNode happily
   *  amplifies, and the 808 needs it: the sample is quiet, and clamping to 1
   *  meant "loudest possible" was still barely audible in a recording. */
  volume: Record<SfxEvent, number>;
  /** Filename under /sfx/ for each event — swap to re-skin. */
  file: Record<SfxEvent, string>;
}

export const SFX_FILES: Record<SfxEvent, string> = {
  keypad: "keypad.mp3",
  swoosh: "swoosh.mp3",
  cramLaunch: "cram-launch.mp3",
  confirm: "confirm.mp3",
  // NEW (sound-authoring pass): the correct-answer cha-ching + the memorize-this vinyl
  // scratch. Files live under /sfx/ (same convention as cram-launch.mp3). A missing
  // file simply plays NOTHING (fail-quiet in load()) — never a fallback to another cue.
  chaching: "chaching.mp3",
  vinylScratch: "vinyl-scratch.mp3",
};

/** Ceiling on a single event's gain. 4x (~+12 dB) is enough to lift a quiet
 *  sample to a usable level without turning clipping into the default. */
export const MAX_GAIN = 4;

export const SFX_DEFAULT: SfxConfig = {
  muted: false,
  // cramLaunch is the 808 DROP on a boss reveal. It defaults LOUD (Lee, 08-17):
  // it was inaudible in recordings at 0.85, which was also the old hard ceiling.
  volume: { keypad: 0.55, swoosh: 0.5, cramLaunch: 2.6, confirm: 0.6, chaching: 0.8, vinylScratch: 0.7 },
  file: { ...SFX_FILES },
};

let cfg: SfxConfig = { ...SFX_DEFAULT, volume: { ...SFX_DEFAULT.volume }, file: { ...SFX_DEFAULT.file } };
let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>(); // filename → decoded
const pending = new Map<string, Promise<AudioBuffer | null>>();

/** Push the latest settings into the engine (called by the route on change). */
export function configureSfx(next: Partial<SfxConfig>): void {
  cfg = {
    muted: next.muted ?? cfg.muted,
    volume: { ...cfg.volume, ...(next.volume ?? {}) },
    file: { ...cfg.file, ...(next.file ?? {}) },
  };
}

export function getSfxConfig(): SfxConfig {
  return { muted: cfg.muted, volume: { ...cfg.volume }, file: { ...cfg.file } };
}

/** prefers-reduced-motion → run silent (spec item 6). Also our reduced-audio hook. */
function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

async function load(file: string): Promise<AudioBuffer | null> {
  if (buffers.has(file)) return buffers.get(file)!;
  if (pending.has(file)) return pending.get(file)!;
  const p = (async () => {
    try {
      const ac = audio();
      if (!ac) return null;
      // `file` is either a bundled name (→ /sfx/<name>) or an absolute URL of a
      // file Lee uploaded to storage (global SFX config).
      const url = /^https?:\/\//.test(file) ? file : `/sfx/${file}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await ac.decodeAudioData(await res.arrayBuffer());
      buffers.set(file, buf);
      return buf;
    } catch {
      return null; // a missing/renamed file simply plays nothing (fail-quiet)
    } finally {
      pending.delete(file);
    }
  })();
  pending.set(file, p);
  return p;
}

/** UNLOCK + WARM (Lee, 08-17). Two separate failures looked like one "the 808 is
 *  too quiet" bug:
 *
 *   1. An AudioContext created without a user gesture starts SUSPENDED. Nothing
 *      throws — every cue silently plays into a stopped context. Opening the film
 *      or capture window is not itself a gesture, so the first keypress in there
 *      has to resume it. Call this from a real key/click handler.
 *   2. The first cue used to decode on demand, landing ~200ms late — after the
 *      flash it was supposed to hit with.
 *
 *  Returns the context state so a caller can SAY which it was rather than guess. */
export function unlockSfx(): "running" | "suspended" | "unavailable" {
  const ac = audio();               // creates it, and calls resume() if suspended
  if (!ac) return "unavailable";
  void ac.resume();                 // idempotent; a no-op when already running
  preloadSfx();
  return ac.state === "running" ? "running" : "suspended";
}

/** Is the engine actually able to make a sound right now? */
export const sfxReady = (): boolean => !!ctx && ctx.state === "running";

/** Warm the decoders (call on entering film so the first cue isn't laggy). */
export function preloadSfx(): void {
  // Decode even when muted: mute is about PLAYING, and un-muting mid-take should
  // not then cost a 200ms decode on the next cue.
  if (reducedMotion()) return;
  for (const ev of Object.keys(cfg.file) as SfxEvent[]) void load(cfg.file[ev]);
}

/** Fire one event. No-op when muted / reduced-motion / no audio. FILM gating is
 *  the caller's job (pass only in film / preview). */
export function playSfx(event: SfxEvent): void {
  if (cfg.muted || reducedMotion()) return;
  const vol = cfg.volume[event] ?? 0.6;
  if (vol <= 0) return;
  void load(cfg.file[event]).then((buf) => {
    const ac = ctx;
    if (!buf || !ac) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.value = Math.max(0, Math.min(MAX_GAIN, vol));
    src.connect(gain).connect(ac.destination);
    src.start();
  });
}
