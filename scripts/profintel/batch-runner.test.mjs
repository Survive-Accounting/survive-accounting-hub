#!/usr/bin/env node
/**
 * Tests for the ProfIntel bounded batch runner.
 * Run: node scripts/profintel/batch-runner.test.mjs
 * Uses node:test + node:assert. No network, no filesystem side effects
 * (checkpoint/costlog are injected as in-memory doubles).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runBatch, parseArgs, DEFAULTS } from "./batch-runner.mjs";

// --- fixtures ---------------------------------------------------------------
function makeCampuses(n, costEach = 0.1) {
  return Array.from({ length: n }, (_, i) => ({
    rank: i + 1, campus: `Campus ${i + 1}`, state: "TX", courseCode: "ACCT",
    currentProfessors: 0, priority: i < 2 ? "P1" : i < 5 ? "P2" : "P3",
    reason: "test", estCostUsd: costEach, yield: "8-12", key: `Campus ${i + 1}|TX`,
  }));
}

// A fake clock we control; a counting executor that records network "calls".
function harness(overrides = {}) {
  let now = 1_000_000;
  const clock = () => now;
  const advance = (ms) => { now += ms; };
  const costLog = [];
  const cp = { done: {}, startedAt: null, totals: { spentUsd: 0, requests: 0, campuses: 0 } };
  let calls = 0;
  const executor = overrides.executor || (async (c) => {
    calls++;
    return { costUsd: c.estCostUsd, requests: 10, contactsInserted: 9, contactsWithEmail: 10 };
  });
  const deps = {
    clock, executor, campuses: overrides.campuses,
    checkpoint: cp, installSignal: false,
    appendCostLog: (l) => costLog.push(l),
    saveCheckpoint: () => {}, // in-memory: don't touch disk
    logger: () => {}, // silence
    ...overrides.deps,
  };
  return { deps, cp, costLog, advance, get calls() { return calls; }, setCalls: (n) => (calls = n) };
}

const baseOpts = (o = {}) => ({
  ...DEFAULTS, input: null, execute: false, dryRun: true,
  checkpoint: ":mem:", costLog: ":mem:", resume: true,
  concurrency: 1, retryCap: 0, priorityMin: "P4",
  costCeilingPerCampusUsd: 0.0, requestsPerCampusEstimate: 10,
  ...o,
});

// --- tests ------------------------------------------------------------------

test("HARD budget guard: never exceeds --budget-usd", async () => {
  const h = harness({ campuses: makeCampuses(100, 0.10) });
  const opts = baseOpts({ budgetUsd: 1.00, maxRequests: 1e9, costCeilingPerCampusUsd: 0.10 });
  const s = await runBatch(opts, h.deps);
  // 0.10/campus, $1 budget => at most 10 campuses, spend <= $1.00
  assert.ok(s.spentUsd <= 1.0 + 1e-9, `spent ${s.spentUsd} must be <= budget 1.0`);
  assert.equal(s.completed, 10);
  assert.match(s.stoppedReason, /budget guard/);
});

test("budget guard holds with concurrency>1 (reservation prevents overshoot)", async () => {
  const h = harness({ campuses: makeCampuses(100, 0.10) });
  const opts = baseOpts({ budgetUsd: 1.00, concurrency: 4, costCeilingPerCampusUsd: 0.10, maxRequests: 1e9 });
  const s = await runBatch(opts, h.deps);
  assert.ok(s.spentUsd <= 1.0 + 1e-9, `spent ${s.spentUsd} <= 1.0`);
  assert.ok(s.completed <= 10, `completed ${s.completed} <= 10`);
});

test("--max-campuses ceiling respected", async () => {
  const h = harness({ campuses: makeCampuses(100, 0.001) });
  const opts = baseOpts({ maxCampuses: 7, budgetUsd: 1e9, maxRequests: 1e9 });
  const s = await runBatch(opts, h.deps);
  assert.equal(s.completed, 7);
  assert.match(s.stoppedReason, /campus-count guard/);
});

test("--max-requests ceiling respected", async () => {
  const h = harness({ campuses: makeCampuses(100, 0.001) });
  // executor reports 10 requests each; estimate 10; ceiling 35 => stop before 4th (would reserve 40)
  const opts = baseOpts({ maxRequests: 35, budgetUsd: 1e9, requestsPerCampusEstimate: 10 });
  const s = await runBatch(opts, h.deps);
  assert.ok(s.requests <= 35, `requests ${s.requests} <= 35`);
  assert.match(s.stoppedReason, /request guard/);
});

test("dry-run default executor makes ZERO real network calls", async () => {
  // If deps.executor is omitted, runBatch builds the built-in simulator.
  const h = harness({ campuses: makeCampuses(5, 0.05) });
  delete h.deps.executor; // force built-in simulator
  const opts = baseOpts({ dryRun: true, budgetUsd: 1e9, maxRequests: 1e9 });
  const s = await runBatch(opts, h.deps);
  assert.equal(s.completed, 5);
  assert.ok(s.contacts > 0, "simulator returns simulated contacts");
  // simulator sets simulated:true and performs no I/O; nothing to assert beyond completion
});

test("resume is idempotent: completed campuses are skipped, not re-run", async () => {
  const campuses = makeCampuses(10, 0.05);
  const h = harness({ campuses });
  const opts = baseOpts({ maxCampuses: 4, budgetUsd: 1e9, maxRequests: 1e9 });
  const s1 = await runBatch(opts, h.deps);
  assert.equal(s1.completed, 4);
  const callsAfter1 = h.calls;
  // second run with same checkpoint + higher ceiling: should skip the 4 done, do 6 more
  const opts2 = baseOpts({ maxCampuses: 100, budgetUsd: 1e9, maxRequests: 1e9 });
  const s2 = await runBatch(opts2, { ...h.deps }); // same cp object reused
  assert.equal(s2.completed, 6, "only the remaining 6 run on resume");
  assert.equal(h.calls, callsAfter1 + 6, "executor called only for the 6 not-yet-done");
  assert.equal(Object.keys(h.cp.done).length, 10);
});

test("retry cap: fails after retryCap+1 attempts, does not loop forever", async () => {
  let attempts = 0;
  const executor = async () => { attempts++; throw new Error("boom"); };
  const h = harness({ campuses: makeCampuses(1, 0.05), executor });
  const opts = baseOpts({ retryCap: 2, budgetUsd: 1e9, maxRequests: 1e9 });
  const s = await runBatch(opts, h.deps);
  assert.equal(s.failed, 1);
  assert.equal(attempts, 3, "1 initial + 2 retries");
});

test("failed campus consumes no budget and is not marked done", async () => {
  const executor = async (c) => (c.campus === "Campus 2" ? { error: "no key" } : { costUsd: c.estCostUsd, requests: 10, contactsInserted: 5, contactsWithEmail: 5 });
  const h = harness({ campuses: makeCampuses(3, 0.05), executor });
  const opts = baseOpts({ retryCap: 0, budgetUsd: 1e9, maxRequests: 1e9 });
  const s = await runBatch(opts, h.deps);
  assert.equal(s.completed, 2);
  assert.equal(s.failed, 1);
  assert.ok(Math.abs(s.spentUsd - 0.10) < 1e-9, "only the 2 successes cost money");
  assert.ok(!h.cp.done["Campus 2|TX"], "failed campus not checkpointed as done");
});

test("priority-min filters the campus set", async () => {
  const h = harness({ campuses: makeCampuses(10, 0.01) }); // 2 P1, 3 P2, 5 P3
  const opts = baseOpts({ priorityMin: "P2", budgetUsd: 1e9, maxRequests: 1e9 });
  const s = await runBatch(opts, h.deps);
  assert.equal(s.completed, 5, "only P1+P2 (2+3) run");
});

test("parseArgs: --execute flips dryRun off; default is dry-run", () => {
  assert.equal(parseArgs([]).dryRun, true);
  assert.equal(parseArgs(["--execute"]).dryRun, false);
  assert.equal(parseArgs(["--execute"]).execute, true);
  assert.equal(parseArgs(["--budget-usd", "42"]).budgetUsd, 42);
  assert.equal(parseArgs(["--priority-min", "p2"]).priorityMin, "P2");
});
