import { describe, expect, test } from "bun:test";

import { buildKeywordMessages, buildRehearsalMessages, KEYWORD_SYSTEM, parseKeywords, parseRehearsalSuggestions, REHEARSAL_SYSTEM } from "./rehearsal-brief";

describe("the rehearsal brief", () => {
  test("the messages carry the slide, the raw speech, the talkthrough notes and style examples", () => {
    const m = buildRehearsalMessages({
      slideLabel: "Memorize this — Internal Users", slideContext: "Managers inside the company",
      rawTranscript: "so like, internal users, um, they're basically the managers, right",
      talkthrough: "Said during Talkthrough: managers make the calls inside the company\nStamps: Phrase: managers make the calls",
      styleExamples: [{ raw: "so external users are like investors and stuff", final: "External users are outside the company — investors, lenders." }],
    });
    expect(m.system).toBe(REHEARSAL_SYSTEM);
    for (const s of ["SLIDE: Memorize this", "Managers inside the company", "LEE'S RAW REHEARSAL SPEECH", "basically the managers", "TALKTHROUGH NOTES", "managers make the calls", "STYLE EXAMPLES", "investors and stuff"]) {
      expect(m.user).toContain(s);
    }
    expect(m.system).toMatch(/KEEP IT LEE'S/);
    expect(m.system).toMatch(/SHORT-FORM PACING/);
    // Every field is asked for, by name, and the cleaned one is told to add nothing.
    expect(m.system).toContain('{"said": str, "suggested": str, "register": "teach"|"cheat-code", "transition": str|null, "keywords": [str]}');
    expect(m.system).toMatch(/ADD NOTHING/);
  });
  test("no style examples or talkthrough omits those sections cleanly", () => {
    const m = buildRehearsalMessages({ slideLabel: "x", slideContext: "", rawTranscript: "just talking", talkthrough: "   " });
    expect(m.user).not.toContain("STYLE EXAMPLES");
    expect(m.user).not.toContain("TALKTHROUGH NOTES");
    expect(m.user).not.toContain("THE CARD");
    expect(m.user).not.toContain("NEXT SLIDE");
    expect(m.user).toContain("SLIDE CONTEXT: (none)");
  });

  // 2026-09-07 — Lee: "it must not be referencing the actual CEQ itself, because neither what I
  // said nor what the suggested said actual teaches anything."
  test("the card rides along with the correct choice marked, and the next slide for the hand-off", () => {
    const m = buildRehearsalMessages({
      slideLabel: "Set card", slideContext: "Which of these is an external user?", rawTranscript: "so external, um, outside",
      card: { stem: "Which of these is an external user?", choices: [{ text: "A manager", correct: false }, { text: "A lender", correct: true }] },
      nextSlide: { label: "Cheat code", context: "No paycheck → external" },
    });
    expect(m.user).toContain("THE CARD");
    expect(m.user).toContain("Q: Which of these is an external user?");
    expect(m.user).toContain("[ ] A manager");
    expect(m.user).toContain("[CORRECT] A lender");
    expect(m.user).toContain("NEXT SLIDE: Cheat code — No paycheck → external");
    expect(m.system).toMatch(/TEACH — the one rule/);
    expect(m.system).toMatch(/TWO REGISTERS/);
    expect(m.system).toMatch(/"transition" = an optional 2–6 word/);
    expect(m.system).toMatch(/"keywords" = 2–5 scannable fragments/);
  });
  test("a callout card renders its title and lines", () => {
    const m = buildRehearsalMessages({
      slideLabel: "Memorize this", slideContext: "Internal users", rawTranscript: "internal is inside",
      card: { stem: "", choices: [], calloutTitle: "Internal users", calloutLines: ["Management", "Budgets, costs, forecasts", "  "] },
    });
    expect(m.user).toContain("THE CARD");
    expect(m.user).not.toContain("Q: ");
    expect(m.user).toContain("Internal users\n  - Management\n  - Budgets, costs, forecasts");
  });

  // "if I write in my own, it's a big signal that there's a possible improvement here."
  test("an edited example shows what he was offered and what he wrote instead", () => {
    const m = buildRehearsalMessages({
      slideLabel: "x", slideContext: "", rawTranscript: "talking",
      styleExamples: [
        { raw: "external um outside", final: "External. Who doesn't get a paycheck? Next question.", rejected: "External users are outside the company." },
        { raw: "same line", final: "Kept as is.", rejected: "Kept as is." },
        { raw: "plain", final: "Plain kept." },
      ],
    });
    expect(m.user).toContain('Example 1 — Lee said: "external um outside" → he was offered: "External users are outside the company." → he wrote instead: "External. Who doesn\'t get a paycheck? Next question."');
    // A "rejected" line identical to the final is no rejection at all.
    expect(m.user).toContain('Example 2 — Lee said: "same line" → he kept: "Kept as is."');
    expect(m.user).toContain('Example 3 — Lee said: "plain" → he kept: "Plain kept."');
    expect(m.system).toMatch(/WROTE his own instead is the strongest signal/);
  });

  test("parses every field; junk and two empty lines both fail", () => {
    expect(parseRehearsalSuggestions('{"said":"Internal users are the managers.","suggested":"Internal users are the managers making the calls.","register":"cheat-code","transition":"Next question.","keywords":["Internal = managers","next question"]}'))
      .toEqual({ said: "Internal users are the managers.", suggested: "Internal users are the managers making the calls.", register: "cheat-code", transition: "Next question.", keywords: ["Internal = managers", "next question"] });
    expect(parseRehearsalSuggestions("no json here")).toBeNull();
    expect(parseRehearsalSuggestions('{"said":"","suggested":""}')).toBeNull();
    expect(parseRehearsalSuggestions('Sure! {"said":"  padded  ","suggested":" also padded "}'))
      .toEqual({ said: "padded", suggested: "also padded", register: "teach", transition: null, keywords: [] });
  });
  test("odd new fields fall back safely: unknown register → teach, blank transition → null, junk keywords dropped and capped", () => {
    const r = parseRehearsalSuggestions('{"said":"a","suggested":"b","register":"shout","transition":"   ","keywords":["one", 2, "", "three", "four", "five", "six", "seven"]}');
    expect(r).toEqual({ said: "a", suggested: "b", register: "teach", transition: null, keywords: ["one", "three", "four", "five", "six"] });
    expect(parseRehearsalSuggestions('{"said":"a","suggested":"b","keywords":"not a list"}')?.keywords).toEqual([]);
  });
  test("a legacy one-line answer is taken as the suggestion; a lone cleaned line stands in for both", () => {
    expect(parseRehearsalSuggestions('{"line":"Internal users are the managers."}')).toEqual({ said: "", suggested: "Internal users are the managers.", register: "teach", transition: null, keywords: [] });
    expect(parseRehearsalSuggestions('{"said":"Just the cleaned one."}')).toEqual({ said: "Just the cleaned one.", suggested: "Just the cleaned one.", register: "teach", transition: null, keywords: [] });
  });
});

describe("keywords for a line Lee kept himself", () => {
  test("the follow-up asks for fragments of exactly that line", () => {
    const m = buildKeywordMessages("  External. Who doesn't get a paycheck? Next question. ");
    expect(m.system).toBe(KEYWORD_SYSTEM);
    expect(m.system).toContain('{"keywords": [str]}');
    expect(m.user).toBe("THE LINE:\nExternal. Who doesn't get a paycheck? Next question.");
  });
  test("parses the list, defended", () => {
    expect(parseKeywords('{"keywords":["External","no paycheck","next question"]}')).toEqual(["External", "no paycheck", "next question"]);
    expect(parseKeywords('Here: {"keywords":[" a ", "", 3]}')).toEqual(["a"]);
    expect(parseKeywords("nope")).toEqual([]);
    expect(parseKeywords("{broken")).toEqual([]);
  });
});
