// ACCOUNT CLASSIFICATION tests. Two contracts live here:
//
//   1. THE SHARED ACCOUNT REGISTRY — integrity, plus a consistency net pinning
//      it against the three modules that already knew a piece of this (the
//      Rubric's account list, the Rubric board's CONTRA + current/long-term
//      seam, and coa-groups' DB type → group headers). Those pins are what make
//      the eventual Rubric migration mechanical instead of risky.
//   2. THE EXHIBIT — the five tiles, the audited traps copy, the depth layer
//      and the reveal shape.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  ACCOUNT_REGISTRY, account, accountByLabel, accountsByTerm, accountsIn, trapAccounts,
  type AccountCategory,
} from "./account-registry";
import {
  CLASS_REVEAL_MAX, CLASS_REVEAL_STEPS, CLASS_TERM_TILES, CLASS_TILES, CLASS_TRAPS,
  acctNodeId, classBandVisible, classNodeIds, classTile, termGroups,
  trapCategory, trapDestination, trapNote, trapTag,
} from "./classification-exhibit-config";
import { groupNameForType } from "./coa-groups";
import { ACCOUNTS, type AcctType } from "./exhibit-lab/rubric-model";
import { CONTRA, CURRENT_ASSET_COUNT } from "./exhibit-lab/rubric-view";

const cardSrc = readFileSync(join(import.meta.dir, "cards", "ClassificationNode.tsx"), "utf8").split("\r\n").join("\n");
const configSrc = readFileSync(join(import.meta.dir, "classification-exhibit-config.ts"), "utf8").split("\r\n").join("\n");

// ───────────────────────────────────────────── 1. the shared registry

