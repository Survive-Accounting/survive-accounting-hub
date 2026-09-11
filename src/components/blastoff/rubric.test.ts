// The rubric's rules, pinned: the click cycle, the derived equity arrow, the balance line, the
// reveal order the spacebar walks, and that every one of Lee's eight presets balances.
import { describe, expect, test } from "bun:test";

import { RUBRIC_KEYS, RUBRIC_PRESETS, applyPreset, assertRenderable, balanceDiff, balanceLine, cycleArrows, cycleKey, derivedEquity, emptyRubric, equityShown, revealGroups, revealedKeys, rubricSteps } from "./rubric";

describe("the equation rubric", () => {
  test("a box cycles blank → ↑ → ↓ → ↑↓ → blank, and ↓↑ counts as ↑↓", () => {
    expect(cycleArrows([])).toEqual(["up"]);
    expect(cycleArrows(["up"])).toEqual(["down"]);
    expect(cycleArrows(["down"])).toEqual(["up", "down"]);
    expect(cycleArrows(["up", "down"])).toEqual([]);
    expect(cycleArrows(["down", "up"])).toEqual([]);
    const s = emptyRubric();
    const next = cycleKey(s.arrows, "Rev");
    expect(next.Rev).toEqual(["up"]);
    expect(s.arrows.Rev).toEqual([]);            // a new object; the old one untouched
    for (const k of RUBRIC_KEYS) if (k !== "Rev") expect(next[k]).toEqual([]);
  });

  test("equity effect: Rev↑ → E↑, Exp↑ → E↓, faded, and only while E is blank", () => {
    const s = emptyRubric();
    s.arrows.Rev = ["up"];
    expect(derivedEquity(s.arrows)).toEqual(["up"]);
    s.arrows.Exp = ["up"];
    expect(derivedEquity(s.arrows)).toEqual(["up", "down"]);
    expect(equityShown({ ...s, equityEffect: false })).toEqual({ arrows: [], ghost: false });
    expect(equityShown({ ...s, equityEffect: true })).toEqual({ arrows: ["up", "down"], ghost: true });
    s.arrows.E = ["down"];
    expect(equityShown({ ...s, equityEffect: true })).toEqual({ arrows: ["down"], ghost: false });
  });

  test("the balance line reads A = L + E + Rev − Exp, and says nothing in arrows mode", () => {
    const s = { ...emptyRubric(), show: "amounts" as const, amount: 600 };
    s.arrows = { ...s.arrows, A: ["down"], Exp: ["up"] };          // paid rent
    expect(balanceDiff(s)).toBe(0);
    expect(balanceLine(s)).toEqual({ ok: true, text: "⚖ Balanced" });
    s.arrows = { ...s.arrows, A: ["down"], Exp: ["down"] };        // wrong way on Exp
    expect(balanceLine(s)).toEqual({ ok: false, text: "⚖ Off by $1,200" });
    expect(balanceLine({ ...s, show: "arrows" })).toBeNull();
    expect(balanceLine({ ...s, amount: 0 })).toBeNull();
    expect(balanceLine({ ...emptyRubric(), show: "amounts", amount: 5 })).toBeNull();
    // both arrows in one box net to zero — bought supplies with cash
    expect(balanceDiff({ arrows: { ...emptyRubric().arrows, A: ["up", "down"] }, amount: 800 })).toBe(0);
  });

  test("every preset balances, and applying one keeps Lee's mode / show / equity settings", () => {
    const base = { ...emptyRubric(), show: "amounts" as const, equityEffect: true };
    expect(RUBRIC_PRESETS).toHaveLength(8);
    for (const p of RUBRIC_PRESETS) {
      const s = applyPreset(base, p);
      expect(balanceDiff(s)).toBe(0);
      expect(s.text).toBe(p.text);
      expect(s.amount).toBe(p.amount);
      expect(s.show).toBe("amounts");
      expect(s.equityEffect).toBe(true);
      expect(s.mode).toBe("ale");
    }
    // a preset clears boxes it doesn't name
    const dirty = { ...base, arrows: { ...base.arrows, L: ["up" as const], Exp: ["down" as const] } };
    expect(applyPreset(dirty, RUBRIC_PRESETS[0]).arrows).toEqual({ A: ["up"], L: [], E: ["up"], Rev: [], Exp: [] });
  });

  test("the reveal walks A, L, E, then Rev/Exp together — skipping empty boxes", () => {
    const s = applyPreset(emptyRubric(), RUBRIC_PRESETS[3]);   // services on account: A↑ Rev↑
    expect(revealGroups(s)).toEqual([["A"], ["Rev", "Exp"]]);
    expect(rubricSteps(s)).toBe(3);
    expect([...revealedKeys(s, 0)]).toEqual([]);
    expect([...revealedKeys(s, 1)]).toEqual(["A"]);
    expect([...revealedKeys(s, 2)]).toEqual(["A", "Rev", "Exp"]);
    expect([...revealedKeys(s, 99)]).toEqual(["A", "Rev", "Exp"]);
    expect(revealedKeys(s, undefined).size).toBe(5);                // at rest: everything
    // the derived E is its own step when the equity effect is on
    expect(revealGroups({ ...s, equityEffect: true })).toEqual([["A"], ["E"], ["Rev", "Exp"]]);
    expect(rubricSteps(emptyRubric())).toBe(1);
  });

  test("only A = L + E renders; the debit / credit mode is refused with a message", () => {
    expect(assertRenderable({ mode: "ale" })).toBeNull();
    expect(assertRenderable({ mode: "dc" })).toMatch(/isn't built yet/);
  });
});
