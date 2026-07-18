import { describe, expect, test } from "bun:test";

import type { ScriptNode } from "./script-doc";
import { storyboardLessons, storyboardSequence } from "./storyboard";

const node = (over: Partial<ScriptNode>): ScriptNode => ({ id: "n", position: { x: 0, y: 0 }, data: {}, ...over });
const frame = (id: string, lesson: string, beat: string, sub: number, data: Record<string, unknown> = {}): ScriptNode =>
  node({ id, type: "frame", parentId: lesson, data: { beat, subIndex: sub, ...data } });

describe("storyboardLessons", () => {
  const nodes: ScriptNode[] = [
    node({ id: "L1", type: "lesson", data: { label: "Intro", pathOrder: 0, worldDefault: "deep-space" } }),
    frame("f1", "L1", "hook", 0, { title: "Open", script: { entry: "hi", scriptState: "final" } }),
    frame("f2", "L1", "teach", 0, { title: "Teach", world: "orbital-grid", filmStatus: "filmed" }),
    node({ id: "c1", type: "je", parentId: "f2", data: { kind: "je" } }),
    node({ id: "c2", type: "list", parentId: "f2", data: { kind: "list" } }),
  ];

  test("orders cells by film order (hook before teach) with 1-based n", () => {
    const [lesson] = storyboardLessons(nodes);
    expect(lesson.label).toBe("Intro");
    expect(lesson.cells.map((c) => c.frameId)).toEqual(["f1", "f2"]);
    expect(lesson.cells.map((c) => c.n)).toEqual([1, 2]);
  });

  test("carries state, film status, card count", () => {
    const [lesson] = storyboardLessons(nodes);
    const [c1, c2] = lesson.cells;
    expect(c1.state).toBe("final");
    expect(c1.cardCount).toBe(0);
    expect(c2.filmStatus).toBe("filmed");
    expect(c2.cardCount).toBe(2);
  });

  test("effective world: own wins, else lesson default", () => {
    const [lesson] = storyboardLessons(nodes);
    expect(lesson.cells[0].world).toBe("deep-space"); // inherits lesson default
    expect(lesson.cells[1].world).toBe("orbital-grid"); // frame's own
  });

  test("storyboardSequence flattens across lessons", () => {
    const more = [...nodes, node({ id: "L2", type: "lesson", data: { label: "Two", pathOrder: 1 } }), frame("f3", "L2", "hook", 0)];
    const seq = storyboardSequence(more);
    expect(seq.map((c) => c.frameId)).toEqual(["f1", "f2", "f3"]);
  });
});