describe("registry integrity", () => {
  test("ids and labels are unique", () => {
    const ids = ACCOUNT_REGISTRY.map((a) => a.id);
    const labels = ACCOUNT_REGISTRY.map((a) => a.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
  test("every account carries a one-line why", () => {
    for (const a of ACCOUNT_REGISTRY) {
      expect(a.whyLine.length).toBeGreaterThan(0);
      expect(a.whyLine.length).toBeLessThan(80);
      expect(a.whyLine).not.toContain("\n");
    }
  });
  test("a contra account keeps its PARENT category — no sixth bucket", () => {
    expect(account("dividends")).toMatchObject({ category: "equity", contra: true });
    expect(account("accumulated-depreciation")).toMatchObject({ category: "asset", contra: true });
    expect(ACCOUNT_REGISTRY.filter((a) => a.contra).map((a) => a.id)).toEqual(["accumulated-depreciation", "dividends"]);
  });
  test("balance-sheet accounts have a term; income-statement accounts do not", () => {
    for (const a of ACCOUNT_REGISTRY) {
      if (a.category === "asset" || a.category === "liability") expect(a.term).toBeDefined();
      else expect(a.term).toBeUndefined();
    }
  });
  test("equity is a balance-sheet category that deliberately carries no term", () => {
    // Equity is not split current/long-term — the depth layer covers A and L only.
    for (const a of accountsIn("equity")) expect(a.term).toBeUndefined();
    expect([...CLASS_TERM_TILES]).toEqual(["asset", "liability"]);
  });
  test("intangibles are long-term assets only", () => {
    for (const a of ACCOUNT_REGISTRY.filter((x) => x.intangible)) {
      expect(a.category).toBe("asset");
      expect(a.term).toBe("longterm");
    }
    expect(ACCOUNT_REGISTRY.filter((a) => a.intangible).map((a) => a.label))
      .toEqual(["Trademarks", "Copyrights", "Patents", "Goodwill"]);
  });
  test("lookup by label finds aliases too", () => {
    expect(accountByLabel("Cost of Goods Sold")!.id).toBe("cost-of-goods-sold");
    expect(accountByLabel("COGS")!.id).toBe("cost-of-goods-sold");
    expect(accountByLabel("Notes Receivable")!.id).toBe("accounts-receivable");
    expect(accountByLabel("nope")).toBeUndefined();
  });
  test("the long-term pile orders plain → intangible → contra", () => {
    const lt = accountsByTerm("asset", "longterm").map((a) => a.label);
    expect(lt[0]).toBe("Equipment");
    expect(lt[lt.length - 1]).toBe("Accumulated Depreciation");
    expect(lt.indexOf("Goodwill")).toBeLessThan(lt.indexOf("Accumulated Depreciation"));
    expect(lt.indexOf("Land")).toBeLessThan(lt.indexOf("Trademarks"));
  });
});

describe("registry ↔ the modules that already knew some of this", () => {
  const RUBRIC_CATEGORY: Record<AcctType, AccountCategory> = {
    A: "asset", L: "liability", E: "equity", R: "revenue", X: "expense",
  };

  test("every account the Rubric lists exists here, with the same category", () => {
    for (const [type, labels] of Object.entries(ACCOUNTS) as [AcctType, string[]][]) {
      for (const label of labels) {
        const a = accountByLabel(label);
        expect(a, `Rubric lists "${label}" but the registry does not`).toBeDefined();
        expect(a!.category, `"${label}" category disagrees with the Rubric`).toBe(RUBRIC_CATEGORY[type]);
      }
    }
  });
  test("the Rubric board's CONTRA set is exactly the registry's", () => {
    const rubricContra = Object.keys(CONTRA).map((k) => k.split(":")[2]).sort();
    const registryContra = ACCOUNT_REGISTRY.filter((a) => a.contra).map((a) => a.id).sort();
    expect(rubricContra).toEqual(registryContra);
  });
  test("the Rubric's current-asset seam agrees with the registry's terms", () => {
    const assets = ACCOUNTS.A;
    for (const label of assets.slice(0, CURRENT_ASSET_COUNT)) {
      expect(accountByLabel(label)!.term, `${label} should be current`).toBe("current");
    }
    for (const label of assets.slice(CURRENT_ASSET_COUNT)) {
      expect(accountByLabel(label)!.term, `${label} should be long-term`).toBe("longterm");
    }
  });
  test("categories map onto the COA group headers, contras under their parent", () => {
    const EXPECTED = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };
    for (const a of ACCOUNT_REGISTRY) {
      const dbType = a.contra ? `contra_${a.category}` : a.category;
      expect(groupNameForType(dbType)).toBe(EXPECTED[a.category]);
    }
  });
});

// ───────────────────────────────────────────── 2. the exhibit

describe("the five tiles", () => {
  test("order and anchors are Lee's grammar", () => {
    expect(CLASS_TILES.map((t) => t.id)).toEqual(["asset", "liability", "equity", "revenue", "expense"]);
    expect(CLASS_TILES.map((t) => t.label)).toEqual(["ASSETS", "LIABILITIES", "EQUITY", "REVENUES", "EXPENSES"]);
    expect(CLASS_TILES.map((t) => t.anchor)).toEqual(["OWN", "OWE", "VALUE", "EARN", "COST"]);
  });
  test("A/L/E sit on the balance sheet, R/X on the income statement", () => {
    expect(CLASS_TILES.filter((t) => t.side === "BS").map((t) => t.id)).toEqual(["asset", "liability", "equity"]);
    expect(CLASS_TILES.filter((t) => t.side === "IS").map((t) => t.id)).toEqual(["revenue", "expense"]);
  });
  test("all five anchors carry MUST KNOW", () => {
    for (const t of CLASS_TILES) expect(t.cue).toBe("must");
  });
  test("the cram set stays small and every chip is a real account of that type", () => {
    for (const t of CLASS_TILES) {
      expect(t.cram.length).toBeGreaterThanOrEqual(3);
      expect(t.cram.length).toBeLessThanOrEqual(6);
      for (const id of t.cram) {
        const a = account(id);
        expect(a, `cram chip "${id}" is not in the registry`).toBeDefined();
        expect(a!.category).toBe(t.id);
      }
    }
  });
  test("the cram set is a SUBSET of the registry — the full list lives in the depth layer", () => {
    const cram = CLASS_TILES.flatMap((t) => t.cram);
    expect(cram.length).toBeLessThan(ACCOUNT_REGISTRY.length);
    for (const cat of CLASS_TERM_TILES) {
      const shown = termGroups(cat).flatMap((g) => g.accounts).length;
      expect(shown).toBeGreaterThan(classTile(cat)!.cram.length);
    }
  });
});

describe("the traps band — audited copy, Bible law 3", () => {
  test("seven traps, in the taught order", () => {
    expect(CLASS_TRAPS.map((t) => t.label)).toEqual([
      "Accounts Receivable", "Anything “Payable”", "Prepaid ___", "Unearned Revenue",
      "Dividends", "Accumulated Depreciation", "Cost of Goods Sold",
    ]);
  });
  test("each trap resolves to its true destination", () => {
    expect(CLASS_TRAPS.map(trapDestination)).toEqual([
      "ASSET", "LIABILITY", "ASSET", "LIABILITY", "CONTRA-EQUITY", "CONTRA-ASSET", "EXPENSE",
    ]);
  });
  test("the importance tags are as authored — Unearned Revenue is the MUST KNOW", () => {
    const tags = Object.fromEntries(CLASS_TRAPS.map((t) => [t.id, trapTag(t)]));
    expect(tags["trap-unearned"]).toBe("must");
    expect(tags["trap-accumdep"]).toBe("aplus");
    for (const id of ["trap-ar", "trap-payable", "trap-prepaid", "trap-dividends", "trap-cogs"]) {
      expect(tags[id]).toBe("easy");
    }
  });
  test("the exact one-liners", () => {
    const note = (id: string) => trapNote(CLASS_TRAPS.find((t) => t.id === id)!);
    expect(note("trap-ar")).toBe("Cash we expect to RECEIVE — you own that claim.");
    expect(note("trap-payable")).toBe("Payables are ALWAYS liabilities — cash we expect to PAY.");
    expect(note("trap-prepaid")).toBe("Prepaids are ALWAYS assets — bought upfront, used later.");
    expect(note("trap-unearned")).toBe("“Revenue” in the name, liability in reality — you OWE the service.");
    expect(note("trap-dividends")).toBe("Not an expense. Retained earnings paid back to owners — reduces equity.");
    expect(note("trap-accumdep")).toBe("“Contra” = opposite-of. Rides with assets, reduces them.");
    expect(note("trap-cogs")).toBe("Inventory is an asset UNTIL it sells — then it becomes this expense.");
  });
  test("account-backed traps take their copy FROM the registry — never duplicated", () => {
    for (const t of CLASS_TRAPS.filter((x) => x.accountId)) {
      const a = account(t.accountId!)!;
      expect(a.trap, `${a.label} must carry its trap in the registry`).toBeDefined();
      expect(trapNote(t)).toBe(a.trap!.note);
      expect(trapCategory(t)).toBe(a.category);
      // …and the config file must not restate it.
      expect(configSrc).not.toContain(a.trap!.note);
    }
    // Only the two PATTERN chips are rules rather than accounts.
    expect(CLASS_TRAPS.filter((t) => !t.accountId).map((t) => t.id)).toEqual(["trap-payable", "trap-prepaid"]);
  });
  test("every registry trap account is surfaced by the band", () => {
    const banded = CLASS_TRAPS.map((t) => t.accountId).filter(Boolean);
    for (const a of trapAccounts()) expect(banded).toContain(a.id);
  });
});

describe("the Current / Long-term depth layer", () => {
  test("it covers assets and liabilities only", () => {
    expect([...CLASS_TERM_TILES]).toEqual(["asset", "liability"]);
  });
  test("both piles are populated for both categories", () => {
    for (const cat of CLASS_TERM_TILES) {
      for (const g of termGroups(cat)) expect(g.accounts.length).toBeGreaterThan(0);
    }
  });
  test("it partitions the category — nothing lost, nothing doubled", () => {
    for (const cat of CLASS_TERM_TILES) {
      const shown = termGroups(cat).flatMap((g) => g.accounts).map((a) => a.id).sort();
      expect(shown).toEqual(accountsIn(cat).map((a) => a.id).sort());
    }
  });
  test("intangibles appear only in the long-term asset pile", () => {
    const current = termGroups("asset").find((g) => g.key === "current")!.accounts;
    const longterm = termGroups("asset").find((g) => g.key === "longterm")!.accounts;
    expect(current.some((a) => a.intangible)).toBe(false);
    expect(longterm.filter((a) => a.intangible).map((a) => a.label)).toEqual(["Trademarks", "Copyrights", "Patents", "Goodwill"]);
  });
  test("the cram state never shows an intangible", () => {
    const cram = CLASS_TILES.flatMap((t) => t.cram);
    for (const a of ACCOUNT_REGISTRY.filter((x) => x.intangible)) expect(cram).not.toContain(a.id);
  });
});

describe("reveal sequence", () => {
  test("four authored states: tiles → anchors → chips → traps", () => {
    expect([...CLASS_REVEAL_STEPS]).toEqual(["tiles", "anchors", "chips", "traps"]);
    expect(CLASS_REVEAL_MAX).toBe(3);
  });
  test("visibility is cumulative and tick 0 is the bare tiles", () => {
    expect(classBandVisible("tiles", 0)).toBe(true);
    expect(classBandVisible("anchors", 0)).toBe(false);
    expect(classBandVisible("anchors", 1)).toBe(true);
    expect(classBandVisible("chips", 1)).toBe(false);
    expect(classBandVisible("traps", 2)).toBe(false);
    expect(classBandVisible("traps", 3)).toBe(true);
  });
  test("the Current/Long-term toggle is NOT a reveal band", () => {
    const steps = [...CLASS_REVEAL_STEPS] as string[];
    expect(steps).not.toContain("term");
    expect(steps).not.toContain("current");
  });
});

describe("declarations + wiring", () => {
  test("node ids are unique across tiles, chips and traps", () => {
    const ids = classNodeIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("asset");
    expect(ids).toContain(acctNodeId("cash"));
    expect(ids).toContain("trap-unearned");
  });
  test("film surfaces render the sequence; other surfaces are always full", () => {
    expect(cardSrc).toContain("!film || classBandVisible(band, revealTick)");
  });
  test("an unrevealed element can never be resurrected by a spotlight", () => {
    const fn = cardSrc.slice(cardSrc.indexOf("const emphasisIn"), cardSrc.indexOf("/** Full bloom"));
    expect(fn).toContain("...emphasis(nodeId)");
    expect(fn.indexOf("opacity: 0")).toBeGreaterThan(fn.indexOf("...emphasis(nodeId)"));
  });
  test("emphasis is opacity/filter only — nothing moves (A3 law)", () => {
    const emph = cardSrc.slice(cardSrc.indexOf("const emphasis = "), cardSrc.indexOf("/** Hidden (unrevealed)"));
    expect(emph).not.toMatch(/transform|width|height|margin|padding/);
  });
  test("NO drag-and-drop in this build — clicking is the whole interaction", () => {
    expect(cardSrc).not.toMatch(/onDragStart|onDrop|draggable=|dnd/i);
  });
  test("the card writes no account copy of its own — it all comes from config", () => {
    for (const s of ["Unearned Revenue", "Accounts Receivable", "Prepaids are ALWAYS", "OWN", "OWE"]) {
      expect(cardSrc.split(`"${s}"`).length - 1).toBe(0);
    }
  });
  test("selection rides the shared highlight store, so ` clears it for free", () => {
    expect(cardSrc).toContain("hl.clear();");
    expect(cardSrc).toContain("ids.forEach((n) => hl.cycle(n));");
  });
});
