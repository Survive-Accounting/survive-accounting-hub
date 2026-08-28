// The chapter page's two doors — the copy rules that must not drift (2026-08-28).
import { describe, expect, test } from "bun:test";

import { chapterUrl } from "@/components/site/ChapterShare";
import { soloSupportLine } from "./ChapterDoors";

describe("left door support line", () => {
  test("default: free for the house — never an aspirational sponsor claim", () => {
    const s = soloSupportLine(false, "ΑΔΧ");
    expect(s.muted).toBe("Cram-style videos & practice.");
    expect(s.strong).toBe("Exam 1 is free for the whole house.");
    expect(s.strong).not.toContain("Sponsored");
  });
  test("sponsored: names the chapter and what it unlocked", () => {
    const s = soloSupportLine(true, "ΑΔΧ");
    expect(s.strong).toBe("Sponsored by ΑΔΧ — every exam unlocked.");
  });
  test("the ONE-CODE rule: this card's code lives in its heading, never in the support line", () => {
    for (const sponsored of [true, false]) {
      expect(soloSupportLine(sponsored, "ΑΔΧ").muted).not.toMatch(/\b[A-Z]{2,4}\s?\d{3,4}\b/);
      expect(soloSupportLine(sponsored, "ΑΔΧ").strong).not.toMatch(/\b[A-Z]{2,4}\s?\d{3,4}\b/);
    }
  });
});

describe("share attribution", () => {
  test("each share path hands out a distinctly stamped URL", () => {
    expect(chapterUrl("auburn", "sigma-chi", "link")).toBe("https://surviveaccounting.com/go/auburn/sigma-chi?via=link");
    expect(chapterUrl("auburn", "sigma-chi", "groupme")).toBe("https://surviveaccounting.com/go/auburn/sigma-chi?via=groupme");
  });
  test("the plain URL — the one shown to be typed — carries no stamp", () => {
    expect(chapterUrl("auburn", "sigma-chi")).toBe("https://surviveaccounting.com/go/auburn/sigma-chi");
  });
});
