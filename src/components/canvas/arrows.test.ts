import { describe, expect, test } from "bun:test";

import { addEdgeCmd, isAutoEdge, lineHandleId, lineIdOfHandle, removeEdgeCmd, resolveConnection, type EdgeLike } from "./arrows";
import { CommandBus, type RfLike } from "./commands";

// fake rf: just the edges array behind the RfLike surface
function fakeRf(initial: EdgeLike[] = []): { rf: RfLike; edges: () => EdgeLike[] } {
  let edges = initial;
  const rf = {
    getNode: () => undefined,
    updateNodeData: () => {},
    setNodes: () => {},
    addNodes: () => {},
    getEdges: () => edges,
    setEdges: (updater: (eds: EdgeLike[]) => EdgeLike[]) => { edges = updater(edges); },
  } as unknown as RfLike;
  return { rf, edges: () => edges };
}

const CONN = { source: "a", target: "b", sourceHandle: "r", targetHandle: "l" };

describe("resolveConnection (the undo-bug fix)", () => {
  test("RF's uncontrolled auto edge is flagged for removal and the styled replacement returned", () => {
    // exactly the live sequence: RF already added its plain edge before onConnect ran
    const auto: EdgeLike = { id: "xy-edge__ar-bl", source: "a", target: "b", sourceHandle: "r", targetHandle: "l" };
    const { autoIds, edge } = resolveConnection([auto], CONN, () => "edge-1");
    expect(autoIds).toEqual(["xy-edge__ar-bl"]);
    expect(edge).toMatchObject({ id: "edge-1", type: "smoothstep" });
    expect((edge!.markerEnd as { type: string }).type).toBe("arrowclosed"); // real arrowhead
    expect((edge!.style as { stroke: string }).stroke).toBe("#E0284A");
  });

  test("a bus-created identical edge means genuine double-invoke → no new edge (auto still cleaned)", () => {
    const ours: EdgeLike = { id: "edge-1", source: "a", target: "b", sourceHandle: "r", targetHandle: "l" };
    const auto: EdgeLike = { id: "xy-edge__ar-bl", source: "a", target: "b", sourceHandle: "r", targetHandle: "l" };
    const { autoIds, edge } = resolveConnection([ours, auto], CONN, () => "edge-2");
    expect(edge).toBeNull();
    expect(autoIds).toEqual(["xy-edge__ar-bl"]);
  });

  test("self-loop and null endpoints produce no edge", () => {
    expect(resolveConnection([], { source: "a", target: "a" }, () => "x").edge).toBeNull();
    expect(resolveConnection([], { source: null, target: "b" }, () => "x").edge).toBeNull();
  });

  test("line-level handles ride through untouched", () => {
    const c = { source: "a", target: "b", sourceHandle: lineHandleId("l7", "r"), targetHandle: lineHandleId("l9", "l") };
    const { edge } = resolveConnection([], c, () => "edge-1");
    expect(edge!.sourceHandle).toBe("ln:l7:r");
    expect(edge!.targetHandle).toBe("ln:l9:l");
  });
});

describe("edge commands on the bus — THE REGRESSION: Ctrl+Z must see arrows", () => {
  test("undo removes an added edge; redo restores it", () => {
    const { rf, edges } = fakeRf();
    const bus = new CommandBus();
    const { edge } = resolveConnection(edges(), CONN, () => "edge-1");
    bus.dispatch(addEdgeCmd(rf, edge!));
    expect(edges()).toHaveLength(1);
    expect(bus.undo()).toBe(true); // the OLD code left the bus empty here — undo() returned false
    expect(edges()).toHaveLength(0);
    bus.redo();
    expect(edges()).toHaveLength(1);
    expect(edges()[0].id).toBe("edge-1");
  });

  test("undo restores a deleted edge exactly (style, marker, handles)", () => {
    const { rf, edges } = fakeRf();
    const bus = new CommandBus();
    const { edge } = resolveConnection([], CONN, () => "edge-1");
    bus.dispatch(addEdgeCmd(rf, edge!));
    bus.dispatch(removeEdgeCmd(rf, "edge-1")!);
    expect(edges()).toHaveLength(0);
    bus.undo();
    expect(edges()).toHaveLength(1);
    expect(edges()[0]).toMatchObject({ id: "edge-1", type: "smoothstep", sourceHandle: "r" });
    expect((edges()[0].markerEnd as { type: string }).type).toBe("arrowclosed");
  });

  test("removeEdgeCmd on a missing id is a null command (no empty undo steps)", () => {
    const { rf } = fakeRf();
    expect(removeEdgeCmd(rf, "nope")).toBeNull();
  });
});

describe("lineIdOfHandle", () => {
  test("parses line handles; card-level handles → null", () => {
    expect(lineIdOfHandle("ln:l-abc123:r")).toBe("l-abc123");
    expect(lineIdOfHandle("ln:l7:l")).toBe("l7");
    expect(lineIdOfHandle("r")).toBeNull();
    expect(lineIdOfHandle(null)).toBeNull();
    expect(lineIdOfHandle("ln:bad")).toBeNull();
  });
});

describe("isAutoEdge", () => {
  test("xy-edge__ prefix only", () => {
    expect(isAutoEdge({ id: "xy-edge__ab", source: "a", target: "b" })).toBe(true);
    expect(isAutoEdge({ id: "edge-1", source: "a", target: "b" })).toBe(false);
  });
});
