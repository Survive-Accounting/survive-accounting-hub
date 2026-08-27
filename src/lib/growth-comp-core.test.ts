import { describe, expect, it } from "bun:test";
import {
  buildCompSummary,
  classifyPartner,
  classifyUntracked,
  fmtUsd,
  KING_RATE,
  MILESTONES,
  milestoneProgress,
} from "./growth-comp-core";

describe("partner classification — the Section 6 carve-out", () => {
  it("founder-typed partners are founder, always", () => {
    expect(classifyPartner({ type: "founder", email: "anything@x.com" })).toBe("founder");
  });
  it("Lee's internal addresses are founder even without the flag", () => {
    expect(classifyPartner({ type: "rep", email: "lee@surviveaccounting.com" })).toBe("founder");
    expect(classifyPartner({ email: "lee@survivestudios.com" })).toBe("founder");
  });
  it("every other rep is King-managed while King owns the program", () => {
    expect(classifyPartner({ type: "rep", email: "sarah@olemiss.edu", created_by: "king" })).toBe(
      "king_growth",
    );
    // self-signup reps (created_by null) come from outreach King ran
    expect(classifyPartner({ type: "rep", email: "jake@uga.edu", created_by: null })).toBe(
      "king_growth",
    );
  });
  it("a partner Lee created that is not a rep stays founder-side", () => {
    expect(classifyPartner({ type: "partner", email: "buddy@gmail.com", created_by: "lee" })).toBe(
      "founder",
    );
  });
});

describe("untracked purchases — campaign touch must precede the purchase", () => {
  it("prior King touch claims it", () => {
    expect(
      classifyUntracked({
        purchasedAt: "2026-09-10T00:00:00Z",
        firstCampaignTouchAt: "2026-09-01T00:00:00Z",
      }),
    ).toBe("king_growth");
  });
  it("no touch → organic", () => {
    expect(
      classifyUntracked({ purchasedAt: "2026-09-10T00:00:00Z", firstCampaignTouchAt: null }),
    ).toBe("organic");
  });
  it("outreach AFTER the purchase claims nothing", () => {
    expect(
      classifyUntracked({
        purchasedAt: "2026-09-10T00:00:00Z",
        firstCampaignTouchAt: "2026-09-11T00:00:00Z",
      }),
    ).toBe("organic");
  });
});

describe("milestones — cumulative, never additive (Exhibit A)", () => {
  it("below the first tier: nothing reached, chasing $25k", () => {
    const m = milestoneProgress(10_000_00);
    expect(m.reached).toBeNull();
    expect(m.next?.revenueCents).toBe(25_000_00);
    expect(m.bonusEarnedCents).toBe(0);
    expect(m.progressToNext).toBeCloseTo(0.4, 5);
  });
  it("$100k pays a TOTAL of $3,500 — the contract's own example", () => {
    const m = milestoneProgress(100_000_00);
    expect(m.bonusEarnedCents).toBe(3_500_00);
    expect(m.next?.revenueCents).toBe(200_000_00);
  });
  it("past the top tier: done, progress full", () => {
    const m = milestoneProgress(250_000_00);
    expect(m.bonusEarnedCents).toBe(7_500_00);
    expect(m.next).toBeNull();
    expect(m.progressToNext).toBe(1);
  });
  it("tiers are strictly increasing in both columns", () => {
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].revenueCents).toBeGreaterThan(MILESTONES[i - 1].revenueCents);
      expect(MILESTONES[i].bonusCents).toBeGreaterThan(MILESTONES[i - 1].bonusCents);
    }
  });
});

describe("the worked example from Exhibit A", () => {
  it("$60k King + $25k founder + $15k organic → King earns $6,500", () => {
    const s = buildCompSummary({ king_growth: 60_000_00, founder: 25_000_00, organic: 15_000_00 });
    expect(s.totalRevenueCents).toBe(100_000_00);
    expect(s.kingCommissionCents).toBe(3_000_00); // 5% of 60k
    expect(s.milestones.bonusEarnedCents).toBe(3_500_00);
    expect(s.kingTotalCents).toBe(6_500_00);
    expect(KING_RATE).toBe(0.05);
  });
  it("founder and organic dollars never enter the commission", () => {
    const s = buildCompSummary({ king_growth: 0, founder: 50_000_00, organic: 50_000_00 });
    expect(s.kingCommissionCents).toBe(0);
    // …but they DO count toward milestones — attribution isn't contribution
    expect(s.milestones.bonusEarnedCents).toBe(3_500_00);
  });
});

describe("formatting", () => {
  it("renders whole dollars", () => {
    expect(fmtUsd(6_500_00)).toBe("$6,500");
    expect(fmtUsd(0)).toBe("$0");
  });
});
