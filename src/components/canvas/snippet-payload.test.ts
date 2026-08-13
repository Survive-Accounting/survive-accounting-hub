import { describe, expect, test } from "bun:test";

import { buildSnippetPayload, spawnSnippet } from "./snippet-payload";
import type { CloneEdge, CloneNode } from "./duplicate-frame";

/** A JE + memo + note cluster at absolute coords, with a memo→JE arrow. */
function selection(): { nodes: CloneNode[]; edges: CloneEdge[] } {
  const nodes: CloneNode[] = [
    { id: "JE1", type: "je", parentId: "F1", position: { x: 500, y: 300 }, width: 320,
      data: { kind: "je", caption: "Accrue interest", scenarioId: "scn-9", deckMember: true, tucked: true, stageOrder: 2, lines: [{ id: "ln1", account: "Interest Expense", dr: 20, cr: null }], _sel: true } },
    { id: "M1", type: "memo", parentId: "F1", position: { x: 900, y: 300 }, data: { kind: "memo", memoKind: "trap", body: "watch the months" } },
    { id: "N1", type: "note", parentId: "F1", position: { x: 500, y: 560 }, data: { kind: "note", body: "aside", color: 0 } },
  ];
  const edges: CloneEdge[] = [{ id: "mre-e1", source: "M1", target: "JE1", sourceHandle: "l", targetHandle: "ln:ln1:r" }];
  return { nodes, edges };
}

let idc = 0;
const mint = (k: string) => `${k}#${++idc}`;

describe("buildSnippetPayload", () => {
  test("normalizes to cluster top-left, drops parentId, strips transient + deck fields", () => {
    const { nodes, edges } = selection();
    const p = buildSnippetPayload(nodes, edges);
    expect(p.v).toBe(1);
    // top-left node is now at (0,0); relative layout preserved
    const je = p.nodes.find((n) => n.type === "je")!;
    const memo = p.nodes.find((n) => n.type === "memo")!;
    const note = p.nodes.find((n) => n.type === "note")!;
    expect(je.position).toEqual({ x: 0, y: 0 });
    expect(memo.position).toEqual({ x: 400, y: 0 });
    expect(note.position).toEqual({ x: 0, y: 260 });
    expect(je.parentId).toBeUndefined();
    // scenario binding kept; deck + transient gone
    expect(je.data.scenarioId).toBe("scn-9");
    expect(je.data.deckMember).toBeUndefined();
    expect(je.data.tucked).toBeUndefined();
    expect(je.data._sel).toBeUndefined();
    // the inside-cluster arrow is kept
    expect(p.edges).toHaveLength(1);
  });

  test("does not mutate the source nodes", () => {
    const { nodes, edges } = selection();
    buildSnippetPayload(nodes, edges);
    expect(nodes[0].position).toEqual({ x: 500, y: 300 });
    expect(nodes[0].data.deckMember).toBe(true);
  });
});

describe("spawnSnippet", () => {
  test("fresh ids, offset to drop point, parented, arrow endpoints remapped", () => {
    const { nodes, edges } = selection();
    const payload = buildSnippetPayload(nodes, edges);
    idc = 0;
    const out = spawnSnippet(payload, mint, { x: 40, y: 10 }, "F2", () => 500);
    expect(out.nodes).toHaveLength(3);
    // all new ids, none colliding with the payload
    const payloadIds = new Set(payload.nodes.map((n) => n.id));
    for (const n of out.nodes) {
      expect(payloadIds.has(n.id)).toBe(false);
      expect(n.parentId).toBe("F2");
      expect((n as { zIndex?: number }).zIndex).toBe(500);
    }
    // relative layout preserved after the drop offset
    const je = out.nodes.find((n) => n.type === "je")!;
    const memo = out.nodes.find((n) => n.type === "memo")!;
    expect(je.position).toEqual({ x: 40, y: 10 });
    expect(memo.position).toEqual({ x: 440, y: 10 });
    // scenario binding carried; deck membership absent (belt + suspenders)
    expect(je.data.scenarioId).toBe("scn-9");
    expect(je.data.deckMember).toBeUndefined();
    // arrow copied with remapped endpoints, handle string preserved
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].source).toBe(memo.id);
    expect(out.edges[0].target).toBe(je.id);
    expect(out.edges[0].targetHandle).toBe("ln:ln1:r");
  });

  test("two spawns are independent (editing one never touches the other)", () => {
    const payload = buildSnippetPayload(...Object.values(selection()) as [CloneNode[], CloneEdge[]]);
    const a = spawnSnippet(payload, mint, { x: 0, y: 0 });
    const b = spawnSnippet(payload, mint, { x: 0, y: 0 });
    (a.nodes.find((n) => n.type === "je")!.data as { caption: string }).caption = "EDITED";
    expect((b.nodes.find((n) => n.type === "je")!.data as { caption: string }).caption).toBe("Accrue interest");
    // loose spawn (no parent) leaves parentId unset
    expect(a.nodes[0].parentId).toBeUndefined();
  });
});
