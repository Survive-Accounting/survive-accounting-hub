import { describe, expect, test } from "bun:test";

import {
  autoBalance,
  balanceState,
  blankFrom,
  effectiveMode,
  effectiveSettings,
  ensureMinLines,
  groupCoa,
  groupLines,
  hasAttempt,
  hopLine,
  hopTo,
  hopToEnd,
  insertLine,
  moveLine,
  normalizePreset,
  orderLines,
  placeLine,
  sideOf,
  swapLines,
  flipSides,
  jeTabTarget,
  memoKindOf,
  memoLeaderGeom,
  memoOf,
  upsertMemo,
  JE_PRESETS,
} from "./je-logic";
import type { JeLine } from "./types";

const L = (id: string, side: "dr" | "cr", amt: number | null = 100, extra: Partial<JeLine> = {}): JeLine => ({
  id,
  account: `acct ${id}`,
  dr: side === "dr" ? amt : null,
  cr: side === "cr" ? amt : null,
  side,
  ...extra,
});

describe("sideOf", () => {
  test("explicit side wins; legacy lines derive from amounts", () => {
    expect(sideOf({ id: "x", account: "", dr: null, cr: 50 })).toBe("cr"); // legacy credit
    expect(sideOf({ id: "x", account: "", dr: 50, cr: null })).toBe("dr");
    expect(sideOf({ id: "x", account: "", dr: null, cr: null })).toBe("dr"); // blank defaults debit
    expect(sideOf({ id: "x", account: "", dr: null, cr: 50, side: "dr" })).toBe("dr"); // explicit wins
  });
});

describe("moveLine", () => {
  test("dr → cr at index keeps amount in the credit column", () => {
    const lines = [L("a", "dr"), L("b", "dr", 40), L("c", "cr", 140)];
    const out = moveLine(lines, "b", "cr", 0);
    const g = groupLines(out);
    expect(g.dr.map((l) => l.id)).toEqual(["a"]);
    expect(g.cr.map((l) => l.id)).toEqual(["b", "c"]);
    const b = out.find((l) => l.id === "b")!;
    expect(b.cr).toBe(40);
    expect(b.dr).toBeNull();
  });

  test("reorder within a side", () => {
    const lines = [L("a", "dr"), L("b", "dr"), L("c", "cr")];
    const out = moveLine(lines, "a", "dr", 1);
    expect(groupLines(out).dr.map((l) => l.id)).toEqual(["b", "a"]);
  });

  test("index clamps to the end", () => {
    const lines = [L("a", "dr"), L("c", "cr")];
    const out = moveLine(lines, "a", "cr", 99);
    expect(groupLines(out).cr.map((l) => l.id)).toEqual(["c", "a"]);
  });
});

describe("swapLines", () => {
  test("dropping one account on another swaps their sides, amounts travel", () => {
    const lines = [L("a", "dr", 100), L("b", "cr", 100)];
    const out = swapLines(lines, "a", "b");
    const a = out.find((l) => l.id === "a")!;
    const b = out.find((l) => l.id === "b")!;
    expect(sideOf(a)).toBe("cr");
    expect(a.cr).toBe(100);
    expect(a.dr).toBeNull();
    expect(sideOf(b)).toBe("dr");
    expect(b.dr).toBe(100);
  });

  test("same-side swap is a no-op on sides", () => {
    const lines = [L("a", "dr"), L("b", "dr")];
    const out = swapLines(lines, "a", "b");
    expect(out.every((l) => sideOf(l) === "dr")).toBe(true);
  });
});

describe("hopLine", () => {
  test("← / → moves a line to the other side's end", () => {
    const lines = [L("a", "dr"), L("b", "cr")];
    const out = hopLine(lines, "a");
    expect(groupLines(out).cr.map((l) => l.id)).toEqual(["b", "a"]);
    const back = hopLine(out, "a");
    expect(groupLines(back).dr.map((l) => l.id)).toEqual(["a"]);
  });
});

