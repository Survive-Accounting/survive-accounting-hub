// /learn home — the simplified structure (09-03): title, cram rows, practice row, and nothing
// else. Rendered server-side (no DOM needed) and snapshotted so the plan cards and topic pills
// cannot quietly come back.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LearnHome, learnTitle, type HomeSet } from "@/components/learn/LearnHome";
import type { StudentSet, StudentTopic } from "@/lib/student.functions";

const set = (id: string, name: string, o: Partial<StudentSet> = {}): StudentSet => ({
  id, name, access: "free", orientation: "portrait", playbackId: null, ceqCount: 0, runtimeSec: null,
  hasReview: false, reviewPlaybackId: null, reviewRuntimeSec: null, firstStem: null, shortLabel: null, ...o,
});
const easy: StudentTopic = { id: "t-easy", name: "Easy Points", shortLabel: "Easy", number: 1, sets: [] };
const analyzing: StudentTopic = { id: "t-analyzing", name: "Analyzing Transactions", shortLabel: "Analyzing", number: 2, sets: [] };
const sets: HomeSet[] = [
  { set: set("s1", "Internal vs. external users", { playbackId: "pb1", runtimeSec: 102, ceqCount: 8, firstStem: "Which of the following is a user of financial accounting information?" }), topic: easy, n: 1, of: 2, locked: false, done: true, watched: 1, playable: true },
  { set: set("s2", "Financial vs. managerial accounting", { ceqCount: 8 }), topic: easy, n: 2, of: 2, locked: false, done: false, watched: 0, playable: true },
  { set: set("s3", "Account classification", { playbackId: "pb3", runtimeSec: 89 }), topic: analyzing, n: 1, of: 1, locked: false, done: false, watched: 0.4, playable: true },
];
const noop = () => {};
const render = (narrow = false) => renderToStaticMarkup(createElement(LearnHome, {
  sets, courseCode: "ACCY 201", schoolName: "Ole Miss", narrow,
  onOpenSet: noop, onLocked: noop, rowRef: () => noop,
  account: { email: null, userId: null, onSignIn: noop, signOut: noop },
}));

describe("/learn home (simplified)", () => {
  test("title reads the course and the campus", () => {
    expect(learnTitle("ACCY 201", "Ole Miss")).toBe("Free ACCY 201 prep at Ole Miss");
    expect(learnTitle(null, "Ole Miss")).toBe("Free intro accounting prep at Ole Miss");
    expect(learnTitle("ACCT 2001", null)).toBe("Free ACCT 2001 prep");
  });

  test("renders the title, one cram row per topic, and the practice row — nothing else", () => {
    const html = render();
    expect(html).toContain("Free ACCY 201 prep at Ole Miss");
    expect(html).toContain("Easy Points");
    expect(html).toContain("Analyzing Transactions");
    expect(html).toContain(">Practice<");
    // the study-mode cards and the topic pills are gone
    expect(html).not.toContain("What's on the exam, fast.");
    expect(html).not.toContain("Try each set right after cramming it.");
    expect(html).not.toContain("Your study time");
    expect(html).not.toContain("lk-chip");
    expect(html).not.toContain(">All<");
  });

  test("uses the homepage tokens, not a palette of its own", () => {
    const html = render();
    expect(html).toContain("var(--text-primary");
    expect(html).toContain("var(--text-secondary");
    expect(html).not.toMatch(/#111111|#E8FF47|#1C1C1C/);
  });

  test("desktop structure snapshot", () => {
    expect(render()).toMatchSnapshot();
  });

  test("phone structure snapshot", () => {
    expect(render(true)).toMatchSnapshot();
  });
});
