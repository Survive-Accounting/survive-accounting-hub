// SIGNING BONUS — the money math is pure and fully pinned here. The derived-not-ledgered design
// means these functions ARE the compensation contract.
import { describe, expect, it } from "bun:test";

import {
  activatedChapters, eventCounts, flyerQrCaption, isQualifyingSale, payingFlyers, signingBonus,
  BONUS_CAP_CENTS, CHAPTER_ACTIVATION_THRESHOLD, FLYER_SIGNUP_THRESHOLD,
} from "@/lib/rep-earnings";

describe("signingBonus", () => {
  it("prices the four events exactly as specced ($1 / $10 / $25 / $50)", () => {
    const b = signingBonus({ signups: 62, flyersProducing: 4, pagesClaimed: 3, chaptersActivated: 1 }, true);
    expect(b.lines.map((l) => l.totalCents)).toEqual([6200, 4000, 7500, 5000]);
    expect(b.rawCents).toBe(22700);              // the spec's own $227 example
    expect(b.earnedCents).toBe(22700);
    expect(b.capped).toBe(false);
    expect(b.locked).toBe(true);
  });
  it("caps at $300 total across all events", () => {
    const b = signingBonus({ signups: 300, flyersProducing: 10, pagesClaimed: 10, chaptersActivated: 5 }, false);
    expect(b.rawCents).toBeGreaterThan(BONUS_CAP_CENTS);
    expect(b.earnedCents).toBe(BONUS_CAP_CENTS);
    expect(b.capped).toBe(true);
  });
  it("zero activity is a clean zero", () => {
    const b = signingBonus({ signups: 0, flyersProducing: 0, pagesClaimed: 0, chaptersActivated: 0 }, true);
    expect(b.earnedCents).toBe(0);
  });
});

describe("the unlock gate", () => {
  it("only a $1,000+ CHAPTER sale qualifies — student purchases never do", () => {
    expect(isQualifyingSale("chapter_purchase", 100_000)).toBe(true);
    expect(isQualifyingSale("chapter_purchase", 250_000)).toBe(true);
    expect(isQualifyingSale("chapter_purchase", 99_999)).toBe(false);
    expect(isQualifyingSale("purchase", 200_000)).toBe(false);
    expect(isQualifyingSale("signup", 500_000)).toBe(false);
  });
  it("one-time rule: events before the first sale count, events after do not", () => {
    const saleAt = 1_000_000;
    expect(eventCounts(999_999, saleAt)).toBe(true);
    expect(eventCounts(1_000_000, saleAt)).toBe(true);
    expect(eventCounts(1_000_001, saleAt)).toBe(false);
    expect(eventCounts(5, null)).toBe(true);     // no sale yet — everything accrues
  });
});

describe("thresholds", () => {
  it("a chapter activates at 10+ signups from that ONE chapter", () => {
    expect(activatedChapters({ a: 10, b: 9, c: 42 })).toEqual(["a", "c"]);
    expect(CHAPTER_ACTIVATION_THRESHOLD).toBe(10);
  });
  it("a flyer pays at 5+ SIGNUPS (scans are diagnostic, never payable)", () => {
    expect(payingFlyers({ f1: 5, f2: 4, f3: 40 })).toEqual(["f1", "f3"]);
    expect(FLYER_SIGNUP_THRESHOLD).toBe(5);
  });
});

describe("flyer QR caption", () => {
  it("names the course; falls back without inventing one", () => {
    expect(flyerQrCaption("ACCY 201")).toBe("Free ACCY 201 exam prep — first exam free.");
    expect(flyerQrCaption(null)).toBe("Free accounting exam prep — first exam free.");
  });
});
