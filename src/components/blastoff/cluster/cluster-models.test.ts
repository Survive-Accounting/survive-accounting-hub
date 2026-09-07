// THE BRIDGE, pinned against the models it bridges: the registry's categories, the ledger's
// posting math, equation-derive's arrows. Same fixture shape as cluster-spec.test.ts.
import { describe, expect, test } from "bun:test";

import { accountsIn } from "@/components/canvas/account-registry";
import { CLASS_TILES } from "@/components/canvas/classification-exhibit-config";

import {
  FIVE_TYPES, accountsFromRegistry, categoryOfLabel, equationArrowsOf, equationFromJe, fmtAmount, jeSourcesOf, jeToLines, postJe, registryCoa, resolveCluster, trialBalanceRows, typeForAccount, withArrowOverrides,
} from "./cluster-models";
import { DEFAULT_FIELD, type ClusterNode, type ClusterSpec } from "./cluster-spec";

const node = (id: string, data: ClusterNode["data"], box = { x: 0, y: 0, w: 900, h: 400 }): ClusterNode => ({ id, ...box, data });

const spec: ClusterSpec = {
  version: 1, id: "map-1", title: "Buy supplies on account", field: { ...DEFAULT_FIELD },
  nodes: [
    node("eq", { kind: "equation", arrows: { assets: "none", liabilities: "none", equity: "none" }, caption: "Supplies on account" }),
    node("je", { kind: "je", description: "Bought supplies on account", lines: [{ account: "Accounts Payable", cr: 500 }, { account: "Supplies", dr: 500, type: "A" }] }),
    node("je2", { kind: "je", description: "Paid half", lines: [{ account: "Accounts Payable", dr: 250 }, { account: "Cash", cr: 250 }] }),
    node("t-sup", { kind: "taccount", account: "Supplies", normal: "dr", fromNodes: ["je"] }),
    node("t-ap", { kind: "taccount", account: "Accounts Payable", normal: "cr", opening: 100 }),
    node("t-cash", { kind: "taccount", account: "Cash", normal: "dr", opening: 1000, posts: [{ label: "Paid rent", amount: 300, dr: false }] }),
    node("tb", { kind: "tb", fromNodes: ["t-sup", "t-ap", "t-cash"] }),
    node("types", { kind: "accounts", revealBy: "group", groups: [{ label: "Assets", accounts: [] }, { label: "Liabilities", accounts: ["Accounts Payable"], normal: "cr" }] }),
  ],
  edges: [{ from: "je", to: "eq", kind: "arrow" }, { from: "je", to: "t-ap", kind: "post" }, { from: "je2", to: "t-ap", kind: "post" }],
  shots: [],
};

describe("the registry, as the map wants it", () => {
  test("five groups in the classifier's order, every account of the category by its label, the normal side, the anchor", () => {
    const g = accountsFromRegistry();
    expect(g.map((x) => x.label)).toEqual(CLASS_TILES.map((t) => t.label));
    expect(FIVE_TYPES).toEqual(["asset", "liability", "equity", "revenue", "expense"]);
    expect(g[0].accounts).toEqual(accountsIn("asset").map((a) => a.label));
    expect(g[0].accounts[0]).toBe("Cash");
    expect(g[0].accounts[g[0].accounts.length - 1]).toBe("Accumulated Depreciation"); // the contra rides last
    expect(g.map((x) => x.normal)).toEqual(["dr", "cr", "cr", "cr", "dr"]);
    expect(g.map((x) => x.note)).toEqual(["OWN", "OWE", "VALUE", "EARN", "COST"]);
    expect(accountsFromRegistry(["revenue"]).length).toBe(1);
  });
  test("a group label names its category loosely", () => {
    expect(categoryOfLabel("ASSETS")).toBe("asset");
    expect(categoryOfLabel("Liabilities")).toBe("liability");
    expect(categoryOfLabel("equity")).toBe("equity");
    expect(categoryOfLabel("Revenues")).toBe("revenue");
    expect(categoryOfLabel("Expenses")).toBe("expense");
    expect(categoryOfLabel("Molecules")).toBeNull();
  });
  test("an account's rubric type: explicit, else the registry (aliases too), else the normal side", () => {
    expect(typeForAccount("Cash")).toBe("A");
    expect(typeForAccount("A/P")).toBe("L");
    expect(typeForAccount("Cash", "X")).toBe("X");
    expect(typeForAccount("Petty Thing", undefined, "cr")).toBe("L");
    expect(typeForAccount("Petty Thing")).toBe("A");
  });
  test("the chart of accounts types contras the canvas way", () => {
    const coa = registryCoa();
    expect(coa.get("Accumulated Depreciation")?.type).toBe("contra_asset");
    expect(coa.get("Dividends")?.type).toBe("contra_equity");
    expect(coa.get("Receivables")?.type).toBe("asset");   // an alias resolves
    expect(coa.get("Cash")?.normal).toBe("debit");
  });
});

