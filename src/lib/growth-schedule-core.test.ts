import { describe, expect, it } from "bun:test";
import {
  capsFor, senderFor, sendingDays, isSendingDay, rankChannels, planRange, followUpsDue,
  type SchedCampus, type SchedOrg, type PriorTouch,
} from "./growth-schedule-core";

const contact = (o: Partial<import("./growth-schedule-core").SchedContact> = {}) => ({
  id: o.id ?? Math.random().toString(36).slice(2), isPerson: o.isPerson ?? false, isRoleAccount: o.isRoleAccount ?? false,
  name: o.name ?? null, role: o.role ?? null, email: o.email ?? null, instagram: o.instagram ?? null,
  prewarmedAt: o.prewarmedAt ?? null, igFollowed: o.igFollowed ?? false, igLiked: o.igLiked ?? false,
});
const org = (o: Partial<SchedOrg>): SchedOrg => ({ orgKey: o.orgKey ?? "chapter:x", kind: o.kind ?? "chapter", label: o.label ?? "Chi O", councilType: o.councilType ?? null, orgType: o.orgType ?? "sorority", rank: o.rank ?? 1, needed: o.needed ?? true, contacts: o.contacts ?? [] });

describe("dates + ramp", () => {
  it("Saturday is off", () => { expect(isSendingDay("2026-09-05")).toBe(false); /* Sat */ expect(isSendingDay("2026-09-06")).toBe(true); /* Sun */ });
  it("ramps capacity", () => {
    expect(capsFor("2026-09-02")).toEqual({ dm: 10, email: 25 });
    expect(capsFor("2026-09-15")).toEqual({ dm: 15, email: 100 });
    expect(capsFor("2026-10-01")).toEqual({ dm: 20, email: 100 });
  });
  it("hands off to King on Sept 13", () => { expect(senderFor("2026-09-12")).toBe("lee"); expect(senderFor("2026-09-13")).toBe("king"); });
  it("sending days skip Saturdays", () => { expect(sendingDays("2026-09-01", "2026-09-07").includes("2026-09-05")).toBe(false); });
});

describe("channel priority", () => {
  it("personal IG outranks email; person outranks org", () => {
    const o = org({ contacts: [contact({ isPerson: false, email: "org@x.edu", instagram: "chio_org" }), contact({ isPerson: true, name: "Sarah", instagram: "sarah_", email: "sarah@x.edu" })] });
    const r = rankChannels(o)!;
    expect(r.contact.name).toBe("Sarah"); // person chosen
    expect(r.channels[0].kind).toBe("personal_ig"); // IG first
    expect(r.channels.map((c) => c.track)).toEqual(["dm", "email"]);
  });
  it("collapses to a single channel when only one exists (S3)", () => {
    const o = org({ contacts: [contact({ isPerson: false, instagram: "chio_org" })] });
    const r = rankChannels(o)!;
    expect(r.channels).toHaveLength(1);
    expect(r.channels[0].track).toBe("dm");
  });
  it("returns null when the org has no reachable contact", () => {
    expect(rankChannels(org({ contacts: [] }))).toBeNull();
  });
});

describe("planRange", () => {
  const campus = (id: string, orgs: SchedOrg[]): SchedCampus => ({ campusId: id, name: id, orgs });
  it("schedules one sequence per org, consuming both tracks, and flags gaps", () => {
    const c = campus("A", [
      org({ orgKey: "council:ifc", kind: "council", councilType: "ifc", label: "IFC", contacts: [contact({ isPerson: true, name: "Pat", email: "pat@a.edu", instagram: "pat_" })] }),
      org({ orgKey: "chapter:1", kind: "chapter", label: "Sigma Chi", contacts: [] }), // gap
    ]);
    const plan = planRange({ from: "2026-09-06", to: "2026-09-11", campuses: [c], touches: [] });
    const day0 = plan[0];
    expect(day0.items).toHaveLength(1);
    expect(day0.items[0].channels.map((x) => x.track).sort()).toEqual(["dm", "email"]);
    expect(day0.gaps.length).toBeGreaterThanOrEqual(1); // Sigma Chi has no contact
    // one-per-week: the same org never appears twice across the week
    const keys = plan.flatMap((d) => d.items).map((i) => i.orgKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("respects the DM cap", () => {
    // 30 chapters, DM-only contacts, Lee week (cap 10) → at most 10 DM sequences on day 0
    const orgs = Array.from({ length: 30 }, (_, i) => org({ orgKey: `chapter:${i}`, contacts: [contact({ instagram: `h${i}` })] }));
    const plan = planRange({ from: "2026-09-06", to: "2026-09-11", campuses: [campus("A", orgs)], touches: [] });
    expect(plan[0].items.length).toBeLessThanOrEqual(10);
  });
});

describe("follow-ups", () => {
  it("becomes due after 7 days with no reply, once", () => {
    const touches: PriorTouch[] = [{ campusId: "A", orgKey: "chapter:1", contactId: "c1", channel: "dm", kind: "new", scheduledDate: "2026-09-08", sentAt: "2026-09-08T10:00:00Z", repliedAt: null, outcome: null }];
    expect(followUpsDue(touches, "2026-09-15")).toHaveLength(1); // 7 days later
    expect(followUpsDue(touches, "2026-09-14")).toHaveLength(0); // 6 days
    const replied = [...touches]; replied[0] = { ...replied[0], repliedAt: "2026-09-10T00:00:00Z" };
    expect(followUpsDue(replied, "2026-09-15")).toHaveLength(0); // replied → no follow-up
  });
});
