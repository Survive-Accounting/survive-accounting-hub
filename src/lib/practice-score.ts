// HOW THE PRACTICE WENT — per set, on this device. Pure + localStorage.
//
// Lee, 2026-09-15: "we want to lock the recap video at the end (video #11) until they have completed all
// videos and all practice questions and earned at least an 80% on it. Give them the option to skip to the
// next topic if they'd like."
//
// The practice tool is deliberately about progress, not scores (PracticeStage's own header), so nothing kept
// a percentage. This keeps the least that can open the recap: each question's LAST answer, right or wrong,
// per set. Rounds are 15 questions, so a set of 20 takes two rounds — the answers add up across them, and a
// question answered again replaces its old mark. Nothing here is shown as a ranking.

export const PRACTICE_PASS = 0.8;
const KEY = "sa-practice-answers";

/** questionId → was it right, the last time they answered it. */
export type AnswerMap = Record<string, boolean>;
export interface PracticeScore { answered: number; correct: number; at: number }

export function scoreOf(answers: AnswerMap | undefined | null, at = 0): PracticeScore {
  const vals = Object.values(answers ?? {});
  return { answered: vals.length, correct: vals.filter(Boolean).length, at };
}
export const pctOf = (s: Pick<PracticeScore, "answered" | "correct">): number => (s.answered > 0 ? s.correct / s.answered : 0);

/** Every question in the set answered, and at least 80% of them right. */
export function passed(s: PracticeScore | null | undefined, total: number): boolean {
  if (!s || s.answered <= 0 || total <= 0) return false;
  return s.answered >= total && pctOf(s) >= PRACTICE_PASS;
}

interface Store { [setId: string]: { answers: AnswerMap; at: number } }
function readStore(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}
export function practiceScoreOf(setId: string): PracticeScore | null {
  const row = readStore()[setId];
  return row ? scoreOf(row.answers, row.at) : null;
}
/** One answer, kept (or replaced). Returns the set's score after it. */
export function recordPracticeAnswer(setId: string, questionId: string, correct: boolean): PracticeScore {
  const all = readStore();
  const row = all[setId] ?? { answers: {}, at: 0 };
  const next = { answers: { ...row.answers, [questionId]: correct }, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify({ ...all, [setId]: next })); } catch { /* this visit only */ }
  return scoreOf(next.answers, next.at);
}
/** Start the set's practice over (the student asked to). */
export function clearPracticeAnswers(setId: string) {
  const all = readStore();
  delete all[setId];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

/** What the lock screen needs: the other videos, and the practice. */
export interface GateState { videosDone: number; videosOf: number; score: PracticeScore | null; total: number }
export const gateOpen = (g: GateState): boolean => g.videosDone >= g.videosOf && passed(g.score, g.total);
export function gateLines(g: GateState): { videos: string; practice: string; videosOk: boolean; practiceOk: boolean } {
  const s = g.score;
  const pct = s ? Math.round(pctOf(s) * 100) : 0;
  return {
    videos: `${g.videosDone} of ${g.videosOf} videos watched`,
    practice: !s || s.answered < g.total
      ? `${s?.answered ?? 0} of ${g.total} practice questions answered`
      : `${pct}% right — ${Math.round(PRACTICE_PASS * 100)}% needed`,
    videosOk: g.videosDone >= g.videosOf,
    practiceOk: passed(s, g.total),
  };
}
