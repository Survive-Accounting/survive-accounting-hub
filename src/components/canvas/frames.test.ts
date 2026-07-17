import { describe, expect, test } from "bun:test";

import {
  absRectOf, beatColOf, beatNeighborFrame, BEAT_COLUMNS, columnX, frame169, frameCellLabel, framesInBeat, framesInLesson,
  frameWalkNext, frameWalkPrev, gridLayout, isWrapUpName, lessonCellSize, lessonGrid, lessonRollFrame, nextSubIndex, REGION, regionLayout,
  RESERVED_ROWS, rowY, SCAFFOLD_BEATS, subIndexOf, subNeighborFrame, frameCompositionGuides, type RectNode,
} from "./frames";
import { FRAME_H, FRAME_W } from "./types";

// A frame at (lesson, beat, subIndex).
const F = (id: string, parentId: string, beat: string, subIndex: number): RectNode => ({ id, type: "frame", parentId, position: { x: 0, y: 0 }, data: { beat, subIndex } });
const L = (id: string, pathOrder: number): RectNode => ({ id, type: "lesson", position: { x: 0, y: 0 }, data: { pathOrder } });

describe("grid accessors", () => {
  const nodes = [
    L("L1", 1),
    F("h1", "L1", "hook", 0), F("h2", "L1", "hook", 1),
    F("t1", "L1", "teach", 0),
    F("c1", "L1", "check", 0),
  ];
  test("beatColOf folds legacy none → hook", () => {
    expect(beatColOf(F("x", "L1", "teach", 0))).toBe("teach");
    expect(beatColOf(F("x", "L1", "none", 0))).toBe("hook");
    expect(beatColOf({ id: "x", type: "frame", parentId: "L1", position: { x: 0, y: 0 }, data: {} })).toBe("hook");
  });
  test("framesInBeat sorts by subIndex", () => expect(framesInBeat(nodes, "L1", "hook").map((f) => f.id)).toEqual(["h1", "h2"]));
  test("lessonGrid buckets by beat", () => {
    const g = lessonGrid(nodes, "L1");
    expect(g.hook.map((f) => f.id)).toEqual(["h1", "h2"]);
    expect(g.teach.map((f) => f.id)).toEqual(["t1"]);
    expect(g.model_practice).toEqual([]);
    expect(g.check.map((f) => f.id)).toEqual(["c1"]);
  });
  test("framesInLesson is COLUMN-MAJOR (Hook 1..n, Teach…, M/P…, Check…)", () =>
    expect(framesInLesson(nodes, "L1").map((f) => f.id)).toEqual(["h1", "h2", "t1", "c1"]));
  test("nextSubIndex appends", () => {
    expect(nextSubIndex(nodes, "L1", "hook")).toBe(2);
    expect(nextSubIndex(nodes, "L1", "model_practice")).toBe(0);
  });
  test("subIndexOf reads / defaults 0", () => { expect(subIndexOf(nodes[2])).toBe(1); expect(subIndexOf({ id: "z", position: { x: 0, y: 0 }, data: {} })).toBe(0); });
});

describe("→ / ← beat navigation (skips empty beats, same subIndex else first)", () => {
  const nodes = [
    L("L1", 1),
    F("h1", "L1", "hook", 0), F("h2", "L1", "hook", 1),
    F("t1", "L1", "teach", 0),
    // model_practice empty
    F("c1", "L1", "check", 0),
  ];
  test("→ same subIndex if it exists", () => expect(beatNeighborFrame(nodes, "h1", 1)?.id).toBe("t1"));
  test("→ falls to the beat's FIRST when same subIndex is missing (h2 → teach has no row 1)", () =>
    expect(beatNeighborFrame(nodes, "h2", 1)?.id).toBe("t1"));
  test("→ SKIPS an empty beat (teach → check, skipping model_practice)", () => expect(beatNeighborFrame(nodes, "t1", 1)?.id).toBe("c1"));
  test("→ off the last beat → null (caller rolls to next lesson)", () => expect(beatNeighborFrame(nodes, "c1", 1)).toBeNull());
  test("← off the first beat → null", () => expect(beatNeighborFrame(nodes, "h1", -1)).toBeNull());
  test("← walks back a beat", () => expect(beatNeighborFrame(nodes, "c1", -1)?.id).toBe("t1"));
});

describe("↑ / ↓ sub-frame navigation", () => {
  const nodes = [L("L1", 1), F("h1", "L1", "hook", 0), F("h2", "L1", "hook", 1), F("h3", "L1", "hook", 2)];
  test("↓ next sub-frame", () => expect(subNeighborFrame(nodes, "h1", 1)?.id).toBe("h2"));
  test("↑ prev sub-frame", () => expect(subNeighborFrame(nodes, "h2", -1)?.id).toBe("h1"));
  test("↓ past the last → null (caller creates in authoring)", () => expect(subNeighborFrame(nodes, "h3", 1)).toBeNull());
  test("↑ at subIndex 0 → null", () => expect(subNeighborFrame(nodes, "h1", -1)).toBeNull());
});

