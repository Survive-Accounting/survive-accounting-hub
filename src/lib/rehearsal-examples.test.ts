import { describe, expect, test } from "bun:test";

import { EXAMPLE_LIMIT, rankRehearsalExamples, REHEARSAL_ACTIONS } from "./rehearsal.functions";

describe("which past rehearsal decisions teach the suggester", () => {
  test("the three actions are the review's three cards", () => {
    expect([...REHEARSAL_ACTIONS]).toEqual(["said", "suggested", "edited"]);
  });
  test("edited first, then said, then suggested — newest first within each — capped", () => {
    const rows = [
      { raw: "s-old", final: "S old", action: "suggested", createdAt: "2026-09-01T00:00:00Z" },
      { raw: "e-old", final: "E old", action: "edited", createdAt: "2026-09-02T00:00:00Z" },
      { raw: "d-new", final: "D new", action: "said", createdAt: "2026-09-06T00:00:00Z" },
      { raw: "e-new", final: "E new", action: "edited", createdAt: "2026-09-05T00:00:00Z" },
      { raw: "a-legacy", final: "A legacy", action: "approved", createdAt: "2026-09-04T00:00:00Z" },
      { raw: "d-old", final: "D old", action: "said", createdAt: "2026-09-03T00:00:00Z" },
      { raw: "s-new", final: "S new", action: "suggested", createdAt: "2026-09-06T01:00:00Z" },
    ];
    expect(rankRehearsalExamples(rows).map((r) => r.raw)).toEqual(["e-new", "e-old", "d-new", "d-old", "s-new"]);
    expect(rankRehearsalExamples(rows)).toHaveLength(EXAMPLE_LIMIT);
    expect(rankRehearsalExamples(rows, 2)).toEqual([{ raw: "e-new", final: "E new" }, { raw: "e-old", final: "E old" }]);
    expect(rankRehearsalExamples([])).toEqual([]);
  });
});
