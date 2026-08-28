// The two-door homepage's locked copy rules (HOMEPAGE FINAL MILE v2 H1, 2026-08-28). These
// strings are LOCKED — a failure here means the homepage stopped saying what the spec says,
// not that the test needs updating.
import { describe, expect, test } from "bun:test";

import { HOME_CAMPUS } from "@/lib/launch";
import { homeCourseCode, soloButtonLabel, soloSupport } from "./two-door-copy";

const NBSP = "\u00A0";

describe("course code token", () => {
  test("known code renders nbsp-joined so the number can never wrap alone", () => {
    expect(homeCourseCode("ACCY 201")).toBe(`ACCY${NBSP}201`);
    expect(homeCourseCode("ACCT 2110")).toBe(`ACCT${NBSP}2110`);
  });
  test("unknown code falls back to the flagship campus config, never a hardcoded string", () => {
    expect(homeCourseCode(null)).toBe(HOME_CAMPUS.courseCode.replace(/ /g, NBSP));
  });
});

describe("left door", () => {
  test("button: Survive <code> →", () => {
    expect(soloButtonLabel("ACCY 201")).toBe(`Survive ACCY${NBSP}201 →`);
  });
  test("support: muted sentence + strong free line", () => {
    const s = soloSupport("ACCY 201");
    expect(s.muted).toBe(`Cram-style videos & practice for ACCY${NBSP}201.`);
    expect(s.strong).toBe("Exam 1 is free.");
  });
});
