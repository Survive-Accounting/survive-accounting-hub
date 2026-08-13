// Guards the pure stage planner: xfade offset math must match the app's
// stitchManifest convention (start of clip k = Σ dur(0..k-1) − k·crossfade),
// hard-cut concat uses the concat filter, single input still normalizes,
// queued stage kinds fail LOUD, and spec validation refuses bad jobs.
import { describe, expect, test } from "bun:test";

import { RENDER } from "./config";
import { concatArgs, planStage, QueuedStageError, validateSpec, type StagedFile } from "./stages";

const f = (durationS: number, i = 0): StagedFile => ({ path: `/tmp/in-${i}.mp4`, durationS });

const graphOf = (args: string[]) => args[args.indexOf("-filter_complex") + 1];

describe("render worker stage planner", () => {
  test("xfade offsets follow the manifest formula (offset_k = Σdur − k·fade)", () => {
    const files = [f(10, 0), f(20, 1), f(30, 2)];
    const g = graphOf(concatArgs(files, "/tmp/out.mp4", { crossfadeMs: 50 }));
    // seam 1: 10 − 1×0.05 = 9.95 · seam 2: 30 − 2×0.05 = 29.9
    expect(g).toContain("xfade=transition=fade:duration=0.05:offset=9.95");
    expect(g).toContain("xfade=transition=fade:duration=0.05:offset=29.9");
    expect(g.match(/acrossfade=d=0\.05/g)?.length).toBe(2);
    expect(g).toContain("[vout]");
  });

  test("hard cut (crossfadeMs 0) uses the concat filter, not xfade", () => {
    const g = graphOf(concatArgs([f(5, 0), f(7, 1)], "/tmp/out.mp4", { crossfadeMs: 0 }));
    expect(g).toContain("concat=n=2:v=1:a=1");
    expect(g).not.toContain("xfade");
  });

  test("single input still normalizes + re-encodes (no concat/xfade)", () => {
    const args = concatArgs([f(8)], "/tmp/out.mp4");
    const g = graphOf(args);
    expect(g).toContain(`scale=${RENDER.width}:${RENDER.height}`);
    expect(g).not.toContain("concat=");
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
    expect(args).toContain("libx264");
  });

  test("default crossfade comes from config (one tuning spot)", () => {
    const g = graphOf(concatArgs([f(10, 0), f(10, 1)], "/tmp/out.mp4"));
    expect(g).toContain(`duration=${RENDER.crossfadeMs / 1000}`);
  });

  test("every input gets geometry/fps/audio normalization before splicing", () => {
    const g = graphOf(concatArgs([f(5, 0), f(5, 1)], "/tmp/out.mp4", { crossfadeMs: 0 }));
    expect(g.match(/force_original_aspect_ratio=decrease/g)?.length).toBe(2);
    expect(g.match(new RegExp(`aresample=${RENDER.audioHz}`, "g"))?.length).toBe(2);
  });

  test("audio is padded+trimmed to the probed duration — the A/V drift guard", () => {
    // acrossfade has no offset param, so every clip's audio must be EXACTLY as
    // long as the duration the video xfade offsets are computed from.
    const g = graphOf(concatArgs([f(10.5, 0), f(7.25, 1)], "/tmp/out.mp4", { crossfadeMs: 50 }));
    expect(g).toContain("apad,atrim=0:10.5,asetpts=PTS-STARTPTS[a0]");
    expect(g).toContain("apad,atrim=0:7.25,asetpts=PTS-STARTPTS[a1]");
  });

  test("an audio-less clip becomes silence of the same length (never a hard fail)", () => {
    const g = graphOf(concatArgs([f(5, 0), { path: "/tmp/in-1.mp4", durationS: 3, hasAudio: false }], "/tmp/out.mp4", { crossfadeMs: 0 }));
    expect(g).toContain(`anullsrc=r=${RENDER.audioHz}:cl=stereo,atrim=0:3,asetpts=PTS-STARTPTS[a1]`);
    expect(g).not.toContain("[1:a]"); // the missing stream is never referenced
  });

  test("a stage may consume an earlier stage's output (__stageN), never a later one", () => {
    const base = { v: 1, inputs: [{ id: "a", url: "https://x/a.mp4" }], output: { putUrl: "https://x/put" } };
    expect(() => validateSpec({ ...base, stages: [{ kind: "concat", inputs: ["a"] }, { kind: "concat", inputs: ["__stage0", "a"] }] })).not.toThrow();
    expect(() => validateSpec({ ...base, stages: [{ kind: "concat", inputs: ["__stage0"] }] })).toThrow(/unknown input/); // self/forward ref
  });

  test("queued stage kinds (reversed_tail, music_bed) fail loud, unknown louder", () => {
    expect(() => planStage({ kind: "reversed_tail", input: "hook" }, [], "/tmp/o.mp4")).toThrow(QueuedStageError);
    expect(() => planStage({ kind: "music_bed", input: "a", bed: "b" }, [], "/tmp/o.mp4")).toThrow(QueuedStageError);
    expect(() => planStage({ kind: "nope" } as never, [], "/tmp/o.mp4")).toThrow(/unknown stage kind/);
  });

  // ---- WARP INTRO ----------------------------------------------------------
  const clip = (durationS: number, hasAudio = false): StagedFile => ({ path: "/tmp/in-0.mp4", durationS, hasAudio });
  const bed = (durationS: number): StagedFile => ({ path: "/tmp/in-1.mp4", durationS });
  const warp = (stage: object, files: StagedFile[]) => graphOf(planStage({ kind: "warp_intro", input: "c0", bed: "bed", ...stage } as never, files, "/tmp/o.mp4"));

  test("warp_intro: reversed tail, white-flash fades meeting at the seam, forward clip", () => {
    const g = warp({ reversedTailS: 1.82, flashMs: 150, musicFadeS: 1 }, [clip(6), bed(30)]);
    // reverse the first R=1.82 of the clip, then forward; half = 150/2000 = 0.075
    expect(g).toContain("[vb0]trim=0:1.82,setpts=PTS-STARTPTS,reverse,setpts=PTS-STARTPTS,fade=t=out:st=1.745:d=0.075:color=white[vrev]");
    expect(g).toContain("[vb1]setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.075:color=white[vfwd]");
    expect(g).toContain("[vrev][vfwd]concat=n=2:v=1:a=0[vout]");
  });

  test("warp_intro: reversed music bed builds to the beat at R, forward bed fades out", () => {
    const g = warp({ reversedTailS: 1.82, musicFadeS: 1 }, [clip(6), bed(30)]);
    expect(g).toContain("[bedA]atrim=0:1.82,asetpts=PTS-STARTPTS,areverse,asetpts=PTS-STARTPTS[brev]");
    // forward bed padded/trimmed to D=6, faded out over the last musicFadeS=1 (st=5)
    expect(g).toContain("apad,atrim=0:6,asetpts=PTS-STARTPTS,afade=t=out:st=5:d=1[bedfwd]");
    expect(g).toContain("[brev][bedfwd]concat=n=2:v=0:a=1[aout]");
  });

  test("warp_intro: a SILENT intro plays the bed as the whole track (no [0:a], no duck)", () => {
    const g = warp({}, [clip(6, false), bed(30)]);
    expect(g).not.toContain("[0:a]");
    expect(g).not.toContain("amix");
    expect(g).not.toContain("volume=");
  });

  test("warp_intro: a TALKING intro ducks the bed under speech and mixes (normalize off)", () => {
    const g = warp({ musicBedDb: -18 }, [clip(6, true), bed(30)]);
    expect(g).toContain("[0:a]aresample=48000");
    expect(g).toContain("[bedfwd]volume=-18dB[bedduck]");
    expect(g).toContain("[clipfwd][bedduck]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[fwd]");
    expect(g).toContain("[brev][fwd]concat=n=2:v=0:a=1[aout]");
  });

  test("warp_intro: a SHORT bed is front-padded so the beat still lands at t=R", () => {
    // bed 1.0s < R 1.82s → reverse the whole 1.0s, then adelay (1.82−1.0)=820ms in front
    const g = warp({ reversedTailS: 1.82 }, [clip(6), bed(1.0)]);
    expect(g).toContain("[bedA]atrim=0:1,asetpts=PTS-STARTPTS,areverse,asetpts=PTS-STARTPTS,adelay=820:all=1,atrim=0:1.82,asetpts=PTS-STARTPTS[brev]");
  });

  test("warp_intro: the reverse window anchors to the CLIP when the clip is short", () => {
    const g = warp({}, [clip(1.0), bed(30)]); // default reversedTailS 1.82 > clip 1.0 → R clamps to 1
    expect(g).toContain("[vb0]trim=0:1,setpts=PTS-STARTPTS,reverse");
  });

  test("warp_intro needs both the clip and the bed", () => {
    expect(() => planStage({ kind: "warp_intro", input: "c0", bed: "bed" }, [clip(6)], "/tmp/o.mp4")).toThrow(/needs the intro clip and the music bed/);
  });

  test("validateSpec accepts warp_intro naming a known clip + bed, rejects unknown", () => {
    const base = { v: 1, inputs: [{ id: "c0", url: "https://x/c.mp4" }, { id: "bd", url: "https://x/b.mp3" }], output: { putUrl: "https://x/put" } };
    expect(() => validateSpec({ ...base, stages: [{ kind: "warp_intro", input: "c0", bed: "bd" }, { kind: "concat", inputs: ["__stage0"] }] })).not.toThrow();
    expect(() => validateSpec({ ...base, stages: [{ kind: "warp_intro", input: "c0", bed: "ghost" }] })).toThrow(/unknown bed "ghost"/);
  });

  // ---- LOOP BUILDER stage wiring (the filtergraph itself is guarded in loop-builder.test.ts)
  test("planStage loop_builder delegates to the loop planner (rotated bed + 1080x1920)", () => {
    const g = graphOf(planStage({ kind: "loop_builder", input: "s", bed: "m", bpm: 120, bars: 8, rotationPointSec: 4.25 } as never, [clip(20), bed(30)], "/tmp/o.mp4"));
    expect(g).toContain("[mA]atrim=start=4.25:end=16,asetpts=PTS-STARTPTS[bedA]");
    expect(g).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
  });

  test("planStage loop_builder needs both the short and the bed", () => {
    expect(() => planStage({ kind: "loop_builder", input: "s", bed: "m", bpm: 120, bars: 8, rotationPointSec: 4.25 } as never, [clip(20)], "/tmp/o.mp4")).toThrow(/needs the short and the music bed/);
  });

  test("validateSpec accepts loop_builder naming a known short + bed, rejects unknown", () => {
    const base = { v: 1, inputs: [{ id: "s", url: "https://x/s.mp4" }, { id: "m", url: "https://x/m.mp3" }], output: { putUrl: "https://x/put" } };
    expect(() => validateSpec({ ...base, stages: [{ kind: "loop_builder", input: "s", bed: "m", bpm: 120, bars: 8, rotationPointSec: 4.25 }] })).not.toThrow();
    expect(() => validateSpec({ ...base, stages: [{ kind: "loop_builder", input: "ghost", bed: "m", bpm: 120, bars: 8, rotationPointSec: 4.25 }] })).toThrow(/unknown input "ghost"/);
  });

  test("validateSpec refuses bad jobs with specifics", () => {
    const ok = { v: 1, inputs: [{ id: "a", url: "https://x/a.mp4" }], stages: [{ kind: "concat", inputs: ["a"] }], output: { putUrl: "https://x/put" } };
    expect(() => validateSpec(ok)).not.toThrow();
    expect(() => validateSpec({ ...ok, v: 2 })).toThrow(/v must be 1/);
    expect(() => validateSpec({ ...ok, inputs: [] })).toThrow(/inputs required/);
    expect(() => validateSpec({ ...ok, stages: [{ kind: "concat", inputs: ["ghost"] }] })).toThrow(/unknown input "ghost"/);
    expect(() => validateSpec({ ...ok, output: { putUrl: "http://insecure" } })).toThrow(/https/);
    expect(() => validateSpec({ ...ok, stages: [{ kind: "wat" }] })).toThrow(/unknown stage kind/);
  });
});
