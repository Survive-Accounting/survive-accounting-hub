// REHEARSAL ROUNDS (2026-09-06, third pass). Lee, after his first real go at rehearsal mode:
// "Putting this into rounds... round 1, round 2. It's about not only build the teleprompter
// lines but also just getting loose and getting a feel for the flow." And: "Time the
// rehearsal. Any rehearsal I do should have a running time. I think it should start with a
// spacebar. So, I enter rehearsal mode, then press space to start."
//
// THE ROUNDS. "I want it to intentionally let me practice blind first in round 1 though. Round 1
// is about getting the feel down. Round 2 is refining it using the teleprompted lines.
// Additional rounds are optional, just for practice. Only editable manually after round 2, to
// try to avoid over doing the review process. Then I just film!" So:
//   · round 1 — BLIND: the prompter panel is hidden on every frame except the canned ones
//     (open/intro/outro/bio still show their canned suggestion — those lines are fixed, and
//     practicing with them is the point). Review opens when the round ends.
//   · round 2 — WITH LINES: the prompter shows what round 1's review kept. Review opens again.
//   · round 3+ — PRACTICE: no review, just the round time. And once two rounds are done, the
//     prompter lines become click-to-edit in the panel — "only editable manually after round 2".
//
// THE PHASES. R arms ("Round N · press space to start"); space starts the clock, the
// dictation, and jumps to slide 0; walking is the normal spacebar; space on the LAST slide walks
// off the end and finishes the round (the clock and dictation stop). R mid-round finishes it
// early the same way; R while merely armed cancels back to off.
//
// Pure: a reducer over plain data, so the keys and the chrome buttons in BlastOffCapture are one
// dispatch each and every transition is testable without a browser. Times are epoch ms the
// caller passes in (`now`), never read here.
import { fmtElapsed } from "@/lib/production-time";

import type { BlastFrameKind } from "../plan";

export type RehearsalPhase = "off" | "armed" | "running";

export interface RehearsalRounds {
  phase: RehearsalPhase;
  /** The round being rehearsed (or just finished). 0 until the first arm. */
  round: number;
  startedAt: number | null;
  slideStartedAt: number | null;
  /** What was said, per round, per frame id — round 1's transcript is never overwritten by
   *  round 2's, so a review can always show the round it belongs to. */
  segmentsByRound: Record<number, Record<string, string>>;
  /** Every finished round this session, in order. */
  history: { round: number; seconds: number }[];
}

export type RoundsAction =
  | { type: "arm" }
  | { type: "start"; now: number }
  | { type: "slide"; now: number }
  | { type: "finish"; now: number }
  | { type: "cancel" }
  | { type: "startOver"; now: number }
  | { type: "scratch"; frameId: string }
  | { type: "addFinal"; frameId: string; text: string };

export const initialRounds = (): RehearsalRounds => ({ phase: "off", round: 0, startedAt: null, slideStartedAt: null, segmentsByRound: {}, history: [] });

/** Rounds 1 and 2 end in the review; 3+ are practice and end on the clock alone. */
export const REVIEW_ROUNDS = 2;
export const opensReview = (round: number): boolean => round >= 1 && round <= REVIEW_ROUNDS;

