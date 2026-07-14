// Regression test for the S2.0 group-drag bug: scenes must never round-trip
// multi-selection (React Flow drags ALL selected nodes as a group, so two
// cards saved selected reload as a drag-group).
import { describe, expect, test } from "bun:test";

import { migrateDeckFields, migrateEdges, sanitizeSceneNodes } from "./scene-io";

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
