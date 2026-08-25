import { describe, expect, it } from "bun:test";
import {
  computePriority,
  demandBoost,
  paidValidationScore,
  readinessScore,
  GROWTH_PRIORITY_VERSION,
  type PriorityInput,
} from "./growth-priority-core";

const base = (over: Partial<PriorityInput>): PriorityInput => ({
  campusId: "00000000-0000-0000-0000-000000000001",
  name: "Test U",
  duplicateSuppressed: false,
  segment: "primary",
  businessBachelors: 1000,
  growthMomentum: 50,
  eligibleCouncilEmails: 0,
  eligibleChapterEmails: 0,
  instagramContacts: 0,
  socialChapters: 0,
  greekQuarantined: false,
  hasCompetitiveRow: false,
  validatedPaidMarket: false,
  introPaidStatus: null,
  courseSpecificCompetitors: 0,
  adsObserved: false,
  marketStatus: null,
  hasCourseCode: false,
  confirmedIntro1Professors: 0,
  likelyIntro1Professors: 0,
  exam1RangeEvidence: false,
  textbookEvidence: false,
  syllabiFound: 0,
  approvedCampusMap: false,
  identifiedUsers: 0,
  paidUsers: 0,
  practiceAttempts: 0,
  waitlistSignups: 0,
  orders: 0,
  chapterClaims: 0,
  ...over,
});

describe("computePriority — determinism & identity", () => {
  const inputs = [
    base({ campusId: "00000000-0000-0000-0000-000000000001", name: "A", businessBachelors: 3000 }),
    base({ campusId: "00000000-0000-0000-0000-000000000002", name: "B", businessBachelors: 100 }),
    base({ campusId: "00000000-0000-0000-0000-000000000003", name: "C", businessBachelors: 800 }),
  ];
  it("is deterministic and independent of input order", () => {
    const a = computePriority(inputs);
    const b = computePriority([...inputs].reverse());
    expect(a.map((r) => r.campusId)).toEqual(b.map((r) => r.campusId));
    expect(a.map((r) => r.score)).toEqual(b.map((r) => r.score));
    expect(a[0].version).toBe(GROWTH_PRIORITY_VERSION);
  });
  it("excludes suppressed duplicate campus rows and two-year segment", () => {
    const out = computePriority([
      ...inputs,
      base({
        campusId: "00000000-0000-0000-0000-000000000004",
        name: "Dup",
        duplicateSuppressed: true,
      }),
      base({ campusId: "00000000-0000-0000-0000-000000000005", name: "CC", segment: "two_year" }),
    ]);
    expect(out.map((r) => r.campusId)).not.toContain("00000000-0000-0000-0000-000000000004");
    expect(out.map((r) => r.campusId)).not.toContain("00000000-0000-0000-0000-000000000005");
  });
  it("assigns dense ranks starting at 1", () => {
    const out = computePriority(inputs);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe("guardrails", () => {
  it("has NO GPA / 990-financial / raw-professor-count inputs (type-level contract)", () => {
    const keys = Object.keys(base({}));
    for (const banned of [
      "gpa",
      "academicNeed",
      "revenue",
      "assets",
      "netAssets",
      "professorCount",
      "rawProfessorCount",
    ]) {
      expect(keys.some((k) => k.toLowerCase().includes(banned.toLowerCase()))).toBe(false);
    }
  });
  it("competitor presence only ADDS paid-validation points (never subtracts)", () => {
    const none = paidValidationScore(base({ hasCompetitiveRow: true }));
    const some = paidValidationScore(
      base({ hasCompetitiveRow: true, courseSpecificCompetitors: 3 }),
    );
    const more = paidValidationScore(
      base({
        hasCompetitiveRow: true,
        courseSpecificCompetitors: 3,
        validatedPaidMarket: true,
        adsObserved: true,
      }),
    );
    expect(some!).toBeGreaterThan(none!);
    expect(more!).toBeGreaterThan(some!);
  });
  it("missing competitive research is null (excluded), not zero", () => {
    expect(paidValidationScore(base({ hasCompetitiveRow: false }))).toBeNull();
  });
  it("quarantined greek counts are excluded from reach", () => {
    const clean = base({ campusId: "00000000-0000-0000-0000-00000000000a", socialChapters: 50 });
    const quarantined = base({
      campusId: "00000000-0000-0000-0000-00000000000b",
      socialChapters: 50,
      greekQuarantined: true,
    });
    const filler = base({ campusId: "00000000-0000-0000-0000-00000000000c", socialChapters: 5 });
    const out = computePriority([clean, quarantined, filler]);
    const cleanRow = out.find((r) => r.campusId === clean.campusId)!;
    const qRow = out.find((r) => r.campusId === quarantined.campusId)!;
    expect(cleanRow.score).toBeGreaterThan(qRow.score);
  });
});

describe("readiness / demand", () => {
  it("readiness uses evidence, not raw counts, and caps at 100", () => {
    expect(readinessScore(base({}))).toBe(0);
    const full = readinessScore(
      base({
        hasCourseCode: true,
        confirmedIntro1Professors: 2,
        exam1RangeEvidence: true,
        textbookEvidence: true,
        syllabiFound: 5,
        approvedCampusMap: true,
      }),
    );
    expect(full).toBe(100);
    // likely-only professors count for less than confirmed
    const likely = readinessScore(base({ likelyIntro1Professors: 3 }));
    const confirmed = readinessScore(base({ confirmedIntro1Professors: 1 }));
    expect(confirmed).toBeGreaterThan(likely);
  });
  it("demand boost is additive and capped at 15", () => {
    expect(demandBoost(base({}))).toBe(0);
    expect(demandBoost(base({ paidUsers: 100 }))).toBe(15);
    expect(demandBoost(base({ identifiedUsers: 1 }))).toBe(3);
  });
  it("live demand surfaces a campus (boost raises score) and lands in baskets + why", () => {
    const quiet = base({ campusId: "00000000-0000-0000-0000-000000000011", name: "Quiet" });
    const hot = base({
      campusId: "00000000-0000-0000-0000-000000000012",
      name: "Hot",
      identifiedUsers: 4,
      paidUsers: 1,
    });
    const out = computePriority([quiet, hot]);
    const hotRow = out.find((r) => r.campusId === hot.campusId)!;
    expect(hotRow.rank).toBe(1);
    expect(hotRow.baskets).toContain("live_demand");
    expect(hotRow.why).toContain("Live demand");
  });
});

describe("manual pin/override contract", () => {
  it("computePriority output never encodes pins — pins layer on top elsewhere", () => {
    const out = computePriority([base({})]);
    expect(Object.keys(out[0])).not.toContain("pinned");
  });
});
