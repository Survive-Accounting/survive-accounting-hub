// Guards the pure loop planner: the loop math (X = one whole bars long), the rotated-bed
// butt-splice at the song loop point, the voice loop-seam qsin crossfade (and the music-only
// branch), the bolt-flash blowout on the seam frames, the fill/trim, loudness-after-assembly,
// and the fail-loud guards on a fractional bar / bad rotation.
import { describe, expect, test } from "bun:test";

import { computeLoop, loopBuilderArgs, loopSidecar, verifyLoopArgs } from "./loop-builder";

const graphOf = (args: string[]) => args[args.indexOf("-filter_complex") + 1];
const T = { bpm: 120, beatsPerBar: 4, bars: 8, rotationPointSec: 4.25, fps: 30 };
const build = (extra: Record<string, unknown> = {}, hasAudio = true) =>
  graphOf(loopBuilderArgs("/tmp/short.mp4", "/tmp/bed.mp3", "/tmp/out.mp4", { ...T, hasAudio, ...extra }));

describe("loop builder", () => {
  test("loop math: bar_length + X + seam frame", () => {
    const r = computeLoop(T); // 60/120*4 = 2.0/bar; *8 = 16.0
    expect(r.barLength).toBe(2);
    expect(r.X).toBe(16);
    expect(r.seamFrame).toBe(480); // 16 * 30
    expect(r.frameDur).toBeCloseTo(1 / 30, 6);
  });

  test("a fractional bar or bad rotation fails LOUD (the whole failure mode)", () => {
    expect(() => computeLoop({ ...T, bars: 8.5 })).toThrow(/whole number/);
    expect(() => computeLoop({ ...T, bars: 0 })).toThrow(/whole number/);
    expect(() => computeLoop({ ...T, bpm: 0 })).toThrow(/BPM/);
    expect(() => computeLoop({ ...T, rotationPointSec: 16 })).toThrow(/rotation_point/); // == X, out of [0,X)
    expect(() => computeLoop({ ...T, rotationPointSec: -1 })).toThrow(/rotation_point/);
  });

  test("bed is ROTATED music[rot→X] ++ music[0→rot], butt-spliced at the song loop point", () => {
    const g = build();
    expect(g).toContain("[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,asplit=2[mA][mB]");
    expect(g).toContain("[mA]atrim=start=4.25:end=16,asetpts=PTS-STARTPTS[bedA]");
    expect(g).toContain("[mB]atrim=start=0:end=4.25,asetpts=PTS-STARTPTS[bedB]");
    expect(g).toContain("[bedA][bedB]concat=n=2:v=0:a=1[bed]"); // concat = butt-splice, NO crossfade
    expect(g).not.toContain("acrossfade"); // never crossfade the music junction
  });

  test("voice gets a <=15ms EQUAL-POWER (qsin) fade-in/out loop-seam crossfade, then ducked mix + loudnorm AFTER", () => {
    const g = build(); // hasAudio true, default 15ms → fade out starts at X-XF = 15.985
    // qsin fade IN over the first 15ms + fade OUT over the last 15ms = the loop-seam crossfade
    expect(g).toContain("[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:16,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.015:curve=qsin,afade=t=out:st=15.985:d=0.015:curve=qsin[voice]");
    expect(g).toContain("[bed]volume=-12dB[bedduck]"); // default duck
    expect(g).toContain("[voice][bedduck]amix=inputs=2:duration=first:normalize=0[premix]");
    expect(g).toContain("[premix]loudnorm=I=-14:TP=-1:LRA=11[aout]"); // AFTER assembly
  });

  test("a music-only short (no voice) plays the bed as the whole track — no [0:a]", () => {
    const g = build({}, false);
    expect(g).toContain("[bed]loudnorm=I=-14:TP=-1:LRA=11[aout]");
    expect(g).not.toContain("[0:a]");
    expect(g).not.toContain("[voice]");
    expect(g).not.toContain("volume=");
  });

  test("video fills 1080x1920 (no letterbox), trims to X, no fade; default = hard cut, no flash", () => {
    const g = build();
    expect(g).toContain("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p,trim=0:16,setpts=PTS-STARTPTS[vout]");
    const videoSubgraph = g.slice(0, g.indexOf("[1:a]")); // the [0:v] chain only
    expect(videoSubgraph).not.toContain("fade"); // NO video fade to black (the audio afade is the voice seam, intentional)
    expect(videoSubgraph).not.toContain("overlay"); // no flash unless asked
  });

  test("bolt_flash composites a white blowout on the seam frames (last + first two), single pass", () => {
    const g = build({ boltFlash: true });
    expect(g).toContain("trim=0:16,setpts=PTS-STARTPTS[vfill]"); // video now feeds the overlay
    expect(g).toContain("color=c=white:s=1080x1920:r=30,format=yuv420p[wht]");
    // last frame: t >= 16 - 1/30 = 15.967 ; first 2 frames: t < 2/30 = 0.067
    expect(g).toContain("[vfill][wht]overlay=enable='gte(t,15.967)+lt(t,0.067)'[vout]");
  });

  test("output argv is 1080x1920 H.264 + faststart, mapped [vout]/[aout]", () => {
    const a = loopBuilderArgs("/tmp/short.mp4", "/tmp/bed.mp3", "/tmp/out.mp4", { ...T, hasAudio: true });
    expect(a).toContain("libx264");
    expect(a).toContain("+faststart");
    expect(a.slice(a.indexOf("-map"))).toEqual(["-map", "[vout]", "-map", "[aout]", "-r", "30", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "/tmp/out.mp4"]);
  });

  test("sidecar carries the debug fields", () => {
    expect(loopSidecar(T, 16.001)).toEqual({ bpm: 120, bars: 8, bar_length: 2, X: 16, rotation_point: 4.25, actual_duration: 16.001, seam_frame: 480 });
  });

  test("verify-loop concatenates bit-exact (-c copy via the concat demuxer)", () => {
    expect(verifyLoopArgs("/tmp/list.txt", "/tmp/preview.mp4")).toEqual(["-y", "-f", "concat", "-safe", "0", "-i", "/tmp/list.txt", "-c", "copy", "/tmp/preview.mp4"]);
  });
});
