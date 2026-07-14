import { describe, expect, it } from "bun:test";

import { chapterLabel, courseLabel } from "./je-api";

describe("courseLabel", () => {
  it("prefers course_name over code (migration 0089 flip — code is legacy)", () => {
    expect(courseLabel({ code: "INTRO1", course_name: "Intro 1" })).toBe("Intro 1");
  });

  it("falls back to code when course_name is null (pre-rename rows)", () => {
    expect(courseLabel({ code: "IA1", course_name: null })).toBe("IA1");
  });

  it("falls back to a generic label when both are null", () => {
    expect(courseLabel({ code: null, course_name: null })).toBe("Course");
  });
});

describe("chapterLabel", () => {
  it("formats an active chapter as 'Ch N · Name'", () => {
    expect(chapterLabel({ number: 4, name: "Journal Entries", status: "active" })).toBe("Ch 4 · Journal Entries");
  });

  it("appends '(archived)' for archived chapters — existing refs stay reachable, just marked", () => {
    expect(chapterLabel({ number: 100, name: "Receivables & Payables", status: "archived" })).toBe("Ch 100 · Receivables & Payables (archived)");
  });

  it("omits the 'Ch N' prefix when number is null", () => {
    expect(chapterLabel({ number: null, name: "Unassigned" })).toBe("Unassigned");
  });

  it("treats undefined status as active (pre-migration / /je tolerance)", () => {
    expect(chapterLabel({ number: 1, name: "Intro" })).toBe("Ch 1 · Intro");
  });
});
