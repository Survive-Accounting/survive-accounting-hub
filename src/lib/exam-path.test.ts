// exam-path — the guided-walk model. Steps derive only from available content; progress counts
// only available steps; Continue order is topics-in-order, each set cram → practice → review.
import { describe, expect, test } from "bun:test";

import { buildPath, estRangeMin, firstUnfinished, nextPathStep, pathProgress, prevPathStep, stepMeta, stepShortLabel, topicComplete } from "./exam-path";

const set = (id: string, o: Record<string, unknown> = {}) => ({
  id, name: `Set ${id}`, shortLabel: null, playbackId: null, ceqCount: 0, hasReview: false,
  reviewPlaybackId: null, runtimeSec: null, reviewRuntimeSec: null, access: "free" as const, ...o,
});

const topics = [
  { key: "t1", name: "Easy Points", sets: [
    set("a", { playbackId: "mux1", runtimeSec: 252, ceqCount: 10, shortLabel: "Accounting cycle order" }),
    set("b", { ceqCount: 5 }),
  ]},
  { key: "t2", name: "Analyzing Transactions", sets: [
    set("c", { ceqCount: 8, hasReview: true, reviewPlaybackId: "mux2", reviewRuntimeSec: 300 }),
    set("paid", { ceqCount: 12, access: "paid" }),
  ]},
];

describe("buildPath", () => {
  test("steps derive only from available content, in walk order", () => {
    const steps = buildPath(topics);
    expect(steps.map((s) => s.id)).toEqual(["a:cram", "a:practice", "b:practice", "c:practice", "c:review"]);
  });
  test("paid sets never enter the free path", () => {
    expect(buildPath(topics).some((s) => s.setId === "paid")).toBe(false);
  });
  test("no cram video → the topic starts at practice", () => {
    const steps = buildPath([{ key: "t", name: "T", sets: [set("x", { ceqCount: 3 })] }]);
    expect(steps[0]).toMatchObject({ id: "x:practice", kind: "practice_set" });
  });
  test("labels prefer shorthand and normalise [ ] placeholders", () => {
    const steps = buildPath([{ key: "t", name: "T", sets: [set("x", { ceqCount: 3, name: 'What type of account is [ ]?' })] }]);
    expect(steps[0]!.label).toBe("What type of account is ___?");
  });
});

describe("progress + navigation", () => {
  const steps = buildPath(topics);
  test("progress counts only available steps", () => {
    expect(pathProgress(steps, {})).toEqual({ done: 0, total: 5, pct: 0 });
    expect(pathProgress(steps, { "a:cram": 1, "a:practice": 1 })).toEqual({ done: 2, total: 5, pct: 40 });
    // a stale done id for content that no longer exists is ignored
    expect(pathProgress(steps, { "zzz:practice": 1 }).done).toBe(0);
  });
  test("next/prev walk the flat order and cross topics", () => {
    expect(nextPathStep(steps, "a:practice")!.id).toBe("b:practice");
    expect(nextPathStep(steps, "b:practice")!.id).toBe("c:practice"); // topic boundary
    expect(nextPathStep(steps, "c:review")).toBeNull();
    expect(prevPathStep(steps, "a:cram")).toBeNull();
    expect(nextPathStep(steps, null)!.id).toBe("a:cram"); // unknown id → first step
  });
  test("firstUnfinished resumes after reload", () => {
    expect(firstUnfinished(steps, { "a:cram": 1 })!.id).toBe("a:practice");
    expect(firstUnfinished(steps, Object.fromEntries(steps.map((s) => [s.id, 1])))).toBeNull();
  });
  test("topicComplete requires every available step of the topic", () => {
    expect(topicComplete(steps, { "a:cram": 1, "a:practice": 1 }, "t1")).toBe(false);
    expect(topicComplete(steps, { "a:cram": 1, "a:practice": 1, "b:practice": 1 }, "t1")).toBe(true);
  });
});

describe("labels", () => {
  const steps = buildPath(topics);
  test("navigator labels", () => {
    expect(stepShortLabel(steps[0]!)).toBe("Cram · Easy Points");
    expect(stepShortLabel(steps[1]!)).toBe("Accounting cycle order");
    expect(stepMeta(steps[0]!)).toBe("Cram · 4:12");
    expect(stepMeta(steps[1]!)).toContain("Practice · 10 questions");
  });
  test("humane time ranges, no fake precision", () => {
    expect(estRangeMin(25)).toBe("~15–25 min");
    expect(estRangeMin(69)).toBe("~45–60 min");
  });
});
