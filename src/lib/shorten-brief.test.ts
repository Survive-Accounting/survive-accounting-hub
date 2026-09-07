import { describe, expect, test } from "bun:test";

import { buildShortenMessages, markHighlight, parseShorten, SHORTEN_SYSTEM, type ShortenRequest } from "./shorten-brief";

const card: ShortenRequest = {
  kind: "ceq",
  stem: "Which of the following users of financial information would be considered an external user of that information?",
  choices: [
    { text: "The company's production manager", correct: false },
    { text: "A lender who is deciding whether to lend to the company", correct: true },
    { text: "The company's chief financial officer", correct: false },
  ],
};

describe("the shorten brief", () => {
  // Lee, 2026-09-07: "removing redundancy, unnecessary words. Only leaving what's essential …
  // CRAMMING this, not teaching it … the 1 or 2 words (ideally only one) word I can highlight"
  test("the system prompt carries Lee's rules and the JSON shapes", () => {
    for (const s of ["CRAMMING this, not teaching it", "redundancy", "STANDARDIZE THE CHOICES", "SAME ORDER and the SAME COUNT", "THE ONE word", "==word==", "NEVER CHANGE what the question tests", "Keep every number"]) {
      expect(SHORTEN_SYSTEM).toContain(s);
    }
    expect(SHORTEN_SYSTEM).toContain('{"stem": str, "choices": [{"text": str, "correct": bool}], "highlight": str, "note": str}');
    expect(SHORTEN_SYSTEM).toContain('{"title": str, "text": str, "bullets": [str], "highlight": str, "note": str}');
  });
  test("a card renders with the correct choice marked; no examples, no previous → those sections stay out", () => {
    const m = buildShortenMessages(card);
    expect(m.system).toBe(SHORTEN_SYSTEM);
    expect(m.user).toContain("THE CARD");
    expect(m.user).toContain("Stem: Which of the following users");
    expect(m.user).toContain("[ ] The company's production manager");
    expect(m.user).toContain("[CORRECT] A lender who is deciding");
    expect(m.user).not.toContain("EXAMPLES");
    expect(m.user).not.toContain("YOUR LAST PASS");
  });
  test("a callout renders title, text and lines", () => {
    const m = buildShortenMessages({ kind: "callout", title: "The Paycheck Test", text: "Ask if they get a paycheck from the company.", bullets: ["If so, internal", "  ", "If not, external"] });
    expect(m.user).toContain("THE CALLOUT");
    expect(m.user).toContain("Title: The Paycheck Test");
    expect(m.user).toContain("Text: Ask if they get a paycheck");
    expect(m.user).toContain("  - If so, internal\n  - If not, external");
  });
  // "I want the app/AI to make note of the edits I'm making, so 'shorten' … gets smarter over time."
  test("the edit log's pairs ride along as examples; a shorten-edited pair says he wrote his own", () => {
    const m = buildShortenMessages({
      ...card,
      examples: [
        { kind: "ceq", source: "shorten-edited", before: { stem: "Which user is external?", choices: [{ text: "Manager", correct: false }, { text: "Lender", correct: true }] }, after: { stem: "Who is ==external==?", choices: [{ text: "Manager", correct: false }, { text: "Lender", correct: true }] } },
        { kind: "callout", source: "manual", before: { title: "Internal users of the company", bullets: ["The managers"] }, after: { title: "==Internal== users", bullets: ["Managers"] } },
      ],
      previous: { stem: "Which user is an external user?", choices: card.choices },
    });
    expect(m.user).toContain("EXAMPLES (Lee's own past edits");
    expect(m.user).toContain("Example 1 — Shorten offered this card, and Lee wrote his own instead:");
    expect(m.user).toContain("BEFORE:\nStem: Which user is external?");
    expect(m.user).toContain("AFTER:\nStem: Who is ==external==?");
    expect(m.user).toContain("Example 2 — Lee's own edit of a callout:");
    expect(m.user).toContain("Title: ==Internal== users\n  - Managers");
    expect(m.user).toContain("YOUR LAST PASS");
    expect(m.user).toContain("go TIGHTER");
  });
});

