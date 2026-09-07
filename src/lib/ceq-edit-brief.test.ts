import { describe, expect, test } from "bun:test";

import { buildCeqEditMessages, buildMicroEditMessages, parseCeqEdit, parseMicroEdit } from "./ceq-edit-brief";

const current = {
  stem: "Which of the following users of financial information would be considered an external user?",
  choices: [
    { text: "The production manager", correct: false, feedback: "inside the company" },
    { text: "A bank deciding whether to lend", correct: true, feedback: null },
    { text: "The CFO", correct: false, feedback: null },
  ],
};

describe("the CEQ edit brief — say the fix", () => {
  // Lee, 2026-09-07: "Wherever we can click, talk, get suggestions."
  test("the Booth's two names are the same brief, re-exported", () => {
    const ceq = { id: "q1", label: "Q1", stem: "Old stem?", choices: [{ text: "A", correct: true }, { text: "B", correct: false }] };
    const m = buildMicroEditMessages({ stamp: "reword", ceq, instruction: "say it like the deck does", styleNotes: ["keep stems under 12 words"] });
    expect(m.system).toContain("Rewrite the STEM");
    expect(m.system).toContain("keep stems under 12 words");
    expect(m.user).toContain(`"say it like the deck does"`);
    expect(parseMicroEdit(`{"proposedStem":"New stem?","proposedChoices":null,"note":"tightened"}`)).toEqual({ proposedStem: "New stem?", proposedChoices: null, note: "tightened" });
  });
  test("a spoken fix with no stamp carries the card, the verbatim words, and the only-what-he-asked rule", () => {
    const m = buildCeqEditMessages({ ...current, spoken: "choice B should say lender, and the stem's too long", styleNotes: ["stems under 12 words"] });
    expect(m.system).toContain("Apply the instruction to whichever parts it names");
    expect(m.system).toContain("ONLY WHAT HE ASKED FOR");
    expect(m.system).toContain("stems under 12 words");
    expect(m.user).toContain("STEM: Which of the following users");
    expect(m.user).toContain("B. ✔ A bank deciding whether to lend");
    expect(m.user).toContain("A. The production manager — fb: inside the company");
    expect(m.user).toContain(`"choice B should say lender, and the stem's too long"`);
  });
  test("a stamped request is the Booth's brief exactly — no extra rule", () => {
    const m = buildCeqEditMessages({ ...current, spoken: "reword it", stamp: "reword" });
    expect(m.system).toContain("Rewrite the STEM");
    expect(m.system).not.toContain("ONLY WHAT HE ASKED FOR");
  });
  test("parse: a stem-only answer echoes the current choices (feedback kept); the diff flags say what moved", () => {
    const r = parseCeqEdit(`{"proposedStem":"Who is an external user?","proposedChoices":null,"note":"shorter"}`, current);
    expect(r?.stem).toBe("Who is an external user?");
    expect(r?.choices).toEqual(current.choices.map((c) => ({ text: c.text, correct: c.correct, feedback: c.feedback })));
    expect(r?.stemChanged).toBe(true);
    expect(r?.choicesChanged).toBe(false);
    expect(r?.note).toBe("shorter");
  });
  test("parse: a full choice list keeps the current feedback by position and needs exactly one correct", () => {
    const r = parseCeqEdit(`{"proposedStem":null,"proposedChoices":[{"text":"The production manager","correct":false},{"text":"A lender","correct":true},{"text":"The CFO","correct":false}],"note":"B says lender"}`, current);
    expect(r?.stem).toBe(current.stem);
    expect(r?.stemChanged).toBe(false);
    expect(r?.choicesChanged).toBe(true);
    expect(r?.choices[1]).toEqual({ text: "A lender", correct: true, feedback: null });
    expect(r?.choices[0].feedback).toBe("inside the company");
    // Two corrects, no corrects → refused.
    expect(parseCeqEdit(`{"proposedStem":null,"proposedChoices":[{"text":"X","correct":true},{"text":"Y","correct":true}],"note":""}`, current)).toBeNull();
    expect(parseCeqEdit(`{"proposedStem":null,"proposedChoices":[{"text":"X","correct":false},{"text":"Y","correct":false}],"note":""}`, current)).toBeNull();
  });
  test("parse: an answer that changes nothing, or isn't JSON, is null so the caller retries once", () => {
    expect(parseCeqEdit(`{"proposedStem":"${current.stem}","proposedChoices":null,"note":""}`, current)).toBeNull();
    expect(parseCeqEdit("not json", current)).toBeNull();
    expect(parseCeqEdit(`{"proposedStem":null,"proposedChoices":null,"note":"nothing"}`, current)).toBeNull();
  });
  test("parse: the answer may be wrapped in prose", () => {
    const r = parseCeqEdit(`Sure — here it is:\n{"proposedStem":"Who is external?","proposedChoices":null,"note":""}\nDone.`, current);
    expect(r?.stem).toBe("Who is external?");
  });
});
