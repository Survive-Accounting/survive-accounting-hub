// SET PRODUCTION PROFILES (P6) — soft checks never block; templates are
// copy-on-write.
import { describe, expect, test } from "bun:test";

import { checkFilmReadiness, type ReadinessCard } from "./film-readiness";
import { applyTemplate, templateFromDeck } from "./set-profile";
import type { DeckDef } from "./types";

const ready: ReadinessCard = {
  id: "q1", prompt: "Q", shorthand: "q", run: "A",
  choices: [{ text: "A", correct: true }, { text: "B" }], chainCount: 1,
};
const note = (id: string): ReadinessCard => ({ id, prompt: "breathe", noteOnly: true, choices: [], chainCount: 0 });

describe("profile-aware readiness — soft, never blocking", () => {
  test("note-budget overrun warns amber but the set stays READY", () => {
    const r = checkFilmReadiness([ready, note("n1"), note("n2"), note("n3")], { noteBudget: 2 });
    const c = r.checks.find((x) => x.key === "noteBudget")!;
    expect(c.soft).toBe(true);
    expect(c.ok).toBe(false);
    expect(c.fails[0].label).toContain("1 over");
    expect(r.ready).toBe(true); // soft never blocks
  });
  test("within budget: no soft check appears", () => {
    const r = checkFilmReadiness([ready, note("n1")], { noteBudget: 2 });
    expect(r.checks.find((x) => x.key === "noteBudget")).toBeUndefined();
  });
  test("dissect-heavy lists run-covered CEQs as soft advice", () => {
    const r = checkFilmReadiness([ready], { style: "dissect-heavy" });
    const c = r.checks.find((x) => x.key === "dissectHeavy")!;
    expect(c.soft).toBe(true);
    expect(r.ready).toBe(true);
  });
  test("no profile: byte-identical behavior to before P6", () => {
    const r = checkFilmReadiness([ready]);
    expect(r.checks.some((x) => x.soft)).toBe(false);
    expect(r.ready).toBe(true);
  });
});

describe("templates — copy-on-write, nothing links back", () => {
  const deck = { id: "d1", name: "Intro set", payloadType: "cards", profile: { style: "mixed", noteBudget: 3, formula: "fast" }, layout: { card: { x: 1, y: 2, scale: 1 } } } as unknown as DeckDef;
  test("templateFromDeck carries profile + layout, never questions", () => {
    const t = templateFromDeck("tpl", deck);
    expect(t.profile?.style).toBe("mixed");
    expect(t.layout).toEqual(deck.layout);
    expect(Object.keys(t)).not.toContain("slots");
  });
  test("applyTemplate returns deep copies — mutating the set never touches the template", () => {
    const t = templateFromDeck("tpl", deck);
    const patch = applyTemplate(t);
    (patch.profile as { noteBudget?: number }).noteBudget = 99;
    (patch.layout as { card: { x: number } }).card.x = 99;
    expect(t.profile?.noteBudget).toBe(3);
    expect((t.layout as { card: { x: number } }).card.x).toBe(1);
  });
});
