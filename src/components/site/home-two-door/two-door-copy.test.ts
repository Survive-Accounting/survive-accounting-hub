// The two-door homepage's locked copy rules (2026-08-27 spec). These strings are LOCKED —
// a failure here means the homepage stopped saying what the spec says, not that the test
// needs updating.
import { describe, expect, test } from "bun:test";

import { GREEK_PORTAL_ORGS } from "@/components/site/portal-home/greek-portal-orgs";
import { soloDoorCta, soloDoorDescription, tickerLetters, tickerLine } from "./two-door-copy";

describe("left door description", () => {
  test("names the verified course code exactly", () => {
    expect(soloDoorDescription("ACCY 201")).toBe("Cram videos + practice built for ACCY 201.");
    expect(soloDoorDescription("ACCT 2110")).toBe("Cram videos + practice built for ACCT 2110.");
  });
  test("never invents a code — null degrades to the generic line", () => {
    expect(soloDoorDescription(null)).toBe("Cram videos + practice built around your course.");
  });
});

describe("left door CTA", () => {
  test("new visitor starts, returning visitor continues", () => {
    expect(soloDoorCta(false)).toBe("Start Exam 1 Free →");
    expect(soloDoorCta(true)).toBe("Continue Exam 1 →");
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