describe("placeLine (socket drop — array order is render order)", () => {
  const lines = [L("a", "dr"), L("b", "dr"), L("c", "cr")];
  test("inserts at the gap index with the chosen side; amount travels", () => {
    const out = placeLine(lines, "c", "dr", 0);
    expect(out.map((l) => l.id)).toEqual(["c", "a", "b"]);
    const c = out.find((l) => l.id === "c")!;
    expect(sideOf(c)).toBe("dr");
    expect(c.dr).toBe(100);
    expect(c.cr).toBeNull();
  });
  test("index clamps; unknown id is a no-op", () => {
    expect(placeLine(lines, "a", "cr", 99).map((l) => l.id)).toEqual(["b", "c", "a"]);
    expect(placeLine(lines, "zzz", "dr", 0)).toBe(lines);
  });
});

describe("insertLine (add-line nook lands adjacent to its column)", () => {
  const nl = { id: "n", account: "", dr: null, cr: null };
  test("after the last same-side line", () => {
    const out = insertLine([L("a", "dr"), L("b", "cr"), L("c", "dr")], "dr", { ...nl });
    expect(out.map((l) => l.id)).toEqual(["a", "b", "c", "n"]);
    const out2 = insertLine([L("a", "dr"), L("b", "cr"), L("c", "dr")], "cr", { ...nl });
    expect(out2.map((l) => l.id)).toEqual(["a", "b", "n", "c"]);
  });
  test("fallbacks: debit → top, credit → bottom", () => {
    expect(insertLine([L("b", "cr")], "dr", { ...nl }).map((l) => l.id)).toEqual(["n", "b"]);
    expect(insertLine([L("a", "dr")], "cr", { ...nl }).map((l) => l.id)).toEqual(["a", "n"]);
  });
});

describe("hopTo (A6 regression + V2 in-place contract)", () => {
  const lines = [L("a", "dr"), L("b", "dr"), L("c", "cr")];
  test("flips exactly the selected id — never a neighbor", () => {
    const out = hopTo(lines, "a", "cr")!;
    expect(sideOf(out.find((l) => l.id === "a")!)).toBe("cr");
    expect(sideOf(out.find((l) => l.id === "b")!)).toBe("dr"); // b (the block below a) did NOT move
    const a = out.find((l) => l.id === "a")!;
    expect(a.cr).toBe(100); // amount travels into the credit column
    expect(a.dr).toBeNull();
  });
  test("PRESERVES the array index — the block shifts in place, never to the bottom", () => {
    const out = hopTo(lines, "a", "cr")!;
    expect(out.map((l) => l.id)).toEqual(["a", "b", "c"]); // order untouched
    const back = hopTo(out, "c", "dr")!;
    expect(back.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(sideOf(back.find((l) => l.id === "c")!)).toBe("dr");
  });
  test("no selection / unknown id / already on that side → null (no undo step)", () => {
    expect(hopTo(lines, undefined, "cr")).toBeNull();
    expect(hopTo(lines, "zzz", "cr")).toBeNull();
    expect(hopTo(lines, "a", "dr")).toBeNull();
  });
});

describe("balanceState (the ??? contract)", () => {
  test("any visible null amount → unknown, even if the rest balances", () => {
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 100), L("c", "cr", null)]).state).toBe("unknown");
  });
  test("hidden lines don't count", () => {
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 100), L("c", "cr", null, { hidden: true })]).state).toBe("balanced");
  });
  test("all-real amounts do the math", () => {
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 60)]).state).toBe("off");
    expect(balanceState([L("a", "dr", 100), L("b", "cr", 100)]).state).toBe("balanced");
  });
  test("empty card is unknown, not balanced", () => {
    expect(balanceState([L("a", "dr", null), L("b", "cr", null)]).state).toBe("unknown");
  });
});

describe("effectiveSettings (two modes)", () => {
  test("presets apply; per-card overrides win", () => {
    expect(effectiveSettings(undefined, "guided").showPicker).toBe(true);
    expect(effectiveSettings(undefined, "practice").showPicker).toBe(false);
    expect(effectiveSettings({ showPicker: true }, "practice").showPicker).toBe(true);
  });
  test("NEVER zero-grid: ghost sockets ship on in both presets", () => {
    expect(JE_PRESETS.guided.showGhosts).toBe(true);
    expect(JE_PRESETS.practice.showGhosts).toBe(true);
  });
  test("retired keys in old per-card overrides are ignored, not spread in", () => {
    const s = effectiveSettings({ allowSearch: false, showAmounts: false } as never, "guided");
    expect("allowSearch" in s).toBe(false);
    expect("showAmounts" in s).toBe(false);
    expect(s.showPicker).toBe(true);
  });
});