describe("parseShorten", () => {
  test("a clean card answer: same count, the correct flag pinned to where it was, marks kept", () => {
    const r = parseShorten(JSON.stringify({
      stem: "Which is an ==external== user?",
      // the model tried to move the correct answer — it may not
      choices: [{ text: "Production manager", correct: true }, { text: "Lender", correct: false }, { text: "CFO", correct: false }],
      highlight: "external", note: "cut 'of the following users of financial information'",
    }), card);
    expect(r).not.toBeNull();
    expect(r!.stem).toBe("Which is an ==external== user?");
    expect(r!.choices!.map((c) => c.correct)).toEqual([false, true, false]);
    expect(r!.choices!.map((c) => c.text)).toEqual(["Production manager", "Lender", "CFO"]);
    expect(r!.highlight).toBe("external");
    expect(r!.note).toMatch(/^cut/);
  });
  test("the highlight word gets its marks when the model forgot them; marks inside a choice are stripped", () => {
    const r = parseShorten(JSON.stringify({
      stem: "Which is an external user?",
      choices: [{ text: "Production manager", correct: false }, { text: "==Lender==", correct: true }, { text: "CFO", correct: false }],
      highlight: "==External==", note: "",
    }), card);
    expect(r!.stem).toBe("Which is an ==external== user?");
    expect(r!.choices![1].text).toBe("Lender");
    expect(r!.highlight).toBe("External");
  });
  test("a wrong choice count, an empty choice, an empty stem, or no JSON at all → null", () => {
    expect(parseShorten(JSON.stringify({ stem: "x", choices: [{ text: "a", correct: true }], highlight: "", note: "" }), card)).toBeNull();
    expect(parseShorten(JSON.stringify({ stem: "x", choices: [{ text: "a" }, { text: "" }, { text: "c" }], highlight: "", note: "" }), card)).toBeNull();
    expect(parseShorten(JSON.stringify({ stem: "", choices: [{ text: "a" }, { text: "b" }, { text: "c" }], highlight: "", note: "" }), card)).toBeNull();
    expect(parseShorten("no json here", card)).toBeNull();
    expect(parseShorten("{not json", card)).toBeNull();
  });
  test("a summary card (no choices) parses with an empty choice list", () => {
    const r = parseShorten(JSON.stringify({ stem: "Assets = Liabilities + Equity", choices: [], highlight: "Assets", note: "" }), { kind: "ceq", stem: "The accounting equation says that assets equal liabilities plus equity", choices: [] });
    expect(r!.stem).toBe("==Assets== = Liabilities + Equity");
    expect(r!.choices).toEqual([]);
  });
  test("a callout answer: title, text (only when the callout has one) and non-empty bullets, one highlight", () => {
    const req: ShortenRequest = { kind: "callout", title: "The Paycheck Test", text: "Ask yourself if they get a paycheck from the company.", bullets: ["If so, they are internal", "If not, they are external"] };
    const r = parseShorten(JSON.stringify({ title: "Paycheck test", text: "Do they get a paycheck?", bullets: ["Yes → internal", "", "No → external"], highlight: "paycheck", note: "cut the hedging" }), req);
    expect(r).toEqual({ title: "==Paycheck== test", text: "Do they get a paycheck?", bullets: ["Yes → internal", "No → external"], highlight: "paycheck", note: "cut the hedging" });
    const phrase = parseShorten(JSON.stringify({ title: "Internal users", text: "ignored", bullets: ["Managers"], highlight: "Internal", note: "" }), { kind: "callout", title: "Internal users of the company", bullets: ["The managers"] });
    expect(phrase).toEqual({ title: "==Internal== users", bullets: ["Managers"], highlight: "Internal", note: "" });
  });
});

describe("markHighlight", () => {
  test("marks the first whole-word occurrence, case-insensitively, in the first text that has it", () => {
    expect(markHighlight(["Externally is not it", "An external user"], "external")).toEqual(["Externally is not it", "An ==external== user"]);
  });
  test("leaves texts alone when one is already marked, or the word is empty or absent", () => {
    expect(markHighlight(["Who is ==external==?", "external"], "external")).toEqual(["Who is ==external==?", "external"]);
    expect(markHighlight(["a b"], "")).toEqual(["a b"]);
    expect(markHighlight(["a b"], "c")).toEqual(["a b"]);
  });
  test("a two-word highlight and regex characters in it are fine", () => {
    expect(markHighlight(["Assets = Liabilities + Equity"], "Liabilities + Equity")).toEqual(["Assets = ==Liabilities + Equity=="]);
  });
});
