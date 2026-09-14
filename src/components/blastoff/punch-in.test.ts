import { describe, expect, test } from "bun:test";

import { chunks, nextAfter, pickTakes, rangeOf, readTakes, uncovered } from "./punch-in";

const ids = ["a", "b", "c", "d", "e"];
const t = (file: string, fromId: string, toId: string, at: number) => ({ file, fromId, toId, at });

describe("punch-in takes", () => {
  test("after a take, the next slide; none past the end", () => {
    expect(nextAfter(ids, { toId: "b" })).toBe("c");
    expect(nextAfter(ids, { toId: "e" })).toBeNull();
    expect(nextAfter(ids, { toId: "zz" })).toBeNull();
  });
  test("a speed run is a range; a slide that left the split drops the take", () => {
    expect(rangeOf(ids, { fromId: "b", toId: "d" })).toEqual({ from: 1, to: 3 });
    expect(rangeOf(ids, { fromId: "b", toId: "gone" })).toBeNull();
  });
  test("the cut is in slide order, and a newer take overwrites the slides it covers", () => {
    const takes = [t("1.mp4", "a", "a", 1), t("2.mp4", "b", "d", 2), t("3.mp4", "e", "e", 3), t("4.mp4", "a", "a", 4)];
    expect(pickTakes(ids, takes).map((p) => p.take.file)).toEqual(["4.mp4", "2.mp4", "3.mp4"]);
    // a punch-in over part of a speed run wins its slide; the older range can't be half-used, so it drops
    const redo = [...takes, t("5.mp4", "c", "c", 5)];
    expect(pickTakes(ids, redo).map((p) => p.take.file)).toEqual(["4.mp4", "5.mp4", "3.mp4"]);
    expect(uncovered(ids, redo)).toEqual([1, 3]);
  });
  test("a long video joins in batches, in order", () => {
    const n = Array.from({ length: 45 }, (_, i) => i);
    const parts = chunks(n, 20);
    expect(parts.map((p) => p.length)).toEqual([20, 20, 5]);
    expect(parts.flat()).toEqual(n);
    expect(chunks([1, 2], 20)).toEqual([[1, 2]]);
  });
  test("stored takes read back defensively", () => {
    expect(readTakes(null)).toEqual([]);
    expect(readTakes("nope")).toEqual([]);
    expect(readTakes(JSON.stringify([t("x.mp4", "a", "b", 1), { file: 3 }]))).toHaveLength(1);
  });
});
