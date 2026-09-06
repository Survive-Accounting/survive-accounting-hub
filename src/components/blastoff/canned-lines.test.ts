import { describe, expect, test } from "bun:test";

import { CANNED_LINES, cannedLinesFor, cannedWarnings, pickCannedLine, type CannedLine } from "./canned-lines";

describe("the canned intro/outro registry", () => {
  test("Lee's ten lines, split cleanly by slot", () => {
    expect(cannedLinesFor("intro")).toHaveLength(4);
    expect(cannedLinesFor("outro")).toHaveLength(3);
    expect(cannedLinesFor("bio")).toHaveLength(3);
    for (const l of CANNED_LINES) expect(l.text.trim().length).toBeGreaterThan(0);
  });
  test("the Standard outro is weighted 3; everything else defaults to 1", () => {
    expect(CANNED_LINES.find((l) => l.id === "outro-standard")?.weight).toBe(3);
    const others = CANNED_LINES.filter((l) => l.id !== "outro-standard");
    for (const l of others) expect(l.weight ?? 1).toBe(1);
  });
});

describe("pickCannedLine", () => {
  const OUTROS: CannedLine[] = [
    { id: "a", slot: "outro", title: "A", text: "a", weight: 3 },
    { id: "b", slot: "outro", title: "B", text: "b" },
    { id: "c", slot: "outro", title: "C", text: "c" },
  ];

  test("never the same as the immediately-previous pick when another option exists", () => {
    for (let i = 0; i < 50; i++) {
      const pick = pickCannedLine(OUTROS, "outro", ["a"], () => i / 50);
      expect(pick?.id).not.toBe("a");
    }
  });
  test("with only one line for the slot, that's the pick even if it was just used", () => {
    const one: CannedLine[] = [{ id: "solo", slot: "intro", title: "Solo", text: "x" }];
    expect(pickCannedLine(one, "intro", ["solo"])?.id).toBe("solo");
  });
  test("no history yet — the whole pool is in play, weighted", () => {
    // rng=0 always lands on the first candidate in weight order
    expect(pickCannedLine(OUTROS, "outro", [], () => 0)?.id).toBe("a");
    // rng just past a's weight share (3 of 5 = 0.6) lands on b
    expect(pickCannedLine(OUTROS, "outro", [], () => 0.61)?.id).toBe("b");
  });
  test("empty pool → null, never a throw", () => {
    expect(pickCannedLine([], "intro", [])).toBeNull();
    expect(pickCannedLine(OUTROS, "intro", [])).toBeNull();
  });
});

describe("cannedWarnings", () => {
  test("no warnings with no history", () => {
    expect(cannedWarnings("a", [])).toEqual([]);
  });
  test("flags an exact repeat of the last video", () => {
    expect(cannedWarnings("a", ["a", "b", "c"])).toContain("Same as last video.");
    expect(cannedWarnings("a", ["b", "a", "c"])).not.toContain("Same as last video.");
  });
  test("flags heavy recent overuse, not occasional repeats", () => {
    expect(cannedWarnings("a", ["b", "a", "c", "a", "b", "a"]).some((w) => w.startsWith("Used"))).toBe(true);
    expect(cannedWarnings("a", ["b", "c", "d", "e", "f", "g"])).toEqual([]);
  });
  test("a short history never trips the overuse warning, only the back-to-back one", () => {
    expect(cannedWarnings("a", ["b"])).toEqual([]);
    expect(cannedWarnings("a", [])).toEqual([]);
  });
});
