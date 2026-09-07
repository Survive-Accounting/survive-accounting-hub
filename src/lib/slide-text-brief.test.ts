import { describe, expect, test } from "bun:test";

import {
  buildSlideTextMessages, buildTightenToLinesMessages, normalizeLine, parseSlideText, sameSlideText,
  slideTextFieldsOf, slideTextPatchOf, slideTextShape, slideTextSystem, tightenSystem,
} from "./slide-text-brief";

const card = {
  stem: "Which user of financial information is external?",
  choices: [{ text: "The production manager", correct: false }, { text: "A lender", correct: true }],
};

describe("the slide text brief — say it", () => {
  // Lee, 2026-09-07: "'Use your words' is the fundamental value… Wherever we can click, talk,
  // get suggestions."
  test("each kind has its shape, and the frame bridges round-trip", () => {
    expect(slideTextShape("cheat")).toEqual({ title: true, text: true, lines: true });
    expect(slideTextShape("phrase")).toEqual({ title: true, text: false, lines: true });
    expect(slideTextShape("outro")).toEqual({ title: false, text: true, lines: false });
    // A cheat code: title / body / bullets. A phrase: its heading is the frame's `text`.
    const cheat = slideTextFieldsOf({ kind: "cheat", title: "The Paycheck Test", body: "Ask if they get a paycheck.", bullets: ["If so, internal", "", "\tmanagement"] });
    expect(cheat).toEqual({ title: "The Paycheck Test", text: "Ask if they get a paycheck.", lines: ["If so, internal", "\tmanagement"] });
    expect(slideTextPatchOf("cheat", cheat!)).toEqual({ title: "The Paycheck Test", body: "Ask if they get a paycheck.", bullets: ["If so, internal", "\tmanagement"] });
    expect(slideTextFieldsOf({ kind: "phrase", text: "Internal users", bullets: ["Management"] })).toEqual({ title: "Internal users", lines: ["Management"] });
    expect(slideTextPatchOf("phrase", { title: "Internal users", lines: ["Management"] })).toEqual({ text: "Internal users", bullets: ["Management"] });
    expect(slideTextFieldsOf({ kind: "intro", text: "" })).toEqual({ text: "" });
    expect(slideTextPatchOf("outro", { text: "Cram it." })).toEqual({ text: "Cram it." });
    // A set card's words are the bank's — not this brief's.
    expect(slideTextFieldsOf({ kind: "ceq" })).toBeNull();
  });
  test("the system prompt carries the register, the nesting rule, the marks and the kind's fields", () => {
    const s = slideTextSystem("phrase");
    for (const x of ["CRAM, NOT TEACH", "one tab character per level", "==word==", "WHAT HE SAID is the spec", "MEMORIZE THIS", "Never add a thought"]) expect(s).toContain(x);
    expect(s).toContain('{"title": str, "lines": [str], "note": str}');
    expect(slideTextSystem("cheat")).toContain('{"title": str, "text": str, "lines": [str], "note": str}');
    expect(slideTextSystem("blank")).toContain('{"text": str, "note": str}');
  });
  test("the user message renders the slide with nesting, the card, the picture, the notes and the verbatim take", () => {
    const m = buildSlideTextMessages({
      kind: "phrase", current: { title: "Internal users", lines: ["Management", "\tBudgets, costs"] },
      spoken: "add production under management", card, picture: "a paycheck with a company logo", talkthrough: "Said during Talkthrough: internal means inside",
    });
    expect(m.system).toBe(slideTextSystem("phrase"));
    expect(m.user).toContain("Title: Internal users");
    expect(m.user).toContain("  - Management\n    - Budgets, costs");
    expect(m.user).toContain("[CORRECT] A lender");
    expect(m.user).toContain("THE SLIDE'S PICTURE: a paycheck");
    expect(m.user).toContain("TALKTHROUGH NOTES:\nSaid during Talkthrough");
    expect(m.user).toContain('"add production under management"');
    expect(m.user).not.toContain("THE SET'S NAME");
  });
  test("an empty slide says so; the intro carries the set's name", () => {
    const m = buildSlideTextMessages({ kind: "intro", current: { text: "" }, spoken: "call it the users of accounting", setName: "Users of Financial Info" });
    expect(m.user).toContain("Text: (empty)");
    expect(m.user).toContain("THE SET'S NAME: Users of Financial Info");
    expect(buildSlideTextMessages({ kind: "tip", current: { title: "", lines: [] }, spoken: "x" }).user).toContain("Lines: (none)");
  });
  test("parse confines the answer to the kind's shape and keeps nesting as tabs", () => {
    const r = parseSlideText(`{"title":"Internal users","text":"ignored on a phrase","lines":["Management","\\tBudgets, costs","  - Production","- ","• Forecasts"],"note":"added production"}`, "phrase");
    expect(r).toEqual({ title: "Internal users", lines: ["Management", "\tBudgets, costs", "\tProduction", "Forecasts"], note: "added production" });
    expect(parseSlideText(`{"text":"Cram what's on your exam.","title":"x","note":""}`, "outro")).toEqual({ text: "Cram what's on your exam.", note: "" });
    // A legacy "bullets" key is read as lines.
    expect(parseSlideText(`{"title":"T","bullets":["a"],"note":""}`, "phrase")?.lines).toEqual(["a"]);
  });
  test("parse: prose around the JSON is fine; nothing usable is null so the caller retries once", () => {
    expect(parseSlideText(`Here:\n{"text":"Users of accounting","note":"n"}\n`, "blank")?.text).toBe("Users of accounting");
    expect(parseSlideText("not json", "phrase")).toBeNull();
    expect(parseSlideText(`{"title":"","lines":[],"note":"nothing"}`, "phrase")).toBeNull();
    expect(parseSlideText(`{"title":"only a title","note":""}`, "blank")).toBeNull(); // a blank has no title
  });
  test("normalizeLine: tabs, two-space groups and bullet glyphs all read as depth + words", () => {
    expect(normalizeLine("\t\tdeep")).toBe("\t\tdeep");
    expect(normalizeLine("    - deep")).toBe("\t\tdeep");
    expect(normalizeLine("• top ")).toBe("top");
    expect(normalizeLine("2) second")).toBe("second");
    expect(normalizeLine("")).toBe("");
  });
  test("sameSlideText ignores blank lines and whitespace, not nesting", () => {
    expect(sameSlideText({ title: "A ", lines: ["x", "", "  y"] }, { title: "A", lines: ["x", "\ty"] })).toBe(true);
    expect(sameSlideText({ title: "A", lines: ["x", "y"] }, { title: "A", lines: ["x", "\ty"] })).toBe(false);
  });
});

