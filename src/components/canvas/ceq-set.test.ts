import { describe, expect, it } from "bun:test";

import {
  correctFor,
  correctOptionForType,
  fillStem,
  filmOrder,
  generateCeqCards,
  seedAccountTypeSet,
  seedDifficulty,
  seedInclude,
  studentOrder,
  type CeqSetAccount,
  type CeqSetDef,
  type SeedCoaAccount,
} from "./ceq-set";

const acct = (p: Partial<CeqSetAccount> & { accountId: string; name: string; accountType: string }): CeqSetAccount => ({
  include: true,
  difficulty: "easy",
  ...p,
});

describe("correctOptionForType — derives the answer from COA type (contra folds to base)", () => {
  it("base types map 1:1", () => {
    expect(correctOptionForType("asset")).toBe("Asset");
    expect(correctOptionForType("liability")).toBe("Liability");
    expect(correctOptionForType("equity")).toBe("Equity");
    expect(correctOptionForType("revenue")).toBe("Revenue");
    expect(correctOptionForType("expense")).toBe("Expense");
  });
  it("contra + adjunct fold to their base type's answer", () => {
    expect(correctOptionForType("contra_asset")).toBe("Asset"); // accumulated depreciation
    expect(correctOptionForType("contra_revenue")).toBe("Revenue");
    expect(correctOptionForType("liability_adjunct")).toBe("Liability");
  });
});

describe("correctFor — manual override wins over derivation", () => {
  it("uses the override when set", () => {
    expect(correctFor(acct({ accountId: "x", name: "Weird", accountType: "asset", correctOverride: "Equity" }))).toBe("Equity");
  });
  it("derives when no override", () => {
    expect(correctFor(acct({ accountId: "x", name: "Cash", accountType: "asset" }))).toBe("Asset");
  });
  it("contra/adjunct → None of these (by type or by Dividends name)", () => {
    expect(correctFor(acct({ accountId: "ad", name: "Accumulated Depreciation", accountType: "contra_asset" }))).toBe("None of these");
    expect(correctFor(acct({ accountId: "d", name: "Dividends", accountType: "equity" }))).toBe("None of these"); // by name even when typed plain equity
    expect(correctFor(acct({ accountId: "la", name: "Bond Premium", accountType: "liability_adjunct" }))).toBe("None of these");
    // an override still wins over the contra rule
    expect(correctFor(acct({ accountId: "ad2", name: "Accumulated Depreciation", accountType: "contra_asset", correctOverride: "Asset" }))).toBe("Asset");
  });
});

describe("fillStem", () => {
  it("substitutes the token", () => {
    const set = { stemTemplate: "What type of account is {account}?", token: "account" };
    expect(fillStem(set, "Prepaid Rent")).toBe("What type of account is Prepaid Rent?");
  });
});

describe("filmOrder — easy→hard, bounce between answer types within a tier", () => {
  const accounts: CeqSetAccount[] = [
    acct({ accountId: "a1", name: "Cash", accountType: "asset", difficulty: "easy" }),
    acct({ accountId: "a2", name: "Land", accountType: "asset", difficulty: "easy" }),
    acct({ accountId: "l1", name: "Accounts Payable", accountType: "liability", difficulty: "easy" }),
    acct({ accountId: "e1", name: "Common Stock", accountType: "equity", difficulty: "easy" }),
    acct({ accountId: "h1", name: "COGS", accountType: "expense", difficulty: "hard" }),
    acct({ accountId: "x", name: "Excluded", accountType: "asset", difficulty: "easy", include: false }),
  ];
  const ordered = filmOrder(accounts);

  it("drops excluded accounts", () => {
    expect(ordered.find((a) => a.accountId === "x")).toBeUndefined();
    expect(ordered).toHaveLength(5);
  });
  it("easy tier comes before hard tier", () => {
    expect(ordered[ordered.length - 1].accountId).toBe("h1"); // the only hard one, last
    expect(ordered.slice(0, 4).every((a) => a.difficulty === "easy")).toBe(true);
  });
  it("consecutive answers differ while ≥2 answer types remain (no all-assets run)", () => {
    // easy tier has A,A,L,E → round-robin yields A,L,E,A (first three distinct)
    const easy = ordered.filter((a) => a.difficulty === "easy").map((a) => correctFor(a));
    expect(easy[0]).not.toBe(easy[1]);
    expect(easy[1]).not.toBe(easy[2]);
  });
  it("is deterministic", () => {
    expect(filmOrder(accounts).map((a) => a.accountId)).toEqual(ordered.map((a) => a.accountId));
  });
});

