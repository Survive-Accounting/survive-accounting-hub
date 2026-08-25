// GROWTH PRIORITY v1 — deterministic, versioned, explainable campus ranking.
//
// This is the ONE place the Fall-2026 default campus order is computed. No LLM, no
// per-pageload scoring: a server function (or script) feeds PriorityInput rows in,
// gets ranked rows out, and stores them in growth_campus_priority.
//
// GUARDRAILS (from GROWTH_PRIORITY_ANALYSIS, do not regress):
//  - GPA / academic-need NEVER enters (not even as an input field here).
//  - 990 financials NEVER enter.
//  - Competitor presence is POSITIVE validation only — never a penalty.
//  - Raw professor directory count NEVER enters; only Intro-1 *evidence* does.
//  - Greek reach counts ONCE (the market-intel outreach score double-counted it;
//    here market size is business completions only, Greek lives in `reach` alone).
//  - Observed first-party demand is an additive surface-boost (sample is tiny in
//    Aug 2026); as real usage grows it lifts campuses without re-tuning weights.

export const GROWTH_PRIORITY_VERSION = "growth_priority_v1";

export interface PriorityInput {
  campusId: string;
  name: string;
  /** market-intel duplicate row (raw_json->>'duplicate_primary' = 'false') — excluded from ranking */
  duplicateSuppressed: boolean;
  segment: string | null; // 'primary' ranks; 'two_year' excluded from the default order
  // A. market opportunity
  businessBachelors: number | null;
  growthMomentum: number | null; // 0-100 (market-intel growth_momentum_score)
  // B. reach (execution/distribution)
  eligibleCouncilEmails: number;
  eligibleChapterEmails: number;
  instagramContacts: number;
  socialChapters: number;
  greekQuarantined: boolean; // growth_scoring_exclusions(greek_chapter_count)
  // C. paid-market validation (competitive intel — positive only)
  hasCompetitiveRow: boolean;
  validatedPaidMarket: boolean;
  introPaidStatus: string | null; // STRONG | MODERATE | WEAK | UNKNOWN
  courseSpecificCompetitors: number;
  adsObserved: boolean;
  marketStatus: string | null; // VALIDATED_PAID_MARKET | CROWDED | WHITE_SPACE | LOW_EVIDENCE
  // D. course readiness (evidence-based, never raw counts)
  hasCourseCode: boolean;
  confirmedIntro1Professors: number; // CONFIRMED_INTRO1 evidence rows
  likelyIntro1Professors: number;
  exam1RangeEvidence: boolean;
  textbookEvidence: boolean;
  syllabiFound: number;
  approvedCampusMap: boolean;
  // E. observed Survive demand (first-party; tiny today, grows over time)
  identifiedUsers: number;
  paidUsers: number;
  practiceAttempts: number;
  waitlistSignups: number;
  orders: number;
  chapterClaims: number;
}

export interface PriorityComponents {
  market: number | null;
  growth: number | null;
  reach: number | null;
  paid: number | null;
  readiness: number;
  demandBoost: number;
}

export interface PriorityRow {
  campusId: string;
  rank: number;
  score: number;
  version: string;
  why: string[];
  components: PriorityComponents;
  baskets: string[];
}

const WEIGHTS = { market: 0.4, reach: 0.2, paid: 0.15, readiness: 0.15, growth: 0.1 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Percentile rank (0-100) of each value among the finite values of `values`. */
function percentiles(values: (number | null)[]): (number | null)[] {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  const n = finite.length;
  if (n === 0) return values.map(() => null);
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    // fraction of values strictly below + half of ties → stable, deterministic
    let lo = 0, hi = finite.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (finite[m] < v) lo = m + 1; else hi = m; }
    let hi2 = lo;
    while (hi2 < n && finite[hi2] === v) hi2++;
    const below = lo + (hi2 - lo) / 2;
    return n === 1 ? 100 : (below / n) * 100;
  });
}

export function paidValidationScore(i: PriorityInput): number | null {
  if (!i.hasCompetitiveRow) return null;
  let s = 0;
  if (i.validatedPaidMarket) s += 55;
  if (i.introPaidStatus === "STRONG") s += 30;
  else if (i.introPaidStatus === "MODERATE") s += 15;
  if (i.courseSpecificCompetitors > 0) s += 15;
  if (i.adsObserved) s += 10;
  return clamp(s, 0, 100);
}

export function readinessScore(i: PriorityInput): number {
  let s = 0;
  if (i.hasCourseCode) s += 25;
  if (i.confirmedIntro1Professors > 0) s += 25;
  else if (i.likelyIntro1Professors > 0) s += 12;
  if (i.exam1RangeEvidence) s += 20;
  if (i.textbookEvidence) s += 15;
  s += (clamp(i.syllabiFound, 0, 3) / 3) * 10;
  if (i.approvedCampusMap) s += 5;
  return r1(clamp(s, 0, 100));
}

