import { describe, expect, test } from "bun:test";

import { courseCode, lessonCode, takePassthrough } from "./take-naming";

describe("take naming — the Mux passthrough convention", () => {
  test("courseCode: initials, fallback SA", () => {
    expect(courseCode("Start Here")).toBe("SH");
    expect(courseCode("Intro 1")).toBe("I1");
    expect(courseCode(null)).toBe("SA");
    expect(courseCode("  ")).toBe("SA");
  });

  test("lessonCode: chapter number zero-padded, else sanitized word", () => {
    expect(lessonCode("Ch 4 · Debits & Credits")).toBe("L04");
    expect(lessonCode("Ch 12 · Adjusting")).toBe("L12");
    expect(lessonCode("Course Wrap-up · Cram Decks")).toBe("CourseWr");
    expect(lessonCode("")).toBe("L00");
  });

  test("takePassthrough: SH-L01-hook-f2 style (server appends -tN)", () => {
    expect(takePassthrough("Start Here", "Ch 1 · Accounts", "hook", 1)).toBe("SH-L01-hook-f2");
    expect(takePassthrough(null, "Ch 4", "model_practice", 0)).toBe("SA-L04-modelpractice-f1");
  });
});
