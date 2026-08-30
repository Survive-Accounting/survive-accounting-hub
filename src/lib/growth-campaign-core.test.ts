import { describe, it, expect } from "bun:test";
import {
  nextBusinessSendTime,
  sendTimeLabel,
  validateCampaign,
  countByChannel,
  type CampaignRecipient,
  type ValidationContext,
} from "./growth-campaign-core";

// A fixed August 2026 week (CDT, UTC-5). 2026-08-31 is a Monday.
const at = (iso: string) => new Date(iso);

describe("nextBusinessSendTime", () => {
  it("schedules the next day at 9am CT, never same-day", () => {
    // Mon 2026-08-31 14:00Z (09:00 CT) -> Tue 2026-09-01 09:00 CT = 14:00Z
    const t = nextBusinessSendTime(at("2026-08-31T14:00:00Z"));
    expect(sendTimeLabel(t)).toBe("Tuesday 9:00 AM");
  });

  it("skips Saturday: a Friday launch sends Sunday", () => {
    // Fri 2026-09-04 -> next day Sat (skip) -> Sun 2026-09-06
    const t = nextBusinessSendTime(at("2026-09-04T18:00:00Z"));
    expect(sendTimeLabel(t)).toBe("Sunday 9:00 AM");
  });

  it("allows Sunday: a Saturday launch sends Sunday", () => {
    const t = nextBusinessSendTime(at("2026-09-05T18:00:00Z"));
    expect(sendTimeLabel(t)).toBe("Sunday 9:00 AM");
  });

  it("a Sunday launch sends Monday", () => {
    const t = nextBusinessSendTime(at("2026-09-06T18:00:00Z"));
    expect(sendTimeLabel(t)).toBe("Monday 9:00 AM");
  });

  it("lands on 9:00 AM CT (14:00Z during CDT)", () => {
    const t = nextBusinessSendTime(at("2026-08-31T14:00:00Z"));
    expect(t.getUTCHours()).toBe(14);
    expect(t.getUTCMinutes()).toBe(0);
  });
});

const rec = (o: Partial<CampaignRecipient>): CampaignRecipient => ({
  id: o.id ?? "r1",
  name: o.name ?? "Chi Omega Pres",
  channel: o.channel ?? "email",
  address: "address" in o ? (o.address ?? null) : "pres@chio.org",
  subject: o.subject ?? "Hi",
  body: o.body ?? "Hello there.",
});

const ctx = (o: Partial<ValidationContext> = {}): ValidationContext => ({
  recentlyContacted: o.recentlyContacted ?? new Set(),
  campusDailyCount: o.campusDailyCount ?? 0,
  campusDailyLimit: o.campusDailyLimit ?? 100,
  globalDailyCount: o.globalDailyCount ?? 0,
  globalDailyLimit: o.globalDailyLimit ?? 1000,
});

describe("validateCampaign", () => {
  it("passes a clean campaign", () => {
    expect(validateCampaign([rec({})], ctx())).toHaveLength(0);
  });

  it("blocks an unresolved merge field, naming it", () => {
    const f = validateCampaign([rec({ body: "Hi {{chapter_name}}!" })], ctx());
    expect(f).toHaveLength(1);
    expect(f[0].problem).toContain("{{chapter_name}}");
  });

  it("blocks a recipient missing the channel address", () => {
    const f = validateCampaign([rec({ address: null })], ctx());
    expect(f[0].problem).toMatch(/no email address/);
  });

  it("blocks duplicate recipients inside the campaign", () => {
    const f = validateCampaign(
      [rec({ id: "a", address: "x@y.com" }), rec({ id: "b", address: "X@Y.com" })],
      ctx(),
    );
    expect(f.some((x) => /more than once/.test(x.problem))).toBe(true);
  });

  it("blocks anyone contacted by a partner in the last 14 days", () => {
    const f = validateCampaign(
      [rec({ address: "seen@x.com" })],
      ctx({ recentlyContacted: new Set(["seen@x.com"]) }),
    );
    expect(f[0].problem).toMatch(/last 14 days/);
  });

  it("blocks when over campus or global daily limits", () => {
    const rs = [rec({ id: "a", address: "a@x.com" }), rec({ id: "b", address: "b@x.com" })];
    expect(validateCampaign(rs, ctx({ campusDailyCount: 99, campusDailyLimit: 100 }))).toHaveLength(
      1,
    );
    expect(
      validateCampaign(rs, ctx({ globalDailyCount: 999, globalDailyLimit: 1000 })),
    ).toHaveLength(1);
  });
});

describe("countByChannel", () => {
  it("splits emails and DMs", () => {
    const c = countByChannel([
      { channel: "email" },
      { channel: "email" },
      { channel: "ig_dm" },
    ]);
    expect(c).toEqual({ emails: 2, dms: 1 });
  });
});
