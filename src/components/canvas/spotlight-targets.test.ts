// Regression net (overnight hardening) — locks the SPOTLIGHT TARGET REGISTRY,
// the contract filming leans on: Ctrl+click must find a target on every card /
// element kind. Element kinds spotlight the WHOLE element ("self"); card kinds
// expose their component targets. ADD-only (does not touch spotlight.test.ts).
import { describe, expect, it } from "bun:test";

import { MEMO_SELF_TARGET, spotlightTargetsOf } from "./spotlight";
import { cardId, type CardData } from "./types";

describe("spotlightTargetsOf — whole-element kinds return the self target", () => {
  const selfKinds: { kind: string; make: () => CardData }[] = [
    { kind: "heading", make: () => ({ kind: "heading", text: "H", level: 1 }) },
    { kind: "text", make: () => ({ kind: "text", body: "t", color: 0 }) },
    { kind: "examcue", make: () => ({ kind: "examcue", label: "Your exam" }) },
    { kind: "memo", make: () => ({ kind: "memo", memoKind: "note", title: "", body: "" }) },
  ];
  for (const { kind, make } of selfKinds) {
    it(`${kind} → ["self"]`, () => {
      expect(spotlightTargetsOf(make())).toEqual([MEMO_SELF_TARGET]);
    });
  }
});

describe("spotlightTargetsOf — card kinds expose component targets", () => {
  it("ceq → one target per choice", () => {
    const c: CardData = { kind: "ceq", prompt: "?", choices: [{ id: "a", text: "x", correct: true }, { id: "b", text: "y" }], editMode: false };
    expect(spotlightTargetsOf(c)).toEqual(["a", "b"]);
  });
  it("formula → one target per segment", () => {
    const c: CardData = { kind: "formula", segments: [{ id: "s1", label: "A", value: "" }, { id: "s2", label: "L", value: "" }], operators: ["="] };
    expect(spotlightTargetsOf(c)).toEqual(["s1", "s2"]);
  });
  it("cycle → one target per step (Lee: only steps, not the whole element)", () => {
    const c: CardData = { kind: "cycle", title: "The Cycle", steps: [{ id: "s1", text: "A" }, { id: "s2", text: "B" }] } as unknown as CardData;
    expect(spotlightTargetsOf(c)).toEqual(["s1", "s2"]);
  });
  it("unknown/undefined → no targets (never throws)", () => {
    expect(spotlightTargetsOf(undefined)).toEqual([]);
  });
});
