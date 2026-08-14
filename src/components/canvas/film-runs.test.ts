import { describe, expect, test } from "bun:test";

import {
  assignRunTo,
  fillDownRuns,
  nextRunLetter,
  normRun,
  runLabelAt,
  runSegments,
  usedRunLetters,
  type RunFrame,
} from "./film-runs";

/** "a b - - C" → frames f0..f4 with those letters ("-" = unlettered). */
const strip = (spec: string): RunFrame[] =>
  spec.split(/\s+/).filter(Boolean).map((tok, i) => ({ id: `f${i}`, ...(tok === "-" ? {} : { run: tok }) }));

const letters = (frames: RunFrame[]) => frames.map((f) => normRun(f.run) ?? "-").join(" ");

/** Apply a RunChange so a test can assert on the resulting strip. */
const applied = (frames: RunFrame[], change: { changes: { id: string; run: string | null }[] }): RunFrame[] => {
  const m = new Map(change.changes.map((c) => [c.id, c.run]));
  return frames.map((f) => (m.has(f.id) ? { id: f.id, ...(m.get(f.id) ? { run: m.get(f.id)! } : {}) } : f));
};

describe("normRun / runLabelAt", () => {
  test("blank, whitespace and case all collapse to one run", () => {
    expect(normRun(undefined)).toBeNull();
    expect(normRun("  ")).toBeNull();
    expect(normRun(" a ")).toBe("A");
  });
  test("labels run past Z so a set is never capped at 26 runs", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(runLabelAt)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });
});

describe("runSegments", () => {
  test("groups contiguous letters and keeps unlettered spans as null", () => {
    const segs = runSegments(strip("A A - - B"));
    expect(segs.map((s) => [s.run, s.start, s.count])).toEqual([["A", 0, 2], [null, 2, 2], ["B", 4, 1]]);
    expect(segs[0].ids).toEqual(["f0", "f1"]);
  });
  test("the same letter in two places is two segments — the split is visible", () => {
    expect(runSegments(strip("A B A")).length).toBe(3);
  });
  test("an empty set has no segments", () => {
    expect(runSegments([])).toEqual([]);
  });
});

describe("usedRunLetters / nextRunLetter", () => {
  test("used letters come back in first-appearance order, deduped and normalized", () => {
    expect(usedRunLetters(strip("b b - a B"))).toEqual(["B", "A"]);
  });
  test("next skips every used letter, including out-of-order ones", () => {
    expect(nextRunLetter([])).toBe("A");
    expect(nextRunLetter(strip("A A B"))).toBe("C");
    expect(nextRunLetter(strip("- - -"))).toBe("A");
    expect(nextRunLetter(strip("B C"))).toBe("A");
  });
  test("next keeps going past Z", () => {
    const all = Array.from({ length: 26 }, (_, i) => ({ id: `f${i}`, run: runLabelAt(i) }));
    expect(nextRunLetter(all)).toBe("AA");
  });
});

describe("assignRunTo", () => {
  test("stamps a contiguous range with no warning", () => {
    const frames = strip("- - - -");
    const r = assignRunTo(frames, ["f1", "f2"], "C");
    expect(r.changes).toEqual([{ id: "f1", run: "C" }, { id: "f2", run: "C" }]);
    expect(r.warnings).toEqual([]);
    expect(letters(applied(frames, r))).toBe("- C C -");
  });
  test("frames already carrying the letter aren't changes — no empty undo steps", () => {
    const r = assignRunTo(strip("A A -"), ["f0", "f1", "f2"], "a");
    expect(r.changes).toEqual([{ id: "f2", run: "A" }]);
  });
  test("null clears, and clearing never warns about splits", () => {
    const frames = strip("A A A");
    const r = assignRunTo(frames, ["f1"], null);
    expect(r.changes).toEqual([{ id: "f1", run: null }]);
    expect(r.warnings).toEqual([]);
    expect(letters(applied(frames, r))).toBe("A - A");
  });
  test("a non-contiguous selection applies anyway and says how many pieces", () => {
    const r = assignRunTo(strip("- - - -"), ["f0", "f2"], "B");
    expect(r.changes.length).toBe(2);
    expect(r.warnings).toEqual(["The selection isn't one span — run B lands in 2 pieces."]);
  });
  test("a contiguous selection that lands apart from the same letter warns about the split", () => {
    const r = assignRunTo(strip("A - - -"), ["f2", "f3"], "A");
    expect(r.changes.length).toBe(2);
    expect(r.warnings).toEqual(["Run A is now in 2 places in this set."]);
  });
  test("landing adjacent to the same letter merges silently", () => {
    const r = assignRunTo(strip("A - -"), ["f1"], "A");
    expect(r.warnings).toEqual([]);
  });
  test("ids not in this set are ignored (a stale selection can't touch other sets)", () => {
    const r = assignRunTo(strip("- -"), ["f0", "ghost"], "A");
    expect(r.changes).toEqual([{ id: "f0", run: "A" }]);
  });
  test("an empty selection is a no-op", () => {
    expect(assignRunTo(strip("- -"), [], "A")).toEqual({ changes: [], warnings: [] });
  });
});

describe("fillDownRuns", () => {
  test("a fully unlettered set becomes one run: A", () => {
    const frames = strip("- - - -");
    expect(letters(applied(frames, fillDownRuns(frames)))).toBe("A A A A");
  });
  test("gaps inherit the frame above — Lee marks split points only", () => {
    const frames = strip("A - - B - -");
    expect(letters(applied(frames, fillDownRuns(frames)))).toBe("A A A B B B");
  });
  test("a leading gap fills UP, so no B ever sits above an A", () => {
    const frames = strip("- - A - B");
    expect(letters(applied(frames, fillDownRuns(frames)))).toBe("A A A A B");
  });
  test("a fully lettered set is a clean no-op", () => {
    expect(fillDownRuns(strip("A B C")).changes).toEqual([]);
  });
  test("only the frames that change come back", () => {
    expect(fillDownRuns(strip("A - A")).changes).toEqual([{ id: "f1", run: "A" }]);
  });
});