export function reduceRounds(s: RehearsalRounds, a: RoundsAction): RehearsalRounds {
  switch (a.type) {
    case "arm": {
      if (s.phase !== "off") return s;
      return { ...s, phase: "armed", round: s.history.length + 1, startedAt: null, slideStartedAt: null };
    }
    case "start": {
      if (s.phase !== "armed") return s;
      return { ...s, phase: "running", startedAt: a.now, slideStartedAt: a.now, segmentsByRound: { ...s.segmentsByRound, [s.round]: {} } };
    }
    case "slide": {
      if (s.phase !== "running") return s;
      return { ...s, slideStartedAt: a.now };
    }
    case "finish": {
      if (s.phase !== "running") return s;
      const seconds = Math.max(0, Math.round((a.now - (s.startedAt ?? a.now)) / 1000));
      // 2026-09-07: the production run's checklist ticks "Rehearse round 1/2" off itself — one
      // announcement, nothing listening is required (components/v3/ProductionTimer.tsx).
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sa:production", { detail: { event: "rehearsal-round-finished", round: { round: s.round, seconds } } }));
      return { ...s, phase: "off", startedAt: null, slideStartedAt: null, history: [...s.history, { round: s.round, seconds }] };
    }
    case "cancel": {
      if (s.phase !== "armed") return s;
      // Back to exactly where R found it — the round number was only ever a promise.
      return { ...s, phase: "off", round: s.history.length, startedAt: null, slideStartedAt: null };
    }
    case "startOver": {
      // "Start over? Scratch previous take?" (Lee) — the whole round from the top: transcript
      // wiped, clock back to zero, still running (the caller jumps to slide 0).
      if (s.phase !== "running") return s;
      return { ...s, startedAt: a.now, slideStartedAt: a.now, segmentsByRound: { ...s.segmentsByRound, [s.round]: {} } };
    }
    case "scratch": {
      // One slide's take, this round only — the existing backtick behaviour.
      if (s.phase !== "running") return s;
      const cur = s.segmentsByRound[s.round] ?? {};
      if (!(a.frameId in cur)) return s;
      const next = { ...cur };
      delete next[a.frameId];
      return { ...s, segmentsByRound: { ...s.segmentsByRound, [s.round]: next } };
    }
    case "addFinal": {
      if (s.phase !== "running") return s;
      const text = a.text.trim();
      if (!text) return s;
      const cur = s.segmentsByRound[s.round] ?? {};
      return { ...s, segmentsByRound: { ...s.segmentsByRound, [s.round]: { ...cur, [a.frameId]: cur[a.frameId] ? `${cur[a.frameId]} ${text}` : text } } };
    }
  }
}

/** The current round's transcript, per frame id (empty when nothing has been said). */
export const roundSegments = (s: RehearsalRounds): Record<string, string> => s.segmentsByRound[s.round] ?? {};

/** "R1", "R2"… */
export const roundLabel = (round: number): string => `R${Math.max(1, round)}`;

/** What kind of round this is, in the words the armed banner uses. */
export const roundMode = (round: number): string => (round <= 1 ? "blind — no lines" : round === 2 ? "with your lines" : "practice");

/** "1:04" — the running clock, from ms. Floors, never rounds: a clock that reads 0:01 after
 *  half a second is lying. Past an hour, fmtElapsed's "1:02:04". */
export const fmtClock = (ms: number): string => fmtElapsed(Math.floor(Math.max(0, ms) / 1000));

/** "R1 2:14 · R2 1:48" — this session's finished rounds, for the chrome bar. */
export const historyLabel = (history: readonly { round: number; seconds: number }[]): string =>
  history.map((h) => `${roundLabel(h.round)} ${fmtElapsed(h.seconds)}`).join(" · ");

/** "Intro is two slides too — wordmark and slogan, then one with topic name" (Lee). Both count,
 *  alongside the outro and the bio, as canned rather than AI-suggested. */
export const isCannedFrameKind = (k: BlastFrameKind): boolean => k === "open" || k === "intro" || k === "outro" || k === "bio";

/** Whether the prompter panel shows on this frame during rehearsal. `round` is 0 when not
 *  rehearsing (always shown). Round 1 is blind everywhere but the canned frames — even a line
 *  committed in an earlier session stays hidden, so "getting the feel down" is really blind. */
export const showsPrompterInRound = (round: number, kind: BlastFrameKind): boolean => round !== 1 || isCannedFrameKind(kind);

/** "Only editable manually after round 2" — click-to-edit in the prompter panel unlocks once two
 *  rounds have finished, and only between rounds (never while one is running). */
export const prompterEditable = (s: RehearsalRounds): boolean => s.phase === "off" && s.history.length >= REVIEW_ROUNDS;