describe("mode normalization (blind retired)", () => {
  test("legacy blind reads as practice; unknown falls back to guided", () => {
    expect(normalizePreset("blind")).toBe("practice");
    expect(normalizePreset("practice")).toBe("practice");
    expect(normalizePreset("guided")).toBe("guided");
    expect(normalizePreset(undefined)).toBe("guided");
    expect(normalizePreset("nonsense")).toBe("guided");
  });
  test("per-card mode wins over the canvas default", () => {
    expect(effectiveMode("practice", "guided")).toBe("practice");
    expect(effectiveMode(undefined, "practice")).toBe("practice");
    expect(effectiveMode("blind" as never, "guided")).toBe("guided"); // invalid card mode → canvas default
  });
});

describe("ensureMinLines (the never-zero invariant)", () => {
  let seq = 0;
  const mkId = () => `n${++seq}`;
  test("deleting a whole side re-spawns one blank socket there", () => {
    const out = ensureMinLines([L("a", "dr")], mkId);
    const g = groupLines(out);
    expect(g.dr.map((l) => l.id)).toEqual(["a"]);
    expect(g.cr.length).toBe(1);
    expect(g.cr[0].account).toBe("");
  });
  test("empty card gets 1 debit + 1 credit", () => {
    const g = groupLines(ensureMinLines([], mkId));
    expect(g.dr.length).toBe(1);
    expect(g.cr.length).toBe(1);
  });
  test("a full card is untouched", () => {
    const lines = [L("a", "dr"), L("b", "cr")];
    expect(ensureMinLines(lines, mkId)).toBe(lines);
  });
});

describe("hasAttempt (practice reveal gate)", () => {
  test("blank sockets = no attempt; any typed account or amount counts", () => {
    const blank = { id: "x", account: "", dr: null, cr: null, side: "dr" as const };
    expect(hasAttempt([blank, { ...blank, id: "y", side: "cr" as const }])).toBe(false);
    expect(hasAttempt([{ ...blank, account: "Cash" }])).toBe(true);
    expect(hasAttempt([{ ...blank, dr: 100 }])).toBe(true);
  });
  test("hidden lines don't count as an attempt", () => {
    expect(hasAttempt([{ id: "x", account: "Cash", dr: 100, cr: null, hidden: true }])).toBe(false);
  });
});

