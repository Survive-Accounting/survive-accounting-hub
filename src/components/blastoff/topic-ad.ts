// THE END-OF-TOPIC AD — the front-facing one Lee wants to close every topic with.
//
// His words, 2026-09-12: "Frontfacing ads can be a thing too. Hey, I just filmed a run of videos
// for this topic. Here's the stats. Here's the best ones. Watch them all, highly recommended, but
// these are the best ones, for sure. Here's how the practice works. I need to end every topic like
// this."
//
// It is the ONE place teasing is allowed — the no-chain rule ("I never reference other videos. I
// never tease up another video at the end of a video, only in ADS") holds everywhere else, which is
// why this slide is an ad and carries the skippable flag.
//
// THE STATS ARE ONLY WHAT THE BANK KNOWS: how many videos are in the topic, and which of them he
// picked as the best. No view counts, no watch time — nothing this app cannot actually count.
//
// Pure: no React. TopicAdFrame.tsx draws it; the Editor picks the best ones.
import type { OutlineSet } from "./exam-outline";

/** The mockup's copy, and the defaults every line falls back to. */
export const TOPIC_AD_COPY = {
  chip: "Just filmed",
  heading: "That's the whole topic",
  line: "Watch them all — but these are the ones I'd start with.",
  practice: "Then go answer the questions. Miss one, and the Reel for it is right there.",
  cta: "Start practising",
} as const;

/** How many of the best ones the slide shows — three reads; five is a list. */
export const TOPIC_AD_BEST = 3;

export interface TopicAdStats {
  /** Videos in this topic, from the bank. */
  videos: number;
}

export const topicAdStats = (sets: readonly OutlineSet[]): TopicAdStats => ({ videos: sets.length });

/** The ones he starred, in the topic's own order; absent = the first three, so the slide is never
 *  empty before he has picked. */
export function bestOf(sets: readonly OutlineSet[], best: readonly string[] | undefined): OutlineSet[] {
  const picked = best?.length ? sets.filter((s) => best.includes(s.id)) : [];
  return (picked.length ? picked : sets.slice(0, TOPIC_AD_BEST)).slice(0, TOPIC_AD_BEST);
}

/** Star / unstar one video. Kept in the topic's order so the slide reads top to bottom. */
export function toggleBest(sets: readonly OutlineSet[], best: readonly string[] | undefined, id: string): string[] {
  const have = new Set(best ?? []);
  if (have.has(id)) have.delete(id); else have.add(id);
  return sets.filter((s) => have.has(s.id)).map((s) => s.id);
}
