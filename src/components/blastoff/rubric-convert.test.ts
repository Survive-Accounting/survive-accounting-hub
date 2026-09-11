// The A = L + E converter, pinned against the real cards in "Accounting equation effects"
// (read from the bank on 2026-09-11): the shortened transaction, the heading, the amount, the
// arrows read from the correct answer, and the convert itself — skip the MCQ, rubric after it,
// the cut moved, idempotent, the non-A = L + E card left alone.
import { describe, expect, test } from "bun:test";

import type { BlastFrame } from "./plan";
import { aleCandidates, amountOf, arrowsFromAnswer, convertAleCards, headingFor, isAleStem, shortMoney, shortTransaction, type AleCard } from "./rubric-convert";

const card = (id: string, stem: string, correct: string, noteOnly = false): AleCard => ({ id, stem, noteOnly, choices: [{ text: "decoy" }, { text: correct, correct: true }] });

const INVEST = "Lee invests $10,000 cash into Survive Co in exchange for common stock. From Survive Co's perspective, what is the effect on A = L + E?";
const INSURANCE = "Survive Co pays $1,200 cash now for a one-year insurance policy that begins today. What is the immediate effect on A = L + E?";
const NOTE = "Survive Co pays $5,000 cash for the note it borrowed previously. Effect on A = L + E?";
const REMINDER = "Which reminder is most useful before answering any accounting-equation question?";

describe("the A = L + E converter", () => {
  test("Lee's own example: the stem shortens to the transaction, $10,000 → $10K", () => {
    expect(shortTransaction(INVEST)).toBe("Lee invests $10K cash into Survive Co in exchange for common stock.");
    expect(shortTransaction(NOTE)).toBe("Survive Co pays $5K cash for the note it borrowed previously.");
    expect(shortTransaction(INSURANCE)).toBe("Survive Co pays $1,200 cash now for a one-year insurance policy that begins today.");
    expect(shortMoney("$800 and $1,500 and $3,000 and $2000")).toBe("$800 and $1,500 and $3K and $2K");
  });

  test("which cards are A = L + E questions, the heading, the amount", () => {
    expect(isAleStem(INVEST)).toBe(true);
    expect(isAleStem("What is the effect on total A=L+E?")).toBe(true);
    expect(isAleStem(REMINDER)).toBe(false);
    expect(headingFor(INVEST)).toBe("Effect on A = L + E?");
    expect(headingFor(INSURANCE)).toBe("Immediate effect on A = L + E?");
    expect(amountOf(INVEST)).toBe(10000);
    expect(amountOf(INSURANCE)).toBe(1200);
    expect(amountOf(REMINDER)).toBe(0);
  });

  test("the arrows, from the answers the set actually uses", () => {
    expect(arrowsFromAnswer("Assets ↑ and Equity ↑")).toEqual({ A: ["up"], L: [], E: ["up"], Rev: [], Exp: [] });
    expect(arrowsFromAnswer("Assets ↓ and Liabilities ↓")).toEqual({ A: ["down"], L: ["down"], E: [], Rev: [], Exp: [] });
    expect(arrowsFromAnswer("One asset ↑ and another asset ↓; total assets are unchanged")).toEqual({ A: ["up", "down"], L: [], E: [], Rev: [], Exp: [] });
    expect(arrowsFromAnswer("Assets ↓ and Expense ↑")).toEqual({ A: ["down"], L: [], E: [], Rev: [], Exp: ["up"] });
    expect(arrowsFromAnswer("No part of the equation changes")).toEqual({ A: ["ne"], L: ["ne"], E: ["ne"], Rev: [], Exp: [] });
    expect(arrowsFromAnswer("Pretend you ARE the company and ask what changed")).toBeNull();
  });

  test("the convert: MCQ skipped, rubric right after it with the card's id, the cut moved, lines copied", () => {
    const cards = [card("c1", INVEST, "Assets ↑ and Equity ↑"), card("c2", INSURANCE, "One asset ↑ and another asset ↓; total assets are unchanged"), card("c3", REMINDER, "Pretend you ARE the company")];
    const frames: BlastFrame[] = [
      { id: "intro", kind: "intro" },
      { id: "f1", kind: "ceq", ceqId: "c1", prompter: ["He hands over ten grand."] },
      { id: "f2", kind: "ceq", ceqId: "c2", cutAfter: true },
      { id: "f3", kind: "ceq", ceqId: "c3" },
      { id: "outro", kind: "outro" },
    ];
    expect(aleCandidates(frames, cards).map((f) => f.id)).toEqual(["f1", "f2"]);
    const r = convertAleCards(frames, cards);
    expect(r.converted).toEqual(["f1", "f2"]);
    expect(r.frames.map((f) => f.kind)).toEqual(["intro", "ceq", "rubric", "ceq", "rubric", "ceq", "outro"]);
    const [, mcq1, rub1, mcq2, rub2] = r.frames;
    expect(mcq1.skipped).toBe(true);
    expect(rub1.ceqId).toBe("c1");
    expect(rub1.rubric?.text).toBe("Lee invests $10K cash into Survive Co in exchange for common stock.");
    expect(rub1.rubric?.arrows).toEqual({ A: ["up"], L: [], E: ["up"], Rev: [], Exp: [] });
    expect(rub1.rubric?.amount).toBe(10000);
    expect(rub1.title).toBeUndefined();                              // the default heading
    expect(rub1.prompter).toEqual(["He hands over ten grand."]);
    expect(mcq2.cutAfter).toBeUndefined();                           // the cut moved to the rubric
    expect(rub2.cutAfter).toBe(true);
    expect(rub2.title).toBe("Immediate effect on A = L + E?");
    expect(r.frames[5].skipped).toBeUndefined();                     // the reminder card stays an MCQ
    // idempotent: nothing left to convert
    expect(aleCandidates(r.frames, cards)).toEqual([]);
    expect(convertAleCards(r.frames, cards).converted).toEqual([]);
    // just one
    expect(convertAleCards(frames, cards, "f2").converted).toEqual(["f2"]);
  });

  test("a skipped MCQ and a note card are never converted", () => {
    const cards = [card("c1", INVEST, "Assets ↑ and Equity ↑"), card("n1", INVEST, "x", true)];
    const frames: BlastFrame[] = [{ id: "f1", kind: "ceq", ceqId: "c1", skipped: true }, { id: "f2", kind: "ceq", ceqId: "n1" }];
    expect(aleCandidates(frames, cards)).toEqual([]);
  });
});
