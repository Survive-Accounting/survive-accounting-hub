import { describe, expect, test } from "bun:test";

import { furthestForward, obsFileTime, recoverTakes } from "./punch-in";

const local = (y: number, mo: number, d: number, h: number, mi: number, s: number, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms).toISOString();

describe("recovering punch-in takes", () => {
  test("OBS file names read as local time", () => {
    expect(obsFileTime("2026-09-15 14-40-16.mp4")).toBe(new Date(2026, 8, 15, 14, 40, 16).getTime());
    expect(obsFileTime("outro.mp4")).toBeNull();
  });
  test("a recording matches its roll and takes back its slides", () => {
    const ids = ["a", "b", "c", "d"];
    const logs = [
      { rolled_at: local(2026, 9, 15, 14, 40, 16, 894), arrivals: [{ frameId: "a", atMs: 0 }, { frameId: "b", atMs: 6459 }] },
      { rolled_at: local(2026, 9, 15, 14, 41, 0, 100), arrivals: [{ frameId: "b", atMs: 0 }, { frameId: "c", atMs: 1500 }, { frameId: "d", atMs: 9000 }] },
      { rolled_at: local(2026, 9, 15, 14, 42, 0), arrivals: [{ frameId: "zz", atMs: 0 }] },
    ];
    const files = [
      { name: "2026-09-15 14-40-16.mp4", durationS: 6.2 },
      { name: "2026-09-15 14-41-00.mp4", durationS: 8.1 },
      { name: "2026-09-15 14-42-00.mp4", durationS: 3 },
      { name: "2026-09-15 15-00-00.mp4", durationS: 3 },
    ];
    expect(recoverTakes(ids, logs, files).map((t) => [t.file, t.fromId, t.toId])).toEqual([
      ["2026-09-15 14-40-16.mp4", "a", "a"],
      ["2026-09-15 14-41-00.mp4", "b", "c"],
    ]);
  });
});

describe("a look back while recording", () => {
  test("the take reaches only as far forward as it got", () => {
    const ids = ["a", "b", "c", "d", "e"];
    // started on c, went forward to d, looked back at a, stopped on a
    expect(furthestForward(ids, "c", ["c", "d", "a"])).toBe("d");
    // started on c, only looked back, stopped on b → just c
    expect(furthestForward(ids, "c", ["c", "b"])).toBe("c");
    // a plain speed run c → e
    expect(furthestForward(ids, "c", ["c", "d", "e"])).toBe("e");
  });
});
