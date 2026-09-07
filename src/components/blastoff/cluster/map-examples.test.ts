import { describe, expect, test } from "bun:test";

import { checkMapSpec } from "@/lib/cluster-brief";
import { accountByLabel } from "@/components/canvas/account-registry";
import { nodeSteps, parseClusterSpec, visibleAt } from "./cluster-spec";
import { MAP_EXAMPLES, cloneExample } from "./map-examples";

describe("the three example maps", () => {
  test("there are three, with distinct titles and ids", () => {
    expect(MAP_EXAMPLES.length).toBe(3);
    expect(new Set(MAP_EXAMPLES.map((e) => e.title)).size).toBe(3);
    expect(new Set(MAP_EXAMPLES.map((e) => e.spec.id)).size).toBe(3);
    expect(MAP_EXAMPLES.map((e) => e.title)).toEqual(["A = L + E effects", "5 types", "pay a payable"]);
  });
  test("each passes parseClusterSpec and checkMapSpec clean", () => {
    for (const e of MAP_EXAMPLES) {
      expect(parseClusterSpec(e.spec).error).toBeNull();
      expect(checkMapSpec(e.spec)).toEqual([]);
    }
  });
  test("every account name is the registry's", () => {
    for (const e of MAP_EXAMPLES) for (const n of e.spec.nodes) {
      const d = n.data;
      const names = d.kind === "je" ? d.lines.map((l) => l.account) : d.kind === "taccount" ? [d.account] : d.kind === "tb" ? (d.rows ?? []).map((r) => r.account) : d.kind === "accounts" ? d.groups.flatMap((g) => g.accounts) : [];
      for (const a of names) expect(accountByLabel(a)?.label).toBe(a);
    }
  });
  test("the list slide is a one-node map that reveals group by group over five shots", () => {
    const five = MAP_EXAMPLES[1].spec;
    expect(five.nodes.length).toBe(1);
    expect(nodeSteps(five.nodes[0])).toBe(5);
    expect(five.shots.length).toBe(5);
    expect(visibleAt(five, 2).steps.get("types")).toBe(3);
    expect(visibleAt(five, 4).steps.get("types")).toBe(5);
  });
  test("the supplies map walks the entry a line at a time, then posts, then the note", () => {
    const s = MAP_EXAMPLES[0].spec;
    expect(s.shots.length).toBe(6);
    expect(visibleAt(s, 1).steps.get("je")).toBe(1);
    expect(visibleAt(s, 3).steps.get("je")).toBe(5);
    expect([...visibleAt(s, 4).nodes]).toEqual(["eq", "je", "t-supplies", "t-ap"]);
    expect(visibleAt(s, 5).nodes.has("note")).toBe(true);
    expect(s.shots.every((sh) => sh.note && !/[\u{1F300}-\u{1FAFF}]/u.test(sh.note))).toBe(true);
  });
  test("cloneExample gives a fresh id and shares nothing", () => {
    const c = cloneExample(MAP_EXAMPLES[2]);
    expect(c.id).not.toBe(MAP_EXAMPLES[2].spec.id);
    expect(c.id).toMatch(/^map-/);
    c.nodes[0].x = 1;
    expect(MAP_EXAMPLES[2].spec.nodes[0].x).toBe(630);
    expect(parseClusterSpec(c).error).toBeNull();
  });
});
