import { describe, expect, test } from "bun:test";

import { buildRetroMessages, normalizeRetroTags, parseRetro, RETRO_SYSTEM, retroLogNote } from "./retro-brief";

describe("the retro by voice", () => {
  test("the messages carry the step, what he said, the minutes and the pauses", () => {
    const m = buildRetroMessages({
      step: "Rehearse & Film",
      taskMinutes: [{ label: "Film the take", minutes: 14.4, status: "done" }, { label: "Set up OBS", minutes: 0.4, status: "skipped" }],
      pauses: [{ taskLabel: "Film the take", reason: "dog at the door", seconds: 180 }, { taskLabel: null, reason: "", seconds: 30 }],
      spoken: "slide four took three takes, Recraft was slow again",
    });
    expect(m.system).toBe(RETRO_SYSTEM);
    for (const s of ["THE STEP: Rehearse & Film", "WHAT LEE SAID", "three takes", "- Film the take: 14 min", "- Set up OBS: <1 min (skipped)", 'on "Film the take", 3 min — "dog at the door"', "between tasks, 1 min"]) {
      expect(m.user).toContain(s);
    }
    expect(m.system).toMatch(/What sucked/);
  });

  test("no pauses and nothing said are said plainly", () => {
    const m = buildRetroMessages({ step: "Editor", taskMinutes: [], pauses: [], spoken: "  " });
    expect(m.user).toContain("(nothing)");
    expect(m.user).toContain("PAUSES: none.");
    expect(m.user).not.toContain("THE MINUTES");
  });

  test("the answer parses to one line and clean tags", () => {
    const r = parseRetro('{"note":"Slide 4 took three takes 😩 and Recraft was slow.","tags":["re-recorded slide 4 ×3","Waiting on Recraft","waiting on recraft","[x]",""]}');
    expect(r?.note).toBe("Slide 4 took three takes and Recraft was slow.");
    expect(r?.tags).toEqual(["re-recorded slide 4 ×3", "Waiting on Recraft", "x"]);
  });

  test("a note the model left empty falls back to his words; empty everything is null", () => {
    expect(parseRetro('{"note":"","tags":[]}', "fine, nothing")?.note).toBe("fine, nothing");
    expect(parseRetro('{"note":"","tags":[]}')).toBeNull();
    expect(parseRetro("nope")).toBeNull();
  });

  test("tags are capped at five and forty-eight characters", () => {
    const tags = normalizeRetroTags(["a", "b", "c", "d", "e", "f", "g"]);
    expect(tags).toHaveLength(5);
    expect(normalizeRetroTags(["x".repeat(80)])[0]).toHaveLength(48);
    expect(normalizeRetroTags("not a list")).toEqual([]);
  });

  test("the log form is [tag] [tag] note — or just the note, or null", () => {
    expect(retroLogNote("the note", ["waiting on Recraft", "re-recorded slide 4 ×3"])).toBe("[waiting on Recraft] [re-recorded slide 4 ×3] the note");
    expect(retroLogNote("the note", [])).toBe("the note");
    expect(retroLogNote("", ["a"])).toBe("[a]");
    expect(retroLogNote(null, null)).toBeNull();
  });
});
