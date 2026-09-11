// THE EXAM OUTLINE'S DATA — what the roadmap slide shows, from the bank. Pure. OutlineFrame.tsx
// draws it.
//
// Lee (2026-09-11): "let's create a new slide... it will be an outline slide for an exam. I want
// to see each topic and be able to click it to open its contents. This will be for the first
// video I make in a topic, so I can let them know the roadmap." Then: "let me < > between a topic
// and show the spine that way, so it's not 25 topics/sets going vertically." Then: "Ensure the
// text on this outline slide is editable too. A lot of times I like to change the way we're
// describing them internally. The slide I want to show will be about hyping up the 'question
// stems' … it's formatted as exam prep > teaching … try to initially set it up like this for all
// topics/sets... I will go in and edit where needed."
//
// THE EXAM is the map's own rule (end-of-topic.ts examTopics): every non-strategy topic, in bank
// order, all Exam 1 until the bank knows an exam per topic. A topic's CONTENTS are its cram-path
// videos in order (offshoots and pitches are side roads). It opens on THIS video's topic.
//
// THE WORDS: a video starts as a question stem (defaultSetLabel — Lee's five, word for word, then
// "<name>?"), a topic as its name; the slide keeps his edits per id (`frame.outline`), and a
// cleared edit falls back to the default.
//
// Module-scope callables are function declarations (the render-path TDZ rule).
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

import { examTopics } from "./end-of-topic";

export interface OutlineSet { id: string; name: string }
export interface OutlineTopic {
  id: string;
  name: string;
  number: number | null;
  /** The topic's cram-path videos, in bank order. */
  sets: OutlineSet[];
  /** This video's own topic. */
  here: boolean;
}
export interface ExamOutline {
  exam: string;
  topics: OutlineTopic[];
  /** Where the slide opens: this video's topic, else the first. */
  hereIndex: number;
  hereSetId: string;
}
/** Lee's words for the slide, by topic id and set id (frame.outline). */
export interface OutlineLabels { topics?: Record<string, string>; sets?: Record<string, string> }

/** How many of a topic's videos the slide lists before "+ N more" — what fits above the captions. */
// TEN SINCE 2026-09-12: the slide runs to the bottom of the safe area now that captions are gone.
export const OUTLINE_MAX_LINES = 10;

/** Lee's five, word for word ("What type of account?" …), matched on the set's name. */
const STEM_DEFAULTS: readonly (readonly [RegExp, string])[] = [
  [/^account classification$/i, "What type of account?"],
  [/^accounting equation effects$/i, "Effect of A = L + E?"],
  [/^debit vs\.? credit effects$/i, "Debit/Credit effects?"],
  [/^normal balances$/i, "Normal balances?"],
  [/^accounting cycle order$/i, "Accounting cycle?"],
];

/** A video's starting label: one of Lee's five, else its name as a question ("Posting & T-accounts?"). */
export function defaultSetLabel(name: string): string {
  const n = name.trim();
  for (const [re, stem] of STEM_DEFAULTS) if (re.test(n)) return stem;
  const base = n.replace(/\s+order$/i, "");
  return /\?$/.test(base) ? base : `${base}?`;
}

export function setLabel(labels: OutlineLabels | undefined, s: OutlineSet): string {
  const v = labels?.sets?.[s.id];
  return v && v.trim() ? v : defaultSetLabel(s.name);
}

export function topicLabel(labels: OutlineLabels | undefined, t: { id: string; name: string }): string {
  const v = labels?.topics?.[t.id];
  return v && v.trim() ? v : t.name;
}

/** The labels with one edit applied — an empty edit removes it, so the default comes back. */
export function withLabel(labels: OutlineLabels | undefined, kind: "topics" | "sets", id: string, value: string): OutlineLabels {
  const next: { topics: Record<string, string>; sets: Record<string, string> } = { topics: { ...(labels?.topics ?? {}) }, sets: { ...(labels?.sets ?? {}) } };
  if (value.trim()) next[kind][id] = value;
  else delete next[kind][id];
  return next;
}

/** A topic's cram-path videos: no offshoots, no pitches. */
export function cramSets(sets: readonly BoothSetInfo[]): OutlineSet[] {
  return sets.filter((s) => !s.lane || s.lane === "cram").map((s) => ({ id: s.id, name: s.name }));
}

export function examOutline(topics: readonly BoothTopic[], setId: string): ExamOutline {
  const exam = examTopics(topics);
  const at = exam.findIndex((t) => t.sets.some((s) => s.id === setId));
  return {
    exam: "Exam 1",
    topics: exam.map((t) => ({ id: t.id, name: t.name, number: t.number, sets: cramSets(t.sets), here: t.sets.some((s) => s.id === setId) })),
    hereIndex: Math.max(0, at),
    hereSetId: setId,
  };
}

/** ‹ and ›: the next topic over, stopping at either end. */
export function stepTopic(i: number, delta: number, n: number): number {
  if (n <= 0) return 0;
  return Math.min(n - 1, Math.max(0, i + delta));
}

/** The videos listed for a topic, and how many didn't fit. */
export function spineLines(sets: readonly OutlineSet[], max = OUTLINE_MAX_LINES): { shown: OutlineSet[]; more: number } {
  const shown = sets.slice(0, max);
  return { shown, more: sets.length - shown.length };
}
