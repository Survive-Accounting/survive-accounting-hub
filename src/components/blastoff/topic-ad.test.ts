// The end-of-topic ad's rules: the stats are only what the bank knows, the best ones are his picks
// (with a sane fallback), and starring is reversible and stays in the topic's order.
import { describe, expect, test } from "bun:test";

import type { OutlineSet } from "./exam-outline";
import { TOPIC_AD_BEST, TOPIC_AD_COPY, bestOf, toggleBest, topicAdStats } from "./topic-ad";

const sets: OutlineSet[] = [
  { id: "s1", name: "Account classification" },
  { id: "s2", name: "Accounting equation effects" },
  { id: "s3", name: "Debit vs credit effects" },
  { id: "s4", name: "Normal balances" },
];

describe("the end-of-topic ad", () => {
  test("the stats are the bank's count and nothing else", () => {
    expect(topicAdStats(sets)).toEqual({ videos: 4 });
    expect(topicAdStats([])).toEqual({ videos: 0 });
  });

  test("his picks, in the topic's order — and the first three until he picks", () => {
    expect(bestOf(sets, undefined).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(bestOf(sets, []).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    // picked out of order, shown in the topic's order
    expect(bestOf(sets, ["s4", "s1"]).map((s) => s.id)).toEqual(["s1", "s4"]);
    // never more than three
    expect(bestOf(sets, ["s1", "s2", "s3", "s4"])).toHaveLength(TOPIC_AD_BEST);
    expect(bestOf([], ["s1"])).toEqual([]);
  });

  test("starring is a toggle and keeps the order", () => {
    let best = toggleBest(sets, undefined, "s3");
    expect(best).toEqual(["s3"]);
    best = toggleBest(sets, best, "s1");
    expect(best).toEqual(["s1", "s3"]);            // topic order, not click order
    best = toggleBest(sets, best, "s3");
    expect(best).toEqual(["s1"]);
  });

  test("the copy is his, and the slide always has a line", () => {
    expect(TOPIC_AD_COPY.chip).toBe("Just filmed");
    expect(TOPIC_AD_COPY.line).toContain("Watch them all");
    expect(TOPIC_AD_COPY.practice.length).toBeGreaterThan(10);
  });
});
