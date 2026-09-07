import { describe, expect, test } from "bun:test";

import {
  buildKeywordMessages, buildRehearsalMessages, buildShortenLineMessages, KEYWORD_SYSTEM, parseKeywords, parseRehearsalSuggestions,
  parseShortenedLine, pictureLineFor, REHEARSAL_SYSTEM, SHORTEN_PASS_LABEL, SHORTEN_PASSES, SHORTEN_SYSTEM,
} from "./rehearsal-brief";

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
    expect(m.system).toContain('{"said": str, "suggested": str, "register": "teach"|"cheat-code", "transition": str|null, "keywords": [str], "transitionPhrase": str|null, "cueWord": str|null}');
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
      .toEqual({ said: "Internal users are the managers.", suggested: "Internal users are the managers making the calls.", register: "cheat-code", transition: "Next question.", keywords: ["Internal = managers", "next question"], transitionPhrase: null, cueWord: null });
    expect(parseRehearsalSuggestions("no json here")).toBeNull();
    expect(parseRehearsalSuggestions('{"said":"","suggested":""}')).toBeNull();
    expect(parseRehearsalSuggestions('Sure! {"said":"  padded  ","suggested":" also padded "}'))
      .toEqual({ said: "padded", suggested: "also padded", register: "teach", transition: null, keywords: [], transitionPhrase: null, cueWord: null });
  });
  test("odd new fields fall back safely: unknown register → teach, blank transition → null, junk keywords dropped and capped", () => {
    const r = parseRehearsalSuggestions('{"said":"a","suggested":"b","register":"shout","transition":"   ","keywords":["one", 2, "", "three", "four", "five", "six", "seven"]}');
    expect(r).toEqual({ said: "a", suggested: "b", register: "teach", transition: null, keywords: ["one", "three", "four", "five", "six"], transitionPhrase: null, cueWord: null });
    expect(parseRehearsalSuggestions('{"said":"a","suggested":"b","keywords":"not a list"}')?.keywords).toEqual([]);
  });
  test("a legacy one-line answer is taken as the suggestion; a lone cleaned line stands in for both", () => {
    expect(parseRehearsalSuggestions('{"line":"Internal users are the managers."}')).toEqual({ said: "", suggested: "Internal users are the managers.", register: "teach", transition: null, keywords: [], transitionPhrase: null, cueWord: null });
    expect(parseRehearsalSuggestions('{"said":"Just the cleaned one."}')).toEqual({ said: "Just the cleaned one.", suggested: "Just the cleaned one.", register: "teach", transition: null, keywords: [], transitionPhrase: null, cueWord: null });
  });

  // 2026-09-07 — Lee: "transition phrase is yellow but the word itself is orange."
  describe("the timing marks", () => {
    const line = "External means outside the company. No paycheck? External. Next question.";
    test("the brief asks for both, verbatim from the suggested line", () => {
      expect(REHEARSAL_SYSTEM).toMatch(/TIMING — the end of each slide pulls into the next one/);
      expect(REHEARSAL_SYSTEM).toMatch(/"transitionPhrase" = the 2–8 words of the SUGGESTED line/);
      expect(REHEARSAL_SYSTEM).toMatch(/"cueWord" = the single word inside that phrase/);
    });
    test("a phrase and a word that are in the line come through, in the line's own spelling", () => {
      const r = parseRehearsalSuggestions(JSON.stringify({ said: "", suggested: line, transitionPhrase: "No paycheck? External.", cueWord: "External" }));
      expect(r?.transitionPhrase).toBe("No paycheck? External.");
      expect(r?.cueWord).toBe("External");
      // A capital the model changed is forgiven — the mark is the line's spelling, so painters find it.
      const r2 = parseRehearsalSuggestions(JSON.stringify({ said: "", suggested: line, transitionPhrase: "no paycheck? external.", cueWord: "external" }));
      expect(r2?.transitionPhrase).toBe("No paycheck? External.");
      expect(r2?.cueWord).toBe("External");
    });
    test("a phrase that isn't in the line is null; a cue word outside the phrase (or the line) is null", () => {
      const r = parseRehearsalSuggestions(JSON.stringify({ said: "", suggested: line, transitionPhrase: "Let's move on now", cueWord: "paycheck" }));
      expect(r?.transitionPhrase).toBeNull();
      // No phrase → the word is checked against the whole line, and "paycheck" IS there.
      expect(r?.cueWord).toBe("paycheck");
      const r2 = parseRehearsalSuggestions(JSON.stringify({ said: "", suggested: line, transitionPhrase: "Next question.", cueWord: "paycheck" }));
      expect(r2?.transitionPhrase).toBe("Next question.");
      expect(r2?.cueWord).toBeNull();            // in the line, not in the phrase
      const r3 = parseRehearsalSuggestions(JSON.stringify({ said: "", suggested: line, transitionPhrase: null, cueWord: "banana" }));
      expect(r3?.cueWord).toBeNull();
    });
    test("junk shapes are null, never a crash", () => {
      const r = parseRehearsalSuggestions(JSON.stringify({ said: "", suggested: line, transitionPhrase: 12, cueWord: ["x"] }));
      expect(r?.transitionPhrase).toBeNull();
      expect(r?.cueWord).toBeNull();
    });
  });
});