describe("frameWalkNext (space-walk — column-major, stops at lesson end)", () => {
  const nodes = [
    L("L1", 1),
    F("h1", "L1", "hook", 0), F("h2", "L1", "hook", 1),
    F("t1", "L1", "teach", 0),
    F("c1", "L1", "check", 0),
    L("L2", 2), F("l2h", "L2", "hook", 0),
  ];
  test("walks column-major within the lesson (Hook 1→Hook 2→Teach 1→Check 1)", () => {
    expect(frameWalkNext(nodes, "h1")?.id).toBe("h2");
    expect(frameWalkNext(nodes, "h2")?.id).toBe("t1");
    expect(frameWalkNext(nodes, "t1")?.id).toBe("c1"); // skips empty model_practice
  });
  test("NEVER rolls to the next lesson — null at the lesson's last frame", () =>
    expect(frameWalkNext(nodes, "c1")).toBeNull());
  test("frameWalkPrev is the exact reverse — null at the lesson's first frame", () => {
    expect(frameWalkPrev(nodes, "c1")?.id).toBe("t1");
    expect(frameWalkPrev(nodes, "t1")?.id).toBe("h2");
    expect(frameWalkPrev(nodes, "h2")?.id).toBe("h1");
    expect(frameWalkPrev(nodes, "h1")).toBeNull(); // never rolls to the previous lesson
  });
  test("frameCellLabel reads beat + 1-based row", () => {
    expect(frameCellLabel(nodes.find((n) => n.id === "h2"))).toBe("Hook 2");
    expect(frameCellLabel(nodes.find((n) => n.id === "t1"))).toBe("Teach 1");
  });
});

describe("cross-lesson roll (→ next Hook 1 · ← prev lesson's last beat)", () => {
  const nodes = [
    L("L1", 1), F("a-h", "L1", "hook", 0), F("a-c", "L1", "check", 0),
    L("L2", 2), F("b-h", "L2", "hook", 0), F("b-t", "L2", "teach", 0),
  ];
  test("→ off L1's last beat rolls to L2's first Hook", () => expect(lessonRollFrame(nodes, "a-c", 1)?.id).toBe("b-h"));
  test("← off L2's first beat rolls to L1's LAST non-empty beat (Check)", () => expect(lessonRollFrame(nodes, "b-h", -1)?.id).toBe("a-c"));
  test("region edges → null", () => {
    expect(lessonRollFrame(nodes, "a-h", -1)).toBeNull();
    expect(lessonRollFrame(nodes, "b-t", 1)).toBeNull();
  });
});

describe("region grid (reserved-space map)", () => {
  test("gridLayout reserves the full RESERVED_ROWS height regardless of sub-frames", () => {
    const empty = gridLayout({ hook: [], teach: [], model_practice: [], check: [] });
    const full = gridLayout({ hook: [F("a", "L", "hook", 0), F("b", "L", "hook", 1), F("c", "L", "hook", 2)], teach: [], model_practice: [], check: [] });
    expect(empty.h).toBe(full.h); // adding sub-frames NEVER grows the cell
    expect(RESERVED_ROWS).toBe(5);
  });
  test("lessonCellSize is the fixed 4-beat × 5-row footprint", () => {
    const c = lessonCellSize();
    expect(c.w).toBeGreaterThan(FRAME_W * 4);
    expect(c.h).toBe(gridLayout({ hook: [], teach: [], model_practice: [], check: [] }).h);
  });
  test("regionLayout lays cells row-major, 5 wide, min 3 rows, ghosts fill", () => {
    const cell = { w: 1000, h: 800 };
    const rl = regionLayout(11, 0, 0, true, cell);
    expect(rl.cols).toBe(5);
    expect(rl.rows).toBe(3); // 11 → still 3 rows
    expect(rl.totalSlots).toBe(15);
    expect(rl.filled).toBe(11); // 11 filled, 4 ghost
    // slot 5 (index 5) wraps to row 1, col 0
    expect(rl.cells[5]).toEqual({ x: 0, y: cell.h + REGION.gutterY });
    // wrap-up centered below the grid
    expect(rl.wrapUp!.x).toBe((rl.gridW - cell.w) / 2);
    expect(rl.wrapUp!.y).toBe(rl.gridH + REGION.wrapGapY);
  });
  test("a 16th cell SOFT-extends to a 4th row (never blocks)", () => {
    const rl = regionLayout(16, 0, 0, false, { w: 1000, h: 800 });
    expect(rl.rows).toBe(4);
    expect(rl.totalSlots).toBe(20);
    expect(rl.wrapUp).toBeNull();
  });
  test("isWrapUpName matches the destination chapter", () => {
    expect(isWrapUpName("Course Wrap-up")).toBe(true);
    expect(isWrapUpName("Wrap up")).toBe(true);
    expect(isWrapUpName("Journal Entries")).toBe(false);
    expect(isWrapUpName(null)).toBe(false);
  });
});

