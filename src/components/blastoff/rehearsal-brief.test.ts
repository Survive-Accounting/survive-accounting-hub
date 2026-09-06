import { describe, expect, test } from "bun:test";

import { buildRehearsalMessages, parseRehearsalSuggestion, REHEARSAL_SYSTEM } from "./rehearsal-brief";

describe("the rehearsal brief", () => {
  test("the messages carry the slide, the raw speech, style examples and a revision", () => {
    const m = buildRehearsalMessages({
      slideLabel: "Memorize this — Internal Users", slideContext: "Managers inside the company",
      rawTranscript: "so like, internal users, um, they're basically the managers, right",
      styleExamples: [{ raw: "so external users are like investors and stuff", final: "External users are outside the company — investors, lenders." }],
      previous: "Internal users are the managers.", revision: "make it punchier",
    });
    expect(m.system).toBe(REHEARSAL_SYSTEM);
    for (const s of ["SLIDE: Memorize this", "Managers inside the company", "LEE'S RAW REHEARSAL SPEECH", "basically the managers", "STYLE EXAMPLES", "investors and stuff", "PREVIOUS LINE", "CHANGE REQUESTED: make it punchier"]) {
      expect(m.user).toContain(s);
    }
    expect(m.system).toMatch(/KEEP IT LEE'S/);
    expect(m.system).toMatch(/SHORT-FORM PACING/);
  });
  test("no style examples or revision omits those sections cleanly", () => {
    const m = buildRehearsalMessages({ slideLabel: "x", slideContext: "", rawTranscript: "just talking" });
    expect(m.user).not.toContain("STYLE EXAMPLES");
    expect(m.user).not.toContain("PREVIOUS LINE");
  });
  test("parses a clean line; junk and an empty line both fail", () => {
    expect(parseRehearsalSuggestion('{"line":"Internal users are the managers making the calls."}')).toBe("Internal users are the managers making the calls.");
    expect(parseRehearsalSuggestion("no json here")).toBeNull();
    expect(parseRehearsalSuggestion('{"line":""}')).toBeNull();
    expect(parseRehearsalSuggestion('{"line":"  padded  "}')).toBe("padded");
  });
});
