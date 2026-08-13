// Dispatcher tests — pure bus semantics + factories against a fake RF store.
import { describe, expect, test } from "bun:test";

import { CommandBus, addNodesCmd, moveNodesCmd, patchDataCmd, patchDataFnCmd, removeNodesCmd, type RfLike } from "./commands";

function fakeRf(initial: any[] = []): RfLike & { nodes: any[]; edges: any[] } {
  const store = {
    nodes: structuredClone(initial),
    edges: [] as any[],
    getNode(id: string) { return store.nodes.find((n) => n.id === id); },
    updateNodeData(id: string, patch: Record<string, unknown>) {
      store.nodes = store.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
    },
    setNodes(up: (nds: any[]) => any[]) { store.nodes = up(store.nodes); },
    addNodes(ns: any[]) { store.nodes = [...store.nodes, ...ns]; },
    getEdges() { return store.edges; },
    setEdges(up: (eds: any[]) => any[]) { store.edges = up(store.edges); },
  };
  return store;
}

const node = (id: string, data: Record<string, unknown> = {}, pos = { x: 0, y: 0 }) => ({ id, position: pos, data });

describe("CommandBus", () => {
  test("dispatch → undo → redo round-trips", () => {
    const bus = new CommandBus();
    let v = 0;
    bus.dispatch({ label: "set1", do: () => (v = 1), undo: () => (v = 0) });
    expect(v).toBe(1);
    expect(bus.undo()).toBe(true);
    expect(v).toBe(0);
    expect(bus.redo()).toBe(true);
    expect(v).toBe(1);
  });

  test("new dispatch clears the redo stack", () => {
    const bus = new CommandBus();
    let v = 0;
    bus.dispatch({ label: "a", do: () => (v = 1), undo: () => (v = 0) });
    bus.undo();
    bus.dispatch({ label: "b", do: () => (v = 2), undo: () => (v = 0) });
    expect(bus.redo()).toBe(false);
    expect(v).toBe(2);
  });

  test("coalescing: burst with same key = ONE undo step (first undo, last do)", () => {
    const bus = new CommandBus();
    let v = "";
    const type = (next: string, prev: string) =>
      bus.dispatch({ label: "type", coalesceKey: "t", do: () => (v = next), undo: () => (v = prev) });
    type("h", "");
    type("he", "h");
    type("hey", "he");
    expect(v).toBe("hey");
    expect(bus.depth().undo).toBe(1);
    bus.undo();
    expect(v).toBe(""); // first undo wins
    bus.redo();
    expect(v).toBe("hey"); // last do wins
  });

  test("undo breaks a coalesce chain", () => {
    const bus = new CommandBus();
    let v = 0;
    bus.dispatch({ label: "a", coalesceKey: "k", do: () => (v = 1), undo: () => (v = 0) });
    bus.undo();
    bus.redo();
    bus.dispatch({ label: "b", coalesceKey: "k", do: () => (v = 2), undo: () => (v = 1) });
    expect(bus.depth().undo).toBe(2); // no merge across the undo boundary
  });

  test("limit drops oldest", () => {
    const bus = new CommandBus();
    bus.limit = 3;
    for (let i = 0; i < 5; i++) bus.dispatch({ label: `c${i}`, do: () => {}, undo: () => {} });
    expect(bus.depth().undo).toBe(3);
  });
});

describe("factories", () => {
  test("patchDataCmd restores only the patched keys", () => {
    const rf = fakeRf([node("a", { x: 1, keep: "yes" })]);
    const bus = new CommandBus();
    bus.dispatch(patchDataCmd(rf, "a", { x: 2 }, "edit")!);
    expect(rf.getNode("a")!.data).toEqual({ x: 2, keep: "yes" });
    bus.undo();
    expect(rf.getNode("a")!.data).toEqual({ x: 1, keep: "yes" });
  });

  test("patchDataFnCmd evaluates against the live store once", () => {
    const rf = fakeRf([node("a", { lines: [1, 2] })]);
    const bus = new CommandBus();
    bus.dispatch(patchDataFnCmd(rf, "a", (d) => ({ lines: [...(d.lines as number[]), 3] }), "append")!);
    expect(rf.getNode("a")!.data.lines).toEqual([1, 2, 3]);
    bus.undo();
    expect(rf.getNode("a")!.data.lines).toEqual([1, 2]);
    bus.redo();
    expect(rf.getNode("a")!.data.lines).toEqual([1, 2, 3]);
  });

  test("removeNodesCmd restores nodes and their edges", () => {
    const rf = fakeRf([node("a"), node("b")]);
    rf.edges.push({ id: "e1", source: "a", target: "b" });
    const bus = new CommandBus();
    bus.dispatch(removeNodesCmd(rf, ["a"], "delete")!);
    expect(rf.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(rf.edges).toEqual([]);
    bus.undo();
    expect(rf.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(rf.edges.length).toBe(1);
  });

  test("addNodesCmd undo removes what it added", () => {
    const rf = fakeRf([]);
    const bus = new CommandBus();
    bus.dispatch(addNodesCmd(rf, [node("n1")], "spawn"));
    expect(rf.nodes.length).toBe(1);
    bus.undo();
    expect(rf.nodes.length).toBe(0);
    bus.redo();
    expect(rf.nodes.length).toBe(1);
  });

  test("moveNodesCmd is one absolute step; no-op moves return null", () => {
    const rf = fakeRf([node("a", {}, { x: 0, y: 0 })]);
    const bus = new CommandBus();
    expect(moveNodesCmd(rf, [{ id: "a", from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }], "drag")).toBeNull();
    bus.dispatch(moveNodesCmd(rf, [{ id: "a", from: { x: 0, y: 0 }, to: { x: 100, y: 50 } }], "drag")!);
    expect(rf.getNode("a")!.position).toEqual({ x: 100, y: 50 });
    bus.undo();
    expect(rf.getNode("a")!.position).toEqual({ x: 0, y: 0 });
  });
});
