// FOUND ON YOUR EXAM — the generator is what makes frame 2 free, so it has to
// pick genuinely different phrasings rather than five ways of saying one thing.
import { describe, expect, test } from "bun:test";

import { MAX_VARIATIONS, distance, foundOnYourExam } from "./found-on-exam";

const CYCLE = [
  "What is the correct order?",
  "Which step comes FIRST in the accounting cycle?",
  "Which step comes LAST in the accounting cycle?",
  "Which step immediately follows journalizing?",
  "Which step immediately follows posting to the ledger?",   // same costume as ↑
  "Which step immediately precedes the adjusted trial balance?",
  "When does closing happen?",
  "Adjusting entries are recorded BEFORE the unadjusted trial balance.",
  "Which list shows the full accounting cycle in the correct order?",
];

describe("distance", () => {
  test("identical is 0, unrelated is 1", () => {
    expect(distance("Which step comes first?", "Which step comes first?")).toBe(0);
    expect(distance("debits and credits", "revenue recognition timing")).toBe(1);
  });
  test("stop words alone never make two stems look alike", () => {
    expect(distance("What is the correct order?", "What is the best statement?")).toBe(1);
  });
});

describe("foundOnYourExam", () => {
  test("caps at five and never repeats the canonical", () => {
    const r = foundOnYourExam(CYCLE);
    expect(r.variations.length).toBeLessThanOrEqual(MAX_VARIATIONS);
    expect(r.variations).not.toContain(r.canonical);
    expect(new Set(r.variations).size).toBe(r.variations.length);
  });
  test("collapses same-costume stems to one — follows-journalizing and follows-posting are one phrasing", () => {
    const r = foundOnYourExam(CYCLE);
    const follows = [r.canonical, ...r.variations].filter((s) => s.includes("immediately follows"));
    expect(follows.length).toBe(1);
  });
  // The canonical is a headline, so it must be the GENERIC form. Centrality
  // alone picks a long specific stem, because the terse one shares little
  // vocabulary with anything — the exact inversion this guards against.
  test("picks the generic form as canonical, matching Lee's own example", () => {
    expect(foundOnYourExam(CYCLE).canonical).toBe("What is the correct order?");
  });
  test("an explicit canonical wins and is excluded from the variations", () => {
    const r = foundOnYourExam(CYCLE, "What is the correct order?");
    expect(r.canonical).toBe("What is the correct order?");
    expect(r.variations).not.toContain("What is the correct order?");
  });
  test("most distinct first — each pick is farther out than the next", () => {
    const r = foundOnYourExam(CYCLE);
    const spread = (s: string) => Math.min(...[r.canonical].map((p) => distance(s, p)));
    expect(spread(r.variations[0])).toBeGreaterThan(0);
  });
  test("degrades quietly: no stems, one stem, blank stems", () => {
    expect(foundOnYourExam([])).toEqual({ canonical: "", variations: [] });
    expect(foundOnYourExam(["  ", ""])).toEqual({ canonical: "", variations: [] });
    const one = foundOnYourExam(["Which step is first?"]);
    expect(one.canonical).toBe("Which step is first?");
    expect(one.variations).toEqual([]);
  });
  test("deterministic — same stems in, same card out", () => {
    expect(foundOnYourExam(CYCLE)).toEqual(foundOnYourExam(CYCLE));
  });
});
