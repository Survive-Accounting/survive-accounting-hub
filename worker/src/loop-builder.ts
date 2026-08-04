// LOOP BUILDER (pure) — engineers a vertical short so it autoplay-loops SEAMLESSLY on
// TikTok / Reels / Shorts, where a single play never reveals a bad seam. No I/O here: the
// server / CLI feed local paths + probed durations and run the argv this returns, and
// bun test asserts the filtergraph directly.
//
// THE TECHNIQUE. The music dictates runtime. X = one whole number of bars long:
//   bar_length = (60 / BPM) * beats_per_bar ;  X = bar_length * bars
// A FRACTIONAL BAR is the entire failure mode of a loop — it is asserted loudly (the caller
// checks the bed + short are >= X and the output == X).
//
// AUDIO. The bed is ROTATED to start at the "warp" point so its natural loop point lands at
// the video seam:  music[rotation → X]  ++  music[0 → rotation].  Their A→B junction IS the
// song's own X→0 loop point → BUTT-SPLICE, sample-accurate, NO crossfade (a crossfade there
// smears the groove). The VOICE gets at most a 15ms EQUAL-POWER (qsin) crossfade where it
// loops (its own tail ↔ head), never at the music junction. Loudness-normalize AFTER the mix
// so the junction levels match.
//
// VIDEO. Fill 1080x1920 (cover + crop, NO letterbox), trim to X, NO fade anywhere (a tail
// fade destroys the loop illusion). match_cut = the loop wrap is a hard cut (first & last
// shots are the same framing). Optional bolt_flash = a white blowout on the frames straddling
// the seam, composited in the SAME pass (single encode).
import { LOOP } from "./config";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface LoopTiming { bpm: number; beatsPerBar: number; bars: number; rotationPointSec: number; fps: number }

/** The loop math — the ONE place bar_length / X / the seam frame are derived. */
export function computeLoop(t: LoopTiming): { barLength: number; X: number; frameDur: number; seamFrame: number } {
  if (!Number.isFinite(t.bpm) || t.bpm <= 0) throw new Error(`loop: BPM must be > 0 (got ${t.bpm})`);
  if (!Number.isInteger(t.bars) || t.bars <= 0) throw new Error(`loop: bars must be a whole number > 0 (got ${t.bars}) — a fractional bar cannot loop`);
  if (!Number.isFinite(t.beatsPerBar) || t.beatsPerBar <= 0) throw new Error(`loop: beats_per_bar must be > 0 (got ${t.beatsPerBar})`);
  if (!Number.isFinite(t.fps) || t.fps <= 0) throw new Error(`loop: fps must be > 0 (got ${t.fps})`);
  const barLength = (60 / t.bpm) * t.beatsPerBar;
  const X = barLength * t.bars;
  if (!(t.rotationPointSec >= 0 && t.rotationPointSec < X)) throw new Error(`loop: rotation_point ${t.rotationPointSec} must be in [0, X=${round3(X)})`);
  return { barLength, X, frameDur: 1 / t.fps, seamFrame: Math.round(X * t.fps) };
}

export interface LoopBuildOpts extends LoopTiming {
  /** Does the short carry a voice/speech track to mix under? (else the bed is the whole audio) */
  hasAudio: boolean;
  boltFlash?: boolean;
  bedDb?: number;
  voiceSeamMs?: number;
  loudI?: number; loudTP?: number; loudLRA?: number;
  width?: number; height?: number;
}

const loopEnc = (fps: number) => [
  "-r", String(fps),
  "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-movflags", "+faststart",
];

/** LOOP BUILDER argv. inputs[0] = the assembled short (video + optional voice), inputs[1] =
 *  the music bed. Output = a self-contained 1080x1920 H.264 clip of length X engineered to
 *  loop seamlessly. The caller asserts the bed + short are >= X first, and the output == X. */
