// DISSECT (P5) — readiness rules for clip-sequenced CEQs.
import { describe, expect, test } from "bun:test";

import { checkFilmReadiness, type ReadinessCard } from "./film-readiness";

const base: ReadinessCard = {
  id: "q1", prompt: "Hard one", shorthand: "hard", run: "",
  choices: [{ text: "A", correct: true }, { text: "B" }], chainCount: 1,
};
const M = (id: string, label: string, waived?: boolean) => ({ id, label, waived });

describe("dissect readiness", () => {
  test("a dissected CEQ is exempt from the run-letter check", () => {
    const r = checkFilmReadiness([{ ...base, dissect: { on: true, moments: [M("m1", "setup")] }, takeMomentIds: ["m1"] }]);
    expect(r.checks.find((c) => c.key === "runs")!.ok).toBe(true);
    expect(r.checks.find((c) => c.key === "dissect")!.ok).toBe(true);
  });
  test("an uncovered, unwaived moment fails with the moment named", () => {
    const r = checkFilmReadiness([{ ...base, dissect: { on: true, moments: [M("m1", "the trap"), M("m2", "resolution")] }, takeMomentIds: ["m1"] }]);
    const d = r.checks.find((c) => c.key === "dissect")!;
    expect(d.ok).toBe(false);
    expect(d.fails[0].label).toContain('"resolution"');
  });
  test("waived moments count as covered", () => {
    const r = checkFilmReadiness([{ ...base, dissect: { on: true, moments: [M("m1", "setup"), M("m2", "tease", true)] }, takeMomentIds: ["m1"] }]);
    expect(r.checks.find((c) => c.key === "dissect")!.ok).toBe(true);
  });
  test("dissect ON with zero planned moments is flagged (an empty shot list is a mistake)", () => {
    const r = checkFilmReadiness([{ ...base, dissect: { on: true, moments: [] } }]);
    expect(r.checks.find((c) => c.key === "dissect")!.ok).toBe(false);
  });
  test("dissect OFF: normal run coverage rules apply, moments are ignored", () => {
    const r = checkFilmReadiness([{ ...base, run: "", dissect: { on: false, moments: [M("m1", "setup")] } }]);
    expect(r.checks.find((c) => c.key === "runs")!.ok).toBe(false);
    expect(r.checks.find((c) => c.key === "dissect")!.ok).toBe(true);
  });
});
