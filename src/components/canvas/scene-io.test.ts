// Regression test for the S2.0 group-drag bug: scenes must never round-trip
// multi-selection (React Flow drags ALL selected nodes as a group, so two
// cards saved selected reload as a drag-group).
import { describe, expect, test } from "bun:test";

import { migrateDeckFields, migrateEdges, migrateElementDeckFields, sanitizeSceneNodes } from "./scene-io";

const isElement = (k: string | undefined) => k === "heading" || k === "text" || k === "paygate" || k === "signupgate";

describe("sanitizeSceneNodes", () => {
  test("strips selected from every node — no multi-select group survives a save/load", () => {
    const nodes = [
      { id: "je-1", selected: true, data: { kind: "je" } },
      { id: "je-2", selected: true, data: { kind: "je" } },
      { id: "note-1", selected: false, data: { kind: "note" } },
    ];
    const out = sanitizeSceneNodes(nodes);
    expect(out.every((n) => !("selected" in n))).toBe(true);
    expect(out.map((n) => n.id)).toEqual(["je-1", "je-2", "note-1"]);
  });

  test("strips dragging and every _transient data key, keeps real data", () => {
    const out = sanitizeSceneNodes([
      { id: "a", dragging: true, data: { kind: "je", caption: "keep me", _arrowPending: true, _selLine: "l-3" } },
    ]);
    expect("dragging" in out[0]).toBe(false);
    expect(out[0].data).toEqual({ kind: "je", caption: "keep me" });
  });

  test("legacy staged/minimized migrate to deckMember+tucked; v2 nodes untouched", () => {
    const out = migrateDeckFields([
      { data: { kind: "je", staged: true, stageOrder: 3 } },
      { data: { kind: "note", minimized: true } },
      { data: { kind: "list", deckMember: true, tucked: false } },
      { data: { kind: "ceq" } },
    ]);
    expect(out[0].data).toEqual({ kind: "je", deckMember: true, tucked: true, stageOrder: 3 });
    expect(out[1].data).toEqual({ kind: "note", deckMember: true, tucked: true });
    expect(out[2].data).toEqual({ kind: "list", deckMember: true, tucked: false });
    expect(out[3].data).toEqual({ kind: "ceq" });
  });

  test("elements silently lose old deck membership; cards keep theirs", () => {
    const out = migrateElementDeckFields(
      [
        { data: { kind: "heading", text: "Welcome", deckMember: true, tucked: true, stageOrder: 2 } },
        { data: { kind: "je", deckMember: true, tucked: true } },
        { data: { kind: "heading", text: "clean" } },
      ],
      isElement,
    );
    expect(out[0].data).toEqual({ kind: "heading", text: "Welcome" }); // membership gone, revealed
    expect(out[1].data).toEqual({ kind: "je", deckMember: true, tucked: true }); // cards untouched
    expect(out[2].data).toEqual({ kind: "heading", text: "clean" });
  });

  test("old handle-less edges get the legacy right→left anchors + smoothstep", () => {
    const out = migrateEdges([
      { id: "e1", source: "a", target: "b" } as never,
      { id: "e2", source: "a", target: "b", sourceHandle: "t", targetHandle: "b", type: "smoothstep" } as never,
    ]);
    expect(out[0]).toMatchObject({ sourceHandle: "r", targetHandle: "l", type: "smoothstep" });
    expect(out[1]).toMatchObject({ sourceHandle: "t", targetHandle: "b" }); // already-migrated untouched
  });

  test("position/parentId/zIndex survive untouched", () => {
    const out = sanitizeSceneNodes([
      { id: "a", selected: true, position: { x: 5, y: 7 }, parentId: "zone-1", zIndex: 12, data: {} } as never,
    ]);
    expect(out[0]).toEqual({ id: "a", position: { x: 5, y: 7 }, parentId: "zone-1", zIndex: 12, data: {} } as never);
  });
});

// ---- PROMPT A: edge visual stamps + JE memo schema migration ----

import { migrateJeMemos } from "./scene-io";

describe("migrateEdges (arrow visual contract)", () => {
  test("stamps style + arrowhead marker on RF auto-added bare edges", () => {
    const [e] = migrateEdges([{ id: "xy-edge__a-b", source: "a", target: "b" } as never]) as Record<string, unknown>[];
    expect(e.type).toBe("smoothstep");
    expect((e.style as { stroke: string }).stroke).toBe("#E0284A");
    expect((e.markerEnd as { type: string }).type).toBe("arrowclosed");
  });

  test("keeps explicit style/marker/handles intact (incl. line-level handles)", () => {
    const styled = { id: "e1", source: "a", target: "b", sourceHandle: "ln:l1:r", targetHandle: "ln:l9:l", type: "smoothstep", style: { stroke: "blue" }, markerEnd: { type: "arrow" } };
    const [e] = migrateEdges([styled as never]) as Record<string, unknown>[];
    expect(e.sourceHandle).toBe("ln:l1:r");
    expect((e.style as { stroke: string }).stroke).toBe("blue");
    expect((e.markerEnd as { type: string }).type).toBe("arrow");
  });
});

describe("migrateJeMemos", () => {
  const jeNode = (lines: Record<string, unknown>[], solution?: Record<string, unknown>[]) =>
    ({ id: "n1", data: { kind: "je", lines, ...(solution ? { solution } : {}) } }) as never;

  test("legacy label/memoPos/memoOpen become a text memo entry; label survives for docs", () => {
    const [n] = migrateJeMemos([jeNode([{ id: "l1", label: "why", memoPos: { x: 3, y: 4 }, memoOpen: true }])]) as { data: { lines: Record<string, unknown>[] } }[];
    const l = n.data.lines[0];
    expect(l.memos).toEqual([{ id: "l1-m-text", kind: "text", text: "why", pos: { x: 3, y: 4 }, open: true }]);
    expect(l.label).toBe("why");
    expect(l.memoPos).toBeUndefined();
    expect(l.memoOpen).toBeUndefined();
  });

  test("solution lines migrate too; already-migrated + non-JE untouched", () => {
    const [n] = migrateJeMemos([jeNode([{ id: "l1" }], [{ id: "s1", label: "sol memo" }])]) as { data: { solution: Record<string, unknown>[] } }[];
    expect(n.data.solution[0].memos).toBeDefined();
    const already = { id: "l1", label: "x", memos: [{ id: "m", kind: "calc", text: "1 = 1" }] };
    const [m] = migrateJeMemos([jeNode([already])]) as { data: { lines: Record<string, unknown>[] } }[];
    expect(m.data.lines[0].memos).toEqual(already.memos);
    const note = { id: "n2", data: { kind: "note", body: "hi" } } as never;
    expect((migrateJeMemos([note])[0] as { data: { body: string } }).data.body).toBe("hi");
  });
});
