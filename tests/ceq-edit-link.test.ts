import { describe, expect, test } from "bun:test";

import { editHref } from "../src/components/canvas/ceq-edit-link";

// The Edit links above the CURRENT and PROPOSED columns of a CEQ edit card on
// a Results board. The base always comes from the route's own $topic/$set —
// these tests use two different sets on purpose, so a hardcoded one would fail.
const EASY = "/v3/easy-points/internal-vs-external-users/blast-off/edit";
const OTHER = "/v3/easy-points/account-classification/blast-off/edit";

const item = { id: "bi-123", ceqIds: ["ceq-e1s-EP"] };

describe("editHref", () => {
  test("carries side=proposed", () => {
    const q = new URL(editHref(EASY, "proposed", item), "https://x.test").searchParams;
    expect(q.get("side")).toBe("proposed");
    expect(q.get("item")).toBe("bi-123");
    expect(q.get("ceq")).toBe("ceq-e1s-EP");
  });

  test("carries side=current", () => {
    const q = new URL(editHref(EASY, "current", item), "https://x.test").searchParams;
    expect(q.get("side")).toBe("current");
  });

  test("the two sides differ only by side", () => {
    const cur = editHref(EASY, "current", item);
    const pro = editHref(EASY, "proposed", item);
    expect(cur).not.toBe(pro);
    expect(cur.replace("side=current", "side=proposed")).toBe(pro);
  });

  test("keeps the set it was given — never one hardcoded set", () => {
    expect(editHref(OTHER, "proposed", item).startsWith(`${OTHER}?`)).toBe(true);
    expect(editHref(OTHER, "proposed", item)).not.toContain("internal-vs-external");
  });

  test("omits ceq when the board item has no CEQ id", () => {
    const href = editHref(EASY, "proposed", { id: "bi-9", ceqIds: [] });
    expect(href).toContain("side=proposed");
    expect(href).not.toContain("ceq=");
  });

  test("escapes ids that need it", () => {
    const href = editHref(EASY, "proposed", { id: "bi 1&2", ceqIds: ["a b"] });
    expect(href).toContain("item=bi+1%262");
    expect(href).toContain("ceq=a+b");
  });
});
