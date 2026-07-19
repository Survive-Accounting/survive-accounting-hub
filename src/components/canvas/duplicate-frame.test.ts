import { describe, expect, test } from "bun:test";

import { cloneNodeSet, orderParentsFirst, type CloneEdge, type CloneNode } from "./duplicate-frame";

/** Deterministic id minter so assertions are stable. */
function counterMint() {
  let n = 0;
  return (kind: string) => `${kind}#${++n}`;
}

/** A frame + a JE card + a memo node + one loose note, plus the two edges among
 *  them — a realistic "one frame" set. */
function frameFixture(): { nodes: CloneNode[]; edges: CloneEdge[] } {
  const nodes: CloneNode[] = [
    {
      id: "F1", type: "frame", parentId: "L1", position: { x: 30, y: 100 }, width: 800, height: 450,
      data: {
        beat: "teach", subIndex: 0, title: "Record it", world: "deep-space",
        script: { entry: "open", beats: "the point", marks: [{ id: "mk1", kind: "je", linkedCardId: "JE1" }, { id: "mk2", kind: "je", linkedCardId: "OUTSIDE" }] },
      },
    },
    {
      id: "JE1", type: "je", parentId: "F1", position: { x: 20, y: 20 }, width: 320,
      data: { kind: "je", caption: "Buy supplies", scenarioId: "scn-42", deckId: "D1", deckMember: true, tucked: true, stageOrder: 3, deckLessonId: "L1", lines: [{ id: "ln1", account: "Supplies", dr: 100, cr: null }] },
    },
    { id: "M1", type: "memo", parentId: "F1", position: { x: 400, y: 20 }, data: { kind: "memo", memoKind: "trap", body: "watch out" } },
    { id: "N1", type: "note", parentId: "F1", position: { x: 40, y: 300 }, data: { kind: "note", body: "aside", color: 0 } },
  ];
  const edges: CloneEdge[] = [
    { id: "mre-e1", source: "M1", target: "JE1", sourceHandle: "l", targetHandle: "ln:ln1:r" },
    { id: "edge-x", source: "JE1", target: "OUTSIDE", sourceHandle: "r", targetHandle: "l" }, // crosses out of the set
  ];
  return { nodes, edges };
}

