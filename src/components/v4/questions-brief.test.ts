// v4 step 1's AI: groups first, then each group's questions — read back through the same checks the
// editor uses, so an incomplete or repeated question never lands.
import { describe, expect, test } from "bun:test";

import { buildGroupsMessages, buildQuestionsMessages, parseGroups, parseQuestions } from "./questions-brief";

const common = { topicName: "Easy Points", setName: "Equation effects", talk: "buying supplies on account trips people up", existingGroups: ["Assets"], existingStems: ["Cash is a…"], examples: [] };

describe("the questions brief", () => {
  test("groups keep existing names and hear what he said", () => {
    const { system, user } = buildGroupsMessages(common);
    expect(system).toContain("Keep any existing group");
    expect(user).toContain("Existing groups: Assets");
    expect(user).toContain("buying supplies on account");
  });
  test("a group's questions: both formats offered, feedback asked for", () => {
    const { system, user } = buildQuestionsMessages({ ...common, group: { name: "On account", covers: "credit purchases", count: 4 }, alreadyInGroup: ["Buy on account?"] });
    expect(system).toContain("select_all");
    expect(system).toContain("feedback");
    expect(user).toContain("Already in this group");
  });
  test("groups are clamped and de-duplicated", () => {
    expect(parseGroups({ groups: [{ name: "Assets", count: 40 }, { name: "assets" }, { name: "" }, { name: "Liabilities", covers: "owe", count: 3 }] }))
      .toEqual([{ name: "Assets", covers: "", count: 10 }, { name: "Liabilities", covers: "owe", count: 3 }]);
  });
  test("incomplete or repeated questions are dropped; select all is kept when it's valid", () => {
    const q = parseQuestions({ questions: [
      { format: "mc", stem: "Cash is a…", choices: [{ text: "Asset", correct: true }, { text: "Liability" }] },           // repeat of an existing one
      { format: "mc", stem: "Two right?", choices: [{ text: "A", correct: true }, { text: "B", correct: true }] },         // invalid mc
      { format: "select_all", stem: "Pick the current assets", choices: [{ text: "Cash", correct: true }, { text: "Supplies", correct: true }, { text: "Land", correct: false, feedback: "long-term" }] },
    ] }, ["Cash is a…"]);
    expect(q.map((x) => [x.format, x.stem])).toEqual([["select_all", "Pick the current assets"]]);
    expect(q[0].choices[2]).toEqual({ text: "Land", correct: false, feedback: "long-term" });
  });
});
