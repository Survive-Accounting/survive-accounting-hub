import { describe, expect, test } from "bun:test";

import { intendedDragIds, isExplicitGroupDrag } from "./drag-select";

// REGRESSION (#1): a single selected JE must move ALONE; a group moves only
// with an explicit multi-selection. React Flow's raw drag set is
// `selected ∪ grabbed`, so these guard the "what actually moves" decision.
describe("drag-select invariant (single-select move)", () => {
  test("select ONE of two JEs, drag it → only it moves", () => {
    // je-a selected, je-b idle; RF happens to only drag je-a
    expect(intendedDragIds(["je-a"], "je-a", ["je-a"])).toEqual(["je-a"]);
    expect(isExplicitGroupDrag(["je-a"], "je-a")).toBe(false);
  });

  test("stray still-selected card does NOT ride along a lone drag", () => {
    // the regression shape: je-b left selected, user grabs UNSELECTED je-a —
    // RF's drag set sweeps in je-b, but only je-a should move
    expect(intendedDragIds(["je-b"], "je-a", ["je-a", "je-b"])).toEqual(["je-a"]);
    expect(isExplicitGroupDrag(["je-b"], "je-a")).toBe(false);
  });

  test("explicit multi-selection moves the whole group", () => {
    expect(isExplicitGroupDrag(["je-a", "je-b", "je-c"], "je-a")).toBe(true);
    expect(new Set(intendedDragIds(["je-a", "je-b", "je-c"], "je-a", ["je-a", "je-b", "je-c"]))).toEqual(
      new Set(["je-a", "je-b", "je-c"]),
    );
  });

  test("a lone selected card is never a group drag even if RF over-reports", () => {
    // defensive: only 1 truly selected, but RF's set had extras → still single
    expect(intendedDragIds(["je-a"], "je-a", ["je-a", "je-b"])).toEqual(["je-a"]);
  });

  test("group drag guarantees the grabbed id is present even if omitted upstream", () => {
    expect(new Set(intendedDragIds(["je-a", "je-b"], "je-a", ["je-b"]))).toEqual(new Set(["je-a", "je-b"]));
  });
});
