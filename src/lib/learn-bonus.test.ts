import { describe, expect, test } from "bun:test";

import { aleRowsOf, arrowsLine, bonusKindOf, equityEffect, isCheatCode, practiceMinutes, rubricForCeq, rubricMatches, stripAmounts, type BonusFrame } from "./learn-bonus";

const R = (id: string, text: string, arrows: BonusFrame["rubric"] extends infer T ? (T extends { arrows?: infer A } ? A : never) : never, extra: Partial<BonusFrame> = {}): BonusFrame =>
  ({ id, kind: "rubric", rubric: { mode: "ale", text, amount: 1000, arrows }, ...extra });

describe("bonus kind", () => {
  test("rubric slides make an A = L + E bonus", () => {
    expect(bonusKindOf([R("r1", "Lee invests $10K cash", { A: ["up"], E: ["up"] })], [])).toBe("ale");
  });
  test("a skipped rubric slide alone is no bonus", () => {
    expect(bonusKindOf([R("r1", "x", { A: ["up"] }, { skipped: true })], [])).toBeNull();
  });
  test("a Types of Accounts slide, or a bank of type questions, makes the types bonus", () => {
    expect(bonusKindOf([{ id: "t", kind: "types" }], [])).toBe("types");
    expect(bonusKindOf([], Array.from({ length: 5 }, (_, i) => `What type of account is X${i}?`))).toBe("types");
    expect(bonusKindOf([], ["What type of account is Cash?"])).toBeNull();
  });
  test("a set with nothing of the sort has no tab", () => {
    expect(bonusKindOf([{ id: "c", kind: "ceq", ceqId: "q" }, { id: "p", kind: "phrase" }], ["Which user is internal?"])).toBeNull();
  });
});

describe("amounts come off the bonus rows", () => {
  test.each([
    ["Lee invests $10K cash in Survive Co for common stock.", "Lee invests cash in Survive Co for common stock."],
    ["Survive Co buys $200 of supplies on account.", "Survive Co buys supplies on account."],
    ["Survive Co performs the $600 worth of services it was paid upfront for.", "Survive Co performs the services it was paid upfront for."],
    ["Survive Co pays a $500 cash dividend.", "Survive Co pays a cash dividend."],
    ["Survive Co provides services for $1k cash.", "Survive Co provides services for cash."],
    ["Survive Co pays $1,200 cash for a one-year insurance policy starting today.", "Survive Co pays cash for a one-year insurance policy starting today."],
  ])("%s", (a, b) => { expect(stripAmounts(a)).toBe(b); });
});

describe("the transaction list", () => {
  test("in plan order, once each, arrows only; skipped and empty ones out", () => {
    const rows = aleRowsOf([
      R("r1", "Lee invests $10K cash", { A: ["up"], E: ["up"] }),
      R("r2", "Survive Co pays $3K cash for equipment.", { A: ["up", "down"] }),
      R("r3", "Lee invests $10K cash", { A: ["up"], E: ["up"] }),
      R("r4", "Survive Co pays $3K cash for equipment.", { A: ["up", "down"] }, { skipped: true }),
      R("r5", "", { A: ["up"] }),
      R("r6", "No arrows yet", {}),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(rows[0].text).toBe("Lee invests cash");
    expect(rows[1].arrows.A).toEqual(["up", "down"]);
  });
});

describe("the key for a question", () => {
  test("prefers the telling that shows Rev / Exp", () => {
    const k = rubricForCeq([
      R("a", "Survive Co provides services for $1k cash.", { A: ["up"], E: ["up"] }, { ceqId: "q" }),
      R("b", "Survive Co provides services for $1k cash.", { A: ["up"], Rev: ["up"] }, { ceqId: "q" }),
    ], "q");
    expect(k?.arrows.Rev).toEqual(["up"]);
    expect(k?.amount).toBe(1000);
  });
  test("null when the card has no rubric slide", () => {
    expect(rubricForCeq([R("a", "x", { A: ["up"] }, { ceqId: "other" })], "q")).toBeNull();
  });
});

describe("grading", () => {
  const key = { A: ["up"] as const, L: [], E: [], Rev: ["up"] as const, Exp: [] };
  const arrows = (p: Partial<Record<"A" | "L" | "E" | "Rev" | "Exp", ("up" | "down" | "ne")[]>>) => ({ A: [], L: [], E: [], Rev: [], Exp: [], ...p });
  test("Rev ↑ and E ↑ are the same answer", () => {
    expect(rubricMatches(arrows({ A: ["up"], Rev: ["up"] }), arrows({ A: ["up"], E: ["up"] }))).toBe(true);
    expect(rubricMatches(arrows({ A: ["up"], E: ["up"] }), { ...key, A: [...key.A], Rev: [...key.Rev] })).toBe(true);
  });
  test("Exp ↑ is E ↓", () => {
    expect(equityEffect(arrows({ Exp: ["up"] }))).toBe("down");
    expect(rubricMatches(arrows({ A: ["down"], Exp: ["up"] }), arrows({ A: ["down"], E: ["down"] }))).toBe(true);
  });
  test("↑↓ and NE are the same box", () => {
    expect(rubricMatches(arrows({ A: ["ne"] }), arrows({ A: ["up", "down"] }))).toBe(true);
  });
  test("wrong is wrong", () => {
    expect(rubricMatches(arrows({ A: ["up"], L: ["up"] }), arrows({ A: ["up"], E: ["up"] }))).toBe(false);
    expect(rubricMatches(arrows({}), arrows({ A: ["up"], E: ["up"] }))).toBe(false);
  });
  test("E's own arrow wins over the derived one", () => {
    expect(equityEffect(arrows({ E: ["down"], Rev: ["up"] }))).toBe("down");
  });
});

describe("words", () => {
  test("the one-breath line", () => {
    expect(arrowsLine({ A: ["up"], L: [], E: [], Rev: ["up"], Exp: [] })).toBe("A↑ Rev↑ (E↑)");
    expect(arrowsLine({ A: ["up", "down"], L: [], E: [], Rev: [], Exp: [] })).toBe("A↑↓");
    expect(arrowsLine({ A: ["down"], L: [], E: ["down"], Rev: [], Exp: [] })).toBe("A↓ E↓");
  });
  test("cheat codes are the quoted words, the Anything rules and the shout", () => {
    expect(isCheatCode("“Receivables”")).toBe(true);
    expect(isCheatCode("Anything “earned”")).toBe(true);
    expect(isCheatCode("COST OF GOODS SOLD!")).toBe(true);
    expect(isCheatCode("Cash")).toBe(false);
    expect(isCheatCode("Accumulated Depreciation")).toBe(false);
  });
  test("≈ minutes", () => { expect(practiceMinutes(37)).toBe(10); expect(practiceMinutes(1)).toBe(1); });
});
