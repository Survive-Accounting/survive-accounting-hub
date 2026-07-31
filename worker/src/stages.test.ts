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
