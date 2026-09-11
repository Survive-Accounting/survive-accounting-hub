// The slide bank's rules, pinned: newest on top, no duplicates, a cap, a banked slide is never
// skipped, and a set card only goes back into its own set.
import { describe, expect, test } from "bun:test";

import { BANK_MAX, addToBank, bankItemId, pasteBlocker, removeFromBank, type BankAdd } from "./slide-bank";

const add = (setId: string, id: string, kind: "ceq" | "phrase" = "phrase"): BankAdd => ({
  setId, setName: `Set ${setId}`, label: kind === "ceq" ? "Set card" : "Memorize this", snippet: "Assets = OWN",
  frame: { id, kind, ...(kind === "ceq" ? { ceqId: `c-${id}` } : { text: "Assets" }), skipped: true },
});

describe("the slide bank", () => {
  test("new slides go on top; banking one again moves it up instead of stacking it", () => {
    const t1 = new Date("2026-09-11T10:00:00Z"), t2 = new Date("2026-09-11T11:00:00Z");
    let b = addToBank([], [add("s1", "a"), add("s1", "b")], t1);
    expect(b.map((x) => x.id)).toEqual([bankItemId("s1", "a"), bankItemId("s1", "b")]);
    b = addToBank(b, [add("s1", "b")], t2);
    expect(b.map((x) => x.frame.id)).toEqual(["b", "a"]);
    expect(b[0].savedAt).toBe(t2.toISOString());
  });

  test("a banked slide is never skipped, and the shelf keeps its cap", () => {
    expect(addToBank([], [add("s1", "a")])[0].frame.skipped).toBeUndefined();
    const many = Array.from({ length: BANK_MAX + 5 }, (_, i) => add("s1", `f${i}`));
    expect(addToBank([], many)).toHaveLength(BANK_MAX);
  });

  test("remove takes one off", () => {
    const b = addToBank([], [add("s1", "a"), add("s1", "b")]);
    expect(removeFromBank(b, bankItemId("s1", "a")).map((x) => x.frame.id)).toEqual(["b"]);
  });

  test("a set card only goes back into its own set; anything else pastes anywhere", () => {
    const [card] = addToBank([], [add("s1", "a", "ceq")]);
    const [callout] = addToBank([], [add("s1", "b", "phrase")]);
    expect(pasteBlocker(card, "s1")).toBeNull();
    expect(pasteBlocker(card, "s2")).toMatch(/can only go back into that set/);
    expect(pasteBlocker(callout, "s2")).toBeNull();
  });
});
