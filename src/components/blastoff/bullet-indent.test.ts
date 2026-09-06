import { describe, expect, test } from "bun:test";

import { indentBulletLine, lineStartAt } from "./bullet-indent";

describe("lineStartAt", () => {
  test("the first line starts at 0", () => {
    expect(lineStartAt("abc", 1)).toBe(0);
    expect(lineStartAt("abc", 0)).toBe(0);
  });
  test("a later line starts right after its \\n", () => {
    expect(lineStartAt("one\ntwo\nthree", 5)).toBe(4); // cursor inside "two"
    expect(lineStartAt("one\ntwo\nthree", 10)).toBe(8); // cursor inside "three"
  });
  test("cursor sitting exactly at a line start", () => {
    expect(lineStartAt("one\ntwo", 4)).toBe(4);
  });
});

describe("indentBulletLine — Tab nests, Shift+Tab un-nests", () => {
  test("Tab on a plain line adds one leading tab, cursor moves with it", () => {
    const r = indentBulletLine("Management\nBudgets", 5, 1);
    expect(r.text).toBe("\tManagement\nBudgets");
    expect(r.cursor).toBe(6);
  });
  test("Tab only touches the line the cursor is in", () => {
    const r = indentBulletLine("Management\nBudgets", 15, 1);
    expect(r.text).toBe("Management\n\tBudgets");
  });
  test("Shift+Tab removes one leading tab", () => {
    const r = indentBulletLine("\tBudgets", 4, -1);
    expect(r.text).toBe("Budgets");
    expect(r.cursor).toBe(3);
  });
  test("Shift+Tab on a depth-0 line is a no-op — never goes negative", () => {
    const r = indentBulletLine("Budgets", 3, -1);
    expect(r).toEqual({ text: "Budgets", cursor: 3 });
  });
  test("nesting twice stacks tabs (depth 2)", () => {
    const once = indentBulletLine("Item", 2, 1);
    const twice = indentBulletLine(once.text, once.cursor, 1);
    expect(twice.text).toBe("\t\tItem");
  });
  test("un-nesting only removes one level at a time", () => {
    const r = indentBulletLine("\t\tItem", 2, -1);
    expect(r.text).toBe("\tItem");
  });
});
