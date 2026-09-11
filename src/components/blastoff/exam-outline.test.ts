// The exam outline's data, pinned: the exam's topics in order, cram videos only, it opens on this
// video's topic, ‹ › stop at either end, and the words start as Lee's question stems and keep his
// edits.
import { describe, expect, test } from "bun:test";

import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

import { OUTLINE_MAX_LINES, defaultSetLabel, examOutline, setLabel, spineLines, stepTopic, topicLabel, withLabel } from "./exam-outline";

const set = (id: string, lane?: "cram" | "offshoot" | "pitch"): BoothSetInfo => ({ id, name: `Set ${id}`, ceqs: [], liveCount: 0, draftCount: 0, ...(lane ? { lane } : {}) });
const bank: BoothTopic[] = [
  { id: "t1", name: "Easy Points", number: 1, sets: [set("a"), set("b", "offshoot"), set("c", "cram")] },
  { id: "s", name: "Strategy", number: null, sets: [set("st")], kind: "strategy" },
  { id: "t2", name: "Recording Journal Entries", number: 2, sets: [set("d"), set("e", "pitch")] },
];

describe("the exam outline", () => {
  test("the exam's topics in order, each with its cram videos only", () => {
    const o = examOutline(bank, "d");
    expect(o.exam).toBe("Exam 1");
    expect(o.topics.map((t) => t.name)).toEqual(["Easy Points", "Recording Journal Entries"]);
    expect(o.topics[0].sets.map((s) => s.id)).toEqual(["a", "c"]);
    expect(o.topics[1].sets.map((s) => s.id)).toEqual(["d"]);
  });

  test("it opens on this video's topic, marked; a video off the exam opens on the first", () => {
    expect(examOutline(bank, "d").hereIndex).toBe(1);
    expect(examOutline(bank, "d").topics[1].here).toBe(true);
    expect(examOutline(bank, "c").hereIndex).toBe(0);
    expect(examOutline(bank, "st").hereIndex).toBe(0);
    expect(examOutline(bank, "st").topics.some((t) => t.here)).toBe(false);
  });

  test("‹ › stop at either end", () => {
    expect(stepTopic(0, -1, 6)).toBe(0);
    expect(stepTopic(0, 1, 6)).toBe(1);
    expect(stepTopic(5, 1, 6)).toBe(5);
    expect(stepTopic(3, 0, 0)).toBe(0);
  });

  test("a long topic lists what fits, then how many more", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `S${i}` }));
    const r = spineLines(many);
    expect(r.shown).toHaveLength(OUTLINE_MAX_LINES);
    expect(r.more).toBe(10 - OUTLINE_MAX_LINES);
    expect(spineLines(many.slice(0, 3)).more).toBe(0);
  });

  test("videos start as Lee's question stems, word for word, then as '<name>?'", () => {
    expect(defaultSetLabel("Account classification")).toBe("What type of account?");
    expect(defaultSetLabel("Accounting equation effects")).toBe("Effect of A = L + E?");
    expect(defaultSetLabel("Debit vs. credit effects")).toBe("Debit/Credit effects?");
    expect(defaultSetLabel("Normal balances")).toBe("Normal balances?");
    expect(defaultSetLabel("Accounting cycle order")).toBe("Accounting cycle?");
    expect(defaultSetLabel("Posting & T-accounts")).toBe("Posting & T-accounts?");
    expect(defaultSetLabel("Why A = L + E?")).toBe("Why A = L + E?");
  });

  test("his edits stick per id; clearing one brings the default back", () => {
    const s = { id: "a", name: "Account classification" };
    const t = { id: "t1", name: "Easy Points" };
    let l = withLabel(undefined, "sets", "a", "Asset, liability, or equity?");
    l = withLabel(l, "topics", "t1", "The easy points");
    expect(setLabel(l, s)).toBe("Asset, liability, or equity?");
    expect(topicLabel(l, t)).toBe("The easy points");
    l = withLabel(l, "sets", "a", "   ");
    expect(setLabel(l, s)).toBe("What type of account?");
    expect(l.sets).toEqual({});
    expect(topicLabel(undefined, t)).toBe("Easy Points");
  });
});
