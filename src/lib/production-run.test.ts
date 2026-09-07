import { describe, expect, test } from "bun:test";

import type { TTDoc } from "@/components/canvas/talkthrough";

import {
  DEFAULT_TASK_LISTS, distractionStats, fmtMin, isCompleteRun, newRun, normalizeRun, normalizeTaskLists, pillLabel,
  recordingSignal, reduceRun, runStepFromPath, runTotals, stepAverages, stepSeconds, taskKeyFor, taskSeconds, timeToBeat,
  type ProductionRun, type RunAction,
} from "./production-run";

const T0 = new Date("2026-09-07T10:00:00.000Z");
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const fresh = (): ProductionRun => newRun({ id: "run_1", setId: "set-a", setName: "Set A", topicSlug: "ch1", topicName: "Chapter 1", setSlug: "set-a", now: T0 });
/** Apply a script of [action, seconds after T0]. */
const play = (run: ProductionRun, script: [RunAction, number][]): ProductionRun => script.reduce((r, [a, s]) => reduceRun(r, a, at(s)), run);

describe("a fresh run", () => {
  test("has the four steps pending with the default task lists", () => {
    const r = fresh();
    expect(r.status).toBe("running");
    expect(Object.keys(r.steps)).toEqual(["talkthrough", "results", "film", "post"]);
    expect(r.steps.results.tasks.map((t) => t.key)).toEqual(["order", "cards", "callouts", "pictures", "camera"]);
    expect(r.steps.film.tasks.every((t) => t.status === "pending" && t.seconds === 0)).toBe(true);
  });
  test("normalizeRun round-trips and fills in missing steps; junk is null", () => {
    const r = fresh();
    expect(normalizeRun(JSON.parse(JSON.stringify(r)))).toEqual(r);
    const partial = normalizeRun({ id: "x", setId: "s", startedAt: T0.toISOString(), steps: { film: { status: "done", tasks: [{ key: "take", seconds: 12 }] } } });
    expect(partial?.steps.film.status).toBe("done");
    expect(partial?.steps.film.tasks[0]).toMatchObject({ key: "take", label: "take", status: "pending", seconds: 12 });
    expect(partial?.steps.talkthrough.status).toBe("pending");
    expect(normalizeRun(null)).toBeNull();
    expect(normalizeRun({ id: "x" })).toBeNull();
  });
});

