// v4 step 2: what the AI is told about a group, and how its slides are read back safely.
import { describe, expect, test } from "bun:test";

import { buildV4SlidesMessages, extractJsonObject, parseV4Slides } from "./slides-brief";

describe("the slides brief", () => {
  test("placeholders are asked for, never skipped; his words and past edits go in", () => {
    const { system, user } = buildV4SlidesMessages({ topicName: "Easy Points", setName: "Equation effects", groupName: "Buying on account", questions: [{ stem: "Buy supplies on account?", correct: ["A up, L up"] }], existing: [], talk: "show the journal entry here", examples: [{ before: { words: "Long heading" }, after: { words: "Short" }, why: "too wordy" }] });
    expect(system).toContain("blank + `needs`");
    expect(system).toContain("Never skip something he asked for");
    expect(user).toContain("Buy supplies on account?  → A up, L up");
    expect(user).toContain("show the journal entry here");
    expect(user).toContain("because: too wordy");
  });
  test("unknown kinds and blanks without needs are dropped; fenced JSON is read", () => {
    const raw = extractJsonObject("```json\n{\"slides\":[{\"kind\":\"cheat\",\"text\":\"A = L + E\",\"big\":true},{\"kind\":\"wormhole\"},{\"kind\":\"blank\"},{\"kind\":\"blank\",\"needs\":\"T-account for supplies\"}]}\n```");
    expect(parseV4Slides(raw)).toEqual([{ kind: "cheat", text: "A = L + E", big: true }, { kind: "blank", needs: "T-account for supplies" }]);
  });
});