describe("the last word — tighten to the lines", () => {
  // Lee: "we've illustrated for it… we've rehearsed it… and now we're at the final editing
  // point. Maybe one last thing comes around to enhance our video… I want it all."
  test("the system prompt says match what he'll say, only take away, same or fewer lines", () => {
    const s = tightenSystem("cheat");
    for (const x of ["KEPT LINES", "MATCH what he says", "ONLY TAKE AWAY OR ALIGN", "never more", "ALREADY TIGHT", "CHEAT CODE"]) expect(s).toContain(x);
    expect(s).toContain('{"title": str, "text": str, "lines": [str], "note": str}');
  });
  test("the user message carries the slide, the kept lines, the keys, the hand-off, the card and the picture", () => {
    const m = buildTightenToLinesMessages({
      kind: "cheat", current: { title: "The Paycheck Test", text: "Ask yourself if they get a paycheck from the company. If so, they're internal.", lines: ["Otherwise external", " "] },
      prompter: ["No paycheck? External. Next.", ""], prompterKeys: ["no paycheck → external", "next"], transition: "Same idea, flipped.", card, picture: "a paycheck",
    });
    expect(m.system).toBe(tightenSystem("cheat"));
    expect(m.user).toContain("Title: The Paycheck Test");
    expect(m.user).toContain("THE KEPT LINES (what Lee will say over it):\n- No paycheck? External. Next.");
    expect(m.user).toContain("THE KEYS (the scan of those lines, in order): no paycheck → external · next");
    expect(m.user).toContain("THE HAND-OFF into the next slide: Same idea, flipped.");
    expect(m.user).toContain("[CORRECT] A lender");
    expect(m.user).toContain("THE SLIDE'S PICTURE: a paycheck");
  });
  test("no keys, no hand-off, no card → those sections stay out", () => {
    const m = buildTightenToLinesMessages({ kind: "blank", current: { text: "hello" }, prompter: ["hi"] });
    for (const x of ["THE KEYS", "THE HAND-OFF", "THE CARD", "PICTURE"]) expect(m.user).not.toContain(x);
  });
});