describe("the checkbox flow", () => {
  test("startStep starts the step and its first task", () => {
    const r = reduceRun(fresh(), { type: "startStep", step: "results" }, T0);
    expect(r.steps.results.status).toBe("running");
    expect(r.steps.results.startedAt).toBe(T0.toISOString());
    expect(r.steps.results.tasks[0].status).toBe("running");
    expect(r.steps.results.tasks[1].status).toBe("pending");
    // Starting it again changes nothing.
    expect(reduceRun(r, { type: "startStep", step: "results" }, at(5))).toEqual(r);
  });
  test("completing the running task stamps its seconds and starts the next one", () => {
    const r = play(fresh(), [[{ type: "startStep", step: "results" }, 0], [{ type: "completeTask", step: "results", key: "order" }, 90]]);
    expect(r.steps.results.tasks[0]).toMatchObject({ status: "done", seconds: 90 });
    expect(r.steps.results.tasks[1]).toMatchObject({ status: "running", startedAt: at(90).toISOString() });
  });
  test("complete on the last task finishes nothing else", () => {
    const r = play(fresh(), [
      [{ type: "startStep", step: "post" }, 0],
      ...DEFAULT_TASK_LISTS.post.map((t, i): [RunAction, number] => [{ type: "completeTask", step: "post", key: t.key }, (i + 1) * 10]),
    ]);
    expect(r.steps.post.tasks.every((t) => t.status === "done")).toBe(true);
    expect(r.steps.post.status).toBe("running"); // the step ends on finishStep, not on its last box
    expect(r.status).toBe("running");
  });
  test("a task checked out of order runs beside the earlier one; completing one of two running starts nothing", () => {
    const r = play(fresh(), [[{ type: "startStep", step: "results" }, 0], [{ type: "startTask", step: "results", key: "pictures" }, 30]]);
    expect(r.steps.results.tasks.filter((t) => t.status === "running").map((t) => t.key)).toEqual(["order", "pictures"]);
    const r2 = reduceRun(r, { type: "completeTask", step: "results", key: "pictures" }, at(60));
    expect(r2.steps.results.tasks.find((t) => t.key === "pictures")).toMatchObject({ status: "done", seconds: 30 });
    expect(r2.steps.results.tasks.filter((t) => t.status === "running").map((t) => t.key)).toEqual(["order"]);
    expect(r2.steps.results.tasks.find((t) => t.key === "camera")?.status).toBe("pending");
  });
  test("a pending task checked straight to done records zero — or the seconds it was credited with", () => {
    const a = reduceRun(fresh(), { type: "completeTask", step: "film", key: "r1" }, at(100));
    expect(a.steps.film.status).toBe("running");
    expect(a.steps.film.tasks.find((t) => t.key === "r1")).toMatchObject({ status: "done", seconds: 0 });
    const b = reduceRun(fresh(), { type: "completeTask", step: "film", key: "r1", seconds: 75 }, at(100));
    expect(b.steps.film.tasks.find((t) => t.key === "r1")).toMatchObject({ status: "done", seconds: 75, startedAt: at(25).toISOString(), endedAt: at(100).toISOString() });
    // It starts the next one (lines) since nothing else runs.
    expect(b.steps.film.tasks.find((t) => t.key === "lines")?.status).toBe("running");
  });
  test("completing or skipping a done task is a no-op; skipping a running one keeps its seconds", () => {
    const r = play(fresh(), [[{ type: "startStep", step: "results" }, 0], [{ type: "completeTask", step: "results", key: "order" }, 10]]);
    expect(reduceRun(r, { type: "completeTask", step: "results", key: "order" }, at(20))).toEqual(r);
    expect(reduceRun(r, { type: "skipTask", step: "results", key: "order" }, at(20))).toEqual(r);
    const s = reduceRun(r, { type: "skipTask", step: "results", key: "cards" }, at(40));
    expect(s.steps.results.tasks[1]).toMatchObject({ status: "skipped", seconds: 30 });
  });
});

describe("pausing", () => {
  test("pause without a running task is a no-op; so is a second pause", () => {
    expect(reduceRun(fresh(), { type: "pause", step: "results", reason: "phone" }, T0)).toEqual(fresh());
    const r = play(fresh(), [[{ type: "startStep", step: "results" }, 0], [{ type: "pause", step: "results", reason: "phone" }, 10]]);
    expect(r.steps.results.pauses).toEqual([{ taskKey: "order", startedAt: at(10).toISOString(), endedAt: null, reason: "phone" }]);
    expect(reduceRun(r, { type: "pause", step: "results", reason: "again" }, at(12))).toEqual(r);
    expect(reduceRun(fresh(), { type: "resume", step: "results" }, T0)).toEqual(fresh());
  });
  test("paused time comes off the task and the step; resume closes the pause", () => {
    const r = play(fresh(), [
      [{ type: "startStep", step: "results" }, 0],
      [{ type: "pause", step: "results", reason: "door" }, 60],
      [{ type: "resume", step: "results" }, 120],
      [{ type: "completeTask", step: "results", key: "order" }, 180],
    ]);
    expect(r.steps.results.pauses[0].endedAt).toBe(at(120).toISOString());
    expect(r.steps.results.tasks[0].seconds).toBe(120); // 180 − 60 paused
    expect(stepSeconds(r.steps.results, at(180))).toBe(120);
    // Live: a still-running task doesn't count an open pause either.
    const live = play(fresh(), [[{ type: "startStep", step: "results" }, 0], [{ type: "pause", step: "results", reason: "x" }, 30]]);
    expect(taskSeconds(live.steps.results.tasks[0], live.steps.results, at(90))).toBe(30);
    expect(stepSeconds(live.steps.results, at(90))).toBe(30);
  });
  test("the pill says paused", () => {
    const live = play(fresh(), [[{ type: "startStep", step: "results" }, 0], [{ type: "pause", step: "results", reason: "x" }, 30]]);
    expect(pillLabel(live, at(90))).toBe("Editor · Order and skip slides · 0:30 · paused");
    expect(pillLabel(fresh(), T0)).toBe("Run · 0:00");
  });
});

