// INTEGRATION — the full "duplicate a frame" pipeline against an in-memory React
// Flow store, dispatched through the REAL command bus. Proves the behavioral
// contract the pane can't (entering a frame stalls the headless preview):
//   • the copy lands independent (editing it never touches the original),
//   • @marks relink to the copies, arrows inside the frame copy too,
//   • it's ONE undoable step — undo removes every copied node AND edge.
import { beforeEach, describe, expect, test } from "bun:test";

import { addNodesAndEdgesCmd, bus, type RfLike } from "./commands";
import { cloneNodeSet, orderParentsFirst, type CloneEdge, type CloneNode } from "./duplicate-frame";

/** A tiny mutable RF store implementing just the RfLike slice the commands use. */
function fakeStore(nodes: any[], edges: any[]) {
  let ns = structuredClone(nodes);
  let es = structuredClone(edges);
  const rf: RfLike = {
    getNode: (id) => ns.find((n) => n.id === id),
    getNodes: (() => ns) as never,
    updateNodeData: (id, patch) => { ns = ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)); },
    setNodes: (u) => { ns = u(ns); },
    addNodes: (add) => { ns = [...ns, ...add]; },
    getEdges: () => es,
    setEdges: (u) => { es = u(es); },
  } as RfLike;
  return { rf, nodes: () => ns, edges: () => es };
}

/** Seed: lesson L1 → frame F1 (with a script @mark to JE1) → {JE1, memo M1}, and
 *  an arrow from the memo to a JE line. Mirrors what duplicateFrame gathers. */
function seed() {
  const nodes: CloneNode[] = [
    { id: "L1", type: "lesson", position: { x: 0, y: 0 }, data: { label: "Intro" } },
    { id: "F1", type: "frame", parentId: "L1", position: { x: 30, y: 100 }, width: 800, height: 450,
      data: { beat: "teach", subIndex: 0, title: "Record it", script: { marks: [{ id: "mk1", kind: "je", linkedCardId: "JE1" }] } } },
    { id: "JE1", type: "je", parentId: "F1", position: { x: 20, y: 20 },
      data: { kind: "je", caption: "Buy supplies", scenarioId: "scn-42", lines: [{ id: "ln1", account: "Supplies", dr: 100, cr: null }] } },
    { id: "M1", type: "memo", parentId: "F1", position: { x: 400, y: 20 }, data: { kind: "memo", memoKind: "trap", body: "watch" } },
  ];
  const edges: CloneEdge[] = [{ id: "mre-e1", source: "M1", target: "JE1", sourceHandle: "l", targetHandle: "ln:ln1:r" }];
  return { nodes, edges };
}

let idc = 0;
const mint = (k: string) => `${k}~${++idc}`;

beforeEach(() => { bus.clear(); idc = 0; });

describe("duplicate frame — end to end through the bus", () => {
  test("copy is added, independent, marks + arrows relink; ONE undo removes it all", () => {
    const { nodes, edges } = seed();
    const store = fakeStore(nodes, edges);

    // gather the frame + its children + inside-the-frame edges (what the route does)
    const setNodes = nodes.filter((n) => n.id === "F1" || n.parentId === "F1");
    const setIds = new Set(setNodes.map((n) => n.id));
    const inEdges = edges.filter((e) => setIds.has(e.source) && setIds.has(e.target));

    const { nodes: cloned, edges: clonedEdges, idMap } = cloneNodeSet(setNodes, inEdges, mint, { stripDeck: true });
    const newFrameId = idMap.get("F1")!;
    const placed = orderParentsFirst(cloned).map((n) => (n.id === newFrameId
      ? { ...n, parentId: "L1", position: { x: 30, y: 620 }, data: { ...n.data, subIndex: 1 } }
      : n));

    const before = store.nodes().length;
    bus.dispatch(addNodesAndEdgesCmd(store.rf, placed, clonedEdges, "duplicate frame"));

    // added: the frame copy + its 2 children, and the memo arrow
    expect(store.nodes().length).toBe(before + 3);
    expect(store.edges().length).toBe(2);

    const newJe = store.nodes().find((n) => n.id === idMap.get("JE1"));
    const newFrame = store.nodes().find((n) => n.id === newFrameId);
    // scenario binding carried; @mark relinked to the JE COPY; child reparented
    expect(newJe.data.scenarioId).toBe("scn-42");
    expect(newFrame.data.script.marks[0].linkedCardId).toBe(newJe.id);
    expect(newJe.parentId).toBe(newFrameId);
    // the copied arrow points copy→copy
    const newEdge = store.edges().find((e) => e.id !== "mre-e1");
    expect(newEdge.source).toBe(idMap.get("M1"));
    expect(newEdge.target).toBe(idMap.get("JE1"));

    // INDEPENDENCE — edit the copy, original is untouched
    store.rf.updateNodeData(newJe.id, { caption: "EDITED" });
    expect(store.nodes().find((n) => n.id === "JE1").data.caption).toBe("Buy supplies");

    // SINGLE UNDO — the whole copy (nodes + edge) disappears in one step
    bus.undo();
    expect(store.nodes().length).toBe(before);
    expect(store.edges().length).toBe(1);
    expect(store.edges()[0].id).toBe("mre-e1");

    // REDO restores it as one step too
    bus.redo();
    expect(store.nodes().length).toBe(before + 3);
    expect(store.edges().length).toBe(2);
  });
});
