// SPLIT INTO PHASES — the toggle's whole implementation is this preamble, so
// the two things that can go wrong are: it isn't there, or it's there three
// times because organise ran again.
import { describe, expect, test } from "bun:test";

import { IDEA_CATEGORY_KEYS, PHASED_PREAMBLE, promptSection, withPhasedPreamble } from "./ideas-prompt";
import { CATEGORIES } from "@/components/ideas/model";

/** What the synthesis lane actually returns. */
const drafted = [
  "## TLDR", "One line.", "",
  "## Summary", "What and why.", "",
  "## Prompt", "Build the thing.", "",
  "## Testing checklist", "- [ ] it works",
].join("\n");

describe("the phase instruction", () => {
  test("names Claude Code, asks Lee, and shows the phase format", () => {
    expect(PHASED_PREAMBLE).toContain("Claude Code: ask Lee if he wants all phases at once or one at a time.");
    expect(PHASED_PREAMBLE).toContain("Phases: 1) [first feature], 2) [second feature]");
  });

  // THE BUG THIS GUARDS: the vault's prompt box, the summary email and the
  // Obsidian note all take the "## Prompt" SECTION. An instruction placed above
  // "## TLDR" reaches nobody.
  test("lands INSIDE ## Prompt, where every reader of the prompt will see it", () => {
    const out = withPhasedPreamble(drafted);
    expect(promptSection(out, "## Prompt").startsWith(PHASED_PREAMBLE)).toBe(true);
    expect(promptSection(out, "## Prompt")).toContain("Build the thing.");
  });

  test("the other sections survive untouched", () => {
    const out = withPhasedPreamble(drafted);
    expect(promptSection(out, "## TLDR")).toBe("One line.");
    expect(promptSection(out, "## Summary")).toBe("What and why.");
    expect(promptSection(out, "## Testing checklist")).toBe("- [ ] it works");
    expect(promptSection(out, "## TLDR")).not.toContain("Claude Code:");
  });

  test("a pasted prompt with no sections gets it up top instead", () => {
    const out = withPhasedPreamble("just build it, no headings");
    expect(out.startsWith(PHASED_PREAMBLE)).toBe(true);
    expect(out).toContain("just build it, no headings");
  });

  test("a redraft does not stack a second copy", () => {
    const once = withPhasedPreamble(drafted);
    expect(withPhasedPreamble(once)).toBe(once);
    const plain = withPhasedPreamble("build it");
    expect(withPhasedPreamble(plain)).toBe(plain);
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