describe("finishing and skipping steps", () => {
  test("finishStep closes the running task as done, leaves never-started tasks skipped, keeps the note", () => {
    const r = play(fresh(), [[{ type: "startStep", step: "results" }, 0], [{ type: "finishStep", step: "results", note: "  cards were a slog  " }, 300]]);
    expect(r.steps.results).toMatchObject({ status: "done", endedAt: at(300).toISOString(), note: "cards were a slog" });
    expect(r.steps.results.tasks[0]).toMatchObject({ status: "done", seconds: 300 });
    expect(r.steps.results.tasks.slice(1).every((t) => t.status === "skipped")).toBe(true);
    expect(r.status).toBe("running");
    expect(reduceRun(r, { type: "finishStep", step: "results", note: null }, at(400))).toEqual(r);
  });
  test("finishing a step nobody started still records it (zero seconds) and closes an open pause first", () => {
    const r = reduceRun(fresh(), { type: "finishStep", step: "talkthrough", note: null }, at(10));
    expect(r.steps.talkthrough).toMatchObject({ status: "done", startedAt: at(10).toISOString(), endedAt: at(10).toISOString() });
    const p = play(fresh(), [[{ type: "startStep", step: "film" }, 0], [{ type: "pause", step: "film", reason: "x" }, 10], [{ type: "finishStep", step: "film", note: "" }, 50]]);
    expect(p.steps.film.pauses[0].endedAt).toBe(at(50).toISOString());
    expect(p.steps.film.note).toBeNull();
    expect(stepSeconds(p.steps.film, at(50))).toBe(10);
  });
  test("the run ends when the last step is decided; a skipped step makes it incomplete", () => {
    const done = play(fresh(), [
      [{ type: "finishStep", step: "talkthrough", note: null }, 10], [{ type: "finishStep", step: "results", note: null }, 20],
      [{ type: "finishStep", step: "film", note: null }, 30],
    ]);
    expect(done.status).toBe("running");
    const ended = reduceRun(done, { type: "finishStep", step: "post", note: null }, at(40));
    expect(ended).toMatchObject({ status: "done", endedAt: at(40).toISOString() });
    expect(isCompleteRun(ended)).toBe(true);
    const skipped = reduceRun(done, { type: "skipStep", step: "post" }, at(40));
    expect(skipped.status).toBe("done");
    expect(isCompleteRun(skipped)).toBe(false);
    expect(skipped.steps.post).toMatchObject({ status: "skipped", startedAt: null, endedAt: null });
    // A finished run ignores everything but abandon.
    expect(reduceRun(ended, { type: "startStep", step: "post" }, at(50))).toEqual(ended);
  });
  test("abandon closes every running step as skipped", () => {
    const r = play(fresh(), [[{ type: "startStep", step: "film" }, 0], [{ type: "abandon" }, 20]]);
    expect(r).toMatchObject({ status: "abandoned", endedAt: at(20).toISOString() });
    expect(r.steps.film).toMatchObject({ status: "skipped", endedAt: at(20).toISOString() });
    expect(r.steps.film.tasks[0]).toMatchObject({ status: "skipped", seconds: 20 });
    expect(r.steps.post.status).toBe("pending");
  });
});

/** A complete run of `total` seconds spread evenly over the four steps. */
const completeRun = (id: string, total: number, setId = id): ProductionRun => {
  let r = newRun({ id, setId, setName: id, topicSlug: "t", topicName: "T", setSlug: setId, now: T0 });
  const each = total / 4;
  (["talkthrough", "results", "film", "post"] as const).forEach((step, i) => {
    r = reduceRun(r, { type: "startStep", step }, at(i * each));
    r = reduceRun(r, { type: "finishStep", step, note: null }, at((i + 1) * each));
  });
  return r;
};

