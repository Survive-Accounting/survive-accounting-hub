import { describe, expect, test } from "bun:test";

import { chicagoYesterday, classifyIgHandles, composeIgDigest, zoneMidnightUtc } from "./ig-digest";

describe("the daily IG digest", () => {
  test("yesterday in Chicago, DST-proof, with a human label", () => {
    // 03:30 UTC on Sep 6 is still Sep 5 in Chicago (CDT), so yesterday is Sep 4.
    expect(chicagoYesterday(new Date("2026-09-06T03:30:00Z"))).toEqual({ ymd: "2026-09-04", label: "Fri, Sep 4" });
    // Midnight Chicago on a CDT day is 05:00Z; on a CST day 06:00Z.
    expect(zoneMidnightUtc("2026-09-04", "America/Chicago").toISOString()).toBe("2026-09-04T05:00:00.000Z");
    expect(zoneMidnightUtc("2026-12-04", "America/Chicago").toISOString()).toBe("2026-12-04T06:00:00.000Z");
  });
  test("the text: totals on file, coverage, who, top campuses — and a calm zero", () => {
    const d = composeIgDigest({
      dayLabel: "Thu Sep 4", dashboardUrl: "https://surviveaccounting.com/admin/growth/coldoutreach",
      byCampus: [{ campus: "Indiana Bloomington", n: 18 }, { campus: "Purdue", n: 5 }],
      byWho: [{ who: "king@surviveaccounting.com", n: 21 }, { who: "lee@surviveaccounting.com", n: 2 }],
      totalOrgIgs: 2128, totalPersonalIgs: 0, campusesCovered: 182, campusesTotal: 240, orgsCovered: 1744, orgsTotal: 1819,
    });
    expect(d.total).toBe(23);
    expect(d.subject).toBe("23 new IG handles Thu Sep 4");
    expect(d.sms).toBe("IG · Thu Sep 4: 23 new (King 21, Lee 2) · Indiana Bloomington 18, Purdue 5 · Org IGs 2,128 · Campuses 182/240 (76%) · Orgs 1,744/1,819 (96%)");
    expect(d.text).toContain("Total Org IG's: 2,128");
    expect(d.text).toContain("Total Personal IG's: 0");
    expect(d.text).toContain("Campuses Covered vs Remaining: 182/240 (76%)");
    expect(d.text).toContain("Orgs Covered vs Remaining: 1,744/1,819 (96%)");
    expect(d.text).toContain("IG's found yesterday: 23");
    expect(d.text).toContain("By campus");

    const z = composeIgDigest({
      dayLabel: "Fri Sep 5", dashboardUrl: "x", byCampus: [], byWho: [],
      totalOrgIgs: 2128, totalPersonalIgs: 0, campusesCovered: 182, campusesTotal: 240, orgsCovered: 1744, orgsTotal: 1819,
    });
    expect(z.subject).toBe("No new IG handles Fri Sep 5");
    expect(z.sms).toBe("IG · Fri Sep 5: no new handles · Org IGs 2,128 · Campuses 182/240 (76%) · Orgs 1,744/1,819 (96%)");
  });
  test("a zero denominator reads as n/a, never NaN or Infinity", () => {
    const d = composeIgDigest({
      dayLabel: "x", dashboardUrl: "x", byCampus: [], byWho: [],
      totalOrgIgs: 0, totalPersonalIgs: 0, campusesCovered: 0, campusesTotal: 0, orgsCovered: 0, orgsTotal: 0,
    });
    expect(d.text).toContain("(n/a)");
    expect(d.sms).not.toMatch(/NaN|Infinity/);
  });
});

describe("org vs personal — the corrected split (Lee, 2026-09-05: \"we are getting personal IG's, no?\")", () => {
  const norm = (v: string) => v.trim().toLowerCase().replace(/^@/, "") || null;

  test("a hand-entered, named, reviewed council officer is personal; the org's own row on the same council is not", () => {
    const { orgHandles, personalHandles } = classifyIgHandles([
      // the IFC's own account — no name, never reviewed as personal
      { instagram: "univmissifc", name: null, contactSource: "campus_council_contacts", igRoleAccount: false },
      // a named officer, reviewed, NOT a role account — this is the fix
      { instagram: "lukehabeeb", name: "Luke Habeeb", contactSource: "campus_council_contacts", igRoleAccount: false },
      { instagram: "makaylabihlmeyer", name: "Makayla Bihlmeyer", contactSource: "campus_council_contacts", igRoleAccount: false },
    ], norm);
    expect(personalHandles).toEqual(new Set(["lukehabeeb", "makaylabihlmeyer"]));
    expect(orgHandles).toEqual(new Set(["univmissifc"]));
  });

  test("the automated chapter scraper never counts as personal, even with a name on the row", () => {
    const { orgHandles, personalHandles } = classifyIgHandles([
      { instagram: "kappasigmaua", name: "Dr. Elizabeth Michael", contactSource: "growth_public_contacts", igRoleAccount: false },
      { instagram: "syracuse_delts", name: null, contactSource: "growth_public_contacts", igRoleAccount: false },
    ], norm);
    expect(personalHandles.size).toBe(0);
    expect(orgHandles).toEqual(new Set(["kappasigmaua", "syracuse_delts"]));
  });

  test("an unreviewed council row (no name, or ig_role_account not explicitly false) counts as org, not personal", () => {
    const { orgHandles, personalHandles } = classifyIgHandles([
      { instagram: "a", name: null, contactSource: "campus_council_contacts", igRoleAccount: false },
      { instagram: "b", name: "Someone", contactSource: "campus_council_contacts", igRoleAccount: true },
      { instagram: "c", name: "Someone Else", contactSource: "campus_council_contacts", igRoleAccount: null },
    ], norm);
    expect(personalHandles.size).toBe(0);
    expect(orgHandles).toEqual(new Set(["a", "b", "c"]));
  });

  test("the same handle never counts in both buckets, and a null/unnormalizable handle is skipped", () => {
    const { orgHandles, personalHandles } = classifyIgHandles([
      { instagram: null, name: "No handle", contactSource: "campus_council_contacts", igRoleAccount: false },
      { instagram: "x", name: "X", contactSource: "campus_council_contacts", igRoleAccount: false },
    ], norm);
    expect(orgHandles.has("x")).toBe(false);
    expect(personalHandles.has("x")).toBe(true);
  });
});
