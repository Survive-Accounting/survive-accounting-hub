import { describe, expect, test } from "bun:test";

import { bodyFrames, collectKeepers, hasDrift, introFrame, keeperOf, lessonPassthrough, missingLabel, nextVersion, resolutionSet, type PubFrame, type PubTake } from "./publish-pipeline";

const F = (id: string, beat: PubFrame["beat"], subIndex: number, extra: Partial<PubFrame> = {}): PubFrame => ({ id, beat, subIndex, ...extra });

const frames: PubFrame[] = [
  F("h1", "hook", 0, { title: "Title" }),
  F("h2", "hook", 1, { title: "Outline" }),
  F("t1", "teach", 0),
  F("m1", "model_practice", 0),
  F("c1", "cram", 0),
];

describe("introFrame", () => {
  test("defaults to Hook f1 (subIndex 0)", () => {
    expect(introFrame(frames)?.id).toBe("h1");
  });
  test("an explicit introTake flag wins", () => {
    expect(introFrame([...frames, F("t2", "teach", 1, { introTake: true })])?.id).toBe("t2");
  });
});

describe("bodyFrames", () => {
  test("excludes the intro, column-major order", () => {
    expect(bodyFrames(frames, "h1").map((f) => f.id)).toEqual(["h2", "t1", "m1", "c1"]);
  });
});

describe("collectKeepers", () => {
  const ready = (frameId: string): PubTake => ({ frameId, keeper: true, muxPlaybackId: `pb-${frameId}`, status: "ready" });
  test("splits keepers vs frames missing a shippable keeper", () => {
    const body = bodyFrames(frames, "h1");
    const map = new Map<string, PubTake>([["h2", ready("h2")], ["t1", ready("t1")], ["m1", ready("m1")]]); // c1 missing
    const { keepers, missing } = collectKeepers(body, (id) => (map.has(id) ? keeperOf([map.get(id)!]) : null));
    expect(keepers.map((k) => k.frame.id)).toEqual(["h2", "t1", "m1"]);
    expect(missing.map((m) => m.id)).toEqual(["c1"]);
  });
  test("keeperOf rejects non-keeper / not-ready / no-playback takes", () => {
    expect(keeperOf([{ frameId: "x", keeper: false, muxPlaybackId: "p", status: "ready" }])).toBeNull();
    expect(keeperOf([{ frameId: "x", keeper: true, muxPlaybackId: "p", status: "processing" }])).toBeNull();
    expect(keeperOf([{ frameId: "x", keeper: true, muxPlaybackId: null, status: "ready" }])).toBeNull();
    expect(keeperOf([{ frameId: "x", keeper: true, muxPlaybackId: "p", status: "ready" }])?.frameId).toBe("x");
  });
  test("missingLabel names frames by title or beat/row", () => {
    expect(missingLabel([F("c1", "cram", 0), F("t1", "teach", 1, { title: "Model it" })])).toBe("cram f1, Model it");
  });
});

describe("versioning + passthrough", () => {
  test("nextVersion bumps past the highest", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([1, 2])).toBe(3);
    expect(nextVersion([3, 1, 2])).toBe(4);
  });
  test("lessonPassthrough is {COURSE}-{LESSON}-v{n}", () => {
    expect(lessonPassthrough("Start Here", "Ch 4 · Debits & Credits", 2)).toBe("SH-L04-v2");
  });
});

describe("resolution drift", () => {
  test("uniform resolutions → no drift", () => {
    expect(hasDrift([{ w: 1920, h: 1080 }, { w: 1920, h: 1080 }, null])).toBe(false);
  });
  test("a mismatched take → drift + the distinct set", () => {
    const dims = [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }];
    expect(hasDrift(dims)).toBe(true);
    expect(resolutionSet(dims).sort()).toEqual(["1280x720", "1920x1080"]);
  });
});