describe("cloneNodeSet — frame duplication (stripDeck)", () => {
  test("fresh node ids, old→new map covers every node", () => {
    const { nodes, edges } = frameFixture();
    const r = cloneNodeSet(nodes, edges, counterMint(), { stripDeck: true });
    expect(r.nodes).toHaveLength(4);
    for (const n of nodes) {
      expect(r.idMap.has(n.id)).toBe(true);
      expect(r.idMap.get(n.id)).not.toBe(n.id);
    }
    // no id collisions with the originals
    const newIds = new Set(r.nodes.map((n) => n.id));
    for (const n of nodes) expect(newIds.has(n.id)).toBe(false);
  });

  test("parentId is remapped for children, preserved for the root", () => {
    const { nodes, edges } = frameFixture();
    const r = cloneNodeSet(nodes, edges, counterMint(), { stripDeck: true });
    const newFrame = r.nodes.find((n) => n.type === "frame")!;
    const newJe = r.nodes.find((n) => n.type === "je")!;
    // the frame's parent (L1) is NOT in the set → left as-is (caller re-parents)
    expect(newFrame.parentId).toBe("L1");
    // the card's parent (F1) IS in the set → remapped to the new frame id
    expect(newJe.parentId).toBe(newFrame.id);
  });

  test("@marks relink to the copies; marks pointing outside the set unlink", () => {
    const { nodes, edges } = frameFixture();
    const r = cloneNodeSet(nodes, edges, counterMint(), { stripDeck: true });
    const newFrame = r.nodes.find((n) => n.type === "frame")!;
    const newJe = r.nodes.find((n) => n.type === "je")!;
    const marks = (newFrame.data.script as { marks: Array<{ linkedCardId: string | null }> }).marks;
    expect(marks[0].linkedCardId).toBe(newJe.id); // relinked to the copy
    expect(marks[1].linkedCardId).toBeNull();      // OUTSIDE → unlinked
  });

  test("scenario binding carries over verbatim; deck membership is stripped", () => {
    const { nodes, edges } = frameFixture();
    const r = cloneNodeSet(nodes, edges, counterMint(), { stripDeck: true });
    const newJe = r.nodes.find((n) => n.type === "je")!;
    expect(newJe.data.scenarioId).toBe("scn-42"); // binding preserved (swap-many)
    for (const f of ["deckId", "deckMember", "tucked", "stageOrder", "deckLessonId"]) {
      expect(newJe.data[f]).toBeUndefined();
    }
  });

  test("internal element ids are preserved so handles keep resolving", () => {
    const { nodes, edges } = frameFixture();
    const r = cloneNodeSet(nodes, edges, counterMint(), { stripDeck: true });
    const newJe = r.nodes.find((n) => n.type === "je")!;
    expect((newJe.data.lines as Array<{ id: string }>)[0].id).toBe("ln1");
  });

  test("only in-set edges copy; endpoints remap; handles ride along unchanged", () => {
    const { nodes, edges } = frameFixture();
    const r = cloneNodeSet(nodes, edges, counterMint(), { stripDeck: true });
    expect(r.edges).toHaveLength(1); // edge-x (crosses out) is dropped
    const e = r.edges[0];
    expect(e.id).not.toBe("mre-e1");
    expect(e.id.startsWith("mre-")).toBe(true); // memo-arrow prefix preserved
    expect(e.source).toBe(r.idMap.get("M1"));
    expect(e.target).toBe(r.idMap.get("JE1"));
    expect(e.targetHandle).toBe("ln:ln1:r"); // internal-id handle untouched
  });

  test("nothing shared mutates — editing a copy never touches the original", () => {
    const { nodes, edges } = frameFixture();
    const r = cloneNodeSet(nodes, edges, counterMint(), { stripDeck: true });
    const newJe = r.nodes.find((n) => n.type === "je")!;
    (newJe.data.lines as Array<{ account: string }>)[0].account = "CHANGED";
    (newJe.data as { caption: string }).caption = "edited";
    const origJe = nodes.find((n) => n.id === "JE1")!;
    expect((origJe.data.lines as Array<{ account: string }>)[0].account).toBe("Supplies");
    expect((origJe.data as { caption: string }).caption).toBe("Buy supplies");
  });
});

describe("cloneNodeSet — lesson duplication (deckIdMap)", () => {
  test("membership follows the deck to its new id; deckLessonId re-homes to the copy", () => {
    const nodes: CloneNode[] = [
      { id: "L1", type: "lesson", position: { x: 0, y: 0 }, width: 900, height: 600, data: { label: "Intro", w: 900, h: 600 } },
      { id: "F1", type: "frame", parentId: "L1", position: { x: 30, y: 100 }, width: 800, height: 450, data: { beat: "cram", subIndex: 0 } },
      { id: "JE1", type: "je", parentId: "F1", position: { x: 10, y: 10 }, data: { kind: "je", deckId: "D1", deckMember: true, deckLessonId: "L1", lines: [] } },
    ];
    const deckIdMap = new Map([["D1", "D1-copy"]]);
    const r = cloneNodeSet(nodes, [], counterMint(), { deckIdMap });
    const newLesson = r.nodes.find((n) => n.type === "lesson")!;
    const newJe = r.nodes.find((n) => n.type === "je")!;
    expect(newJe.data.deckId).toBe("D1-copy");        // follows its deck
    expect(newJe.data.deckMember).toBe(true);          // membership kept
    expect(newJe.data.deckLessonId).toBe(newLesson.id); // re-homed to the copy
  });
});

describe("orderParentsFirst", () => {
  test("lesson before frame before card", () => {
    const ordered = orderParentsFirst([
      { type: "je" }, { type: "frame" }, { type: "lesson" }, { type: "memo" },
    ]);
    expect(ordered.map((n) => n.type)).toEqual(["lesson", "frame", "je", "memo"]);
  });
});