describe("the journal entry", () => {
  test("debits first, credits after, typed from the line or the registry", () => {
    const lines = jeToLines(spec.nodes[1]);
    expect(lines.map((l) => l.account)).toEqual(["Supplies", "Accounts Payable"]);
    expect(lines.map((l) => l.type)).toEqual(["A", "L"]);
    expect(lines.map((l) => l.amount)).toEqual([500, 500]);
    expect(jeToLines(spec.nodes[0])).toEqual([]);
  });
});

describe("the T-account", () => {
  test("posts derive from fromNodes and from post edges, each je once", () => {
    expect(jeSourcesOf(spec.nodes[3], spec.nodes, spec.edges).map((n) => n.id)).toEqual(["je"]);
    expect(jeSourcesOf(spec.nodes[4], spec.nodes, spec.edges).map((n) => n.id)).toEqual(["je", "je2"]);
  });
  test("the T is the lab's: labelled posts, totals, the balance on its side", () => {
    const ap = postJe(spec.nodes[4], spec.nodes, spec.edges)!;
    expect(ap.posts.map((p) => [p.label, p.amount, p.dr])).toEqual([["Bought supplies on account", 500, false], ["Paid half", 250, true]]);
    expect(ap.opening).toBe(100);
    expect(ap.crTotal).toBe(600); expect(ap.drTotal).toBe(250);
    expect(ap.balance).toBe(350); expect(ap.side).toBe("cr");
  });
  test("explicit posts win; an account with nothing posted still gets a T", () => {
    const cash = postJe(spec.nodes[5], spec.nodes, spec.edges)!;
    expect(cash.posts.length).toBe(1);
    expect(cash.balance).toBe(700); expect(cash.side).toBe("dr");
    const lonely = postJe(node("t", { kind: "taccount", account: "Widgets", normal: "dr", opening: 40 }), [], [])!;
    expect(lonely).toMatchObject({ account: "Widgets", balance: 40, side: "dr", posts: [] });
    expect(postJe(spec.nodes[0], spec.nodes, spec.edges)).toBeNull();
  });
});

describe("the trial balance", () => {
  test("rows from the taccount nodes named, totalled; balanced when the ledger is", () => {
    const tb = trialBalanceRows(spec.nodes[6], spec.nodes, spec.edges)!;
    expect(tb.title).toBe("Trial Balance");
    expect(tb.rows).toEqual([{ account: "Supplies", dr: 500 }, { account: "Accounts Payable", cr: 350 }, { account: "Cash", dr: 700 }]);
    expect(tb.dr).toBe(1200); expect(tb.cr).toBe(350); expect(tb.balanced).toBe(false);
  });
  test("explicit rows win", () => {
    const tb = trialBalanceRows(node("tb", { kind: "tb", title: "TB", rows: [{ account: "Cash", dr: 10 }, { account: "Common Stock", cr: 10 }] }), [], [])!;
    expect(tb).toMatchObject({ title: "TB", dr: 10, cr: 10, balanced: true });
  });
});

