import { describe, expect, test } from "bun:test";

import { lessonGroups, lessonIdOf, nextTucked, nextTuckedCross, type DeckNode } from "./deck-logic";

const lesson = (id: string, label: string, pathOrder: number | null): DeckNode =>
  ({ id, type: "lesson", data: { label, pathOrder } });
const card = (id: string, opts: Record<string, unknown> = {}): DeckNode =>
  ({ id, type: "note", data: { kind: "note", deckMember: true, tucked: true, stageOrder: 0, ...opts } });

// two lessons in path order + a loose card — the PROMPT C walk fixture
const FIX: DeckNode[] = [
  lesson("L1", "Intro", 1),
  lesson("L2", "Practice", 2),
  card("a", { deckLessonId: "L1", stageOrder: 0 }),
  card("b", { deckLessonId: "L1", stageOrder: 1 }),
  card("c", { deckLessonId: "L2", stageOrder: 2 }),
  card("d", { deckLessonId: null, stageOrder: 3 }), // Loose
];

describe("lessonIdOf", () => {
  test("stamp wins; lesson-parented members heal; loose reads null", () => {
    const nodes: DeckNode[] = [lesson("L1", "Intro", 1), { id: "x", type: "note", parentId: "L1", data: { kind: "note", deckMember: true } }];
    expect(lessonIdOf(nodes[1], nodes)).toBe("L1"); // healed from parent
    expect(lessonIdOf(card("y", { deckLessonId: "L9" }), nodes)).toBe("L9");
    expect(lessonIdOf(card("z", { deckLessonId: null }), nodes)).toBeNull();
  });
});

describe("lessonGroups", () => {
  test("groups by lesson in path order, Loose last, counts right", () => {
    const gs = lessonGroups(FIX);
    expect(gs.map((g) => g.label)).toEqual(["Intro", "Practice", "Loose"]);
    expect(gs.map((g) => g.members.length)).toEqual([2, 1, 1]);
  });

  test("dangling deckLessonId (lesson deleted) falls back to Loose", () => {
    const gs = lessonGroups([card("a", { deckLessonId: "gone" })]);
    expect(gs).toHaveLength(1);
    expect(gs[0].lessonId).toBeNull();
  });
});

describe("nextTuckedCross (the cross-lesson space-walk)", () => {
  test("walks the current lesson first, then flows into the next", () => {
    expect(nextTuckedCross(FIX, "L1")!.id).toBe("a");
    // L1 exhausted (both dealt) → next comes from L2
    const l1Done = FIX.map((n) => (n.data.deckLessonId === "L1" ? { ...n, data: { ...n.data, tucked: false } } : n));
    expect(nextTuckedCross(l1Done, "L1")!.id).toBe("c");
    // L2 also exhausted → Loose
    const l2Done = l1Done.map((n) => (n.data.deckLessonId === "L2" ? { ...n, data: { ...n.data, tucked: false } } : n));
    expect(nextTuckedCross(l2Done, "L1")!.id).toBe("d");
    // everything dealt → undefined
    const allDone = l2Done.map((n) => (n.type === "note" ? { ...n, data: { ...n.data, tucked: false } } : n));
    expect(nextTuckedCross(allDone, "L1")).toBeUndefined();
  });

  test("no current lesson → first group in path order", () => {
    expect(nextTuckedCross(FIX, undefined)!.id).toBe("a");
  });

  test("current = a later lesson wraps to earlier groups last", () => {
    expect(nextTuckedCross(FIX, "L2")!.id).toBe("c");
    const l2Done = FIX.map((n) => (n.data.deckLessonId === "L2" ? { ...n, data: { ...n.data, tucked: false } } : n));
    // L2 exhausted, Loose next in the wrap order, then back to L1
    expect(nextTuckedCross(l2Done, "L2")!.id).toBe("d");
  });

  test("global nextTucked still honors overall order", () => {
    expect(nextTucked(FIX)!.id).toBe("a");
  });
});
