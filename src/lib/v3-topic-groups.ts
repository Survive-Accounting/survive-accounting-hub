// SUBCATEGORIES INSIDE A TOPIC — Lee, 2026-09-06: "Add subcategories to /strategy so I know
// what's for onboarding reps. That's my #1 priority tonight. And, order them in the same order
// a rep would view them. Any other subcategories, make them."
//
// The bank has no notion of a group below a topic (a topic is a chapter row, a set is a deck),
// and the sets of a topic come back in scene order — newest first — which is exactly backwards
// for a sequence someone is meant to watch in order. So the grouping lives here, in code, by
// set SLUG (the same slug the URL uses, so renaming a set in the studio is the one thing that
// can move it out of its group — it then lands in the trailing "Other" group rather than
// vanishing). A topic with no entry here is one group with no label, in bank order — the
// accounting topics look exactly as they did.
//
// The Strategy topic (SURVIVE_STRATEGY_CULTURE_2026-09.md, "Content Verticals"): onboarding
// shorts are for reps, chairs and IFC — "explain the role, put a face to the name". The rep
// order is the order a new rep should meet them: what this is → what the job is → what it pays
// → what you'll learn → why you were picked → where it's all going (the one where "they decide
// whether it's a job or a thing they want in on").
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { slugOf } from "@/components/v3/use-bank";

export interface TopicGroupSpec {
  label: string;
  /** Who it's for and why it's in this order — shown under the label. */
  blurb?: string;
  /** Set slugs, in viewing order. `ordered` numbers them on screen. */
  slugs: readonly string[];
  ordered?: boolean;
}

export const TOPIC_GROUPS: Record<string, readonly TopicGroupSpec[]> = {
  strategy: [
    {
      label: "Rep onboarding",
      blurb: "For a new rep, in the order they should watch — Slater at Mississippi State is who you're picturing.",
      ordered: true,
      slugs: [
        "what-survive-is-for-a-rep",
        "what-a-rep-actually-does-week-to-week",
        "how-you-get-paid",
        "an-education-with-a-commission-attached",
        "why-the-bar-is-high",
        "the-mission",
      ],
    },
    {
      label: "Chapter partners",
      blurb: "Scholarship chairs and councils — the shorter, face-to-the-name cut. Partnership, not vendor.",
      slugs: [
        "for-the-scholarship-chair-i-want-you-to-be-incredible-at-your-job",
        "for-ifc-and-councils-this-is-for-your-whole-greek-system",
      ],
    },
    {
      label: "Students",
      blurb: "The free Easy Points promise, said once, plainly.",
      slugs: ["for-students-easy-points-is-free"],
    },
  ],
};

export interface TopicGroup { label: string | null; blurb?: string; ordered: boolean; sets: BoothSetInfo[] }

/** The topic's sets, grouped and ordered. Every set appears exactly once: matched sets in
 *  their group's order, anything unmatched in a trailing "Other" group (bank order), empty
 *  groups dropped. A topic with no spec → one unlabelled group in bank order. */
export function groupSets(topicSlug: string, sets: readonly BoothSetInfo[]): TopicGroup[] {
  const specs = TOPIC_GROUPS[topicSlug];
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
