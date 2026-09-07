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
  // 2026-09-07 — Lee: "if I write in my own, it's a big signal that there's a possible
  // improvement here." The suggestion he turned down rides with an edited row, nowhere else.
  test("an edited row carries the suggestion Lee rejected; said/suggested rows and no-op edits don't", () => {
    const rows = [
      { raw: "e", final: "What he wrote.", action: "edited", createdAt: "2026-09-07T00:00:03Z", suggested: "What he was offered." },
      { raw: "e-same", final: "Same line.", action: "edited", createdAt: "2026-09-07T00:00:02Z", suggested: " Same line. " },
      { raw: "e-blank", final: "No offer.", action: "edited", createdAt: "2026-09-07T00:00:01Z", suggested: "" },
      { raw: "s", final: "Accepted.", action: "suggested", createdAt: "2026-09-07T00:00:00Z", suggested: "Accepted." },
    ];
    expect(rankRehearsalExamples(rows)).toEqual([
      { raw: "e", final: "What he wrote.", rejected: "What he was offered." },
      { raw: "e-same", final: "Same line." },
      { raw: "e-blank", final: "No offer." },
      { raw: "s", final: "Accepted." },
    ]);
  });
});
