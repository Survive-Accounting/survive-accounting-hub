import { describe, expect, test } from "bun:test";

import {
  assemblyCommandSketch, assemblyFiltergraph, buildBodyEdl, DEFAULT_CROSSFADE_MS,
  edlDuration, keepersReel, type SegmentInput,
} from "./segment-assembly";

const seg = (frameId: string, beatIndex: number, playbackId: string, start: number, end: number): SegmentInput =>
  ({ frameId, beatIndex, playbackId, start, end });

/** 4-beat frame F1 whose beat 3 keeper comes from a SECOND take (punch-in). */
const segments: Record<string, SegmentInput[]> = {
  F1: [
    seg("F1", 0, "takeA", 0, 8),
    seg("F1", 1, "takeA", 8, 15),
    seg("F1", 2, "takeB", 3, 9), // re-recorded beat, different take
    seg("F1", 3, "takeA", 22, 30),
  ],
  F2: [seg("F2", 0, "takeC", 0, 12)],
  F3: [], // missing keeper → gap
};

describe("buildBodyEdl", () => {
  test("flattens keeper segments in frame order; reports gaps", () => {
    const { edl, gapFrameIds } = buildBodyEdl([{ id: "F1" }, { id: "F2" }, { id: "F3" }], (id) => segments[id] ?? []);
    expect(edl).toHaveLength(5); // 4 from F1 + 1 from F2
    expect(edl.map((s) => s.playbackId)).toEqual(["takeA", "takeA", "takeB", "takeA", "takeC"]);
    expect(gapFrameIds).toEqual(["F3"]);
  });
  test("beat 3 keeper is the punch-in take", () => {
    const { edl } = buildBodyEdl([{ id: "F1" }], (id) => segments[id] ?? []);
    expect(edl[2]).toMatchObject({ beatIndex: 2, playbackId: "takeB" });
  });
});

describe("keepersReel", () => {
  test("segments in order with a GAP step announced (not skipped)", () => {
    const reel = keepersReel([{ id: "F1" }, { id: "F2" }, { id: "F3" }], (id) => segments[id] ?? [], (id) => `Frame ${id}`);
    const kinds = reel.map((s) => s.kind);
    expect(kinds.filter((k) => k === "segment")).toHaveLength(5);
    const gap = reel.find((s) => s.kind === "gap");
    expect(gap).toMatchObject({ frameId: "F3", label: "Frame F3" });
  });
});

describe("edlDuration", () => {
  test("sums segment lengths", () => {
    const { edl } = buildBodyEdl([{ id: "F1" }, { id: "F2" }], (id) => segments[id] ?? []);
    // 8 + 7 + 6 + 8 + 12 = 41
    expect(edlDuration(edl)).toBe(41);
  });
});

describe("assemblyFiltergraph", () => {
  test("≤1 input → empty (nothing to join)", () => {
    expect(assemblyFiltergraph(1)).toBe("");
    expect(assemblyFiltergraph(0)).toBe("");
  });
  test("N inputs → video hard-cut concat + chained audio acrossfade to [a]", () => {
    const fg = assemblyFiltergraph(3, 60);
    expect(fg).toContain("[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]");
    // two joins → two acrossfades, last outputs [a]
    expect(fg.match(/acrossfade=d=0\.060/g)).toHaveLength(2);
    expect(fg.endsWith("[a]")).toBe(true);
  });
  test("default crossfade is 50ms", () => {
    expect(DEFAULT_CROSSFADE_MS).toBe(50);
    expect(assemblyFiltergraph(2)).toContain("acrossfade=d=0.050");
  });
});

describe("assemblyCommandSketch", () => {
  test("emits per-segment -ss/-to inputs + the filter_complex", () => {
    const { edl } = buildBodyEdl([{ id: "F2" }], (id) => segments[id] ?? []);
    const cmd = assemblyCommandSketch(edl); // single segment → -c copy path
    expect(cmd).toContain("-ss 0.000 -to 12.000");
    const { edl: multi } = buildBodyEdl([{ id: "F1" }], (id) => segments[id] ?? []);
    expect(assemblyCommandSketch(multi)).toContain("-filter_complex");
  });
});
