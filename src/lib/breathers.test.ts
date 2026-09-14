import { describe, expect, test } from "bun:test";

import { breatherPosition, breatherWarnings, moveBreather, newBreather, studentBreathers, type Breather } from "./breathers";

const order = Array.from({ length: 14 }, (_, i) => (i === 0 ? "s" : `s#${i + 1}`));
const b = (after: number, body = "Receivable is always an asset.", live = true): Breather => ({ ...newBreather(order[after]), body, live });

describe("breathers", () => {
  test("nothing is created by default, and a new one is a draft with no text", () => {
    const n = newBreather("s#3");
    expect(n.live).toBe(false);
    expect(n.body).toBe("");
    expect(n.heading).toBe("You just learned");
  });

  test("warnings: long runs, too close, empty, too long, after the last video", () => {
    expect(breatherWarnings(order, []).map((w) => w.kind)).toEqual(["long_run"]);
    const w = breatherWarnings(order, [b(1), b(2), b(7, ""), b(9, "x".repeat(150))]).map((x) => x.kind);
    expect(w).toContain("too_close");
    expect(w).toContain("empty");
    expect(w).toContain("too_long");
    expect(breatherWarnings(order, [b(13)]).some((x) => x.message.includes("never shows"))).toBe(true);
    // Lee's example spacing (after 2, 8 and 10) leaves 8→10 fine and a run of 6 from 3–8.
    const lee = breatherWarnings(order, [b(1), b(7), b(9)]);
    expect(lee.filter((x) => x.kind === "too_close")).toHaveLength(0);
    expect(lee.filter((x) => x.kind === "long_run")).toHaveLength(1);
  });

  test("students get live breathers with text, as part indexes, never after the last video", () => {
    const s = studentBreathers(order, [b(7), b(1), b(3, "", true), b(5, "draft", false), b(13)]);
    expect(s.map((x) => x.afterIndex)).toEqual([1, 7]);
  });

  test("move and position", () => {
    const one = b(1);
    expect(moveBreather([one], one.id, "s#5")[0].afterPubKey).toBe("s#5");
    expect(breatherPosition(2, 14)).toBe("3 of 14");
  });
});
