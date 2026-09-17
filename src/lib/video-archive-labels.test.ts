import { describe, expect, test } from "bun:test";

import { buildLabelMessages, cleanSourceRef, parseLabel, TRANSCRIPT_EXCERPT_CHARS } from "./video-archive-labels";

describe("parseLabel", () => {
  test("bare JSON object parses every field", () => {
    const r = parseLabel('{"course_family":"intro_1","kind":"homework","chapter_number":12,"source_ref":"QS 12-12","confidence":0.9,"note":"title names the item"}');
    expect(r).toEqual({ course_family: "intro_1", kind: "homework", chapter_number: 12, source_ref: "QS 12-12", confidence: 0.9, note: "title names the item" });
  });

  test("fenced JSON with prose around it still parses", () => {
    const text = [
      "Sure, here is the label:",
      "```json",
      '{ "course_family": "intermediate_2", "kind": "homework", "chapter_number": 17, "source_ref": "E17.18", "confidence": 0.85, "note": "Kieso item in title" }',
      "```",
      "Let me know if you need anything else.",
    ].join("\n");
    const r = parseLabel(text);
    expect(r?.course_family).toBe("intermediate_2");
    expect(r?.kind).toBe("homework");
    expect(r?.chapter_number).toBe(17);
    expect(r?.source_ref).toBe("E17.18");
    expect(r?.confidence).toBe(0.85);
  });

  test("bad enum values become null, never a wrong label", () => {
    const r = parseLabel('{"course_family":"financial","kind":"lecture","chapter_number":"3","confidence":0.7,"note":"x"}');
    expect(r).not.toBeNull();
    expect(r?.course_family).toBeNull();
    expect(r?.kind).toBeNull();
    expect(r?.chapter_number).toBe(3); // numeric strings are accepted
    expect(r?.confidence).toBe(0.7);
  });

  test("missing fields fall back to null / 0 / empty", () => {
    const r = parseLabel('{"course_family":"intro_2"}');
    expect(r).toEqual({ course_family: "intro_2", kind: null, chapter_number: null, source_ref: null, confidence: 0, note: "" });
  });

  test("out-of-range values are clamped or dropped", () => {
    const r = parseLabel('{"course_family":"intro_1","kind":"review","chapter_number":99,"confidence":7,"note":"'.concat("n".repeat(900), '"}'));
    expect(r?.chapter_number).toBeNull();
    expect(r?.confidence).toBe(1);
    expect(r?.note.length).toBe(500);
    expect(parseLabel('{"kind":"cram","confidence":-2}')?.confidence).toBe(0);
    expect(parseLabel('{"kind":"cram","confidence":"nope"}')?.confidence).toBe(0);
  });

  test("source_ref is only kept on homework and is normalized", () => {
    expect(parseLabel('{"kind":"review","source_ref":"E5.4"}')?.source_ref).toBeNull();
    expect(parseLabel('{"kind":"homework","source_ref":"  P22.1B  "}')?.source_ref).toBe("P22.1B");
    expect(parseLabel('{"kind":"homework","source_ref":"null"}')?.source_ref).toBeNull();
    expect(parseLabel('{"kind":"homework","source_ref":null}')?.source_ref).toBeNull();
    expect(cleanSourceRef("QS   12-12")).toBe("QS 12-12");
    expect(cleanSourceRef("x".repeat(80))?.length).toBe(40);
  });

  test("no JSON at all → null (arrays, prose, garbage)", () => {
    expect(parseLabel("")).toBeNull();
    expect(parseLabel("I could not determine the course.")).toBeNull();
    expect(parseLabel("[1,2,3]")).toBeNull();
    expect(parseLabel("{ this is not json }")).toBeNull();
  });
});

describe("buildLabelMessages", () => {
  test("carries the title, duration and a capped transcript excerpt", () => {
    const long = "word ".repeat(2_000);
    const { system, user } = buildLabelMessages({ title: "QS 12-12 Cash flows", duration_sec: 245, transcript_text: long });
    expect(system).toContain("intro_1");
    expect(system).toContain("intermediate_2");
    expect(user).toContain("Title: QS 12-12 Cash flows");
    expect(user).toContain("4:05");
    const excerptLine = user.split("\n").find((l) => l.startsWith("Transcript opening:")) ?? "";
    expect(excerptLine.length).toBeLessThan(TRANSCRIPT_EXCERPT_CHARS + 40);
    expect(excerptLine.endsWith("…")).toBe(true);
  });

  test("survives an untitled row with no transcript", () => {
    const { user } = buildLabelMessages({ title: null, duration_sec: null, transcript_text: null });
    expect(user).toContain("(untitled)");
    expect(user).toContain("unknown");
    expect(user).toContain("(no transcript)");
  });
});
