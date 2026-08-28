// Tonight's Plan model — the plan filter, tiers, estimates and forgiving-change rules.
import { describe, expect, test } from "bun:test";

import type { PathStep } from "@/lib/exam-path";
import {
  addDepth, aTeaser, depthOptions, fmtClock, midMin, planIdentity, planSteps, planTopicRows,
  remainingSteps, stepMinutes, stepTier, sumMinutes, type PlanState,
} from "./plan-model";

const step = (setId: string, stage: "cram" | "practice" | "review", topicKey: string, topicName: string, questions = 8, runtimeSec: number | null = 240): PathStep => ({
  id: `${setId}:${stage}`,
  setId,
  stage,
  kind: stage === "cram" ? "cram_video" : stage === "practice" ? "practice_set" : "review_video",
  topicKey,
  topicName,
  label: setId,
  questions,
  runtimeSec: stage === "practice" ? null : runtimeSec,
});

// A small canonical map: Easy Points (easy tier) + Journal Entries (core, 3 practice sets so the
// last one previews as b_to_a) + Adjusting Entries (core, 1 practice set, review published).
const ALL: PathStep[] = [
  step("ep1", "cram", "easy", "Easy Points"),
  step("ep1", "practice", "easy", "Easy Points", 6),
  step("je1", "cram", "je", "Journal Entries"),
  step("je1", "practice", "je", "Journal Entries", 10),
  step("je2", "practice", "je", "Journal Entries", 10),
  step("je3", "practice", "je", "Journal Entries", 12),
  step("ae1", "cram", "ae", "Adjusting Entries"),
  step("ae1", "practice", "ae", "Adjusting Entries", 9),
  step("ae1", "review", "ae", "Adjusting Entries", 9, 360),
];

const plan = (mode: PlanState["mode"], goal: PlanState["goal"], overrides: PlanState["overrides"] = {}): PlanState =>
  ({ mode, goal, overrides, createdAt: 1 });

describe("preview tiers", () => {
  test("easy topic, core default, last-practice b_to_a rule", () => {
    expect(stepTier(ALL[1]!, ALL)).toBe("easy");
    expect(stepTier(ALL[3]!, ALL)).toBe("core");
    expect(stepTier(ALL[5]!, ALL)).toBe("b_to_a"); // je3: last of 3 practice sets
    expect(stepTier(ALL[7]!, ALL)).toBe("core"); // ae has only 1 practice set — no b_to_a
  });
});

describe("plan filter", () => {
  test("cram mode keeps only cram videos", () => {
    expect(planSteps(ALL, plan("cram", "b")).map((s) => s.id)).toEqual(["ep1:cram", "je1:cram", "ae1:cram"]);
  });
  test("practice · b includes cram+practice but never b_to_a", () => {
    const ids = planSteps(ALL, plan("practice", "b")).map((s) => s.id);
    expect(ids).toContain("je2:practice");
    expect(ids).not.toContain("je3:practice");
    expect(ids).not.toContain("ae1:review");
  });
  test("practice · a adds the b_to_a step", () => {
    expect(planSteps(ALL, plan("practice", "a")).map((s) => s.id)).toContain("je3:practice");
  });
  test("just pass trims core topics to their first practice step, keeps easy topic whole", () => {
    const ids = planSteps(ALL, plan("practice", "pass")).map((s) => s.id);
    expect(ids).toContain("ep1:practice");
    expect(ids).toContain("je1:practice");
    expect(ids).not.toContain("je2:practice");
  });
  test("full_review includes published review; choose_as_i_go is the whole map", () => {
    expect(planSteps(ALL, plan("full_review", "b")).map((s) => s.id)).toContain("ae1:review");
    expect(planSteps(ALL, plan("choose_as_i_go", null))).toEqual(ALL);
  });
  test("plan order is always canonical map order", () => {
    const ids = planSteps(ALL, plan("full_review", "a")).map((s) => s.id);
    expect(ids.indexOf("ep1:cram")).toBeLessThan(ids.indexOf("je1:cram"));
    expect(ids.indexOf("je3:practice")).toBeLessThan(ids.indexOf("ae1:cram"));
  });
});