// 2026-09-07 — "now we've illustrated for it (which could mean I now may reference the illustration!)"
describe("the slide's picture rides along", () => {
  test("a generated picture is one line: its title, else Lee's prompt words, else just that one is there", () => {
    expect(pictureLineFor({ assetUrl: "https://x/a.png", summary: { title: "The Paycheck Test" }, prompt: "a guy holding a paycheck" })).toBe("The Paycheck Test");
    expect(pictureLineFor({ assetUrl: "https://x/a.png", summary: null, prompt: "  a guy holding a paycheck " })).toBe("a guy holding a paycheck");
    expect(pictureLineFor({ assetUrl: "https://x/a.png" })).toBe("(a picture, untitled)");
    expect(pictureLineFor({ assetUrl: "https://x/a.png", summary: { title: "x".repeat(300) } })).toHaveLength(160);
  });
  test("a banked idea that isn't generated yet is no picture on the slide", () => {
    expect(pictureLineFor({ assetUrl: null, prompt: "a banked idea" })).toBeUndefined();
    expect(pictureLineFor(null)).toBeUndefined();
    expect(pictureLineFor(undefined)).toBeUndefined();
  });
  test("the brief carries it, and the rule says a line MAY point at it", () => {
    const m = buildRehearsalMessages({ slideLabel: "Cheat code", slideContext: "The paycheck test", rawTranscript: "look at the paycheck", picture: "The Paycheck Test" });
    expect(m.user).toContain("THE SLIDE'S PICTURE: The Paycheck Test");
    expect(m.system).toMatch(/THE SLIDE'S PICTURE, when given/);
    expect(buildRehearsalMessages({ slideLabel: "x", slideContext: "", rawTranscript: "t", picture: "  " }).user).not.toContain("THE SLIDE'S PICTURE");
  });
});

// 2026-09-07 — Lee: "a button to 'shorten' and revert icon if so. Shorten can almost be like,
// making more concise of what's written first, but then like another one is actually
// eliminating stuff… Maybe let me do two passes (three?) to see how each looks."
describe("shorten passes on a line", () => {
  const card = { stem: "Which of these is an external user?", choices: [{ text: "A manager", correct: false }, { text: "A lender", correct: true }] };
  test("three passes, named: concise, cut, tighter still", () => {
    expect(SHORTEN_PASSES).toBe(3);
    expect(SHORTEN_PASS_LABEL).toEqual({ 1: "concise", 2: "cut", 3: "tighter still" });
    expect(SHORTEN_SYSTEM).toMatch(/PASS 1 — CONCISE: the same content, fewer words/);
    expect(SHORTEN_SYSTEM).toMatch(/PASS 2 — CUT: drop everything but the answer, the cheat code that finds it, and the hand-off/);
    expect(SHORTEN_SYSTEM).toMatch(/PASS 3 — TIGHTER STILL/);
  });
  test("the messages name the pass, the register, the line, the card and the picture", () => {
    const m = buildShortenLineMessages({
      line: "  External means anybody outside the company. Remember the cheat code: if they don't get a paycheck, they're external. ",
      pass: 2, card, register: "teach", picture: "The Paycheck Test",
    });
    expect(m.system).toBe(SHORTEN_SYSTEM);
    expect(m.user).toContain("PASS 2 — CUT");
    expect(m.user).toContain("REGISTER: teach");
    expect(m.user).toContain("THE LINE TO SHORTEN:\nExternal means anybody outside the company. Remember the cheat code: if they don't get a paycheck, they're external.");
    expect(m.user).toContain("[CORRECT] A lender");
    expect(m.user).toContain("THE SLIDE'S PICTURE: The Paycheck Test");
    // The TEACH rule and the register survive every pass; the answer carries its own keywords.
    expect(m.system).toMatch(/TEACH — the rule that survives every pass/);
    expect(m.system).toMatch(/KEEP THE REGISTER/);
    expect(m.system).toContain('{"line": str, "keywords": [str]}');
  });
  test("no card, no picture → neither section; pass 1 and 3 read as their names", () => {
    expect(buildShortenLineMessages({ line: "x", pass: 1, register: "cheat-code" }).user).toBe("PASS 1 — CONCISE\n\nREGISTER: cheat-code\n\nTHE LINE TO SHORTEN:\nx");
    expect(buildShortenLineMessages({ line: "x", pass: 3, register: "teach", picture: " " }).user).toContain("PASS 3 — TIGHTER STILL");
  });
  test("parses the line and its keywords, defended; a legacy {suggested} shape still reads", () => {
    expect(parseShortenedLine('{"line":"External. No paycheck. Next.","keywords":["External","no paycheck","next"]}'))
      .toEqual({ line: "External. No paycheck. Next.", keywords: ["External", "no paycheck", "next"] });
    expect(parseShortenedLine('Sure — {"line":"  padded  "}')).toEqual({ line: "padded", keywords: [] });
    expect(parseShortenedLine('{"suggested":"legacy shape","keywords":"nope"}')).toEqual({ line: "legacy shape", keywords: [] });
    expect(parseShortenedLine('{"line":""}')).toBeNull();
    expect(parseShortenedLine("no json")).toBeNull();
    expect(parseShortenedLine("{broken")).toBeNull();
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
