import { describe, expect, test } from "bun:test";

import { BANNED_SUBJECTS, BRIEF_SYSTEM, RECURRING_STUDENT, buildBriefMessages, parseBrief, promptHasLabel } from "./illustration-brief";
import { composeIllustrationPrompt, illustrationStyle } from "./illustration";

describe("the illustration brief", () => {
  // v5 (2026-09-06, docs/ILLUSTRATION-STYLE-V5-PROPOSAL.md): the four brief changes.
  test("v5: the surreality allowance, the recurring student, the banned list and the enforced pair rule are all in the system prompt", () => {
    // the proposal's paragraph, verbatim, plus its "one in three" usage note
    expect(BRIEF_SYSTEM).toContain("Scale and space may be pushed: an object much larger than life, a figure standing on or inside something that couldn't hold them, an ordinary thing floating or repeating. Use this to make the idea strange enough to remember, never to make it unclear — the one clear subject rule still governs.");
    expect(BRIEF_SYSTEM).toMatch(/one picture in three/);
    // one fixed character, never Lee, defined by silhouette and garment, editable in one place
    expect(BRIEF_SYSTEM).toContain(RECURRING_STUDENT);
    expect(RECURRING_STUDENT).toMatch(/hoodie/);
    expect(RECURRING_STUDENT).toMatch(/never face-on/);
    expect(BRIEF_SYSTEM).toMatch(/never Lee/);
    // the reject list — each one, by name (v5's seven; v6 adds the five Grateful Dead marks below)
    expect(BANNED_SUBJECTS).toHaveLength(12);
    for (const s of ["money piles", "handshakes", "lightbulbs", "gears", "target with arrow", "ladder of success", "jigsaw pieces"]) {
      expect(BANNED_SUBJECTS).toContain(s);
      expect(BRIEF_SYSTEM).toContain(s);
    }
    expect(BRIEF_SYSTEM).toMatch(/specific real-world thing behind the idea/);
    // the pair rule is enforced in words, not left to the seed
    expect(BRIEF_SYSTEM).toMatch(/RESTATE the reference's cast, its scale/);
    expect(BRIEF_SYSTEM).toMatch(/never rely on the shared seed/);
    expect(BRIEF_SYSTEM).toMatch(/bullets must name what stayed the same/);
    // the style line is preset-agnostic now that two presets exist
    expect(BRIEF_SYSTEM).toMatch(/the preset adds the medium/);
    expect(BRIEF_SYSTEM).not.toMatch(/watercolor-and-ink/);
  });
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
    // 2026-09-06 (v6): the cast direction REPLACED the 2026-09-05 "reads YOUNG" rule
    expect(m.system).not.toMatch(/reading YOUNG/);
    expect(m.system).toMatch(/CAST DIRECTION/);
  });
  // v6 (2026-09-06, docs/ILLUSTRATION-STYLE-V6-DIRECTION.md): the cast direction, the setting,
  // the legal reject list, and the system prompt as a parameter (the editor's textarea).
  test("v6: the cast direction and the setting line are the doc's, verbatim; the student is the one the pictures follow", () => {
    expect(BRIEF_SYSTEM).toContain("People are sharp young professionals in a major city — New York, Chicago, London. Tailored, confident, mid-stride or mid-work. Convey standing through posture, silhouette, tailoring, and scale against architecture, never through facial expression. They are creative or startup professionals, not corporate drones and not students at a desk.");
    expect(BRIEF_SYSTEM).toContain("Favor a real urban setting with recognizable architecture, elevated viewpoints, glass, steel, and street level — a specific place beats a generic office.");
    // the two rules don't fight: the professionals are the world the student moves through
    expect(BRIEF_SYSTEM).toMatch(/the world they move through/);
    expect(BRIEF_SYSTEM).toMatch(/never parked at a desk/);
    // the senior exception survives as the way to say who is NOT the student
    expect(BRIEF_SYSTEM).toMatch(/a board member, an executive or a veteran of the room is not the student/);
  });
  test("v6: Grateful Dead iconography is on the reject list by name — protected marks, not an aesthetic", () => {
    for (const s of ["dancing bears", "skull and roses", "Steal Your Face", "13-point lightning bolts", "tie-dye spirals"]) {
      expect(BANNED_SUBJECTS).toContain(s);
      expect(BRIEF_SYSTEM).toContain(s);
    }
  });
  test("the system prompt is a parameter: the editor's edited brief goes out as-is; the default is the code's", () => {
    const req = { brainstorm: "a vault", teachingIntent: null };
    expect(buildBriefMessages(req).system).toBe(BRIEF_SYSTEM);
    expect(buildBriefMessages(req, "custom brief from settings").system).toBe("custom brief from settings");
    expect(buildBriefMessages(req, "custom brief from settings").user).toContain("a vault");
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
    expect(withLabel).toMatch(/background/i);      // the preset's own ground, whichever style is default
    expect(composeIllustrationPrompt(s, "a vault", null)).toMatch(/no text\b/i);
  });
});
