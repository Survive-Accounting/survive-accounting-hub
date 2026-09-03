// Shared bits for anything that shows a cram video (learn v3).
export const DEMO_PLAYBACK = "__demo__";
/** Mux frame-accurate poster — free for every published video. */
export const muxThumb = (playbackId: string, width = 480) => `https://image.mux.com/${playbackId}/thumbnail.jpg?width=${width}&time=2`;
export const fmtRuntime = (sec: number) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, "0")}`; };
export const LAST_SET_KEY = "sa-cram-last-set";
export const SOUND_KEY = "sa-cram-sound";
export type ProgressState = "unstarted" | "in_progress" | "complete";
export type Prog = { state: ProgressState; positionSec: number; durationSec: number | null; updatedAt: number };
