// SUBCATEGORIES INSIDE A TOPIC — Lee, 2026-09-06: "Add subcategories to /strategy so I know
// what's for onboarding reps. That's my #1 priority tonight. And, order them in the same order
// a rep would view them. Any other subcategories, make them."
//
// The bank has no notion of a group below a topic (a topic is a chapter row, a set is a deck),
// and a topic's sets come back in scene order — newest first — which is exactly backwards for
// a sequence someone is meant to watch in order. So the grouping lives here.
//
// THE STRATEGY TOPIC derives its groups from the strategy board's own vocabulary
// (lib/strategy.ts): SHORT_LANES are the audiences, in the board's order, and every short
// seed knows its lane — so a short "blasted off" from the board lands in the right group here
// with no second list to maintain. The one thing pinned here is the REP ORDER: the four shorts
// that play on /rep/onboarding steps 1–4 (lib/rep-pre-onboarding.ts STEPS: What Survive is →
// The mission → The role → How you earn) come first, in step order, then the rep shorts that
// aren't in that flow. Matching is by set slug (the same slug the URL uses), so renaming a set
// in the studio is the one thing that can move it out of its group — it then lands in the
// trailing "Other" group rather than vanishing. A topic with no groups renders as one
// unlabelled group in bank order — the accounting topics look exactly as they did.
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { slugOf } from "@/components/v3/use-bank";
import { SHORT_LANES, STRATEGY_SHORTS, type ShortLane } from "@/lib/strategy";

export interface TopicGroupSpec {
  label: string;
  /** Who it's for and why it's in this order — shown under the label. */
  blurb?: string;
  /** Set slugs, in viewing order. `ordered` numbers them on screen. */
  slugs: readonly string[];
  ordered?: boolean;
}

/** The four rep shorts in the order /rep/onboarding plays them (steps 1–4) — seed slugs from
 *  lib/strategy.ts. Any other rep-lane short follows these, in the board's priority order. */
export const REP_ONBOARDING_ORDER: readonly string[] = ["rep-what-survive-is", "rep-the-mission", "rep-week-to-week", "rep-how-you-get-paid"];

const LANE_BLURB: Partial<Record<ShortLane, string>> = {
  reps: "The onboarding shorts, in the order a new rep meets them — steps 1–4 of /rep/onboarding first, then the rest. Slater at Mississippi State is who you're picturing.",
};

/** The Strategy topic's groups, built from the board: one per audience lane, sets in the
 *  board's priority order — except the reps lane, which follows the onboarding flow. */
export function strategyGroupSpecs(): TopicGroupSpec[] {
  return SHORT_LANES.map((lane) => {
    const seeds = STRATEGY_SHORTS.filter((s) => s.lane === lane.key).sort((a, b) => a.priority - b.priority);
    const pinned = REP_ONBOARDING_ORDER.map((k) => seeds.find((s) => s.slug === k)).filter((s): s is (typeof seeds)[number] => !!s);
    const ordered = lane.key === "reps" ? [...pinned, ...seeds.filter((s) => !REP_ONBOARDING_ORDER.includes(s.slug))] : seeds;
    return { label: lane.title, blurb: LANE_BLURB[lane.key] ?? lane.blurb, ordered: lane.key === "reps", slugs: ordered.map((s) => slugOf(s.title)) };
  });
}

export const TOPIC_GROUPS: Record<string, () => TopicGroupSpec[]> = {
  strategy: strategyGroupSpecs,
};

export interface TopicGroup { label: string | null; blurb?: string; ordered: boolean; sets: BoothSetInfo[] }

/** The topic's sets, grouped and ordered. Every set appears exactly once: matched sets in
 *  their group's order, anything unmatched in a trailing "Other" group (bank order), empty
 *  groups dropped. A topic with no spec → one unlabelled group in bank order. */
export function groupSets(topicSlug: string, sets: readonly BoothSetInfo[]): TopicGroup[] {
  const specs = TOPIC_GROUPS[topicSlug]?.();
  if (!specs) return [{ label: null, ordered: false, sets: [...sets] }];
  const bySlug = new Map(sets.map((s) => [slugOf(s.name), s]));
  const placed = new Set<string>();
  const out: TopicGroup[] = [];
  for (const spec of specs) {
    const got: BoothSetInfo[] = [];
    for (const slug of spec.slugs) { const s = bySlug.get(slug); if (s && !placed.has(s.id)) { got.push(s); placed.add(s.id); } }
    if (got.length) out.push({ label: spec.label, blurb: spec.blurb, ordered: !!spec.ordered, sets: got });
  }
  const rest = sets.filter((s) => !placed.has(s.id));
  if (rest.length) out.push({ label: out.length ? "Other" : null, ordered: false, sets: rest });
  return out;
}

/** The same order, flattened — for any list that shows a topic's sets in a row (the queue). */
export const orderedSets = (topicSlug: string, sets: readonly BoothSetInfo[]): BoothSetInfo[] =>
  groupSets(topicSlug, sets).flatMap((g) => g.sets);
