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

export type SfxEvent = "keypad" | "swoosh" | "cramLaunch" | "confirm";

export interface SfxConfig {
  /** Global mute — silences every event. */
  muted: boolean;
  /** Per-event gain, 0..1. */
  volume: Record<SfxEvent, number>;
  /** Filename under /sfx/ for each event — swap to re-skin. */
  file: Record<SfxEvent, string>;
}

export const SFX_FILES: Record<SfxEvent, string> = {
  keypad: "keypad.mp3",
  swoosh: "swoosh.mp3",
  cramLaunch: "cram-launch.mp3",
  confirm: "confirm.mp3",
};

export const SFX_DEFAULT: SfxConfig = {
  muted: false,
  volume: { keypad: 0.55, swoosh: 0.5, cramLaunch: 0.85, confirm: 0.6 },
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

/** Warm the decoders (call on entering film so the first cue isn't laggy). */
export function preloadSfx(): void {
  if (cfg.muted || reducedMotion()) return;
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
    gain.gain.value = Math.max(0, Math.min(1, vol));
    src.connect(gain).connect(ac.destination);
    src.start();
  });
}
