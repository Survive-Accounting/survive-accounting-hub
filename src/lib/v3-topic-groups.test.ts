import { describe, expect, test } from "bun:test";

import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { TOPIC_GROUPS, groupSets, orderedSets } from "./v3-topic-groups";

const set = (id: string, name: string): BoothSetInfo => ({ id, name, ceqs: [], liveCount: 0, draftCount: 0 });

// The bank's order — newest first, i.e. the reverse of how a rep should watch them.
const STRATEGY = [
  set("1", "The mission"),
  set("2", "For students: Easy Points is free"),
  set("3", "For IFC and councils: this is for your whole Greek system"),
  set("4", "For the scholarship chair: I want you to be incredible at your job"),
  set("5", "An education with a commission attached"),
  set("6", "Why the bar is high"),
  set("7", "How you get paid"),
  set("8", "What a rep actually does, week to week"),
  set("9", "What Survive is (for a rep)"),
];

describe("groupSets", () => {
  test("strategy: rep onboarding first, in the order a rep watches, numbered", () => {
    const g = groupSets("strategy", STRATEGY);
    expect(g[0].label).toBe("Rep onboarding");
    expect(g[0].ordered).toBe(true);
    expect(g[0].sets.map((s) => s.name)).toEqual([
      "What Survive is (for a rep)", "What a rep actually does, week to week", "How you get paid",
      "An education with a commission attached", "Why the bar is high", "The mission",
    ]);
  });
  test("strategy: chairs and councils, then students — every set exactly once", () => {
    const g = groupSets("strategy", STRATEGY);
    expect(g.map((x) => x.label)).toEqual(["Rep onboarding", "Chapter partners", "Students"]);
    expect(g.flatMap((x) => x.sets).map((s) => s.id).sort()).toEqual(STRATEGY.map((s) => s.id).sort());
  });
  test("a set that matches no group lands in a trailing Other, never vanishes", () => {
    const g = groupSets("strategy", [...STRATEGY, set("10", "Something new")]);
    expect(g.at(-1)?.label).toBe("Other");
    expect(g.at(-1)?.sets.map((s) => s.name)).toEqual(["Something new"]);
  });
  test("a topic with no spec is one unlabelled group in bank order", () => {
    const acct = [set("a", "Normal balances"), set("b", "Journal entry format")];
    expect(groupSets("easy-points", acct)).toEqual([{ label: null, ordered: false, sets: acct }]);
  });
  test("orderedSets flattens in the same order", () => {
    expect(orderedSets("strategy", STRATEGY)[0].name).toBe("What Survive is (for a rep)");
    expect(orderedSets("strategy", STRATEGY).length).toBe(9);
  });
  test("every configured slug is a real slug shape", () => {
    for (const specs of Object.values(TOPIC_GROUPS)) for (const g of specs) for (const s of g.slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