export function loopBuilderArgs(shortPath: string, bedPath: string, outPath: string, o: LoopBuildOpts): string[] {
  const { X, frameDur } = computeLoop(o);
  const ROT = o.rotationPointSec;
  const W = o.width ?? LOOP.width, H = o.height ?? LOOP.height, FPS = o.fps;
  const bedDb = o.bedDb ?? LOOP.bedDb;
  const XF = Math.min((o.voiceSeamMs ?? LOOP.voiceSeamMs) / 1000, X / 4); // <=15ms, clamped
  const [I, TP, LRA] = [o.loudI ?? LOOP.loudI, o.loudTP ?? LOOP.loudTP, o.loudLRA ?? LOOP.loudLRA];
  const flashOn = !!o.boltFlash;

  // ---- VIDEO: fill 1080x1920 + trim to X (+ optional bolt-flash blowout on the seam frames)
  const vParts: string[] = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p,trim=0:${round3(X)},setpts=PTS-STARTPTS${flashOn ? "[vfill]" : "[vout]"}`,
  ];
  if (flashOn) {
    // 3 white frames straddling the loop wrap: the LAST frame + the FIRST 2 frames, so the
    // blowout peaks at the seam. Opaque white overlay = a full blowout; single encode.
    vParts.push(`color=c=white:s=${W}x${H}:r=${FPS},format=yuv420p[wht]`);
    vParts.push(`[vfill][wht]overlay=enable='gte(t,${round3(X - frameDur)})+lt(t,${round3(2 * frameDur)})'[vout]`);
  }

  // ---- AUDIO: rotate the bed (butt-splice at the song loop point), + voice loop-seam qsin
  const aParts: string[] = [
    `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,asplit=2[mA][mB]`,
    `[mA]atrim=start=${round3(ROT)}:end=${round3(X)},asetpts=PTS-STARTPTS[bedA]`,
    `[mB]atrim=start=0:end=${round3(ROT)},asetpts=PTS-STARTPTS[bedB]`,
    `[bedA][bedB]concat=n=2:v=0:a=1[bed]`,
  ];
  if (o.hasAudio) {
    aParts.push(
      // Loop-seam EQUAL-POWER (qsin) crossfade: fade the voice IN over its first XF and OUT
      // over its last XF, so at the loop WRAP the tail (→0) meets the head (0→) with constant
      // power and no click. Length stays X; the MUSIC junction is butt-spliced (never faded).
      `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${round3(X)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${round3(XF)}:curve=qsin,afade=t=out:st=${round3(X - XF)}:d=${round3(XF)}:curve=qsin[voice]`,
      `[bed]volume=${bedDb}dB[bedduck]`,
      `[voice][bedduck]amix=inputs=2:duration=first:normalize=0[premix]`,
      `[premix]loudnorm=I=${I}:TP=${TP}:LRA=${LRA}[aout]`,
    );
  } else {
    // music-only short: the rotated bed IS the whole track (no [0:a] referenced)
    aParts.push(`[bed]loudnorm=I=${I}:TP=${TP}:LRA=${LRA}[aout]`);
  }

  const graph = `${vParts.join(";")};${aParts.join(";")}`;
  return ["-y", "-i", shortPath, "-i", bedPath, "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", ...loopEnc(FPS), outPath];
}

/** The debugging sidecar written next to the output. */
export function loopSidecar(t: LoopTiming, actualDurationS: number): {
  bpm: number; bars: number; bar_length: number; X: number; rotation_point: number; actual_duration: number; seam_frame: number;
} {
  const { barLength, X, seamFrame } = computeLoop(t);
  return { bpm: t.bpm, bars: t.bars, bar_length: round3(barLength), X: round3(X), rotation_point: t.rotationPointSec, actual_duration: round3(actualDurationS), seam_frame: seamFrame };
}

/** --verify-loop: concatenate the output to itself (bit-exact, -c copy via the concat
 *  demuxer, so the real seam is preserved — a re-encode would hide it) → a preview that
 *  actually plays the seam N-1 times. `listPath` is a concat list file the caller writes
 *  (one `file '<out>'` line per repeat). */
export function verifyLoopArgs(listPath: string, previewPath: string): string[] {
  return ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", previewPath];
}