describe("the reads", () => {
  test("runTotals ranks tasks by seconds desc with their share", () => {
    const r = play(fresh(), [
      [{ type: "startStep", step: "results" }, 0], [{ type: "completeTask", step: "results", key: "order" }, 30],
      [{ type: "completeTask", step: "results", key: "cards" }, 150], [{ type: "finishStep", step: "results", note: null }, 150],
    ]);
    const t = runTotals(r, at(150));
    expect(t.total).toBe(150);
    expect(t.tasks[0]).toMatchObject({ key: "cards", seconds: 120, share: 0.8, stepLabel: "Editor" });
    expect(t.tasks[1]).toMatchObject({ key: "order", seconds: 30, share: 0.2 });
    expect(t.steps.find((s) => s.step === "results")).toMatchObject({ seconds: 150, status: "done" });
  });
  test("timeToBeat averages complete runs only; skipped steps are excluded", () => {
    expect(timeToBeat([])).toBeNull();
    const a = completeRun("a", 1200), b = completeRun("b", 1800);
    expect(timeToBeat([a, b])).toBe(1500);
    let c = completeRun("c", 100);
    c = { ...c, steps: { ...c.steps, post: { ...c.steps.post, status: "skipped" } } };
    expect(timeToBeat([a, b, c])).toBe(1500);
    expect(timeToBeat([c])).toBeNull();
    // A still-running run doesn't count either.
    expect(timeToBeat([a, reduceRun(fresh(), { type: "startStep", step: "film" }, T0)])).toBe(1200);
    expect(stepAverages([a, b])).toEqual({ talkthrough: 375, results: 375, film: 375, post: 375 });
    expect(stepAverages([])).toEqual({});
  });
  test("distractionStats names the task paused most", () => {
    const a = play(fresh(), [
      [{ type: "startStep", step: "results" }, 0], [{ type: "pause", step: "results", reason: "phone" }, 10], [{ type: "resume", step: "results" }, 70],
      [{ type: "pause", step: "results", reason: "kid" }, 80], [{ type: "resume", step: "results" }, 100],
    ]);
    const b = play({ ...fresh(), id: "run_2", setName: "Set B" }, [
      [{ type: "startStep", step: "film" }, 0], [{ type: "pause", step: "film", reason: "door" }, 10], [{ type: "resume", step: "film" }, 40],
    ]);
    const d = distractionStats([a, b]);
    expect(d.pauses).toHaveLength(3);
    expect(d.totalPaused).toBe(110);
    expect(d.mostPaused).toMatchObject({ step: "results", key: "order", count: 2, seconds: 80 });
    expect(d.byTask[1]).toMatchObject({ step: "film", key: "setup", count: 1, seconds: 30 });
    expect(d.pauses[0]).toMatchObject({ reason: "kid", setName: "Set A", taskLabel: "Order and skip slides" });
    expect(distractionStats([]).mostPaused).toBeNull();
  });
  test("fmtMin", () => {
    expect(fmtMin(30)).toBe("<1 min");
    expect(fmtMin(1500)).toBe("~25 min");
  });
});

