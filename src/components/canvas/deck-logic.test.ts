import { describe, expect, test } from "bun:test";

import { lastDealtCross, lastDealtInFrame, lessonGroups, lessonIdOf, nextTucked, nextTuckedCross, nextTuckedInFrame, type DeckNode } from "./deck-logic";

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

describe("nextTuckedInFrame (the frame-scoped space-walk)", () => {
  const fcard = (id: string, frameId: string, stageOrder: number, tucked = true): DeckNode =>
    ({ id, type: "note", parentId: frameId, data: { kind: "note", deckMember: true, tucked, stageOrder } });
  const nodes: DeckNode[] = [
    lesson("L1", "Intro", 1),
    fcard("f1a", "F1", 0), fcard("f1b", "F1", 1),
    fcard("f2a", "F2", 0),
  ];
  test("deals the current frame's next tucked member, in stageOrder", () => {
    expect(nextTuckedInFrame(nodes, "F1")!.id).toBe("f1a");
  });
  test("skips already-dealt (untucked) members within the frame", () => {
    const dealt = nodes.map((n) => (n.id === "f1a" ? { ...n, data: { ...n.data, tucked: false } } : n));
    expect(nextTuckedInFrame(dealt, "F1")!.id).toBe("f1b");
  });
  test("frame exhausted → undefined (caller arms the transition)", () => {
    const done = nodes.map((n) => (n.parentId === "F1" ? { ...n, data: { ...n.data, tucked: false } } : n));
    expect(nextTuckedInFrame(done, "F1")).toBeUndefined();
  });
  test("scoped to the frame — F2's card never leaks into F1's walk", () => {
    const done = nodes.map((n) => (n.parentId === "F1" ? { ...n, data: { ...n.data, tucked: false } } : n));
    expect(nextTuckedInFrame(done, "F2")!.id).toBe("f2a"); // F2 still has its own
  });
});

describe("lessonGroups — empty lessons included (import targets)", () => {
  test("a lesson with no entries still gets a group (0 members); empty Loose hides", () => {
    const gs = lessonGroups([lesson("L1", "Intro", 1), lesson("LW", "Wrap-up", 9), card("a", { deckLessonId: "L1" })]);
    expect(gs.map((g) => [g.label, g.members.length])).toEqual([["Intro", 1], ["Wrap-up", 0]]);
  });
});

// ---- HARDENING P3: membership-vs-presence + deal order (Lee's filming core) ----

import { deckMembers, isMember, isTucked } from "./deck-logic";

describe("isMember / isTucked — membership is separate from presence", () => {
  test("a dealt member is still IN the deck (member, not tucked)", () => {
    const d = { kind: "je" as const, deckMember: true, tucked: false };
    expect(isMember(d)).toBe(true);
    expect(isTucked(d)).toBe(false);
  });
  test("a tucked member is hidden but still a member", () => {
    const d = { kind: "je" as const, deckMember: true, tucked: true };
    expect(isMember(d)).toBe(true);
    expect(isTucked(d)).toBe(true);
  });
  test("a loose card is NOT a member", () => {
    expect(isMember({ kind: "je" as const })).toBe(false);
  });
  test("legacy staged/minimized read as tucked members (v1 scenes)", () => {
    expect(isMember({ kind: "note" as const, staged: true })).toBe(true);
    expect(isTucked({ kind: "note" as const, staged: true })).toBe(true);
    expect(isMember({ kind: "note" as const, minimized: true })).toBe(true);
    expect(isTucked({ kind: "note" as const, minimized: true })).toBe(true);
  });
  test("ELEMENTS never count as deck members even if flagged", () => {
    expect(isMember({ kind: "heading" as const, deckMember: true })).toBe(false);
    expect(isMember({ kind: "text" as const, deckMember: true, tucked: true })).toBe(false);
  });
});

describe("deckMembers — deal order (container path first, then stageOrder)", () => {
  const m = (id: string, stageOrder: number, parentId?: string): DeckNode =>
    ({ id, type: "note", parentId, data: { kind: "note", deckMember: true, tucked: true, stageOrder } });

  test("stageOrder orders loose members; elements + containers excluded", () => {
    const nodes: DeckNode[] = [
      m("c", 2), m("a", 0), m("b", 1),
      { id: "el", type: "heading", data: { kind: "heading", deckMember: true } }, // element, excluded
      { id: "L", type: "lesson", data: { label: "L", pathOrder: 1 } }, // container, excluded
    ];
    expect(deckMembers(nodes).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  test("a lesson's pathOrder wins over stageOrder across containers", () => {
    const nodes: DeckNode[] = [
      { id: "L2", type: "lesson", data: { label: "L2", pathOrder: 2 } },
      { id: "L1", type: "lesson", data: { label: "L1", pathOrder: 1 } },
      m("x", 99, "L1"), // in L1 (path 1) but high stageOrder
      m("y", 0, "L2"),  // in L2 (path 2) but low stageOrder
    ];
    // L1 (path 1) deals before L2 (path 2) regardless of stageOrder
    expect(deckMembers(nodes).map((n) => n.id)).toEqual(["x", "y"]);
  });
});

describe("lastDealtInFrame / lastDealtCross (Shift+Space reverse — item 3)", () => {
  const fcard = (id: string, frame: string, order: number, tucked: boolean): DeckNode =>
    ({ id, type: "je", parentId: frame, data: { kind: "je", deckMember: true, tucked, stageOrder: order } });

  test("lastDealtInFrame returns the highest-order DEALT (not tucked) member of the frame", () => {
    const nodes = [fcard("a", "F1", 0, false), fcard("b", "F1", 1, false), fcard("c", "F1", 2, true)];
    expect(lastDealtInFrame(nodes, "F1")?.id).toBe("b"); // c is still tucked; b was the last dealt
  });

  test("lastDealtInFrame is undefined when the frame has no dealt members", () => {
    const nodes = [fcard("a", "F1", 0, true), fcard("b", "F1", 1, true)];
    expect(lastDealtInFrame(nodes, "F1")).toBeUndefined();
  });

  test("reverse of deal: it un-deals in the exact reverse order Space dealt", () => {
    // deal order was a, b (nextTuckedInFrame ascending). reverse pops b then a.
    let nodes = [fcard("a", "F1", 0, false), fcard("b", "F1", 1, false)];
    expect(lastDealtInFrame(nodes, "F1")?.id).toBe("b");
    nodes = [fcard("a", "F1", 0, false), fcard("b", "F1", 1, true)]; // b re-tucked
    expect(lastDealtInFrame(nodes, "F1")?.id).toBe("a");
  });

  test("lastDealtCross returns the most-recently-dealt member globally", () => {
    const nodes = [fcard("a", "F1", 0, false), fcard("b", "F2", 5, false), fcard("c", "F2", 9, true)];
    expect(lastDealtCross(nodes)?.id).toBe("b");
  });
});
