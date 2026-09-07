import { describe, expect, test } from "bun:test";

import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { STRATEGY_SHORTS } from "@/lib/strategy";
import { STEPS } from "@/lib/rep-pre-onboarding";
import { REP_ONBOARDING_ORDER, groupSets, orderedSets, strategyGroupSpecs } from "./v3-topic-groups";

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

describe("groupSets — strategy", () => {
  test("rep onboarding first: the /rep/onboarding steps in order, then the rest of the lane, numbered", () => {
    const g = groupSets("strategy", STRATEGY);
    expect(g[0].label).toBe("Campus reps");
    expect(g[0].ordered).toBe(true);
    expect(g[0].sets.map((s) => s.name)).toEqual([
      "What Survive is (for a rep)", "The mission", "What a rep actually does, week to week", "How you get paid",
      "Why the bar is high", "An education with a commission attached",
    ]);
  });
  test("the pinned rep order names real seeds, one per onboarding video step", () => {
    for (const slug of REP_ONBOARDING_ORDER) expect(STRATEGY_SHORTS.some((s) => s.slug === slug && s.lane === "reps")).toBe(true);
    expect(REP_ONBOARDING_ORDER.length).toBe(STEPS.filter((s) => s.videoKey).length);
  });
  test("chairs and councils, then students — every set exactly once, empty lanes dropped", () => {
    const g = groupSets("strategy", STRATEGY);
    expect(g.map((x) => x.label)).toEqual(["Campus reps", "Chairs & councils", "New students"]);
    expect(g[1].sets.map((s) => s.name)).toEqual([
      "For the scholarship chair: I want you to be incredible at your job",
      "For IFC and councils: this is for your whole Greek system",
    ]);
    expect(g.flatMap((x) => x.sets).map((s) => s.id).sort()).toEqual(STRATEGY.map((s) => s.id).sort());
  });
  test("every lane on the board is a group spec, in the board's order", () => {
    expect(strategyGroupSpecs().map((s) => s.label)).toEqual(["Campus reps", "Chairs & councils", "New students", "Building Survive", "Founder notes", "Later"]);
  });
  test("a set that matches no group lands in a trailing Other, never vanishes", () => {
    const g = groupSets("strategy", [...STRATEGY, set("10", "Something new")]);
    expect(g.at(-1)?.label).toBe("Other");
    expect(g.at(-1)?.sets.map((s) => s.name)).toEqual(["Something new"]);
  });
  test("orderedSets flattens in the same order", () => {
    expect(orderedSets("strategy", STRATEGY)[0].name).toBe("What Survive is (for a rep)");
    expect(orderedSets("strategy", STRATEGY).length).toBe(9);
  });
});

describe("groupSets — a topic with no groups", () => {
  test("is one unlabelled group in bank order", () => {
    const acct = [set("a", "Normal balances"), set("b", "Journal entry format")];
    expect(groupSets("easy-points", acct)).toEqual([{ label: null, ordered: false, sets: acct }]);
  });
});
