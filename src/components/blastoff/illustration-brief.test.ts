import { describe, expect, test } from "bun:test";

import { BRIEF_SYSTEM, buildBriefMessages, parseBrief, promptHasLabel } from "./illustration-brief";
import { composeIllustrationPrompt, illustrationStyle } from "./illustration";

describe("the illustration brief", () => {
  test("the messages carry the brainstorm, the point, the reference and the revision", () => {
    const m = buildBriefMessages({
      brainstorm: "suited guy at a desk with a magnifying glass, the financials say OUR COMPANY",
      teachingIntent: "Internal vs external users", setName: "Internal vs. External Users",
      reference: { title: "The insider at his desk", prompt: "a man in a suit at a desk" },
      previous: { title: "x", prompt: "y" }, revision: "make him look worried",
    });
    expect(m.system).toBe(BRIEF_SYSTEM);
    for (const s of ["LEE SAID", "magnifying glass", "THE TEACHING POINT", "THE SET", "REFERENCE PICTURE", "a man in a suit", "PREVIOUS DRAFT", "LEE WANTS CHANGED: make him look worried"]) expect(m.user).toContain(s);
    // the rules that keep the picture scannable are in the system prompt, not left to chance
    expect(m.system).toMatch(/ONE concrete subject first/);
    expect(m.system).toMatch(/single clear divider/);
    expect(m.system).toMatch(/at most one short label/i);
    expect(m.system).toMatch(/NEVER write the style/);
  });
  test("the answer parses to a title, three bullets and a subject; junk does not", () => {
    const b = parseBrief('here you go {"title":"Insider at the desk","bullets":["a man in a suit","reading at a desk","sign says OUR COMPANY"],"prompt":"a man in a suit at a desk reading a report, with the words \\"OUR COMPANY\\" on the wall sign"}');
    expect(b?.title).toBe("Insider at the desk");
    expect(b?.bullets).toHaveLength(3);
    expect(b?.prompt).toContain("OUR COMPANY");
    expect(parseBrief("no json here")).toBeNull();
    expect(parseBrief('{"title":"t"}')).toBeNull();
    // short on bullets → padded to three, never fewer
    expect(parseBrief('{"title":"t","bullets":["one"],"prompt":"p"}')?.bullets).toHaveLength(3);
  });
  test("a quoted label lifts the preset's 'no text' — nothing else changes", () => {
    const s = illustrationStyle(null);
    expect(promptHasLabel('a sign with the words "OUR COMPANY" on it')).toBe(true);
    expect(promptHasLabel("a vault")).toBe(false);
    const withLabel = composeIllustrationPrompt(s, 'a sign with the words "OUR COMPANY" on it', null);
    expect(withLabel).not.toMatch(/no text\b/i);   // "no texture" stays
    expect(withLabel).toMatch(/black background/i);
    expect(composeIllustrationPrompt(s, "a vault", null)).toMatch(/no text\b/i);
  });
});
