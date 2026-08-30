// The signup reports' pure rules (K5, 2026-08-29). The sending itself is gated behind a live
// database and CHAPTER_REPORTS_ENABLED; what is pinned here is the arithmetic and the wording,
// because those are what a chapter exec actually reads.
import { describe, expect, test } from "bun:test";

import { reportsEnabled, sourceLine, SURGE_MIN, SURGE_WINDOW_MIN, weekKey } from "./chapter-reports.server";

describe("the switch", () => {
  test("off unless explicitly set to 1 — a merge can never start emailing people", () => {
    const prev = process.env.CHAPTER_REPORTS_ENABLED;
    delete process.env.CHAPTER_REPORTS_ENABLED;
    expect(reportsEnabled()).toBe(false);
    process.env.CHAPTER_REPORTS_ENABLED = "true";
    expect(reportsEnabled()).toBe(false); // only "1" counts
    process.env.CHAPTER_REPORTS_ENABLED = "1";
    expect(reportsEnabled()).toBe(true);
    if (prev === undefined) delete process.env.CHAPTER_REPORTS_ENABLED;
    else process.env.CHAPTER_REPORTS_ENABLED = prev;
  });
});

describe("surge threshold", () => {
  test("the documented starting point: 5 in 60 minutes", () => {
    expect(SURGE_MIN).toBe(5);
    expect(SURGE_WINDOW_MIN).toBe(60);
  });
});

describe("week key", () => {
  test("ISO week, so a Sunday run and its Monday retry are the same period", () => {
    expect(weekKey(new Date("2026-08-29T12:00:00Z"))).toBe("2026-W35");
    expect(weekKey(new Date("2026-08-31T12:00:00Z"))).toBe("2026-W36");
  });
});

describe("the source line", () => {
  test("names the dominant channel in plain English", () => {
    expect(sourceLine([{ via: "groupme", n: 9 }, { via: "link", n: 3 }])).toBe("Mostly from your GroupMe link.");
    expect(sourceLine([{ via: "flyer", n: 4 }])).toBe("All of them came from the flyer QR.");
  });
  test("says nothing when nothing is attributable — never a guess", () => {
    expect(sourceLine([])).toBeNull();
    expect(sourceLine([{ via: "link", n: 0 }])).toBeNull();
  });
  test("an even spread is described as a spread, not as a winner", () => {
    expect(sourceLine([{ via: "link", n: 5 }, { via: "groupme", n: 4 }, { via: "text", n: 3 }]))
      .toBe("Most from the chapter link, the rest spread across your other links.");
  });
  test("every share channel has a human name", () => {
    for (const via of ["link", "groupme", "text", "flyer", "slide", "campaign"]) {
      const line = sourceLine([{ via, n: 3 }]);
      expect(line).not.toBeNull();
      expect(line).not.toContain(via === "link" ? "@@" : via.toUpperCase());
    }
  });
});