describe("the task lists", () => {
  test("the defaults validate; bad shapes fall back to null", () => {
    expect(normalizeTaskLists(DEFAULT_TASK_LISTS)).toEqual(DEFAULT_TASK_LISTS);
    expect(normalizeTaskLists(null)).toBeNull();
    expect(normalizeTaskLists({ ...DEFAULT_TASK_LISTS, post: [] })).toBeNull();
    expect(normalizeTaskLists({ ...DEFAULT_TASK_LISTS, post: [{ key: "Bad Key", label: "x" }] })).toBeNull();
    expect(normalizeTaskLists({ ...DEFAULT_TASK_LISTS, post: [{ key: "a", label: "x" }, { key: "a", label: "y" }] })).toBeNull();
    expect(normalizeTaskLists({ ...DEFAULT_TASK_LISTS, post: [{ key: "a", label: "  " }] })).toBeNull();
    const { post: _p, ...missing } = DEFAULT_TASK_LISTS;
    expect(normalizeTaskLists(missing)).toBeNull();
    expect(normalizeTaskLists({ ...DEFAULT_TASK_LISTS, post: [{ key: "a", label: "  Trimmed  " }] })?.post).toEqual([{ key: "a", label: "Trimmed" }]);
  });
  test("taskKeyFor slugs and de-duplicates", () => {
    expect(taskKeyFor("Fix the cards!", [])).toBe("fix-the-cards");
    expect(taskKeyFor("Fix the cards", [{ key: "fix-the-cards", label: "x" }])).toBe("fix-the-cards-2");
    expect(taskKeyFor("???", [])).toBe("task");
  });
  test("newRun takes a custom list", () => {
    const r = newRun({ setId: "s", setName: "S", topicSlug: "t", topicName: "T", setSlug: "s", now: T0, lists: { ...DEFAULT_TASK_LISTS, post: [{ key: "yt", label: "YouTube only" }] } });
    expect(r.steps.post.tasks).toEqual([{ key: "yt", label: "YouTube only", status: "pending", startedAt: null, endedAt: null, seconds: 0 }]);
  });
});

describe("the signals", () => {
  test("runStepFromPath", () => {
    expect(runStepFromPath("/v3/ch1/set-a/blast-off/results")).toEqual({ kind: "set", topicSlug: "ch1", setSlug: "set-a", step: "results" });
    expect(runStepFromPath("/v3/ch1/set-a/blast-off/arrange/")).toEqual({ kind: "set", topicSlug: "ch1", setSlug: "set-a", step: "results" });
    expect(runStepFromPath("/v3/ch1/set-a/blast-off/film?popout=1")).toEqual({ kind: "set", topicSlug: "ch1", setSlug: "set-a", step: "film" });
    expect(runStepFromPath("/v3/ch1/set-a/blast-off/improve")).toEqual({ kind: "set", topicSlug: "ch1", setSlug: "set-a", step: "improve" });
    expect(runStepFromPath("/v3/post")).toEqual({ kind: "post" });
    expect(runStepFromPath("/v3/ch1/set-a/blast-off")).toBeNull();
    expect(runStepFromPath("/v3")).toBeNull();
    expect(runStepFromPath("/study/canvas")).toBeNull();
  });
  test("recordingSignal: a session alone isn't recording; a segment is; endedAt is the stop", () => {
    const base = { createdAt: "2026-09-07T10:00:00.000Z", updatedAt: "2026-09-07T10:00:00.000Z", syncedAt: null };
    const doc: TTDoc = {
      sessions: [
        { ...base, id: "old", setId: "s1", setName: "S1", startedAt: "2026-09-01T10:00:00.000Z", endedAt: "2026-09-01T11:00:00.000Z" },
        { ...base, id: "cur", setId: "s1", setName: "S1", startedAt: "2026-09-07T10:00:00.000Z", endedAt: null },
      ],
      segments: [], tags: [], boardItems: [],
    };
    expect(recordingSignal(doc, "s1")).toEqual({ sessionId: "cur", startedAt: "2026-09-07T10:00:00.000Z", recording: false, ended: false });
    expect(recordingSignal(doc, "nope")).toBeNull();
    const talking: TTDoc = { ...doc, segments: [{ ...base, id: "g1", sessionId: "cur", seq: 0, text: "hi", source: "live", whisperPending: false, startedAt: "2026-09-07T10:01:00.000Z" }] };
    expect(recordingSignal(talking, "s1")?.recording).toBe(true);
    const ended: TTDoc = { ...talking, sessions: talking.sessions.map((s) => (s.id === "cur" ? { ...s, endedAt: "2026-09-07T10:30:00.000Z" } : s)) };
    expect(recordingSignal(ended, "s1")).toMatchObject({ recording: true, ended: true });
  });
});
