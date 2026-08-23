// Guards the URL→template classifier and QA status derivation — the two pure
// pieces the cockpit's ranking and roll-ups depend on.
import { describe, expect, test } from "bun:test";

import { classifyPath } from "./classify";
import { deriveStatus, statusUrgency } from "./status";

describe("classifyPath", () => {
  test("static + greek + partner paths", () => {
    expect(classifyPath("/")).toBe("homepage");
    expect(classifyPath("/go/university-of-arizona/kappa-kappa-gamma")).toBe("greek-chapter-page");
    expect(classifyPath("/go/university-of-arizona")).toBe("chapter-finder");
    expect(classifyPath("/go/university-of-arizona/council/ifc")).toBe("council-private-page");
    expect(classifyPath("/partners/national/kappa-kappa-gamma")).toBe("national-org-page");
    expect(classifyPath("/partners/council/clemson/ifc")).toBe("council-partner-page");
    expect(classifyPath("/chapters/dashboard")).toBe("chapter-dashboard");
    expect(classifyPath("/admin/site-qa")).toBe("site-qa");
  });

  test("outreach console vs sub-consoles", () => {
    expect(classifyPath("/outreach")).toBe("outreach-console");
    expect(classifyPath("/outreach/campuses")).toBe("outreach-console");
    expect(classifyPath("/outreach/profintel")).toBe("profintel-admin");
    expect(classifyPath("/outreach/greek-orgs")).toBe("greekintel-admin");
    expect(classifyPath("/outreach/school/clemson")).toBe("prof-campus-landing");
  });

  test("query strings and trailing slashes are ignored", () => {
    expect(classifyPath("/?ref=x")).toBe("homepage");
    expect(classifyPath("/terms/")).toBe("legal");
  });

  test("unknown paths return null", () => {
    expect(classifyPath("/definitely-not-a-real-slug-xyz")).toBeNull();
  });
});

describe("deriveStatus", () => {
  const base = {
    currentVersion: "abc",
    verifiedVersion: "abc",
    verifiedAt: "2026-08-01T00:00:00Z",
    recentErrors: 0,
  };
  test("errors win over everything", () => {
    expect(deriveStatus({ ...base, recentErrors: 3 })).toBe("error");
  });
  test("no verification → never", () => {
    expect(deriveStatus({ ...base, verifiedAt: null, verifiedVersion: null })).toBe("never");
  });
  test("hash mismatch → changed", () => {
    expect(deriveStatus({ ...base, verifiedVersion: "old" })).toBe("changed");
  });
  test("match → verified", () => {
    expect(deriveStatus(base)).toBe("verified");
  });
  test("urgency orders error < changed < never < verified", () => {
    expect(statusUrgency("error")).toBeLessThan(statusUrgency("changed"));
    expect(statusUrgency("changed")).toBeLessThan(statusUrgency("never"));
    expect(statusUrgency("never")).toBeLessThan(statusUrgency("verified"));
  });
});
