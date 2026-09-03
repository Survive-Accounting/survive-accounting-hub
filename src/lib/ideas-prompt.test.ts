// SPLIT INTO PHASES — the toggle's whole implementation is this preamble, so
// the two things that can go wrong are: it isn't there, or it's there three
// times because organise ran again.
import { describe, expect, test } from "bun:test";

import { IDEA_CATEGORY_KEYS, PHASED_PREAMBLE, withPhasedPreamble } from "./ideas-prompt";
import { CATEGORIES } from "@/components/ideas/model";

describe("the phase instruction", () => {
  test("names Claude Code, asks Lee, and shows the phase format", () => {
    expect(PHASED_PREAMBLE).toContain("Claude Code: ask Lee if he wants all phases at once or one at a time.");
    expect(PHASED_PREAMBLE).toContain("Phases: 1) [first feature], 2) [second feature]");
  });

  test("goes on top of the drafted prompt, keeping every word of it", () => {
    const out = withPhasedPreamble("## Summary\nDo the thing.");
    expect(out.startsWith(PHASED_PREAMBLE)).toBe(true);
    expect(out).toContain("## Summary\nDo the thing.");
  });

  test("a redraft does not stack a second copy", () => {
    const once = withPhasedPreamble("## Prompt\nbuild it");
    expect(withPhasedPreamble(once)).toBe(once);
  });

  test("an empty draft still carries the instruction rather than silently dropping it", () => {
    expect(withPhasedPreamble("").startsWith(PHASED_PREAMBLE)).toBe(true);
    expect(withPhasedPreamble(null).startsWith(PHASED_PREAMBLE)).toBe(true);
  });
});

describe("the category vocabulary", () => {
  test("the organiser is offered exactly the categories the vault stores", () => {
    expect([...IDEA_CATEGORY_KEYS].sort()).toEqual([...CATEGORIES].sort());
  });
  test("Student side is one of them", () => {
    expect(CATEGORIES).toContain("STUDENT_SIDE");
  });
});
