// Unit tests for the Exam 1 Global Starter Map plan builder — runs against the committed
// workbook so the canonical contract (6/25/274 + structural invariants) is CI-enforced.
import { test, expect } from "bun:test";
import { join } from "node:path";
import { readImportRows } from "./workbook";
import { buildPlan, deckIdFor, ceqIdFor, EXPECTED } from "./plan";

const WORKBOOK = join(import.meta.dir, "..", "..", "..", "scripts", "curriculum", "Survive_Exam1_Master_CEQ_Editorial_Pass_v1.xlsx");
const { rows } = readImportRows(WORKBOOK);
const plan = buildPlan(rows);

test("plan builds with zero validation errors", () => {
  expect(plan.errors).toEqual([]);
});

test("canonical counts: 6 topics / 25 sets / 274 CEQs", () => {
  expect(plan.topics.length).toBe(EXPECTED.topics);
  expect(plan.sets.length).toBe(EXPECTED.subtopics);
  expect(plan.ceqCount).toBe(EXPECTED.ceqs);
});

test("every set belongs to exactly one topic; every CEQ to exactly one set", () => {
  const setToTopic = new Map<string, number>();
  for (const t of plan.topics) for (const s of t.sets) { expect(setToTopic.has(s.deckId)).toBe(false); setToTopic.set(s.deckId, t.order); }
  expect(setToTopic.size).toBe(EXPECTED.subtopics);
  const ceqToSet = new Map<string, string>();
  for (const s of plan.sets) for (const c of s.ceqs) { expect(ceqToSet.has(c.ceqId)).toBe(false); ceqToSet.set(c.ceqId, s.deckId); }
  expect(ceqToSet.size).toBe(EXPECTED.ceqs);
});

test("every CEQ has 2–5 choices and exactly one correct", () => {
  for (const s of plan.sets) for (const c of s.ceqs) {
    expect(c.choices.length).toBeGreaterThanOrEqual(2);
    expect(c.choices.length).toBeLessThanOrEqual(5);
    expect(c.choices.filter((x) => x.correct).length).toBe(1);
  }
});

test("no duplicate CEQ ids or Question Keys; no dup prompt within a set", () => {
  const ids = new Set<string>(), keys = new Set<string>();
  for (const s of plan.sets) { const seen = new Set<string>(); for (const c of s.ceqs) { expect(ids.has(c.ceqId)).toBe(false); ids.add(c.ceqId); expect(keys.has(c.questionKey)).toBe(false); keys.add(c.questionKey); const p = c.prompt.toLowerCase(); expect(seen.has(p)).toBe(false); seen.add(p); } }
  expect(ids.size).toBe(EXPECTED.ceqs);
});

test("180 reused + 94 new; deterministic ids are stable across two builds", () => {
  const reused = plan.sets.reduce((a, s) => a + s.ceqs.filter((c) => c.reused).length, 0);
  expect(reused).toBe(180);
  expect(plan.ceqCount - reused).toBe(94);
  const plan2 = buildPlan(rows);
  expect(plan2.sets.map((s) => s.deckId)).toEqual(plan.sets.map((s) => s.deckId));
  expect(plan2.sets.flatMap((s) => s.ceqs.map((c) => c.ceqId))).toEqual(plan.sets.flatMap((s) => s.ceqs.map((c) => c.ceqId)));
});

test("reused CEQ ids reuse the Original CEQ ID; feedback lands on the correct choice", () => {
  const withFeedback = plan.sets.flatMap((s) => s.ceqs).filter((c) => c.choices.some((x) => x.feedback));
  for (const c of withFeedback) { const fb = c.choices.filter((x) => x.feedback); expect(fb.length).toBe(1); expect(fb[0].correct).toBe(true); }
  const anyReused = plan.sets.flatMap((s) => s.ceqs).find((c) => c.reused);
  expect(anyReused && anyReused.ceqId.startsWith("ceq-")).toBe(true);
});