describe("the equation", () => {
  test("a je's lines become arrows through the registry — gross, so both ways is ↑↓", () => {
    expect(equationFromJe(spec.nodes[1])).toEqual({ assets: "up", liabilities: "up", equity: "none" });
    const rev = node("j", { kind: "je", description: "Earned", lines: [{ account: "Cash", dr: 100 }, { account: "Service Revenue", cr: 100 }] });
    expect(equationFromJe(rev)).toEqual({ assets: "up", liabilities: "none", equity: "up" });
    const swap = node("j", { kind: "je", description: "Bought", lines: [{ account: "Equipment", dr: 100 }, { account: "Cash", cr: 100 }] });
    expect(equationFromJe(swap)?.assets).toBe("both");
    const typed = node("j", { kind: "je", description: "Odd", lines: [{ account: "Widget Reserve", dr: 5, type: "L" }, { account: "Cash", cr: 5 }] });
    expect(equationFromJe(typed)).toEqual({ assets: "down", liabilities: "down", equity: "none" });
  });
  test("an all-— equation with a je pointing at it takes the entry's arrows; explicit arrows win", () => {
    expect(equationArrowsOf(spec.nodes[0], spec.nodes, spec.edges)).toEqual({ assets: "up", liabilities: "up", equity: "none" });
    const own = node("eq", { kind: "equation", arrows: { assets: "down", liabilities: "none", equity: "none" } });
    expect(equationArrowsOf(own, spec.nodes, spec.edges)).toEqual({ assets: "down", liabilities: "none", equity: "none" });
    expect(equationArrowsOf(spec.nodes[0], spec.nodes, [])).toEqual({ assets: "none", liabilities: "none", equity: "none" });
  });
});

describe("resolveCluster", () => {
  test("fills every derived field so a renderer never derives", () => {
    const r = resolveCluster(spec);
    expect(r.size).toBe(spec.nodes.length);
    const eq = r.get("eq")!.view; if (eq.kind !== "equation") throw new Error("eq");
    expect(eq.arrows.assets).toBe("up"); expect(eq.caption).toBe("Supplies on account");
    const je = r.get("je")!.view; if (je.kind !== "je") throw new Error("je");
    expect(je.pieces.length).toBe(5); expect(je.totals.balanced).toBe(true); expect(je.badge).toBe("JE"); expect(je.typed).toBe(true);
    const t = r.get("t-ap")!.view; if (t.kind !== "taccount") throw new Error("t");
    expect(t.rows.map((x) => x.kind)).toEqual(["opening", "post", "post"]); expect(t.balance.amount).toBe(350);
    const tb = r.get("tb")!.view; if (tb.kind !== "tb") throw new Error("tb");
    expect(tb.tb.rows.length).toBe(3);
    const types = r.get("types")!.view; if (types.kind !== "accounts") throw new Error("types");
    expect(types.groups[0].accounts).toEqual(accountsIn("asset").map((a) => a.label)); // an empty Assets group filled from the registry
    expect(types.groups[0].normal).toBe("dr");
    expect(types.groups[1].accounts).toEqual(["Accounts Payable"]);                    // a given list kept
  });
  test("the take's arrow override sits over the resolved equation and touches nothing else", () => {
    const r = resolveCluster(spec);
    const o = withArrowOverrides(r, { eq: { equity: "both" }, je: { assets: "up" } });
    const eq = o.get("eq")!.view; if (eq.kind !== "equation") throw new Error("eq");
    expect(eq.arrows).toEqual({ assets: "up", liabilities: "up", equity: "both" });
    expect(o.get("je")).toBe(r.get("je"));
    expect(withArrowOverrides(r, undefined)).toBe(r);
  });
  test("amounts print like the ledger", () => {
    expect(fmtAmount(1200)).toBe("1,200");
    expect(fmtAmount(12.5)).toBe("12.50");
  });
});
