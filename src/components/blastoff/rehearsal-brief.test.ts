import { describe, expect, test } from "bun:test";

import { buildRehearsalMessages, parseRehearsalSuggestions, REHEARSAL_SYSTEM } from "./rehearsal-brief";

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
    // Both lines are asked for, by name, and the cleaned one is told to add nothing.
    expect(m.system).toContain('{"said": str, "suggested": str}');
    expect(m.system).toMatch(/ADD NOTHING/);
  });
  test("no style examples or talkthrough omits those sections cleanly", () => {
    const m = buildRehearsalMessages({ slideLabel: "x", slideContext: "", rawTranscript: "just talking", talkthrough: "   " });
    expect(m.user).not.toContain("STYLE EXAMPLES");
    expect(m.user).not.toContain("TALKTHROUGH NOTES");
    expect(m.user).toContain("SLIDE CONTEXT: (none)");
  });
  test("parses both lines; junk and two empty lines both fail", () => {
    expect(parseRehearsalSuggestions('{"said":"Internal users are the managers.","suggested":"Internal users are the managers making the calls."}'))
      .toEqual({ said: "Internal users are the managers.", suggested: "Internal users are the managers making the calls." });
    expect(parseRehearsalSuggestions("no json here")).toBeNull();
    expect(parseRehearsalSuggestions('{"said":"","suggested":""}')).toBeNull();
    expect(parseRehearsalSuggestions('Sure! {"said":"  padded  ","suggested":" also padded "}')).toEqual({ said: "padded", suggested: "also padded" });
  });
  test("a legacy one-line answer is taken as the suggestion; a lone cleaned line stands in for both", () => {
    expect(parseRehearsalSuggestions('{"line":"Internal users are the managers."}')).toEqual({ said: "", suggested: "Internal users are the managers." });
    expect(parseRehearsalSuggestions('{"said":"Just the cleaned one."}')).toEqual({ said: "Just the cleaned one.", suggested: "Just the cleaned one." });
  });
});
