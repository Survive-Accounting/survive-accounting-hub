// The two-door homepage's locked copy rules (HOMEPAGE FINAL MILE v2 H1, 2026-08-28). These
// strings are LOCKED — a failure here means the homepage stopped saying what the spec says,
// not that the test needs updating.
import { describe, expect, test } from "bun:test";

import { GREEK_PORTAL_ORGS } from "@/components/site/portal-home/greek-portal-orgs";
import { HOME_CAMPUS } from "@/lib/launch";
import { homeCourseCode, soloButtonLabel, soloSupport, tickerLetters, tickerLine } from "./two-door-copy";

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

describe("greek ticker", () => {
  test("derives from the canonical org list — same letters, same order, no second list", () => {
    expect(tickerLetters()).toEqual(GREEK_PORTAL_ORGS.map((o) => o.letters));
    expect(tickerLetters().length).toBeGreaterThanOrEqual(10);
  });
  test("letters are real Greek characters, not Latin lookalikes", () => {
    for (const letters of tickerLetters()) {
      expect(letters).toMatch(/^[Α-Ω]+$/); // Greek capital letters only
    }
  });
  test("one line, dot-separated", () => {
    const line = tickerLine();
    expect(line.startsWith(GREEK_PORTAL_ORGS[0]!.letters)).toBe(true);
    expect(line).toContain(" · ");
  });
});
