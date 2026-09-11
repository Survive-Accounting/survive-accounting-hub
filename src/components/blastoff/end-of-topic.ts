// THE END-OF-TOPIC FRAMES' DATA — what Topic Complete and Up Next say, derived from the bank,
// never typed. Pure: no React, no network (EndOfTopicFrames.tsx draws it).
//
// Prompt 3 of the Editor session brief (2026-09-11): "Topic name and X/Y come from the bank
// (topicOfSet, the exam's topics in order) — never typed." The bank has no exam grouping of its
// own; THE EXAM is what the map already calls it (LaneMapPage: every topic that is not a
// strategy topic, in bank order), so the charge bar and the map agree on the count.
//
// UP NEXT names the next TOPIC. The brief points at nextSetAfter; walked over exam topics only,
// the set after the last set of a topic is the first set of the next topic, which is the frame's
// case — Topic Complete and Up Next close a topic, so the next set IS the next topic. Placed
// mid-topic it says that same topic's name, which is honest rather than wrong.
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

import { RUBRIC_PRESETS, type RubricPreset } from "./rubric";

export interface TopicProgress {
  topic: BoothTopic;
  /** 1-based position of the finished topic among the exam's topics. */
  done: number;
  total: number;
}

/** The exam's topics, in bank order — the map's own rule (LaneMapPage). */
export function examTopics(topics: readonly BoothTopic[]): BoothTopic[] {
  return topics.filter((t) => t.kind !== "strategy");
}

/** The topic a set belongs to and where it sits in the exam. Null when the set is not in the
 *  bank, or its topic is not an exam topic (a strategy short has no charge bar). */
export function topicProgress(topics: readonly BoothTopic[], setId: string): TopicProgress | null {
  const exam = examTopics(topics);
  const i = exam.findIndex((t) => t.sets.some((s) => s.id === setId));
  if (i < 0) return null;
  return { topic: exam[i], done: i + 1, total: exam.length };
}

/** The set after this one across the exam's topics, with its topic. Null after the last set or
 *  when the set is not in the bank. */
export function upNextFor(topics: readonly BoothTopic[], setId: string): { topic: BoothTopic; set: BoothSetInfo } | null {
  const flat = examTopics(topics).flatMap((t) => t.sets.map((s) => ({ topic: t, set: s })));
  const i = flat.findIndex((x) => x.set.id === setId);
  return i >= 0 && i + 1 < flat.length ? flat[i + 1] : null;
}

/** THE UP NEXT DEMO: the rubric cycles four of Lee's presets, arrows only, every ~3 s —
 *  borrow → supplies → services on account → rent (end-of-topic-frames.html's DEMO). */
export const UP_NEXT_DEMO_IDS = ["borrow", "supplies", "services", "rent"] as const;
export const UP_NEXT_DEMO: readonly RubricPreset[] = UP_NEXT_DEMO_IDS.map((id) => {
  const p = RUBRIC_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`end-of-topic: no rubric preset "${id}"`);
  return p;
});
export const UP_NEXT_EVERY_MS = 2900;

/** Which demo transaction shows `ms` into the slide. */
export function demoIndexAt(ms: number): number {
  return Math.floor(Math.max(0, ms) / UP_NEXT_EVERY_MS) % UP_NEXT_DEMO.length;
}

/** The mockup's copy on the Topic Complete card. The one line under "Now go practice" is the
 *  frame's `text` when Lee types one; this is what it says otherwise. */
export const TOPIC_DONE_COPY = {
  chip: "Topic complete",
  yourMove: "Your move",
  heading: "Now go practice",
  line: "Your exam asks it. Get the reps in.",
  cta: "Start practice questions",
  note: (done: number, total: number) => `${done} of ${total} topics charged`,
} as const;

export const UP_NEXT_COPY = { chip: "Up next" } as const;
