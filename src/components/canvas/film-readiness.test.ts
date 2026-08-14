import { describe, expect, test } from "bun:test";

import { checkFilmReadiness, type ReadinessCard } from "./film-readiness";

const good: ReadinessCard = {
  id: "q1", prompt: "What type of account is Cash?", shorthand: "Cash = asset", run: "A",
  choices: [{ text: "Asset", correct: true }, { text: "Liability" }], chainCount: 2,
};

describe("checkFilmReadiness", () => {
  test("a clean set is ready, with counts", () => {
    const r = checkFilmReadiness([good, { ...good, id: "q2" }, { id: "n1", prompt: "breathe", noteOnly: true, choices: [], chainCount: 0 }]);
    expect(r.ready).toBe(true);
    expect(r.counts).toEqual({ ceq: 2, notes: 1, runs: 1 });
  });
  test("zero or two correct choices fail with counts in the label", () => {
    const r = checkFilmReadiness([
      { ...good, id: "q1", choices: [{ text: "A" }, { text: "B" }] },
      { ...good, id: "q2", choices: [{ text: "A", correct: true }, { text: "B", correct: true }] },
    ]);
    const c = r.checks.find((x) => x.key === "correct")!;
    expect(c.ok).toBe(false);
    expect(c.fails.map((f) => f.id)).toEqual(["q1", "q2"]);
    expect(c.fails[0].label).toContain("no correct");
    expect(c.fails[1].label).toContain("2 correct");
  });
  test("empty stem, thin choices, exhibit gap, run gap, shorthand gap", () => {
    const r = checkFilmReadiness([
      { id: "q1", prompt: " ", choices: [{ text: "x", correct: true }], exhibit: "T", run: "", shorthand: "", chainCount: 0 },
    ]);
    for (const key of ["stems", "choices", "exhibits", "runs", "shorthand"]) {
      expect(r.checks.find((x) => x.key === key)!.ok).toBe(false);
    }
    expect(r.ready).toBe(false);
  });
  test("notes are exempt from every CEQ check and never numbered", () => {
    const r = checkFilmReadiness([
      { id: "n1", prompt: "", noteOnly: true, choices: [], chainCount: 0 },
      good,
    ]);
    expect(r.ready).toBe(true);
    // the CEQ after the note is Q1 (numbering skips notes)
    expect(checkFilmReadiness([{ id: "n1", prompt: "", noteOnly: true, choices: [], chainCount: 0 }, { ...good, run: "" }]).checks.find((x) => x.key === "runs")!.fails[0].label).toStartWith("Q1");
  });
  test("exhibit flag passes with a non-empty chain (the proxy)", () => {
    const r = checkFilmReadiness([{ ...good, exhibit: "TB", chainCount: 1 }]);
    expect(r.checks.find((x) => x.key === "exhibits")!.ok).toBe(true);
  });
});
