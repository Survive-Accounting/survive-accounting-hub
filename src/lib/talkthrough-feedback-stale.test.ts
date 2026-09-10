// talkthrough-feedback-stale.test.ts — a cloned card's inherited feedback is flagged, not blanked.
//
// Lee (2026-09-09): "duplicated cards have identical feedback. Audit/fix." The fix is one
// boolean on the node's data: duplicateCeqCard sets `feedbackStale` when the copy carries any
// feedback, applyCeqEdit clears it the first time the feedback is saved with different words,
// and loadBoothBank passes it to the Editor. The two helpers are pure and tested here; the
// three handler edits are pinned in source so a refactor cannot quietly drop one of them.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { anyChoiceHasFeedback, feedbackChanged } from "@/lib/talkthrough.functions";

const src = readFileSync(join(import.meta.dir, "talkthrough.functions.ts"), "utf8").split("\r\n").join("\n");
/** The text of one server function, from its export line to the next top-level export. */
const fnBody = (name: string): string => {
  const start = src.indexOf(`export const ${name} =`);
  expect(start).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
};

describe("anyChoiceHasFeedback", () => {
  test("true only when some choice carries a non-empty sentence", () => {
    expect(anyChoiceHasFeedback([{ text: "a", correct: true, feedback: "Right." }, { text: "b", correct: false }])).toBe(true);
    expect(anyChoiceHasFeedback([{ text: "a", correct: true }, { text: "b", correct: false }])).toBe(false);
    expect(anyChoiceHasFeedback([{ text: "a", correct: true, feedback: "   " }])).toBe(false);
    expect(anyChoiceHasFeedback([{ text: "a", correct: true, feedback: "" }])).toBe(false);
  });
  test("tolerates the shapes a scene can hold: missing, not an array, null entries", () => {
    expect(anyChoiceHasFeedback(undefined)).toBe(false);
    expect(anyChoiceHasFeedback("nope")).toBe(false);
    expect(anyChoiceHasFeedback([null, { feedback: 7 }, { feedback: "ok" }])).toBe(true);
    expect(anyChoiceHasFeedback([null, { feedback: 7 }])).toBe(false);
  });
});

describe("feedbackChanged", () => {
  const stored = [
    { id: "c0", text: "Asset", correct: true, feedback: "Prepaid Rent is an asset." },
    { id: "c1", text: "Liability", correct: false },
    { id: "c2", text: "Equity", correct: false },
  ];
  const same = () => [
    { text: "Asset", correct: true, feedback: "Prepaid Rent is an asset." },
    { text: "Liability", correct: false, feedback: null },
    { text: "Equity", correct: false, feedback: "" },
  ];
  test("the same words in every slot is not a change — even with the choice text edited", () => {
    expect(feedbackChanged(stored, same())).toBe(false);
    const textOnly = same();
    textOnly[1].text = "Liabilities";
    expect(feedbackChanged(stored, textOnly)).toBe(false);
  });
  test("whitespace around the sentence does not count as words", () => {
    const padded = same();
    padded[0].feedback = "  Prepaid Rent is an asset.\n";
    expect(feedbackChanged(stored, padded)).toBe(false);
  });
  test("a rewritten sentence is a change — the case that clears the flag", () => {
    const rewritten = same();
    rewritten[0].feedback = "Prepaid Insurance is an asset.";
    expect(feedbackChanged(stored, rewritten)).toBe(true);
  });
  test("a sentence added to a choice that had none is a change; removing one is too", () => {
    const added = same();
    added[1].feedback = "Not a liability — the company is owed the benefit.";
    expect(feedbackChanged(stored, added)).toBe(true);
    const removed = same();
    removed[0].feedback = null;
    expect(feedbackChanged(stored, removed)).toBe(true);
  });
  test("a choice added or dropped with no feedback on either side is not a change", () => {
    expect(feedbackChanged(stored, [...same(), { text: "Revenue", correct: false, feedback: null }])).toBe(false);
    expect(feedbackChanged(stored, same().slice(0, 2))).toBe(false);
  });
  test("a card with no stored choices: only submitted words count", () => {
    expect(feedbackChanged(undefined, [{ feedback: null }, { feedback: "" }])).toBe(false);
    expect(feedbackChanged(undefined, [{ feedback: "now there is one" }])).toBe(true);
  });
});

describe("the three handler edits stay wired", () => {
  test("duplicateCeqCard flags borrowed feedback on the copy's data, beside clonedFrom/clonedAt, and never blanks it", () => {
    const dup = fnBody("duplicateCeqCard");
    expect(dup).toContain("copy.data.clonedFrom = data.ceqNodeId;");
    expect(dup).toContain("if (anyChoiceHasFeedback(copy.data.choices)) copy.data.feedbackStale = true;");
    // Lee wants the old sentence as the starting point: the copy keeps its feedback. The only
    // deletes on the copy are the ones the clone story already had (history, label).
    const deletes = dup.split("\n").filter((l) => l.trim().startsWith("delete "));
    expect(deletes.some((l) => /\bfeedback\b/.test(l))).toBe(false);
    expect(dup).not.toContain("feedback: undefined");
    expect(dup).not.toContain('feedback: ""');
  });
  test("applyCeqEdit clears the flag when the feedback differs, compared before the choices are overwritten", () => {
    const apply = fnBody("applyCeqEdit");
    const clear = apply.indexOf("if (node.data.feedbackStale && feedbackChanged(node.data.choices, data.choices)) delete node.data.feedbackStale;");
    const write = apply.indexOf("node.data.choices = data.choices.map(");
    expect(clear).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(clear);
  });
  test("loadBoothBank carries feedbackStale onto BoothCeq so the Editor can show it", () => {
    expect(src).toContain("feedbackStale?: boolean;");
    expect(fnBody("loadBoothBank")).toContain("...(c.d.feedbackStale === true ? { feedbackStale: true } : {}),");
  });
  test("both helpers are function declarations (the TDZ ratchet's shape), not module-scope arrows", () => {
    expect(src).toContain("export function anyChoiceHasFeedback(");
    expect(src).toContain("export function feedbackChanged(");
  });
});
