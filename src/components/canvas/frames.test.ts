import { describe, expect, test } from "bun:test";

import { absRectOf, adjacentFrame, filmstripLayout, frame169, framesInLesson, lessonNeighborFrame, nextFrameOrder, SCAFFOLD_BEATS, type RectNode } from "./frames";

const F = (id: string, parentId: string, order: number, x = 0): RectNode => ({ id, type: "frame", parentId, position: { x, y: 0 }, data: { order } });
const L = (id: string, pathOrder: number, x = 0): RectNode => ({ id, type: "lesson", position: { x, y: 0 }, data: { pathOrder } });

describe("frames (F1)", () => {
  test("framesInLesson sorts by order, only this lesson's frames", () => {
    const nodes: RectNode[] = [F("f2", "L", 2, 500), F("f1", "L", 1, 0), F("x", "L2", 1), { id: "c", parentId: "f1", position: { x: 0, y: 0 } }];
    expect(framesInLesson(nodes, "L").map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  test("nextFrameOrder appends after the max", () => {
    expect(nextFrameOrder([F("a", "L", 1), F("b", "L", 2)], "L")).toBe(3);
    expect(nextFrameOrder([], "L")).toBe(1);
  });

  test("adjacentFrame steps and STOPS at lesson edges (no wrap)", () => {
    const nodes = [F("f1", "L", 1), F("f2", "L", 2), F("f3", "L", 3)];
    expect(adjacentFrame(nodes, "f1", 1)?.id).toBe("f2");
    expect(adjacentFrame(nodes, "f2", -1)?.id).toBe("f1");
    expect(adjacentFrame(nodes, "f1", -1)).toBeNull(); // edge
    expect(adjacentFrame(nodes, "f3", 1)).toBeNull(); // edge
  });

  test("lessonNeighborFrame jumps to the next lesson's FIRST / prev lesson's LAST frame (FF-4)", () => {
    const nodes: RectNode[] = [
      L("L1", 1), L("L2", 2), L("L3", 3),
      F("a1", "L1", 1), F("a2", "L1", 2),
      F("b1", "L2", 1), F("b2", "L2", 2),
      F("c1", "L3", 1),
    ];
    // from a frame in L2, → goes to L3's first frame, ← goes to L1's last frame
    expect(lessonNeighborFrame(nodes, "b1", 1)?.id).toBe("c1");
    expect(lessonNeighborFrame(nodes, "b2", -1)?.id).toBe("a2");
    // edges: prev of L1 / next of L3 = null (region edge)
    expect(lessonNeighborFrame(nodes, "a1", -1)).toBeNull();
    expect(lessonNeighborFrame(nodes, "c1", 1)).toBeNull();
  });

  test("lessonNeighborFrame skips a neighbour with no frames only by returning null at its slot", () => {
    const nodes: RectNode[] = [L("L1", 1), L("L2", 2), F("a1", "L1", 1)];
    expect(lessonNeighborFrame(nodes, "a1", 1)).toBeNull(); // L2 has no frames
  });

  test("frame169 aspect-locks to 16:9", () => {
    expect(frame169(1600)).toEqual({ w: 1600, h: 900 });
    expect(frame169(320)).toEqual({ w: 320, h: 180 });
  });

  test("absRectOf walks card→frame→lesson chain", () => {
    const lesson: RectNode = { id: "L", type: "lesson", position: { x: 100, y: 100 }, data: { w: 900, h: 500 } };
    const frame: RectNode = { id: "f", type: "frame", parentId: "L", position: { x: 40, y: 60 }, data: { w: 400, h: 225 } };
    const card: RectNode = { id: "c", type: "je", parentId: "f", position: { x: 10, y: 20 }, data: { w: 200, h: 120 } };
    const byId = new Map([lesson, frame, card].map((n) => [n.id, n]));
    expect(absRectOf(card, byId)).toEqual({ x: 150, y: 180, w: 200, h: 120 }); // 100+40+10, 100+60+20
    expect(absRectOf(frame, byId)).toEqual({ x: 140, y: 160, w: 400, h: 225 });
  });
});

describe("filmstrip layout (F2)", () => {
  test("filmstripLayout lays frames L→R and sizes the lesson to contain them", () => {
    const { positions, w, h } = filmstripLayout(4, 800, 450);
    expect(positions).toHaveLength(4);
    expect(positions[0]).toEqual({ x: 30, y: 56 + 30 }); // pad, headerH+pad
    expect(positions[1].x).toBe(30 + 800 + 80); // +frameW +gap
    expect(positions[1].y).toBe(positions[0].y); // same row
    expect(w).toBe(30 + 4 * 800 + 3 * 80 + 30);
    expect(h).toBe(56 + 30 + 450 + 30);
  });
  test("SCAFFOLD_BEATS are the four beats in walk order", () => {
    expect(SCAFFOLD_BEATS.map((b) => b.beat)).toEqual(["hook", "teach", "model_practice", "check"]);
  });
});
