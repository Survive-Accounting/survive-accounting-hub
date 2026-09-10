// THE SPINE'S SELECTION — a list with the focused slide last, so everything that read the one
// selected id keeps reading it. Lee's notes: multi-select, range select.
import { describe, expect, test } from "bun:test";

import { EMPTY_SELECTION, clickSelect, focusOnly, getClip, pickOrdered, setClip, type Selection } from "./spine-select";
import type { BlastFrame } from "./plan";

const order = ["a", "b", "c", "d", "e"];

describe("clickSelect", () => {
  test("a plain click is just that slide, and it becomes the anchor", () => {
    expect(clickSelect(EMPTY_SELECTION, order, "c", { shift: false, ctrl: false })).toEqual({ ids: ["c"], anchor: "c" });
    expect(clickSelect({ ids: ["a", "b"], anchor: "a" }, order, "d", { shift: false, ctrl: false })).toEqual({ ids: ["d"], anchor: "d" });
  });
  test("shift walks the range forward from the anchor, clicked slide last (the focus)", () => {
    const sel = clickSelect({ ids: ["b"], anchor: "b" }, order, "d", { shift: true, ctrl: false });
    expect(sel.ids).toEqual(["b", "c", "d"]);
    expect(sel.anchor).toBe("b");
  });
  test("shift walks backward too — the clicked slide is still last", () => {
    const sel = clickSelect({ ids: ["d"], anchor: "d" }, order, "b", { shift: true, ctrl: false });
    expect(sel.ids).toEqual(["d", "c", "b"]);
    expect(sel.ids[sel.ids.length - 1]).toBe("b");
    expect(sel.anchor).toBe("d");
  });
  test("shift with no anchor (or an anchor that left the spine) is a plain click", () => {
    expect(clickSelect(EMPTY_SELECTION, order, "c", { shift: true, ctrl: false })).toEqual({ ids: ["c"], anchor: "c" });
    expect(clickSelect({ ids: ["zz"], anchor: "zz" }, order, "c", { shift: true, ctrl: false })).toEqual({ ids: ["c"], anchor: "c" });
  });
  test("ctrl toggles: on adds it to the end, the anchor stays", () => {
    const sel = clickSelect({ ids: ["a"], anchor: "a" }, order, "d", { shift: false, ctrl: true });
    expect(sel).toEqual({ ids: ["a", "d"], anchor: "a" });
    expect(clickSelect(EMPTY_SELECTION, order, "d", { shift: false, ctrl: true })).toEqual({ ids: ["d"], anchor: "d" });
  });
  test("ctrl toggles off; toggling off the last one leaves the pick empty", () => {
    const two = clickSelect({ ids: ["a", "d"], anchor: "a" }, order, "a", { shift: false, ctrl: true });
    expect(two.ids).toEqual(["d"]);
    const none = clickSelect(two, order, "d", { shift: false, ctrl: true });
    expect(none.ids).toEqual([]);
    expect(none.anchor).toBeNull();
  });
});

describe("pickOrdered", () => {
  test("returns the pick in spine order whatever order it was clicked in, dropping ids gone from the spine", () => {
    const sel: Selection = { ids: ["d", "zz", "a", "c"], anchor: "d" };
    expect(pickOrdered(sel, order)).toEqual(["a", "c", "d"]);
  });
});

describe("focusOnly", () => {
  test("Escape on a multi-pick keeps only the focused (last) slide", () => {
    expect(focusOnly({ ids: ["d", "c", "b"], anchor: "d" })).toEqual({ ids: ["b"], anchor: "b" });
    expect(focusOnly(EMPTY_SELECTION)).toEqual(EMPTY_SELECTION);
  });
});

describe("the clipboard", () => {
  test("holds a copy of what was put in it, not the array itself", () => {
    const frames: BlastFrame[] = [{ id: "x", kind: "phrase", text: "Cash is king" }];
    setClip(frames);
    frames.push({ id: "y", kind: "blank" });
    expect(getClip().map((f) => f.id)).toEqual(["x"]);
    setClip([]);
    expect(getClip()).toEqual([]);
  });
});