describe("layout", () => {
  test("frame169 aspect-locks", () => expect(frame169(1600)).toEqual({ w: 1600, h: 900 }));
  test("columnX / rowY step by frame size + gaps", () => {
    expect(columnX(0)).toBeLessThan(columnX(1));
    expect(rowY(0)).toBeLessThan(rowY(1));
  });
  test("gridLayout positions frames per (beat column, sub row) and sizes the lesson", () => {
    const grid = { hook: [F("h1", "L", "hook", 0), F("h2", "L", "hook", 1)], teach: [F("t1", "L", "teach", 0)], model_practice: [], check: [] };
    const gl = gridLayout(grid, FRAME_W, FRAME_H);
    expect(gl.positions.get("h1")!.x).toBe(columnX(0));
    expect(gl.positions.get("t1")!.x).toBe(columnX(1));
    expect(gl.positions.get("h2")!.y).toBe(rowY(1));
    expect(gl.columns.map((c) => c.beat)).toEqual(BEAT_COLUMNS);
    expect(gl.w).toBeGreaterThan(FRAME_W * 4); // 4 columns + gaps
  });
  test("SCAFFOLD_BEATS = the 4 beats in column order", () => expect(SCAFFOLD_BEATS.map((b) => b.beat)).toEqual(["hook", "teach", "model_practice", "check"]));
  test("absRectOf walks card→frame→lesson", () => {
    const lesson: RectNode = { id: "L", type: "lesson", position: { x: 100, y: 100 }, data: { w: 900, h: 500 } };
    const frame: RectNode = { id: "f", type: "frame", parentId: "L", position: { x: 40, y: 60 }, data: { w: 400, h: 225 } };
    const card: RectNode = { id: "c", type: "je", parentId: "f", position: { x: 10, y: 20 }, data: { w: 200, h: 120 } };
    const byId = new Map([lesson, frame, card].map((n) => [n.id, n]));
    expect(absRectOf(card, byId)).toEqual({ x: 150, y: 180, w: 200, h: 120 });
  });
});

describe("frameCompositionGuides — compose the shot", () => {
  const F = { w: FRAME_W, h: FRAME_H }; // 800 x 450 → center (400,225)
  const node = (x: number, y: number) => ({ x, y, w: 100, h: 60 });

  test("center snap: card center within 6px of frame center snaps both axes", () => {
    // node w=100,h=60 → to center, start would be (350,195). Drag to (347,198): dx=-3, dy=+3.
    const g = frameCompositionGuides(F, node(347, 198), [], { safeInset: null });
    expect(g.snapX).toBe(350);
    expect(g.snapY).toBe(195);
    expect(g.v.some((l) => l.pos === 400 && l.weight === "center")).toBe(true);
    expect(g.h.some((l) => l.pos === 225 && l.weight === "center")).toBe(true);
  });

  test("rule of thirds: center aligns to a third line", () => {
    // vertical third at 800/3≈266.67; node center there → start≈216.67
    const g = frameCompositionGuides(F, node(216, 0), [], { safeInset: null });
    expect(g.v.some((l) => l.weight === "third")).toBe(true);
    expect(g.snapX).toBeCloseTo(216.67, 1);
  });

  test("fifths are offered and snap, lighter weight", () => {
    // vertical fifth at 160; node center 160 → start 110
    const g = frameCompositionGuides(F, node(111, 0), [], { safeInset: null });
    expect(g.v.some((l) => l.pos === 160 && l.weight === "fifth")).toBe(true);
    expect(g.snapX).toBe(110);
  });

  test("center outranks a coincident weaker line", () => {
    // both center (400) and a sibling whose center is ~397 are near; center should win the snap
    const g = frameCompositionGuides(F, node(348, 0), [{ x: 347, y: 0, w: 100, h: 60 }], { safeInset: null });
    expect(g.snapX).toBe(350); // lands on frame center, not the sibling
  });

  test("sibling-card center alignment produces a card guide + snap", () => {
    // no frame line near, but a sibling centered at 250 (start 200,w100). node center→250 ⇒ start 200
    const g = frameCompositionGuides(F, node(202, 0), [{ x: 200, y: 999, w: 100, h: 60 }], { safeInset: null });
    expect(g.v.some((l) => l.pos === 250 && l.weight === "card")).toBe(true);
    expect(g.snapX).toBe(200);
  });

  test("Alt bypass keeps guides visible but drops the snap", () => {
    const g = frameCompositionGuides(F, node(347, 198), [], { safeInset: null, altBypass: true });
    expect(g.snapX).toBeNull();
    expect(g.snapY).toBeNull();
    expect(g.v.length).toBeGreaterThan(0); // still shows the line
  });

  test("safe-area edges snap the card's EDGE (not center) when inset is given", () => {
    // safeInset 40 → left safe line at 40; node left edge near 40 snaps start to 40
    const g = frameCompositionGuides(F, node(43, 0), [], { safeInset: 40 });
    expect(g.v.some((l) => l.pos === 40 && l.weight === "safe")).toBe(true);
    expect(g.snapX).toBe(40);
  });

  test("nothing within threshold → no guides, no snap", () => {
    const g = frameCompositionGuides(F, node(123, 77), [], { safeInset: null });
    expect(g.v).toEqual([]);
    expect(g.h).toEqual([]);
    expect(g.snapX).toBeNull();
    expect(g.snapY).toBeNull();
  });
});
