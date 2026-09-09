import { describe, expect, test } from "bun:test";

import { PIECE_CARD_CEILING, cuttable, pieceStatus, piecesFromCuts, splitProblem, suggestPieceName, type SplitCard } from "./split-set";

// Lee, 2026-09-09: "that survive accounting is all shorts, vertical shorts that are three minutes
// or less. The splitting has to be ruthless." The account-type set is the case: 31 cards →
// Assets / Liabilities / Equity / Revenue / Expense.
const card = (id: string, stem = id): SplitCard => ({ id, stem });
const cards = [
  card("cash", "What type of account is Cash?"), card("ar", "What type of account is Accounts Receivable?"), card("land", "What type of account is Land?"),
  card("ap", "What type of account is Accounts Payable?"), card("np", "What type of account is Notes Payable?"),
  card("cs", "What type of account is Common Stock?"), card("div", "What type of account is Dividends?"),
];

describe("the knife", () => {
  test("a cut after a card ends a piece there; the remainder is the last piece", () => {
    const p = piecesFromCuts(cards, new Set([2, 4]), ["Assets", "Liabilities", "Equity"]);
    expect(p.map((x) => x.ceqIds)).toEqual([["cash", "ar", "land"], ["ap", "np"], ["cs", "div"]]);
    expect(p.map((x) => x.name)).toEqual(["Assets", "Liabilities", "Equity"]);
  });
  test("no cuts is one piece; a cut past the end is ignored", () => {
    expect(piecesFromCuts(cards, new Set())).toHaveLength(1);
    expect(piecesFromCuts(cards, new Set([6, 99]))).toHaveLength(1);
  });
  test("a missing name becomes Part n, in order", () => {
    const p = piecesFromCuts(cards, new Set([2]), ["Assets"]);
    expect(p[1].name).toBe("Part 2");
    expect(piecesFromCuts(cards, new Set([2]), ["", "  "]).map((x) => x.name)).toEqual(["Part 1", "Part 2"]);
  });
  test("note-only and draft cards are not on the knife — they stay with the parent", () => {
    const all: SplitCard[] = [{ id: "intro", stem: "", noteOnly: true }, ...cards, { id: "wip", stem: "", draft: true }];
    expect(cuttable(all).map((c) => c.id)).toEqual(cards.map((c) => c.id));
  });
});

describe("what can and cannot be split", () => {
  const ids = cards.map((c) => c.id);
  test("a legal split is null", () => {
    expect(splitProblem(ids, piecesFromCuts(cards, new Set([2, 4]), ["A", "L", "E"]))).toBeNull();
  });
  test("one piece is not a split", () => {
    expect(splitProblem(ids, piecesFromCuts(cards, new Set()))).toMatch(/at least two/);
  });
  test("every piece needs a name and a card, and a card belongs to one piece of this set", () => {
    expect(splitProblem(ids, [{ name: "", ceqIds: ["cash"] }, { name: "B", ceqIds: ["ar"] }])).toMatch(/needs a name/);
    expect(splitProblem(ids, [{ name: "A", ceqIds: [] }, { name: "B", ceqIds: ["ar"] }])).toMatch(/no cards/);
    expect(splitProblem(ids, [{ name: "A", ceqIds: ["nope"] }, { name: "B", ceqIds: ["ar"] }])).toMatch(/not in this set/);
    expect(splitProblem(ids, [{ name: "A", ceqIds: ["cash"] }, { name: "B", ceqIds: ["cash"] }])).toMatch(/two pieces/);
    expect(splitProblem(ids, [{ name: "Same", ceqIds: ["cash"] }, { name: "same", ceqIds: ["ar"] }])).toMatch(/same name/);
  });
});

describe("the ceiling", () => {
  test("twelve cards is the line — over it, the panel says so", () => {
    expect(PIECE_CARD_CEILING).toBe(12);
    expect(pieceStatus({ name: "x", ceqIds: Array.from({ length: 12 }, (_, i) => `c${i}`) }).over).toBe(false);
    expect(pieceStatus({ name: "x", ceqIds: Array.from({ length: 13 }, (_, i) => `c${i}`) })).toEqual({ n: 13, over: true });
  });
});

describe("a suggested name", () => {
  // Lee's five, as he says them: "one for assets, one for liabilities, one for equity, one for
  // revenue, one for expense." Only the first two are plural.
  test("a run whose cards share one answer is named for that family, the way Lee says it", () => {
    expect(suggestPieceName([], ["Asset", "Asset", "Asset"])).toBe("Assets");
    expect(suggestPieceName([], ["Liability", "Liability"])).toBe("Liabilities");
    expect(suggestPieceName([], ["Equity — a contra account that reduces it", "Equity"])).toBe("Equity");
    expect(suggestPieceName([], ["Revenue"])).toBe("Revenue");
    expect(suggestPieceName([], ["Expense"])).toBe("Expense");
  });
  test("mixed answers fall back to the first stem's tail", () => {
    expect(suggestPieceName(["What type of account is Cash?", "x"], ["Asset", "Liability"])).toBe("Cash");
    expect(suggestPieceName([])).toBe("Part");
  });
});