describe("blankFrom (practice copy silhouette)", () => {
  test("same shape, fresh ids, no content", () => {
    let seq = 0;
    const out = blankFrom([L("a", "dr", 100), L("b", "dr", 40), L("c", "cr", 140)], () => `p${++seq}`);
    const g = groupLines(out);
    expect(g.dr.length).toBe(2);
    expect(g.cr.length).toBe(1);
    expect(out.every((l) => l.account === "" && l.dr === null && l.cr === null)).toBe(true);
    expect(out.map((l) => l.id)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("groupCoa", () => {
  test("5 groups in teaching order; contra rides with its parent", () => {
    const rows = [
      { canonical_name: "Cash", account_type: "asset", normal_balance: "debit" },
      { canonical_name: "Accumulated Depreciation", account_type: "contra_asset", normal_balance: "credit" },
      { canonical_name: "Accounts Payable", account_type: "liability", normal_balance: "credit" },
      { canonical_name: "Premium on Bonds Payable", account_type: "liability_adjunct", normal_balance: "credit" },
      { canonical_name: "Common Stock", account_type: "equity", normal_balance: "credit" },
      { canonical_name: "Sales Revenue", account_type: "revenue", normal_balance: "credit" },
      { canonical_name: "Rent Expense", account_type: "expense", normal_balance: "debit" },
    ];
    const g = groupCoa(rows);
    expect(g.map((x) => x.label)).toEqual(["Assets", "Liabilities", "Equity", "Revenue", "Expenses"]);
    expect(g[0].accounts.map((a) => a.name)).toEqual(["Accumulated Depreciation", "Cash"]);
    expect(g[1].accounts.map((a) => a.name)).toEqual(["Accounts Payable", "Premium on Bonds Payable"]);
    expect(g[0].normal).toBe("debit");
  });
});

// ---- PROMPT A: memos (text + calc), calc alignment, date ----

import { calcRows, fmtJeDate, memoOf, memosOf, patchMemo, textMemoOf, upsertMemo } from "./je-logic";

describe("memosOf / textMemoOf (legacy label fallback)", () => {
  test("legacy label synthesizes a text memo carrying pos/open", () => {
    const l = L("a", "dr", 100, { label: "why this line", memoPos: { x: 5, y: 6 }, memoOpen: true });
    const ms = memosOf(l);
    expect(ms).toHaveLength(1);
    expect(ms[0].kind).toBe("text");
    expect(ms[0].text).toBe("why this line");
    expect(ms[0].pos).toEqual({ x: 5, y: 6 });
    expect(ms[0].open).toBe(true);
    expect(textMemoOf(l)).toBe("why this line");
  });

  test("memos array wins over legacy label; no memos → empty", () => {
    const l = L("a", "dr", 100, { label: "old", memos: [{ id: "m1", kind: "calc", text: "2+2 = 4" }] });
    expect(memosOf(l).map((m) => m.kind)).toEqual(["calc"]);
    expect(textMemoOf(l)).toBeUndefined();
    expect(memosOf(L("b", "cr"))).toEqual([]);
  });
});

describe("upsertMemo (one per kind; text keeps label in sync)", () => {
  test("a line carries BOTH a text and a calc memo", () => {
    const l = L("a", "dr");
    const withText = { ...l, ...upsertMemo(l, "text", "prose why") } as typeof l;
    const withBoth = { ...withText, ...upsertMemo(withText, "calc", "500,000 × 8% × 6/12 = 20,000") } as typeof l;
    expect(memosOf(withBoth).map((m) => m.kind).sort()).toEqual(["calc", "text"]);
    expect(withBoth.label).toBe("prose why"); // doc round-trip stays intact
    expect(memoOf(withBoth, "calc")!.text).toContain("20,000");
  });

  test("replacing a kind keeps its pos/open; empty text removes it (and label for text)", () => {
    const l = L("a", "dr", 100, { memos: [{ id: "m", kind: "text", text: "v1", pos: { x: 1, y: 2 }, open: true }], label: "v1" });
    const replaced = { ...l, ...upsertMemo(l, "text", "v2") } as typeof l;
    expect(memoOf(replaced, "text")).toMatchObject({ text: "v2", pos: { x: 1, y: 2 }, open: true });
    expect(replaced.label).toBe("v2");
    const removed = { ...replaced, ...upsertMemo(replaced, "text", "") } as typeof l;
    expect(memoOf(removed, "text")).toBeUndefined();
    expect(removed.label).toBeUndefined();
  });
});

describe("patchMemo", () => {
  test("patches one kind's pos/open without touching siblings", () => {
    const l = L("a", "dr", 100, {
      memos: [
        { id: "t", kind: "text", text: "t", pos: { x: 0, y: 0 } },
        { id: "c", kind: "calc", text: "c" },
      ],
    });
    const out = { ...l, ...patchMemo(l, "calc", { pos: { x: 9, y: 9 }, open: true }) } as typeof l;
    expect(memoOf(out, "calc")).toMatchObject({ pos: { x: 9, y: 9 }, open: true });
    expect(memoOf(out, "text")!.pos).toEqual({ x: 0, y: 0 });
  });
});

describe("calcRows (= alignment)", () => {
  test("splits each line at its LAST =; lines without = span full width", () => {
    expect(calcRows("500,000 × 8% × 6/12 = 20,000\nsubtotal\n1 + 1 = 2 = 2")).toEqual([
      { left: "500,000 × 8% × 6/12", right: "20,000" },
      { left: "subtotal", right: null },
      { left: "1 + 1 = 2", right: "2" },
    ]);
  });

  test("blank lines dropped", () => {
    expect(calcRows("a = 1\n\n\nb = 2")).toHaveLength(2);
  });
});

describe("fmtJeDate", () => {
  const now = new Date("2026-07-14T12:00:00Z");
  test("same year → 'Jan 15'; other year appends it; bad input → null", () => {
    expect(fmtJeDate("2026-01-15", now)).toBe("Jan 15");
    expect(fmtJeDate("2025-12-31", now)).toBe("Dec 31, 2025");
    expect(fmtJeDate(undefined, now)).toBeNull();
    expect(fmtJeDate("not-a-date", now)).toBeNull();
    expect(fmtJeDate("2026-13-05", now)).toBeNull();
  });
});

// ---- #1: DEBIT/CREDIT INVARIANT (canonical grouped shape) --------------------
describe("orderLines + hopToEnd (DR/CR invariant — no interleave)", () => {
  const isGrouped = (ls: JeLine[]) => {
    // every debit index precedes every credit index
    const sides = ls.map(sideOf);
    const firstCr = sides.indexOf("cr");
    return firstCr === -1 || !sides.slice(firstCr).includes("dr");
  };

  test("orderLines groups an interleaved array (dr, cr, dr) → dr,dr,cr", () => {
    const interleaved = [L("a", "dr"), L("b", "cr"), L("c", "dr")];
    const out = orderLines(interleaved);
    expect(out.map((l) => l.id)).toEqual(["a", "c", "b"]);
    expect(isGrouped(out)).toBe(true);
  });

  test("orderLines is idempotent + preserves within-side entry order", () => {
    const ls = [L("a", "dr"), L("b", "dr"), L("c", "cr"), L("d", "cr")];
    const once = orderLines(ls);
    expect(orderLines(once)).toEqual(once);
    expect(once.map((l) => l.id)).toEqual(["a", "b", "c", "d"]);
  });

  test("hopToEnd lands the line at the END of the target side's group", () => {
    const ls = [L("a", "dr"), L("b", "dr"), L("c", "cr")];
    const out = hopToEnd(ls, "a", "cr")!; // debit a → credits
    expect(out.map((l) => l.id)).toEqual(["b", "c", "a"]); // a is last credit
    expect(sideOf(out.find((l) => l.id === "a")!)).toBe("cr");
    expect(isGrouped(out)).toBe(true);
  });

  test("hopToEnd is a no-op (null) when the line is already on that side / missing", () => {
    const ls = [L("a", "dr"), L("b", "cr")];
    expect(hopToEnd(ls, "a", "dr")).toBeNull();
    expect(hopToEnd(ls, undefined, "cr")).toBeNull();
    expect(hopToEnd(ls, "zzz", "cr")).toBeNull();
  });

  test("ARBITRARY hop sequence never interleaves (fuzz)", () => {
    let ls: JeLine[] = [L("a", "dr"), L("b", "cr"), L("c", "dr"), L("d", "cr"), L("e", "dr")];
    const ids = ["a", "b", "c", "d", "e"];
    const sides: JeSide[] = ["dr", "cr"];
    // deterministic pseudo-random walk of 40 hops
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    for (let i = 0; i < 40; i++) {
      const id = ids[rnd(ids.length)];
      const to = sides[rnd(2)];
      const next = hopToEnd(orderLines(ls), id, to);
      if (next) ls = next;
      expect(isGrouped(orderLines(ls))).toBe(true);
    }
    // both sides always retain at least their survivors, grouped
    expect(isGrouped(orderLines(ls))).toBe(true);
  });
});

describe("memo default pointer (J2/J3)", () => {
  const line: JeLine = { id: "l1", account: "Cash", dr: 100, cr: null, side: "dr" };

  test("a freshly-created memo carries an OPEN box (the pointer's precondition)", () => {
    const patch = upsertMemo(line, "text", "why cash", { open: true, pos: { x: 300, y: 40 } });
    const m = memoOf({ ...line, ...patch }, "text");
    expect(m).toBeTruthy();
    expect(m!.open).toBe(true);
    expect(m!.pos).toEqual({ x: 300, y: 40 });
  });

  test("a new memo yields a NON-DEGENERATE leader to its own block", () => {
    // default spawn is to the RIGHT of the block: memo left edge → block right edge
    const g = memoLeaderGeom({ boxX: 300, boxY: 40, boxW: 190, blockInd: 0, blockW: 280, rowIndex: 0, blockH: 36 });
    expect(g.mx).not.toBe(g.bx); // visible span, never a zero-length arrow
    expect(g.mx).toBe(300); // leaves the memo's left edge (memo is right of block)
    expect(g.bx).toBe(280); // lands on the block's right edge
    expect(g.by).toBe(18); // row 0 mid
  });

  test("a memo LEFT of its block points from the memo's RIGHT edge", () => {
    const g = memoLeaderGeom({ boxX: -220, boxY: 0, boxW: 190, blockInd: 0, blockW: 280, rowIndex: 0, blockH: 36 });
    expect(g.mx).toBe(-30); // memo right edge (-220 + 190)
    expect(g.bx).toBe(0); // block left edge
  });

  test("re-target (J3) aims the leader at the TARGET row, not the memo's own", () => {
    const g = memoLeaderGeom({ boxX: 300, boxY: 0, boxW: 190, blockInd: 40, blockW: 280, rowIndex: 2, blockH: 36 });
    expect(g.by).toBe(2 * 36 + 18); // row 2 mid
  });
});

describe("memos as objects — edit after creation (Phase 1)", () => {
  const base: JeLine = { id: "l9", account: "Cash", dr: 100, cr: null, side: "dr" };

  test("memoKindOf: explicit wins; else derived from structural kind", () => {
    expect(memoKindOf({ id: "m", kind: "text", text: "x" })).toBe("note");
    expect(memoKindOf({ id: "m", kind: "calc", text: "x" })).toBe("calc");
    expect(memoKindOf({ id: "m", kind: "text", text: "x", memoKind: "trap" })).toBe("trap");
  });

  test("upsert then RE-EDIT preserves title/memoKind/category when body-only changes", () => {
    let l: JeLine = { ...base, ...upsertMemo(base, "text", "watch this", { title: "Gotcha", memoKind: "trap", category: "exam" }) };
    let m = memoOf(l, "text")!;
    expect(m.title).toBe("Gotcha");
    expect(m.memoKind).toBe("trap");
    expect(m.category).toBe("exam");
    // re-edit body only (extra omits the fields) → they survive
    l = { ...l, ...upsertMemo(l, "text", "watch this closely") };
    m = memoOf(l, "text")!;
    expect(m.text).toBe("watch this closely");
    expect(m.title).toBe("Gotcha");
    expect(m.memoKind).toBe("trap");
    expect(m.category).toBe("exam");
  });

  test("re-edit CAN change kind/category (extra overrides)", () => {
    let l: JeLine = { ...base, ...upsertMemo(base, "text", "b", { memoKind: "note", category: "a" }) };
    l = { ...l, ...upsertMemo(l, "text", "b", { memoKind: "cheat", category: "b" }) };
    const m = memoOf(l, "text")!;
    expect(m.memoKind).toBe("cheat");
    expect(m.category).toBe("b");
  });
});

describe("Tab walk-and-wrap (JT1)", () => {
  const t = (lines: JeLine[], id: string, w: "account" | "amount", back = false) => {
    const r = jeTabTarget(lines, id, w, back);
    return r ? `${r.lineId}:${r.which}` : null;
  };
  test("1DR/1CR forward: DR acct → DR amt → CR acct → CR amt → (wrap) DR acct", () => {
    const ls = [L("d", "dr"), L("c", "cr")];
    expect(t(ls, "d", "account")).toBe("d:amount");
    expect(t(ls, "d", "amount")).toBe("c:account");
    expect(t(ls, "c", "account")).toBe("c:amount");
    expect(t(ls, "c", "amount")).toBe("d:account"); // WRAP
  });
  test("Shift+Tab walks backwards and wraps", () => {
    const ls = [L("d", "dr"), L("c", "cr")];
    expect(t(ls, "d", "account", true)).toBe("c:amount"); // wrap back
    expect(t(ls, "c", "account", true)).toBe("d:amount");
    expect(t(ls, "d", "amount", true)).toBe("d:account");
  });
  test("2DR/1CR: DR0 amt → DR1 acct, DR1 amt → CR acct", () => {
    const ls = [L("d0", "dr"), L("d1", "dr"), L("c", "cr")];
    expect(t(ls, "d0", "amount")).toBe("d1:account");
    expect(t(ls, "d1", "amount")).toBe("c:account");
    expect(t(ls, "c", "amount")).toBe("d0:account"); // wrap
  });
  test("credit-first: Tab past the CREDIT amount WRAPS to the debit, never spawns", () => {
    // orderLines re-sorts to [dr, cr]; the credit's amount is the last field
    const ls = [L("c", "cr"), L("d", "dr")];
    expect(t(ls, "c", "amount")).toBe("d:account");
  });
});

describe("flipSides (JT4)", () => {
  test("swaps every side, preserves account/amount/id, re-sorts shape", () => {
    const ls = [L("a", "dr", 100, { account: "Cash" }), L("b", "cr", 100, { account: "Revenue" })];
    const f = flipSides(ls);
    // re-sorted: debits first — the old credit (Revenue) is now the debit
    expect(f.map((l) => l.id)).toEqual(["b", "a"]);
    const b = f.find((l) => l.id === "b")!;
    const a = f.find((l) => l.id === "a")!;
    expect(sideOf(b)).toBe("dr");
    expect(b.account).toBe("Revenue");
    expect(b.dr).toBe(100);
    expect(b.cr).toBeNull();
    expect(sideOf(a)).toBe("cr");
    expect(a.cr).toBe(100);
  });
  test("2DR/1CR flips to 1DR/2CR (double flip is identity on sides)", () => {
    const ls = [L("d0", "dr"), L("d1", "dr"), L("c", "cr")];
    const f = flipSides(ls);
    expect(f.filter((l) => sideOf(l) === "cr").map((l) => l.id).sort()).toEqual(["d0", "d1"]);
    expect(f.filter((l) => sideOf(l) === "dr").map((l) => l.id)).toEqual(["c"]);
    const back = flipSides(f);
    expect(back.filter((l) => sideOf(l) === "dr").map((l) => l.id).sort()).toEqual(["d0", "d1"]);
  });
});

describe("autoBalance (guided amount echo, item 1)", () => {
  const dr = (id: string, amt: number | null): JeLine => ({ id, account: "", dr: amt, cr: null, side: "dr" });
  const cr = (id: string, amt: number | null): JeLine => ({ id, account: "", dr: null, cr: amt, side: "cr" });

  test("entering one debit auto-fills the sole empty credit, marked echo", () => {
    const out = autoBalance([dr("d", 10000), cr("c", null)]);
    const c = out.find((l) => l.id === "c")!;
    expect(c.cr).toBe(10000);
    expect(c.echo).toBe(true);
  });

  test("blank card (both empty) stays blank — nothing determinate", () => {
    const out = autoBalance([dr("d", null), cr("c", null)]);
    expect(out.every((l) => l.dr == null && l.cr == null)).toBe(true);
    expect(out.some((l) => l.echo)).toBe(false);
  });

  test("hand-typed amounts are never clobbered (two typed → unbalanced, no echo)", () => {
    const out = autoBalance([dr("d", 10000), cr("c", 8000)]);
    expect(out.find((l) => l.id === "d")!.dr).toBe(10000);
    expect(out.find((l) => l.id === "c")!.cr).toBe(8000);
    expect(out.some((l) => l.echo)).toBe(false);
  });

  test("adding a 3rd hand-typed line re-derives the one echo cell", () => {
    // dr 10000 (typed) + dr 3000 (typed) + cr echo → cr recomputes to 13000
    const out = autoBalance([dr("d1", 10000), dr("d2", 3000), { id: "c", account: "", dr: null, cr: 10000, side: "cr", echo: true }]);
    const c = out.find((l) => l.id === "c")!;
    expect(c.cr).toBe(13000);
    expect(c.echo).toBe(true);
  });

  test("two open cells on a side → ambiguous, no echo", () => {
    const out = autoBalance([dr("d", 10000), cr("c1", null), cr("c2", null)]);
    expect(out.some((l) => l.echo)).toBe(false);
  });

  test("idempotent — re-running does not change a settled echo", () => {
    const once = autoBalance([dr("d", 500), cr("c", null)]);
    const twice = autoBalance(once);
    expect(twice.find((l) => l.id === "c")!.cr).toBe(500);
    expect(twice.find((l) => l.id === "c")!.echo).toBe(true);
  });

  test("non-positive balancing figure is not committed", () => {
    // debits already exceed credits; the sole open debit can't be a positive echo
    const out = autoBalance([dr("d1", 1000), dr("d2", null), cr("c", 500)]);
    expect(out.find((l) => l.id === "d2")!.dr).toBeNull();
    expect(out.some((l) => l.echo)).toBe(false);
  });
});
