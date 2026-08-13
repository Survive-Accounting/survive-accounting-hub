// Verifies the Ch 1-5 CEQ seed content is structurally sound: spec'd counts,
// exactly one correct answer per question, distinct non-empty choices, and ZERO
// chains/memos anywhere (Lee's voice is added later).
import { expect, test } from "bun:test";

import { SEED_SETS } from "./ceq-seed";

const EXPECTED: Record<string, number> = {
  "ch1-free": 7, "ch1-full": 22,
  "ch2-free": 6, "ch2-full": 19,
  "ch3-free": 4, "ch3-full": 12,
  "ch4-free": 6, "ch4-full": 18,
  "ch5-free": 6, "ch5-full": 24,
};

test("10 seed sets exist", () => {
  expect(SEED_SETS.length).toBe(10);
  expect(new Set(SEED_SETS.map((s) => s.key)).size).toBe(10); // unique keys → unique deck ids
});

test("per-set counts match the spec", () => {
  for (const set of SEED_SETS) expect(`${set.key}=${set.questions.length}`).toBe(`${set.key}=${EXPECTED[set.key]}`);
});

test("every question is a valid single-answer MC with distinct, non-empty choices", () => {
  for (const set of SEED_SETS) {
    for (const q of set.questions) {
      expect(q.stem.trim().length, `stem in ${set.key}`).toBeGreaterThan(0);
      expect(q.choices.length, `#choices in ${set.key}: ${q.stem}`).toBeGreaterThanOrEqual(2);
      const correct = q.choices.filter((c) => c.correct);
      expect(correct.length, `exactly one correct in ${set.key}: ${q.stem}`).toBe(1);
      for (const c of q.choices) expect(c.text.trim().length, `empty choice in ${set.key}: ${q.stem}`).toBeGreaterThan(0);
      const texts = q.choices.map((c) => c.text.trim().toLowerCase());
      expect(new Set(texts).size, `distinct choices in ${set.key}: ${q.stem}`).toBe(texts.length);
    }
  }
});

test("account-type (ch1) sets list choices in the fixed Asset→Liability→Equity→Revenue→Expense order", () => {
  const ORDER = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
  for (const set of SEED_SETS.filter((s) => s.key.startsWith("ch1-"))) {
    expect(set.noRotate, `${set.key} must skip the seed-time rotate`).toBe(true);
    for (const q of set.questions) {
      expect(q.choices.map((c) => c.text), `${set.key}: ${q.stem}`).toEqual(ORDER);
    }
  }
});

test("no chains or memos anywhere in the seed", () => {
  for (const set of SEED_SETS) {
    for (const q of set.questions) {
      expect((q as Record<string, unknown>).chain).toBeUndefined();
      for (const c of q.choices) {
        expect((c as Record<string, unknown>).chain).toBeUndefined();
        expect((c as Record<string, unknown>).memoNodeId).toBeUndefined();
      }
    }
  }
});
