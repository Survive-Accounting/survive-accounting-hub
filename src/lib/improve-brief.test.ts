import { describe, expect, test } from "bun:test";

import {
  buildImproveMessages, CADENCE_LINE, costPerShort, fmtUsd, groupByWhen, IMPROVE_SYSTEM, parseImprove, recommendationId, setCost, suggestionsFromStored,
} from "./improve-brief";
import { newRun, reduceRun, type ProductionRun, type RunAction } from "./production-run";

const T0 = new Date("2026-09-07T10:00:00.000Z");
const at = (s: number): Date => new Date(T0.getTime() + s * 1000);
const play = (run: ProductionRun, script: [RunAction, number][]): ProductionRun => script.reduce((r, [a, s]) => reduceRun(r, a, at(s)), run);
const base = (id: string, setName: string) => newRun({ id, setId: id, setName, topicSlug: "ch1", topicName: "Chapter 1", setSlug: id, now: T0 });

const complete = (id: string, name: string, each: number): ProductionRun => play(base(id, name), [
  [{ type: "startStep", step: "talkthrough" }, 0], [{ type: "finishStep", step: "talkthrough", note: null }, each],
  [{ type: "startStep", step: "results" }, each], [{ type: "finishStep", step: "results", note: null }, 2 * each],
  [{ type: "startStep", step: "film" }, 2 * each], [{ type: "finishStep", step: "film", note: null }, 3 * each],
  [{ type: "startStep", step: "post" }, 3 * each], [{ type: "finishStep", step: "post", note: null }, 4 * each],
]);

describe("the iterate brief", () => {
  test("the system prompt sets the tone, the cadence rule and the shape", () => {
    expect(IMPROVE_SYSTEM).toMatch(/no shame/);
    expect(IMPROVE_SYSTEM).toMatch(/NEVER SHAMING/);
    expect(IMPROVE_SYSTEM).toContain("\"headline\": str");
    expect(IMPROVE_SYSTEM).toContain("src/lib/production-run.ts");
    // Lee: "is this required before next set or can it wait until next topic?" — the rule.
    expect(IMPROVE_SYSTEM).toContain("\"next-topic\" is the default");
    expect(IMPROVE_SYSTEM).toMatch(/saves real minutes on every single set/);
    expect(IMPROVE_SYSTEM).toMatch(/take itself was compromised/);
    expect(IMPROVE_SYSTEM).toContain("\"when\": str, \"why\": str");
    expect(CADENCE_LINE).toMatch(/topic boundaries/);
  });
  test("the user message carries the numbers, the pauses with reasons, the notes, the spend and the prior runs", () => {
    const run = play(base("a", "Set A"), [
      [{ type: "startStep", step: "results" }, 0],
      [{ type: "completeTask", step: "results", key: "order" }, 60],
      [{ type: "pause", step: "results", reason: "phone rang" }, 100], [{ type: "resume", step: "results" }, 160],
      [{ type: "completeTask", step: "results", key: "cards" }, 700],
      [{ type: "finishStep", step: "results", note: "the cards took forever" }, 700],
      [{ type: "skipStep", step: "post" }, 700],
    ]);
    const prior = [complete("b", "Set B", 300), complete("c", "Set C", 600)];
    const m = buildImproveMessages(run, prior, [{ step: "Editor", note: "the cards took forever" }], { total: 0.42, byKind: { ai: 0.3, recraft: 0.12 }, perShort: 0.5 });
    expect(m.system).toBe(IMPROVE_SYSTEM);
    for (const s of [
      "THIS RUN: Set A (Chapter 1)", "still running", "skipped: Cross-post",
      "TIME TO BEAT (mean of prior complete runs): 30 min",
      "Editor: 11 min (done)", "Editor / Fix the cards: 10 min", "paused 1×",
      "PAUSES THIS RUN:", "\"phone rang\"", "LEE'S NOTES PER STEP:\n- Editor: the cards took forever",
      "TOOL SPEND THIS SET: $0.42 (ai $0.30, recraft $0.12); cost per short so far $0.50",
      "MOST PAUSED TASK ACROSS ALL RUNS: Editor / Fix the cards (1×",
      "PRIOR RUNS:", "Set B (2026-09-07): 20 min total", "Set C (2026-09-07): 40 min total",
    ]) expect(m.user).toContain(s);
  });
  test("a first run with nothing says so instead of inventing", () => {
    const m = buildImproveMessages(base("a", "Set A"), [], []);
    expect(m.user).toContain("none yet — this is the first");
    expect(m.user).toContain("(no task timed)");
    expect(m.user).toContain("(none — one sitting)");
    expect(m.user).toContain("LEE'S NOTES PER STEP:\n(none)");
    expect(m.user).not.toContain("PRIOR RUNS");
    expect(m.user).not.toContain("MOST PAUSED");
    expect(m.user).not.toContain("TOOL SPEND");
  });
  test("parseImprove takes the JSON with when/why, clamps and defends; bare strings still parse; junk is null", () => {
    const r = parseImprove('Here you go: {"headline":" Cards ate half the run. ","bottlenecks":[{"task":"Fix the cards","minutes":9.4,"why":"see note"},{"minutes":3}],"approaches":[{"text":"Do callouts first","when":"before-next-set","why":"saves five minutes every set"},"Skim before talking",{"text":""}],"guardrails":[{"text":"Phone in the other room","when":"whenever","why":""}],"prompts":[{"title":"","prompt":"In src/routes/v3.$topic.$set.blast-off.results.tsx add a bulk card fixer","when":"later","why":"nice to have"},{"title":"x"}]}');
    expect(r?.headline).toBe("Cards ate half the run.");
    expect(r?.bottlenecks).toEqual([{ task: "Fix the cards", minutes: 9, why: "see note" }]);
    expect(r?.recommendations.map((x) => [x.kind, x.text, x.when, x.why])).toEqual([
      ["approach", "Do callouts first", "before-next-set", "saves five minutes every set"],
      ["approach", "Skim before talking", "next-topic", ""],
      ["guardrail", "Phone in the other room", "next-topic", ""],
      ["prompt", "In src/routes/v3.$topic.$set.blast-off.results.tsx add a bul", "later", "nice to have"],
    ]);
    expect(r?.recommendations[3].prompt).toBe("In src/routes/v3.$topic.$set.blast-off.results.tsx add a bulk card fixer");
    expect(r?.recommendations[0].id).toBe(recommendationId("approach", "Do callouts first"));
    expect(parseImprove("nothing here")).toBeNull();
    expect(parseImprove("{}")).toBeNull();
    expect(parseImprove("{not json")).toBeNull();
    expect(parseImprove('{"bottlenecks":[{"task":"x","minutes":"12"}]}')?.bottlenecks[0].minutes).toBe(12);
  });
  test("recommendationId is stable across punctuation and case, distinct across kinds", () => {
    expect(recommendationId("approach", "Do callouts first.")).toBe(recommendationId("approach", "do callouts FIRST"));
    expect(recommendationId("approach", "Do callouts first")).not.toBe(recommendationId("guardrail", "Do callouts first"));
    expect(recommendationId("approach", "a")).not.toBe(recommendationId("approach", "b"));
  });
  test("a stored answer round-trips and groups by when, before-next-set first", () => {
    const parsed = parseImprove('{"headline":"h","approaches":[{"text":"A","when":"later","why":"w"}],"guardrails":[{"text":"G","when":"before-next-set","why":"w"}]}')!;
    const back = suggestionsFromStored(JSON.parse(JSON.stringify(parsed)));
    expect(back).toEqual(parsed);
    expect(groupByWhen(back!.recommendations).map((g) => [g.when, g.items.map((i) => i.text)])).toEqual([
      ["before-next-set", ["G"]], ["next-topic", []], ["later", ["A"]],
    ]);
    expect(suggestionsFromStored(null)).toBeNull();
    expect(suggestionsFromStored("x")).toBeNull();
  });
});

