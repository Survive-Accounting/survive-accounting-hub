// THE LANES. Every one of these pins the same invariant from a different side: a deck that has
// never been marked is on the cram path, because the whole bank was the cram path before this
// existed. Get that wrong and marking one set changes what students see everywhere.
import { describe, expect, test } from "bun:test";

import {
  branchProblem, BRANCH_LANES, DECK_LANES, isBranchLane, isDeckLane, LANE_HINT, LANE_LABEL,
  laneChip, laneOf, OFFSHOOT_STUDENT_LABEL,
} from "./deck-lane";

describe("absent means cram", () => {
  test("no field, no deck, null, undefined — all cram", () => {
    expect(laneOf({})).toBe("cram");
    expect(laneOf(null)).toBe("cram");
    expect(laneOf(undefined)).toBe("cram");
    expect(laneOf({ lane: undefined })).toBe("cram");
  });
  test("a value we do not know reads as cram rather than throwing", () => {
    expect(laneOf({ lane: "teaching" })).toBe("cram");
    expect(laneOf({ lane: 2 })).toBe("cram");
    expect(laneOf({ lane: null })).toBe("cram");
    expect(laneOf({ lane: "" })).toBe("cram");
    expect(laneOf({ lane: "CRAM" })).toBe("cram"); // case matters; unknown → the default
  });
  test("the three real lanes come back as themselves", () => {
    for (const l of DECK_LANES) expect(laneOf({ lane: l })).toBe(l);
  });
});

describe("the guard", () => {
  test("it accepts exactly the three lanes", () => {
    expect(DECK_LANES).toEqual(["cram", "offshoot", "pitch"]);
    for (const l of DECK_LANES) expect(isDeckLane(l)).toBe(true);
    for (const v of ["", "teaching", "CRAM", 1, null, undefined, {}]) expect(isDeckLane(v)).toBe(false);
  });
  test("branch lanes are the two that hang off something", () => {
    expect([...BRANCH_LANES]).toEqual(["offshoot", "pitch"]);
    expect(isBranchLane("cram")).toBe(false);
    expect(isBranchLane("offshoot")).toBe(true);
    expect(isBranchLane("pitch")).toBe(true);
  });
});

describe("what Lee sees", () => {
  test("every lane has a label and a hint", () => {
    for (const l of DECK_LANES) {
      expect(LANE_LABEL[l].length).toBeGreaterThan(0);
      expect(LANE_HINT[l].length).toBeGreaterThan(0);
    }
  });
  test("cram gets no chip — it is the default and a chip on every row says nothing", () => {
    expect(laneChip("cram")).toBeNull();
    expect(laneChip("offshoot")).toBe("OFFSHOOT");
    expect(laneChip("pitch")).toBe("PITCH");
  });
  test("a student is never shown the word offshoot", () => {
    expect(OFFSHOOT_STUDENT_LABEL).toBe("Take it to an A");
    expect(OFFSHOOT_STUDENT_LABEL.toLowerCase()).not.toContain("offshoot");
  });
});

describe("where a branch may hang", () => {
  const sets = [
    { id: "cram-a" },
    { id: "cram-b" },
    { id: "off-1", lane: "offshoot" },
    { id: "pitch-1", lane: "pitch" },
  ];
  test("a cram parent in the same topic is fine", () => {
    expect(branchProblem({ id: "off-1" }, "cram-a", sets)).toBeNull();
    expect(branchProblem({ id: "pitch-1" }, "cram-b", sets)).toBeNull();
  });
  test("no parent, itself, a stranger, or another branch are each refused by name", () => {
    expect(branchProblem({ id: "off-1" }, "", sets)).toContain("Pick the cram set");
    expect(branchProblem({ id: "off-1" }, "off-1", sets)).toContain("cannot hang off itself");
    expect(branchProblem({ id: "off-1" }, "nope", sets)).toContain("not in this topic");
    expect(branchProblem({ id: "off-1" }, "pitch-1", sets)).toContain("cram path");
  });
  test("one level deep: a branch can never be a parent, so the tree cannot nest", () => {
    for (const s of sets.filter((x) => x.lane)) {
      expect(branchProblem({ id: "new" }, s.id, sets)).not.toBeNull();
    }
  });
});