export function demandBoost(i: PriorityInput): number {
  const raw =
    i.identifiedUsers * 3 +
    i.paidUsers * 10 +
    i.chapterClaims * 5 +
    i.orders * 2 +
    i.waitlistSignups * 1 +
    i.practiceAttempts * 0.05;
  return r1(clamp(raw, 0, 15));
}

function reachRaw(i: PriorityInput): number {
  const chapterPart = i.greekQuarantined ? 0 : clamp(i.socialChapters, 0, 60) * 0.5;
  return (
    i.eligibleCouncilEmails * 3 +
    i.eligibleChapterEmails * 2 +
    clamp(i.instagramContacts, 0, 40) * 0.2 +
    chapterPart
  );
}

function whyChips(c: PriorityComponents, i: PriorityInput): string[] {
  const chips: Array<[number, string]> = [];
  if (c.market != null && c.market >= 80) chips.push([c.market, "Large market"]);
  else if (c.market != null && c.market >= 60) chips.push([c.market, "Sizeable market"]);
  // "Proven paid" chips only where a COURSE-SPECIFIC paid competitor validates the exact
  // product (generic marketplaces exist everywhere — not a differentiator).
  if (i.courseSpecificCompetitors > 0 && (c.paid ?? 0) >= 70) chips.push([c.paid!, "Proven paid market"]);
  if (c.reach != null && c.reach >= 70) chips.push([c.reach, "Strong Greek reach"]);
  if (c.readiness >= 60) chips.push([c.readiness, "Course-ready"]);
  if (c.growth != null && c.growth >= 75) chips.push([c.growth, "Fast-growing"]);
  if (c.demandBoost > 0) chips.push([100 + c.demandBoost, "Live demand"]); // always surfaces first
  if (i.marketStatus === "WHITE_SPACE" && (c.market ?? 0) >= 60) chips.push([50, "White space"]);
  return chips.sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, label]) => label);
}

function basketsOf(c: PriorityComponents, i: PriorityInput): string[] {
  const b: string[] = [];
  if (c.market != null && c.market >= 80) b.push("top_markets");
  if (i.courseSpecificCompetitors > 0) b.push("proven_paid");
  if (c.reach != null && c.reach >= 70) b.push("greek_power");
  if (c.readiness >= 60) b.push("course_ready");
  if (c.market != null && c.market >= 70 && c.readiness < 40) b.push("needs_enrichment");
  if (c.demandBoost > 0) b.push("live_demand");
  if (i.marketStatus === "WHITE_SPACE" && c.market != null && c.market >= 60) b.push("white_space");
  return b;
}

/** Compute the full deterministic ranking. Input order does not affect output. */
export function computePriority(inputs: PriorityInput[]): PriorityRow[] {
  const eligible = inputs.filter((i) => !i.duplicateSuppressed && i.segment !== "two_year");
  const marketPct = percentiles(eligible.map((i) => i.businessBachelors));
  const reachPct = percentiles(eligible.map((i) => (reachRaw(i) > 0 ? reachRaw(i) : null)));

  const scored = eligible.map((i, idx) => {
    const components: PriorityComponents = {
      market: marketPct[idx] == null ? null : r1(marketPct[idx]!),
      growth: i.growthMomentum == null ? null : r1(clamp(i.growthMomentum, 0, 100)),
      reach: reachRaw(i) > 0 ? r1(reachPct[idx] ?? 0) : 0,
      paid: paidValidationScore(i),
      readiness: readinessScore(i),
      demandBoost: demandBoost(i),
    };
    // Weighted mean over non-null components, renormalized (a missing signal is
    // excluded, never scored 0 — matches the market-intel convention).
    let wSum = 0, sSum = 0;
    for (const key of ["market", "growth", "reach", "paid", "readiness"] as const) {
      const v = components[key];
      if (v != null) { wSum += WEIGHTS[key]; sSum += WEIGHTS[key] * v; }
    }
    const base = wSum > 0 ? sSum / wSum : 0;
    const score = r1(clamp(base + components.demandBoost, 0, 115));
    return { i, components, score };
  });

  scored.sort((a, b) =>
    b.score - a.score ||
    (b.i.businessBachelors ?? -1) - (a.i.businessBachelors ?? -1) ||
    a.i.name.localeCompare(b.i.name) ||
    a.i.campusId.localeCompare(b.i.campusId),
  );

  return scored.map(({ i, components, score }, idx) => ({
    campusId: i.campusId,
    rank: idx + 1,
    score,
    version: GROWTH_PRIORITY_VERSION,
    why: whyChips(components, i),
    components,
    baskets: basketsOf(components, i),
  }));
}