describe("local depth (go deeper)", () => {
  test("adds one topic's stage without changing global mode, other topics untouched", () => {
    const p2 = addDepth(plan("cram", "b"), "je", "practice");
    const ids = planSteps(ALL, p2).map((s) => s.id);
    expect(p2.mode).toBe("cram");
    expect(ids).toContain("je1:practice");
    expect(ids).toContain("je2:practice");
    expect(ids).not.toContain("ep1:practice"); // easy topic still cram-only
    expect(ids).not.toContain("je3:practice"); // depth ≠ A-material: goal still excludes b_to_a
  });
  test("depthOptions offers practice with real minutes, review honest about availability", () => {
    const opts = depthOptions(ALL, plan("cram", "b"), "je");
    const practice = opts.find((o) => o.stage === "practice")!;
    expect(practice.available).toBe(true);
    expect(midMin(practice.minutes!)).toBeGreaterThan(0);
    const review = opts.find((o) => o.stage === "review")!;
    expect(review.available).toBe(false); // je has no published review → Coming soon
    const optsAe = depthOptions(ALL, plan("cram", "b"), "ae");
    expect(optsAe.find((o) => o.stage === "review")!.available).toBe(true);
  });
  test("adding depth twice is a no-op", () => {
    const p2 = addDepth(plan("cram", "b"), "je", "practice");
    expect(addDepth(p2, "je", "practice")).toBe(p2);
  });
});

describe("forgiving changes (completed work is permanent)", () => {
  test("mode change only re-filters; done steps stay done and remaining shrinks", () => {
    const done = { "ep1:cram": 1, "je1:cram": 1 };
    const cramPlan = planSteps(ALL, plan("cram", "b"));
    expect(remainingSteps(cramPlan, done).map((s) => s.id)).toEqual(["ae1:cram"]);
    const practicePlan = planSteps(ALL, plan("practice", "b"));
    const rem = remainingSteps(practicePlan, done).map((s) => s.id);
    expect(rem).not.toContain("ep1:cram"); // still complete under the new plan
    expect(rem).toContain("ep1:practice"); // new steps ADDED to the remaining path
  });
});

describe("time estimates", () => {
  test("practice uses the 0.65–0.9 min/question band; videos use real runtime", () => {
    const m = stepMinutes(ALL[3]!); // 10 questions
    expect(m.low).toBeCloseTo(6.5);
    expect(m.high).toBeCloseTo(9);
    expect(stepMinutes(ALL[0]!).low).toBeCloseTo(4); // 240s cram
  });
  test("fmtClock rounds to 5 min and reads humanely", () => {
    expect(fmtClock(58)).toBe("1 hr");
    expect(fmtClock(43)).toBe("45 min");
    expect(fmtClock(105)).toBe("1 hr 45 min");
    expect(fmtClock(2)).toBe("5 min");
  });
});

describe("take it to an A teaser", () => {
  test("counts exactly the steps goal=a would add, with time", () => {
    const t = aTeaser(ALL, plan("practice", "b"))!;
    expect(t.count).toBe(1); // je3:practice
    expect(midMin(t.minutes)).toBeCloseTo(midMin(sumMinutes([ALL[5]!])));
    expect(aTeaser(ALL, plan("practice", "a"))).toBeNull();
    expect(aTeaser(ALL, plan("choose_as_i_go", null))).toBeNull();
  });
});

describe("payoff rows", () => {
  test("compact map marks planned stages and honest review state", () => {
    const p = plan("full_review", "b");
    const rows = planTopicRows(ALL, planSteps(ALL, p), p);
    expect(rows.map((r) => r.topicKey)).toEqual(["easy", "je", "ae"]);
    const je = rows.find((r) => r.topicKey === "je")!;
    expect(je.cram && je.practice).toBe(true);
    expect(je.review).toBe("coming"); // full_review wanted, nothing published for je
    expect(rows.find((r) => r.topicKey === "ae")!.review).toBe("in");
  });
});

describe("identity", () => {
  test("plan identity strings", () => {
    expect(planIdentity(plan("practice", "b"))).toBe("PRACTICE · SOLID B");
    expect(planIdentity(plan("choose_as_i_go", null))).toBe("BROWSING THE MAP");
  });
});