describe("cost per short", () => {
  const ledger = [
    { setId: "a", total: 0.5, byKind: { ai: 0.4, recraft: 0.1 } },
    { setId: "b", total: 0.2, byKind: { ai: 0.2 } },
  ];
  const library = { a: 0.3, b: 0.15, c: 0.6 };
  test("the library counts only when the ledger has no recraft rows for the set — never twice", () => {
    expect(setCost("a", ledger, library)).toEqual({ total: 0.5, byKind: { ai: 0.4, recraft: 0.1 }, libraryCounted: false });
    expect(setCost("b", ledger, library)).toEqual({ total: 0.35, byKind: { ai: 0.2, recraft: 0.15 }, libraryCounted: true });
    expect(setCost("c", ledger, library)).toEqual({ total: 0.6, byKind: { recraft: 0.6 }, libraryCounted: true });
    expect(setCost("d", ledger, library)).toEqual({ total: 0, byKind: {}, libraryCounted: false });
  });
  test("the mean is over sets with a complete run; none yet is null, not zero", () => {
    expect(costPerShort([], ledger, library)).toEqual({ perShort: null, sets: 0 });
    const incomplete = play(base("c", "Set C"), [[{ type: "skipStep", step: "post" }, 0]]);
    expect(costPerShort([incomplete], ledger, library)).toEqual({ perShort: null, sets: 0 });
    const r = costPerShort([complete("a", "Set A", 60), complete("b", "Set B", 60), complete("b", "Set B again", 60), incomplete], ledger, library);
    expect(r.sets).toBe(2);
    expect(r.perShort).toBeCloseTo((0.5 + 0.35) / 2, 6);
  });
  test("fmtUsd", () => {
    expect(fmtUsd(0)).toBe("$0.00");
    expect(fmtUsd(0.004)).toBe("<$0.01");
    expect(fmtUsd(0.4183)).toBe("$0.42");
  });
});
