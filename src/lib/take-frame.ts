// GRABBING A FRAME OF THE TAKE — the pure half of components/v3/TakeFrame.tsx.
//
// Lee, 2026-09-09: "I think with the using the intro slide for the thumbnail, let me choose
// between the first few seconds (as granular as we can), since often I have my eyes closed at
// the start."
//
// So the cover can also be the video's own opening: he loads the take, steps through the first
// seconds one frame at a time, and saves the one where his eyes are open. The file never leaves
// the machine — a blob URL into a <video>, a canvas, a download.
//
// Everything here is arithmetic and naming. The seeking lives in the component.

/** Most takes are 30fps; 60 is the other one OBS is commonly set to. A frame step this size is
 *  the finest useful granularity — HTMLVideoElement seeking is not frame-exact, but a step of
 *  1/60s always lands on a different frame than the one before it. */
export const FRAME_RATES = [24, 30, 60] as const;
export type FrameRate = (typeof FRAME_RATES)[number];
export const DEFAULT_FPS: FrameRate = 30;
export const isFrameRate = (v: unknown): v is FrameRate =>
  typeof v === "number" && (FRAME_RATES as readonly number[]).includes(v);

/** THE OPENING. The cold open assembles over three seconds and Lee's first line lands right
 *  after, so the frame worth keeping is almost always inside the first six — but the window is a
 *  default, not a cage: the slider covers the whole take. */
export const OPENING_SECONDS = 6;

/** Step by whole frames, clamped inside the take. A step that would fall off either end lands on
 *  the end instead of doing nothing — holding the key at 0 should not feel broken. */
export function stepTime(current: number, frames: number, fps: number, duration: number): number {
  const rate = fps > 0 ? fps : DEFAULT_FPS;
  const end = duration > 0 ? duration : 0;
  const next = current + frames / rate;
  return Math.min(end, Math.max(0, Number.isFinite(next) ? next : 0));
}

/** Which frame a time falls on, for the readout. */
export const frameIndex = (t: number, fps: number): number =>
  Math.max(0, Math.round(t * (fps > 0 ? fps : DEFAULT_FPS)));

/** "1.833s" — three decimals, because two cannot tell 30fps frames apart. */
export const formatTime = (t: number): string => `${Math.max(0, t).toFixed(3)}s`;

/** The saved still's name: the video it came from, and exactly where in it. */
export function frameFilename(name: string, t: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "short"}-frame-${Math.max(0, t).toFixed(3).replace(".", "-")}s.png`;
}

/** The evenly spaced times a contact sheet of the opening samples. Never past the take's end, and
 *  never a duplicate — a two-second clip asked for eight thumbs gets as many as it can hold. */
export function contactTimes(duration: number, window = OPENING_SECONDS, count = 8): number[] {
  const end = Math.min(window, duration > 0 ? duration : 0);
  if (end <= 0 || count < 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.round((end * i) / count * 1000) / 1000;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** A take file, checked before it is handed to a <video>: name and type only — the bytes are the
 *  browser's problem. Returns the reason it can't be used, or null. */
export function takeFileProblem(file: { name: string; type: string; size: number } | null): string | null {
  if (!file) return "Pick the take file first.";
  const named = /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name);
  if (!file.type.startsWith("video/") && !named) return "That doesn't look like a video file.";
  if (/\.mkv$/i.test(file.name)) return "Chrome can't play .mkv — remux to .mp4 first (OBS: Remux Recordings).";
  if (file.size <= 0) return "That file is empty.";
  return null;
}
