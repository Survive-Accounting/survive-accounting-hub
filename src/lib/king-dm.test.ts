import { describe, expect, it } from "bun:test";

import {
  ACTIVE_SLUGS, bareIg, contactsFromRow, councilKeyOf, daysBetween, followUpDue,
  parseRoster, planForDay, rosterTemplate, TARGET_CAMPUSES, type PlannableContact,
} from "./king-dm";

const NOW = new Date("2026-09-10T15:00:00Z");
const c = (over: Partial<PlannableContact> & { contactId: string }): PlannableContact => ({
  campusSlug: "university-of-mississippi", size: null, sentAt: null, repliedAt: null, outboundCount: 0, ...over,
});

describe("targets", () => {
  it("works the three live campuses first and greys the Florida cluster", () => {
    expect(ACTIVE_SLUGS).toEqual(["university-of-mississippi", "louisiana-state-university", "university-of-tennessee-knoxville"]);
    const upcoming = TARGET_CAMPUSES.filter((t) => t.stage === "upcoming");
    expect(upcoming).toHaveLength(6);
    expect(upcoming.every((t) => t.cluster === "Florida cluster")).toBe(true);
    expect(upcoming.map((t) => t.label)).toContain("Florida Gulf Coast");
  });
});

describe("follow-ups", () => {
  it("comes due after three quiet days, and never after a reply", () => {
    expect(followUpDue(c({ contactId: "a", sentAt: "2026-09-07T15:00:00Z" }), NOW)).toBe(true);
    expect(followUpDue(c({ contactId: "a", sentAt: "2026-09-08T15:00:00Z" }), NOW)).toBe(false);
    expect(followUpDue(c({ contactId: "a", sentAt: "2026-09-01T15:00:00Z", repliedAt: "2026-09-02T15:00:00Z" }), NOW)).toBe(false);
  });

  it("stops nudging after two", () => {
    expect(followUpDue(c({ contactId: "a", sentAt: "2026-09-01T15:00:00Z", outboundCount: 2 }), NOW)).toBe(true);
    expect(followUpDue(c({ contactId: "a", sentAt: "2026-09-01T15:00:00Z", outboundCount: 3 }), NOW)).toBe(false);
  });

  it("counts whole days and never goes negative", () => {
    expect(daysBetween("2026-09-07T15:00:00Z", NOW)).toBe(3);
    expect(daysBetween("2026-09-30T15:00:00Z", NOW)).toBe(0);
    expect(daysBetween("nonsense", NOW)).toBe(0);
  });
});

describe("planForDay", () => {
  it("puts follow-ups before new DMs, oldest nudge first", () => {
    const plan = planForDay([
      c({ contactId: "new1", size: 100 }),
      c({ contactId: "old", sentAt: "2026-09-01T15:00:00Z" }),
      c({ contactId: "less-old", sentAt: "2026-09-06T15:00:00Z" }),
    ], { now: NOW });
    expect(plan.map((p) => p.contactId)).toEqual(["old", "less-old", "new1"]);
    expect(plan[0].reason).toBe("follow_up");
    expect(plan[0].daysSince).toBe(9);
    expect(plan[2].reason).toBe("new");
  });

  it("skips anyone who replied — that is a conversation, not a task", () => {
    const plan = planForDay([c({ contactId: "replied", sentAt: "2026-09-01T15:00:00Z", repliedAt: "2026-09-02T15:00:00Z" })], { now: NOW });
    expect(plan).toEqual([]);
  });

  it("interleaves campuses so one big school cannot eat the day", () => {
    const plan = planForDay([
      c({ contactId: "om1", campusSlug: "university-of-mississippi", size: 200 }),
      c({ contactId: "om2", campusSlug: "university-of-mississippi", size: 190 }),
      c({ contactId: "om3", campusSlug: "university-of-mississippi", size: 180 }),
      c({ contactId: "lsu1", campusSlug: "louisiana-state-university", size: 50 }),
      c({ contactId: "tn1", campusSlug: "university-of-tennessee-knoxville", size: 10 }),
    ], { now: NOW });
    expect(plan.map((p) => p.contactId)).toEqual(["om1", "lsu1", "tn1", "om2", "om3"]);
  });

  it("sorts new DMs biggest chapter first within a campus", () => {
    const plan = planForDay([
      c({ contactId: "small", size: 20 }),
      c({ contactId: "big", size: 300 }),
      c({ contactId: "unknown", size: null }),
    ], { now: NOW });
    expect(plan.map((p) => p.contactId)).toEqual(["big", "small", "unknown"]);
  });

  it("respects the daily target", () => {
    const many = Array.from({ length: 40 }, (_, i) => c({ contactId: `x${i}`, size: 40 - i }));
    expect(planForDay(many, { now: NOW })).toHaveLength(20);
    expect(planForDay(many, { now: NOW, dailyTarget: 5 })).toHaveLength(5);
  });
});

