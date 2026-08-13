import { describe, expect, test } from "bun:test";

import { cycleScriptState, deriveScriptState, scriptTree, SCRIPT_STATE_META, type ScriptNode } from "./script-doc";
import type { FrameScript } from "./types";

describe("script state derivation", () => {
  test("no text → empty", () => {
    expect(deriveScriptState(undefined)).toBe("empty");
    expect(deriveScriptState({})).toBe("empty");
    expect(deriveScriptState({ entry: "   " })).toBe("empty");
  });
  test("text but no explicit state → draft", () => {
    expect(deriveScriptState({ entry: "Hello" })).toBe("draft");
    expect(deriveScriptState({ beats: "- a\n- b" })).toBe("draft");
  });
  test("explicit state wins (when there's text)", () => {
    expect(deriveScriptState({ entry: "x", scriptState: "review" })).toBe("review");
    expect(deriveScriptState({ entry: "x", scriptState: "final" })).toBe("final");
  });
  test("explicit state on empty script still reads empty (nothing to review)", () => {
    expect(deriveScriptState({ scriptState: "final" } as FrameScript)).toBe("empty");
  });
});

describe("cycleScriptState", () => {
  test("draft → review → final → draft; empty starts at draft", () => {
    expect(cycleScriptState("empty")).toBe("draft");
    expect(cycleScriptState("draft")).toBe("review");
    expect(cycleScriptState("review")).toBe("final");
    expect(cycleScriptState("final")).toBe("draft");
  });
  test("every state has display meta", () => {
    for (const s of ["empty", "draft", "review", "final"] as const) {
      expect(SCRIPT_STATE_META[s].label.length).toBeGreaterThan(0);
      expect(SCRIPT_STATE_META[s].color.startsWith("#")).toBe(true);
    }
  });
});

describe("scriptTree rolls up state", () => {
  const node = (over: Partial<ScriptNode>): ScriptNode => ({ id: "n", position: { x: 0, y: 0 }, data: {}, ...over });
  const frame = (id: string, lesson: string, beat: string, sub: number, script: FrameScript): ScriptNode =>
    node({ id, type: "frame", parentId: lesson, data: { beat, subIndex: sub, script } });

  test("final count reflects marked-final frames; scripted counts any text", () => {
    const nodes: ScriptNode[] = [
      node({ id: "L1", type: "lesson", data: { label: "Intro", pathOrder: 0 } }),
      frame("f1", "L1", "hook", 0, { entry: "hi", scriptState: "final" }),
      frame("f2", "L1", "hook", 1, { entry: "draft it" }),
      frame("f3", "L1", "teach", 0, {}), // empty
    ];
    const tree = scriptTree(nodes);
    expect(tree.length).toBe(1);
    const l = tree[0];
    expect(l.total).toBe(3);
    expect(l.scripted).toBe(2);
    expect(l.final).toBe(1);
    const states = l.beats.flatMap((b) => b.frames).map((f) => f.state);
    expect(states).toEqual(["final", "draft", "empty"]);
  });
});
