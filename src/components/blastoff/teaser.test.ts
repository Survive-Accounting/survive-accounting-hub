// The teaser slide's rules, pinned: Lee's default list, the colour by words, the film walk.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { TEASER_DEFAULT, teaserItems, teaserKindOf, teaserShown, teaserSteps } from "./teaser";

describe("the teaser", () => {
  test("defaults to Lee's five, in his order; his own lines replace them", () => {
    expect(teaserItems({})).toEqual(["Common Exam Question!", "Cheat Codes", "Memorize This", "Tricky Question", "Deeper Idea"]);
    expect(teaserItems({ bullets: ["", "  Cheat Codes ", "\tTricky"] })).toEqual(["Cheat Codes", "Tricky"]);
    expect(TEASER_DEFAULT).toHaveLength(5);
  });

  test("each line takes the colour of the callout it names", () => {
    expect(TEASER_DEFAULT.map(teaserKindOf)).toEqual(["found", "cheat", "phrase", "tricky", "tip"]);
    expect(teaserKindOf("Ask yourself")).toBe("ask");
    expect(teaserKindOf("Bonus round")).toBeNull();
  });

  test("the film walk: nothing, then one chip per step; at rest, all of them", () => {
    expect(teaserSteps({})).toBe(6);
    expect(teaserShown({}, 0)).toBe(0);
    expect(teaserShown({}, 3)).toBe(3);
    expect(teaserShown({}, 99)).toBe(5);
    expect(teaserShown({}, null)).toBe(5);
  });

  test("on film a click reveals the next chip, ` puts them away, and space walks it too", () => {
    const capture = readFileSync(join(import.meta.dir, "BlastOffCapture.tsx"), "utf8");
    expect(capture).toContain("teaser ? teaserSteps(frame!) :");
    expect(capture).toContain("if (teaser || ledger) setShot(() => 0);");
    expect(capture).toContain("advance: (d: number) => setShot((s) => Math.max(0, Math.min(steps - 1, s + d)))");
  });
});
