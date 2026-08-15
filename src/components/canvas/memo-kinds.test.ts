// MEMO KINDS (P4) — taxonomy + migration-planner tests. The migration itself
// only runs after Lee approves the dry-run table; these pin the plan's rules.
import { describe, expect, test } from "bun:test";

import { CALLOUT_MEMO_KINDS, SUPPORT_MEMO_KINDS, MEMO_KIND_META, MEMO_KIND_ORDER, calloutKindOf, kindFromCategory, planKindMigration } from "./memo-kinds";

describe("the taxonomy", () => {
  test("five callout kinds + four support kinds, all with meta, callout-first order", () => {
    expect(CALLOUT_MEMO_KINDS).toHaveLength(5);
    expect(SUPPORT_MEMO_KINDS).toHaveLength(4);
    expect(MEMO_KIND_ORDER).toEqual([...CALLOUT_MEMO_KINDS, ...SUPPORT_MEMO_KINDS]);
    for (const k of MEMO_KIND_ORDER) expect(MEMO_KIND_META[k].group).toBe((CALLOUT_MEMO_KINDS as readonly string[]).includes(k) ? "CALLOUT" : "SUPPORT");
  });
  test("callout kinds map 1:1 onto P1 callout banners; support kinds don't", () => {
    expect(calloutKindOf("cheat-code")).toBe("cheat-code");
    expect(calloutKindOf("steps")).toBeNull();
    expect(calloutKindOf(undefined)).toBeNull();
  });
});

describe("legacy category → playbookKind", () => {
  test("name-preserving: only CHEAT CODES crosses into callout-land", () => {
    expect(kindFromCategory("CHEAT CODES")).toBe("cheat-code");
    expect(kindFromCategory("STEPS")).toBe("steps");
    expect(kindFromCategory("EXAM TRAPS")).toBe("exam-trap");
    expect(kindFromCategory("ON THE EXAM")).toBe("exam-trap");
    expect(kindFromCategory("OTHER TIPS")).toBe("other-tip");
    expect(kindFromCategory("ELEMENT")).toBe("element");
  });
  test("unknown or empty stays UNFILED — the migration never invents a kind", () => {
    expect(kindFromCategory("")).toBeNull();
    expect(kindFromCategory(undefined)).toBeNull();
    expect(kindFromCategory("SOMETHING ELSE")).toBeNull();
  });
});

describe("planKindMigration — additive, idempotent, never destructive", () => {
  const memos = [
    { id: "m1", label: "Payables are liabilities", category: "CHEAT CODES" },
    { id: "m2", label: "already stamped", category: "STEPS", playbookKind: "recap" },
    { id: "m3", label: "no category", category: "" },
  ];
  const plan = planKindMigration(memos);
  test("unstamped memos get their mapped kind", () => {
    expect(plan[0]).toMatchObject({ to: "cheat-code", changed: true, from: "·" });
  });
  test("a hand-set playbookKind is NEVER overwritten (idempotent re-runs)", () => {
    expect(plan[1]).toMatchObject({ to: "recap", changed: false, from: "recap" });
  });
  test("UNFILED stays unfiled and unchanged", () => {
    expect(plan[2]).toMatchObject({ to: "· (unfiled)", changed: false, category: "UNFILED" });
  });
  test("mirrors the live 08-14 dry-run shape: 58 of 60 stamp, 2 stay unfiled", () => {
    const live = [
      ...Array.from({ length: 28 }, (_, i) => ({ id: `t${i}`, category: "OTHER TIPS" })),
      ...Array.from({ length: 18 }, (_, i) => ({ id: `c${i}`, category: "CHEAT CODES" })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, category: "EXAM TRAPS" })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `el${i}`, category: "ELEMENT" })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `u${i}`, category: "" })),
    ];
    const p = planKindMigration(live);
    expect(p.filter((r) => r.changed)).toHaveLength(58);
    expect(p.filter((r) => r.to === "· (unfiled)")).toHaveLength(2);
  });
});
