import { describe, expect, test } from "bun:test";

import { PIECE_CARD_CEILING, SPINE_KINDS, carryFrames, cuttable, pieceStatus, piecesFromCuts, splitProblem, suggestPieceName, type SplitCard } from "./split-set";

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

// Lee had 52 slides on Account classification when the knife was built — the slogan, a
// memorize-this, callouts between the questions. The draft goes with the cards.
describe("the draft goes with the cards", () => {
  const f = (id: string, kind: string, ceqId?: string) => ({ id, kind, ...(ceqId ? { ceqId } : {}) });
  const parent = [
    f("open", "open"), f("intro", "intro"),
    f("slogan", "slogan"),                       // before any card → the FIRST piece
    f("q-cash", "ceq", "cash"), f("memo-1", "phrase"),
    f("q-ar", "ceq", "ar"),
    f("q-ap", "ceq", "ap"), f("cheat-1", "cheat"),
    f("q-cs", "ceq", "cs"), f("tip-1", "tip"),   // cs is NOT cut — it and its tip stay
    f("bio", "bio"), f("outro", "outro"),
  ];
  const pieces = [{ name: "Assets", ceqIds: ["cash", "ar"] }, { name: "Liabilities", ceqIds: ["ap"] }];

  test("each insert travels with the card it sits after; the leading insert joins the first piece", () => {
    const { carried } = carryFrames(parent, pieces);
    expect(carried[0].map((x) => x.id)).toEqual(["slogan", "q-cash", "memo-1", "q-ar"]);
    expect(carried[1].map((x) => x.id)).toEqual(["q-ap", "cheat-1"]);
  });
  test("the spine never travels — every piece grows its own", () => {
    const { carried, staying } = carryFrames(parent, pieces);
    for (const c of carried) expect(c.some((x) => SPINE_KINDS.has(x.kind))).toBe(false);
    expect(staying.filter((x) => SPINE_KINDS.has(x.kind)).map((x) => x.id)).toEqual(["open", "intro", "bio", "outro"]);
  });
  test("an uncut card stays, and so does the insert after it", () => {
    const { staying } = carryFrames(parent, pieces);
    expect(staying.map((x) => x.id)).toEqual(["open", "intro", "q-cs", "tip-1", "bio", "outro"]);
  });
  test("no plan, no problem", () => {
    const { carried, staying } = carryFrames([], pieces);
    expect(carried).toEqual([[], []]);
    expect(staying).toEqual([]);
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
