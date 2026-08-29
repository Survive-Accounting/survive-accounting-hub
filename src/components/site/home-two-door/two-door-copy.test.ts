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
  // ONE-CODE RULE: on the home page the HEADLINE carries the code, so the button must not.
  test("button carries no course code — the headline is this block's one mention", () => {
    expect(soloButtonLabel()).toBe("Start cramming →");
    expect(soloButtonLabel()).not.toContain("ACCY");
  });
  test("support: muted sentence keeps the code + strong free line", () => {
    const s = soloSupport("ACCY 201");
    expect(s.muted).toBe(`Cram-style videos & practice for ACCY${NBSP}201.`);
    expect(s.strong).toBe("Exam 1 is free.");
  });
});
