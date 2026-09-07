import { describe, expect, test } from "bun:test";

import { buildImproveMessages, IMPROVE_SYSTEM, parseImprove } from "./improve-brief";
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

describe("the improve brief", () => {
  test("the system prompt sets the tone and the shape", () => {
    expect(IMPROVE_SYSTEM).toMatch(/no shame/);
    expect(IMPROVE_SYSTEM).toMatch(/NEVER SHAMING/);
    expect(IMPROVE_SYSTEM).toContain("\"headline\": str");
    expect(IMPROVE_SYSTEM).toContain("src/lib/production-run.ts");
  });
  test("the user message carries the numbers, the pauses with reasons, the notes and the prior runs", () => {
    const run = play(base("a", "Set A"), [
      [{ type: "startStep", step: "results" }, 0],
      [{ type: "completeTask", step: "results", key: "order" }, 60],
      [{ type: "pause", step: "results", reason: "phone rang" }, 100], [{ type: "resume", step: "results" }, 160],
      [{ type: "completeTask", step: "results", key: "cards" }, 700],
      [{ type: "finishStep", step: "results", note: "the cards took forever" }, 700],
      [{ type: "skipStep", step: "post" }, 700],
    ]);
    const prior = [complete("b", "Set B", 300), complete("c", "Set C", 600)];
    const m = buildImproveMessages(run, prior, [{ step: "Editor", note: "the cards took forever" }]);
    expect(m.system).toBe(IMPROVE_SYSTEM);
    for (const s of [
      "THIS RUN: Set A (Chapter 1)", "still running", "skipped: Cross-post",
      "TIME TO BEAT (mean of prior complete runs): 30 min",
      "Editor: 11 min (done)", "Editor / Fix the cards: 10 min", "paused 1×",
      "PAUSES THIS RUN:", "\"phone rang\"", "LEE'S NOTES PER STEP:\n- Editor: the cards took forever",
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
  });
  test("parseImprove takes the JSON, clamps and defends; junk is null", () => {
    const r = parseImprove('Here you go: {"headline":" Cards ate half the run. ","bottlenecks":[{"task":"Fix the cards","minutes":9.4,"why":"see note"},{"minutes":3}],"approaches":["Do callouts first",""],"guardrails":["Phone in the other room"],"prompts":[{"title":"","prompt":"In src/routes/v3.$topic.$set.blast-off.results.tsx add a bulk card fixer"},{"title":"x"}]}');
    expect(r).toEqual({
      headline: "Cards ate half the run.",
      bottlenecks: [{ task: "Fix the cards", minutes: 9, why: "see note" }],
      approaches: ["Do callouts first"],
      guardrails: ["Phone in the other room"],
      prompts: [{ title: "In src/routes/v3.$topic.$set.blast-off.results.tsx add a bul", prompt: "In src/routes/v3.$topic.$set.blast-off.results.tsx add a bulk card fixer" }],
    });
    expect(parseImprove("nothing here")).toBeNull();
    expect(parseImprove("{}")).toBeNull();
    expect(parseImprove("{not json")).toBeNull();
    expect(parseImprove('{"bottlenecks":[{"task":"x","minutes":"12"}]}')?.bottlenecks[0].minutes).toBe(12);
  });
});