describe("handles and councils", () => {
  it("bares a handle from anything a human pastes", () => {
    expect(bareIg("@SigmaChi_OleMiss")).toBe("sigmachi_olemiss");
    expect(bareIg("https://instagram.com/sigmachi/")).toBe("sigmachi");
    expect(bareIg("instagram.com/kappa.alpha")).toBe("kappa.alpha");
    expect(bareIg("")).toBe("");
    expect(bareIg("-")).toBe("");
    expect(bareIg("not a handle at all!!")).toBe("");
    // A name that slipped into a handle column must come back empty, never its last word.
    expect(bareIg("John Smith")).toBe("");
    expect(bareIg("Maddie Carter")).toBe("");
  });

  it("maps what people actually type to a council key", () => {
    expect(councilKeyOf("IFC")).toBe("ifc");
    expect(councilKeyOf("Interfraternity")).toBe("ifc");
    expect(councilKeyOf("Panhel")).toBe("panhellenic");
    expect(councilKeyOf("NPHC")).toBe("nphc");
    expect(councilKeyOf("Divine 9")).toBe("nphc");
    expect(councilKeyOf("nonsense")).toBeNull();
  });
});

describe("parseRoster", () => {
  it("reads a header row in any column order, council AND chapter rows together", () => {
    const { rows } = parseRoster([
      "Chapter,Council,Org IG,President,President IG,Scholarship Chair,Chair IG",
      "Sigma Chi,IFC,@sigmachi_om,Jordan Ellis,@jordan.ellis,Maddie Carter,@maddiec",
      ",IFC,@olemissifc,,,,",
    ].join("\n"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ council: "ifc", chapter: "Sigma Chi", orgIg: "sigmachi_om", presidentName: "Jordan Ellis", presidentIg: "jordan.ellis", chairName: "Maddie Carter", chairIg: "maddiec" });
    expect(rows[1]).toMatchObject({ council: "ifc", chapter: "", orgIg: "olemissifc" });
  });

  it("accepts a headerless paste in the documented column order, and tabs", () => {
    const { rows } = parseRoster("IFC\tSigma Chi\t@sigmachi\tJordan\t@jordan\tMaddie\t@maddie");
    expect(rows[0]).toMatchObject({ council: "ifc", chapter: "Sigma Chi", orgIg: "sigmachi", presidentIg: "jordan", chairIg: "maddie" });
  });

  it("drops rows with no handle and rows with no recognisable council, and counts them", () => {
    const { rows, skipped } = parseRoster([
      "IFC,Sigma Chi,@sigmachi,,,,",
      "IFC,Kappa Sigma,,,,,",             // nothing reachable
      "Chess Club,Whatever,@chessclub,,,,", // not a council
    ].join("\n"));
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it("returns nothing for empty input", () => {
    expect(parseRoster("")).toEqual({ rows: [], skipped: 0 });
    expect(parseRoster("\n\n  \n")).toEqual({ rows: [], skipped: 0 });
  });
});

describe("contactsFromRow", () => {
  it("splits one chapter line into up to three contacts with the right roles", () => {
    const [row] = parseRoster("IFC,Sigma Chi,@sigmachi,Jordan Ellis,@jordan,Maddie Carter,@maddie").rows;
    const out = contactsFromRow(row);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ slot: "org", role: "Chapter account", handle: "sigmachi", isOrg: true });
    expect(out[1]).toMatchObject({ slot: "pres", role: "President", name: "Jordan Ellis", isOrg: false });
    expect(out[2]).toMatchObject({ slot: "chair", role: "Scholarship Chair", name: "Maddie Carter", isOrg: false });
  });

  it("labels a council-level account as the council's own", () => {
    const [row] = parseRoster("IFC,,@olemissifc,,,,").rows;
    expect(contactsFromRow(row)[0]).toMatchObject({ slot: "org", role: "Council account", chapter: "" });
  });

  it("emits only the slots that carry a handle", () => {
    const [row] = parseRoster("IFC,Sigma Chi,,Jordan Ellis,@jordan,,").rows;
    expect(contactsFromRow(row).map((x) => x.slot)).toEqual(["pres"]);
  });
});

describe("rosterTemplate", () => {
  it("hands back a fillable sheet seeded with the chapters we know", () => {
    const csv = rosterTemplate([{ council: "ifc", name: "Sigma Chi" }, { council: "panhellenic", name: "Kappa Delta" }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Council,Chapter,Org IG,President,President IG,Scholarship Chair,Chair IG");
    expect(lines[1]).toBe("ifc,Sigma Chi,,,,,");
    expect(lines).toHaveLength(3);
    // round-trips: the template parses back to zero rows (no handles yet) without throwing
    expect(parseRoster(csv).rows).toHaveLength(0);
  });
});
