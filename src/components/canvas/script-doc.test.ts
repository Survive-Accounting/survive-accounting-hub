import { describe, expect, test } from "bun:test";

import { courseScriptMarkdown, filmStatusOf, hasScript, scriptTree, type ScriptNode } from "./script-doc";

const lesson = (id: string, label: string, pathOrder: number): ScriptNode => ({
  id, type: "lesson", position: { x: 0, y: 0 }, data: { label, pathOrder },
});
const frame = (id: string, parentId: string, beat: string, subIndex: number, data: Record<string, unknown> = {}): ScriptNode => ({
  id, type: "frame", parentId, position: { x: 0, y: 0 }, data: { beat, subIndex, ...data },
});

const scene: ScriptNode[] = [
  lesson("L2", "Ch 2 · Debits", 2),
  lesson("L1", "Ch 1 · Accounts", 1),
  frame("f-hook", "L1", "hook", 0, { title: "Title card", script: { entry: "Welcome back.", beats: "why accounts\nfive types", exit: "Let's map them." } }),
  frame("f-hook2", "L1", "hook", 1, { title: "Outline" }),
  frame("f-check", "L1", "check", 0, { filmStatus: "filmed", script: { entry: "Quiz time." } }),
  frame("f-teach", "L1", "teach", 0, { filmStatus: "retake" }),
  frame("f2-hook", "L2", "hook", 0),
];

describe("scriptTree", () => {
  test("lessons in path order, beats in column order, frames by subIndex, walk numbering", () => {
    const t = scriptTree(scene);
    expect(t.map((l) => l.lessonId)).toEqual(["L1", "L2"]);
    const l1 = t[0];
    expect(l1.beats.map((b) => b.beat)).toEqual(["hook", "teach", "check"]); // model_practice empty → dropped
    expect(l1.beats[0].frames.map((f) => f.frameId)).toEqual(["f-hook", "f-hook2"]);
    // walk numbering runs across the whole lesson: hook(1,2) teach(3) check(4)
    expect(l1.beats.flatMap((b) => b.frames.map((f) => f.n))).toEqual([1, 2, 3, 4]);
  });

  test("progress counts: scripted + filmed vs total", () => {
    const l1 = scriptTree(scene)[0];
    expect(l1.total).toBe(4);
    expect(l1.scripted).toBe(2); // f-hook + f-check carry text
    expect(l1.filmed).toBe(1); // retake ≠ filmed
  });

  test("hasScript ignores whitespace-only fields", () => {
    expect(hasScript({ entry: "  " })).toBe(false);
    expect(hasScript({ beats: "a" })).toBe(true);
    expect(hasScript(undefined)).toBe(false);
  });

  test("filmStatusOf defaults to unfilmed", () => {
    expect(filmStatusOf({})).toBe("unfilmed");
    expect(filmStatusOf({ filmStatus: "filmed" })).toBe("filmed");
    expect(filmStatusOf({ filmStatus: "bogus" })).toBe("unfilmed");
  });
});

describe("courseScriptMarkdown", () => {
  const md = courseScriptMarkdown(scriptTree(scene), "Start Here");

  test("hierarchy: course › lesson › beat › frame", () => {
    expect(md).toContain("# Start Here — course script");
    expect(md.indexOf("## Ch 1 · Accounts")).toBeLessThan(md.indexOf("## Ch 2 · Debits"));
    expect(md).toContain("### Hook");
    expect(md).toContain("**Frame 1 — Title card**");
  });

  test("entry as quote, beats as bullets, exit as italic quote, unscripted flagged", () => {
    expect(md).toContain("> Welcome back.");
    expect(md).toContain("- why accounts");
    expect(md).toContain("- five types");
    expect(md).toContain("> _Let's map them._");
    expect(md).toContain("_(no script yet)_");
  });

  test("summary line counts scripted frames", () => {
    expect(md).toContain("2 lessons · 2/5 frames scripted");
  });
});
