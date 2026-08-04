// RENDER WORKER CONFIG — the ONE place Lee tunes the pipeline. Every stage reads
// its defaults from here; job specs may override per-field, but "set once, TM
// forever" lives in this file.
export const RENDER = {
  /** Output frame geometry + rate — every input is normalized to this before any
   *  concat/xfade so mixed-source clips (OBS takes, phone clips) always splice. */
  width: 1920,
  height: 1080,
  fps: 30,
  /** Encode: x264 CRF (18 = visually lossless-ish for screen content) + preset.
   *  Auphonic re-processes audio downstream; video passes through Mux after. */
  crf: 18,
  preset: "veryfast",
  audioKbps: 192,
  audioHz: 48000,
  /** CONCAT seam: crossfade duration between spliced clips. 0 = hard cut. The
   *  app's stitch manifest models this same constant (DEFAULT_CROSSFADE_MS = 50)
   *  so chapter offsets stay aligned with what the worker actually renders. */
  crossfadeMs: 50,
  /** WARP INTRO (stage kind "warp_intro"): reversedTailS is THE shared constant —
   *  Lee trimmed the music so the assembled intro's beat-drop lands exactly this far
   *  in, so the reversed-video duration AND the music groove-land are locked together
   *  (1.82s). flashMs = the white-flash SNAP at the reverse→forward seam; flashColor =
   *  its colour; musicBedDb = the music's gain when ducked under a talking intro's
   *  speech (a silent brand intro plays the bed at full); musicFadeS = the forward
   *  music's fade-out into Q1. Job specs may override any of these per render. */
  reversedTailS: 1.82,
  flashMs: 150,
  flashColor: "white",
  musicBedDb: -18,
  musicFadeS: 1.0,
} as const;

/** Hard ceilings — fail loud rather than render garbage or fill the disk.
 *  jobTimeoutMs caps the WHOLE job (every op is clamped to the time remaining),
 *  and it sits below the app's 60-min publish poll deadline — so the worker can
 *  never still be "legitimately succeeding" after the app has given up. */
export const LIMITS = {
  maxInputs: 64,
  maxInputBytes: 2_000_000_000, // 2 GB per clip
  maxTotalBytes: 8_000_000_000, // ~Fly ephemeral rootfs headroom (inputs + stage outputs)
  jobTimeoutMs: 50 * 60_000, // whole-job ceiling — MUST stay under the app's 60-min poll
  downloadTimeoutMs: 5 * 60_000, // per clip (clamped to job time remaining)
  renderTimeoutMs: 45 * 60_000, // per stage (clamped to job time remaining)
  uploadTimeoutMs: 15 * 60_000, // clamped to job time remaining
  /** Self-exit after this long with no active jobs and no requests — the Fly
   *  idle strategy (fly.toml): clean exit stops the machine, auto_start revives. */
  idleExitMs: 5 * 60_000,
} as const;