describe("studentOrder — deterministic shuffle, different from film order", () => {
  const accounts: CeqSetAccount[] = Array.from({ length: 8 }, (_, i) =>
    acct({ accountId: `a${i}`, name: `Acct ${i}`, accountType: "asset" }),
  );
  it("same seed → same order", () => {
    expect(studentOrder(accounts, 42).map((a) => a.accountId)).toEqual(studentOrder(accounts, 42).map((a) => a.accountId));
  });
  it("different seed → (usually) different order", () => {
    const a = studentOrder(accounts, 1).map((x) => x.accountId).join();
    const b = studentOrder(accounts, 999).map((x) => x.accountId).join();
    expect(a).not.toBe(b);
  });
});

describe("generateCeqCards — one card per account, correct answer flagged", () => {
  const set: CeqSetDef = seedAccountTypeSet("s1", [
    { id: "cash", name: "Cash", accountType: "asset" },
    { id: "ap", name: "Accounts Payable", accountType: "liability" },
  ]);
  const cards = generateCeqCards(set, filmOrder(set.accounts));
  it("one card per included account + the auto-added COGS", () => {
    // Cash + AP + COGS (auto-added since not in COA) = 3
    expect(cards).toHaveLength(3);
  });
  it("each card has the 6 fixed options (incl. None of these) and exactly one correct", () => {
    for (const c of cards) {
      expect(c.choices.map((ch) => ch.text)).toEqual(["Asset", "Liability", "Equity", "Revenue", "Expense", "None of these"]);
      expect(c.choices.filter((ch) => ch.correct).length).toBe(1);
    }
  });
  it("correct answer matches the account type (COGS → Expense)", () => {
    const cogs = cards.find((c) => c.prompt.includes("Cost of Goods Sold"))!;
    expect(cogs.choices.find((ch) => ch.correct)!.text).toBe("Expense");
    const cash = cards.find((c) => c.prompt.includes("Cash"))!;
    expect(cash.choices.find((ch) => ch.correct)!.text).toBe("Asset");
  });
});

describe("seed rules — Lee's ramp", () => {
  const coa: SeedCoaAccount[] = [
    { id: "cash", name: "Cash", accountType: "asset" },
    { id: "prepaid", name: "Prepaid Rent", accountType: "asset" },
    { id: "intrec", name: "Interest Receivable", accountType: "asset" },
    { id: "ap", name: "Accounts Payable", accountType: "liability" },
    { id: "unearn", name: "Unearned Revenue", accountType: "liability" },
    { id: "cs", name: "Common Stock", accountType: "equity" },
    { id: "div", name: "Dividends", accountType: "contra_equity" },
    { id: "accdep", name: "Accumulated Depreciation", accountType: "contra_asset" },
    { id: "rev", name: "Service Revenue", accountType: "revenue" },
    { id: "depexp", name: "Depreciation Expense", accountType: "expense" },
    { id: "rentexp", name: "Rent Expense", accountType: "expense" },
    { id: "wageexp", name: "Wages Expense", accountType: "expense" },
    { id: "cogs", name: "Cost of Goods Sold", accountType: "expense" },
  ];

  it("difficulty ramp: obvious=easy, cheat-code=medium, tricky=hard", () => {
    expect(seedDifficulty("Cash")).toBe("easy");
    expect(seedDifficulty("Accounts Payable")).toBe("medium");
    expect(seedDifficulty("Accounts Receivable")).toBe("medium"); // plain receivable → medium
    expect(seedDifficulty("Interest Receivable")).toBe("hard"); // Lee's ramp: a tricky one
    expect(seedDifficulty("Prepaid Rent")).toBe("hard");
    expect(seedDifficulty("Cost of Goods Sold")).toBe("hard");
    expect(seedDifficulty("Rent Expense")).toBe("hard");
  });

  it("include rules: contra + Dividends IN (None-of-these answer); only Dep/Rent/COGS expenses IN", () => {
    const inc = (n: string) => seedInclude(coa.find((c) => c.name === n)!);
    expect(inc("Dividends")).toBe(true);
    expect(inc("Accumulated Depreciation")).toBe(true);
    expect(inc("Wages Expense")).toBe(false); // most expenses excluded
    expect(inc("Depreciation Expense")).toBe(true);
    expect(inc("Rent Expense")).toBe(true);
    expect(inc("Cost of Goods Sold")).toBe(true);
    expect(inc("Cash")).toBe(true);
    expect(inc("Common Stock")).toBe(true);
  });

  it("seedAccountTypeSet does NOT duplicate COGS when the COA already has it", () => {
    const set = seedAccountTypeSet("s", coa);
    const cogs = set.accounts.filter((a) => /cost of goods sold/i.test(a.name));
    expect(cogs).toHaveLength(1);
    expect(cogs[0].offCoa).toBeUndefined(); // it's the real COA one
  });

  it("seedAccountTypeSet ADDS an off-COA COGS when the COA lacks it", () => {
    const set = seedAccountTypeSet("s", coa.filter((c) => c.id !== "cogs"));
    const cogs = set.accounts.find((a) => /cost of goods sold/i.test(a.name))!;
    expect(cogs.offCoa).toBe(true);
    expect(correctFor(cogs)).toBe("Expense");
  });
});
