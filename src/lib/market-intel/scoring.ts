/**
 * Campus Market Intelligence — shared types + presentation helpers for the future Growth dashboard.
 * The scored data lives in the `campus_market_intelligence` table / `campus_market_intelligence_card`
 * view (see migration 20260824_2000). Weights/thresholds live in `scoring-config.json`.
 * This file is types + pure helpers only (no runtime deps) so it is safe to import anywhere.
 */

export type GrowthLabel = 'RAPID_GROWTH' | 'GROWING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
export type Segment = 'primary' | 'two_year' | 'other';
export type ComingSoon = 'COMING_SOON';

/** One dashboard card row (matches the campus_market_intelligence_card view). */
export interface CampusMarketCard {
  campus_id: string;
  campus: string;
  state: string | null;
  ipeds_unitid: string | null;
  segment: Segment;
  outreach_priority_score: number | null;
  market_opportunity_score: number | null;
  growth_momentum_score: number | null;
  growth_label: GrowthLabel;
  distribution_strength_score: number | null;
  distribution_data_completeness: number | null;
  course_readiness_status: ComingSoon | string;
  course_readiness_score: number | null;
  live_demand_status: ComingSoon | string;
  estimated_intro1_annual: number | null;
  business_bachelors: number | null;
  business_growth_5y: number | null;
  greek_chapters: number | null;
  councils_present: string[] | null;
  enrichment_priority_score: number | null;
  recommended_next_action: string | null;
  action_suppressed: boolean;
  top_drivers: string[] | null;
  market_data_completeness: number | null;
  generated_at: string;
}

/** Score band for colour-coding a 0-100 score. */
export function scoreBand(score: number | null): 'none' | 'low' | 'medium' | 'high' | 'top' {
  if (score == null) return 'none';
  if (score >= 85) return 'top';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export const GROWTH_LABEL_TEXT: Record<GrowthLabel, string> = {
  RAPID_GROWTH: 'Rapid growth',
  GROWING: 'Growing',
  STABLE: 'Stable',
  DECLINING: 'Declining',
  INSUFFICIENT_DATA: 'Not enough data',
};

/** Distribution Strength should always be shown with its data completeness. */
export function distributionLabel(card: Pick<CampusMarketCard, 'distribution_strength_score' | 'distribution_data_completeness'>): string {
  if (card.distribution_strength_score == null) return 'Pending research';
  const pct = card.distribution_data_completeness != null ? ` (${Math.round(card.distribution_data_completeness * 100)}% data)` : '';
  return `${card.distribution_strength_score}${pct}`;
}

export const COURSE_READINESS_COMING_SOON = 'COMING_SOON' as const;
