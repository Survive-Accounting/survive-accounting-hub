// GROWTH COMPENSATION — the Growth Partner Agreement, as executable rules.
//
// This file IS the deal: the rates, the Fall 2026 milestone table, and the bucket
// classification the dashboard, the payout math and King's digest all read. If the
// agreement changes, this file changes with it — nothing else hardcodes a number.
//
// The three buckets (see the Revenue Attribution Guide, and the Venn on King's HQ):
//   king_growth — King's outreach + reps he manages          → King earns 5%
//   founder     — Lee's own links / personal network         → excluded from King's base
//   organic     — no code, no prior touch                    → excluded
// Milestone bonuses key on TOTAL semester revenue (all buckets) because attribution
// undercounts influence by design — that is the contract's own reasoning.
//
// Client-safe: pure data + pure functions.

export const KING_RATE = 0.05;
export const REP_RATE = 0.1;

/** Fall 2026 semester window — the period every comp number is computed over. */
export const SEMESTER = {
  key: "fall-2026",
  label: "Fall 2026",
  start: "2026-08-01T00:00:00Z",
  end: "2027-01-01T00:00:00Z",
} as const;

/** CUMULATIVE tiers (Exhibit A): reaching $100k pays a TOTAL of $3,500 — the highest
 *  tier reached — never the sum of the tiers below it. */
export const MILESTONES: { revenueCents: number; bonusCents: number }[] = [
  { revenueCents: 25_000_00, bonusCents: 500_00 },
  { revenueCents: 50_000_00, bonusCents: 1_500_00 },
  { revenueCents: 100_000_00, bonusCents: 3_500_00 },
  { revenueCents: 200_000_00, bonusCents: 7_500_00 },
];

export type Bucket = "king_growth" | "founder" | "organic";

const INTERNAL_EMAIL = /@(surviveaccounting|survivestudios)\.com$/i;

/** Classify a referral partner (rep). Founder-flagged partners — Lee acting as his own
 *  rep — are the contract's Section 6 carve-out. Every OTHER rep is King-managed while
 *  King owns the rep program (Lee flips a partner's type to 'founder' to carve one out). */
export function classifyPartner(p: {
  type?: string | null;
  email?: string | null;
  created_by?: string | null;
}): Bucket {
  if ((p.type ?? "").toLowerCase() === "founder") return "founder";
  if (p.email && INTERNAL_EMAIL.test(p.email)) return "founder";
  if ((p.created_by ?? "").toLowerCase() === "lee" && (p.type ?? "").toLowerCase() !== "rep")
    return "founder";
  return "king_growth";
}

/** Classify a purchase with no tracked link: a prior King-campaign touch on the buyer's
 *  chapter or campus makes it King-Managed Growth; otherwise it is organic. The touch
 *  must PRECEDE the purchase — outreach after the fact claims nothing. */
export function classifyUntracked(opts: {
  purchasedAt: string;
  firstCampaignTouchAt: string | null;
}): Bucket {
  if (!opts.firstCampaignTouchAt) return "organic";
  return opts.firstCampaignTouchAt < opts.purchasedAt ? "king_growth" : "organic";
}

export interface MilestoneProgress {
  totalRevenueCents: number;
  /** The tier currently reached (null before $25k). */
  reached: { revenueCents: number; bonusCents: number } | null;
  /** The next tier to chase (null past $200k). */
  next: { revenueCents: number; bonusCents: number } | null;
  /** 0..1 progress from the last reached tier to the next one. */
  progressToNext: number;
  /** Total bonus earned so far under the cumulative rule. */
  bonusEarnedCents: number;
}

export function milestoneProgress(totalRevenueCents: number): MilestoneProgress {
  let reached: MilestoneProgress["reached"] = null;
  let next: MilestoneProgress["next"] = null;
  for (const m of MILESTONES) {
    if (totalRevenueCents >= m.revenueCents) reached = m;
    else {
      next = m;
      break;
    }
  }
  const floor = reached?.revenueCents ?? 0;
  const progressToNext = next
    ? Math.min(1, Math.max(0, (totalRevenueCents - floor) / (next.revenueCents - floor)))
    : 1;
  return {
    totalRevenueCents,
    reached,
    next,
    progressToNext,
    bonusEarnedCents: reached?.bonusCents ?? 0,
  };
}

export interface CompSummary {
  semester: typeof SEMESTER;
  buckets: Record<Bucket, number>; // cents
  totalRevenueCents: number;
  kingCommissionCents: number; // 5% of king_growth
  milestones: MilestoneProgress;
  kingTotalCents: number; // commission + milestone bonuses
}

export function buildCompSummary(buckets: Record<Bucket, number>): CompSummary {
  const totalRevenueCents = buckets.king_growth + buckets.founder + buckets.organic;
  const kingCommissionCents = Math.round(buckets.king_growth * KING_RATE);
  const milestones = milestoneProgress(totalRevenueCents);
  return {
    semester: SEMESTER,
    buckets,
    totalRevenueCents,
    kingCommissionCents,
    milestones,
    kingTotalCents: kingCommissionCents + milestones.bonusEarnedCents,
  };
}

export const fmtUsd = (cents: number): string =>
  "$" + (cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
