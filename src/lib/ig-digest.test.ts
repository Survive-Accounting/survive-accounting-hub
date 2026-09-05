import { describe, expect, test } from "bun:test";

import { chicagoYesterday, composeIgDigest, zoneMidnightUtc } from "./ig-digest";

describe("the daily IG digest", () => {
  test("yesterday in Chicago, DST-proof, with a human label", () => {
    // 03:30 UTC on Sep 6 is still Sep 5 in Chicago (CDT), so yesterday is Sep 4.
    expect(chicagoYesterday(new Date("2026-09-06T03:30:00Z"))).toEqual({ ymd: "2026-09-04", label: "Fri, Sep 4" });
    // Midnight Chicago on a CDT day is 05:00Z; on a CST day 06:00Z.
    expect(zoneMidnightUtc("2026-09-04", "America/Chicago").toISOString()).toBe("2026-09-04T05:00:00.000Z");
    expect(zoneMidnightUtc("2026-12-04", "America/Chicago").toISOString()).toBe("2026-12-04T06:00:00.000Z");
  });
  test("the text: total, who, top campuses, on file — and a calm zero", () => {
    const d = composeIgDigest({ dayLabel: "Thu Sep 4", totalOnFile: 1536, dashboardUrl: "https://surviveaccounting.com/admin/growth/coldoutreach",
      byCampus: [{ campus: "Indiana Bloomington", n: 18 }, { campus: "Purdue", n: 5 }], byWho: [{ who: "king@surviveaccounting.com", n: 21 }, { who: "lee@surviveaccounting.com", n: 2 }] });
    expect(d.total).toBe(23);
    expect(d.subject).toBe("23 new IG handles Thu Sep 4");
    expect(d.sms).toBe("IG · Thu Sep 4: 23 new handles (King 21, Lee 2) · Indiana Bloomington 18, Purdue 5 · 1,536 on file");
    expect(d.text).toContain("By campus");
    const z = composeIgDigest({ dayLabel: "Fri Sep 5", totalOnFile: 1536, dashboardUrl: "x", byCampus: [], byWho: [] });
    expect(z.subject).toBe("No new IG handles Fri Sep 5");
    expect(z.sms).toBe("IG · Fri Sep 5: no new handles · 1,536 on file");
  });
});
