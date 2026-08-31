// THE STUDY PLAN — what a student committed to, and what it should cost them in minutes.
//
// ── WHY THE ESTIMATE IS THE PRODUCT ───────────────────────────────────────────────────────────
// The number on the plan screen is the whole reason the guided path exists. A student the night
// before an exam is deciding between this and a night of scrolling; "Cram: 94 min" is a decision
// they can make, and "start studying" is not. So it updates live as modes toggle, and it is
// derived from the REAL per-video durations in the tree rather than a constant per topic.
//
// ── AND WHY IT IS ALLOWED TO SAY "ESTIMATE" ───────────────────────────────────────────────────
// Not every set has a runtime. A video that is authored but unpublished has `runtimeSec: null`,
// and practice has no runtime at all — it is questions, and how long a question takes is a
// property of the student. Rather than quietly substituting an average and presenting the total
// as fact, every mode reports whether its number is MEASURED or ESTIMATED and the UI is expected
// to say so. A confident wrong number is the failure mode that costs trust; a number labelled
// "about" costs nothing.
//
// Pure and DOM-free so the arithmetic can be tested without a browser — the same reason
// pickVisibleTopic lives outside its component.

/** The three ways to study one topic. Order is the order they happen in. */
export const STUDY_MODES = ["cram", "practice", "review"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const MODE_LABEL: Record<StudyMode, string> = {
  cram: "Cram",
  practice: "Practice",
  review: "Review",
};

export const MODE_BLURB: Record<StudyMode, string> = {
  cram: "The videos. What's actually on the exam.",
  practice: "Work the questions yourself.",
  review: "Watch me work them, after you've tried.",
};

export type TargetGrade = "a" | "b" | "pass";

export const GRADE_LABEL: Record<TargetGrade, string> = {
  a: "An A",
  b: "A B",
  pass: "Just pass",
};

/** The subset of a set the estimator needs. Deliberately narrow: this file must not depend on
 *  the student tree's shape, so a change there cannot silently change the arithmetic. */
export type EstimableSet = {
  runtimeSec: number | null;
  ceqCount: number;
  hasReview: boolean;
  reviewRuntimeSec: number | null;
  /** A set with no published video contributes nothing to cram whatever its runtime says. */
  playbackId: string | null;
};

/** WHEN A RUNTIME IS MISSING. Measured across the sets that DO have one rather than picked: an
 *  unpublished set is not systematically shorter or longer than a published one, so the best
 *  guess for it is the average of its siblings. Falls back to this only when nothing is measured. */
const FALLBACK_CRAM_SEC = 300;

/** SECONDS PER PRACTICE QUESTION. There is no measurement for this yet — no practice player has
 *  shipped, so nothing has ever been timed. 45s is a deliberate, stated guess: fast enough that a
 *  student is not scared off a 10-question set, slow enough not to promise something impossible.
 *  Every total it touches is reported as an estimate, never as a measurement. */
export const SEC_PER_QUESTION = 45;

export type ModeEstimate = {
  seconds: number;
  /** FALSE when any part of this number was guessed rather than read off a published video. */
  measured: boolean;
};

/** What one mode costs across a set of videos. */
export function estimateMode(mode: StudyMode, sets: EstimableSet[]): ModeEstimate {
  if (mode === "practice") {
    const questions = sets.reduce((a, s) => a + Math.max(0, s.ceqCount), 0);
    // Never measured — see SEC_PER_QUESTION.
    return { seconds: questions * SEC_PER_QUESTION, measured: false };
  }

  const relevant = mode === "cram"
    ? sets.filter((s) => s.playbackId !== null)
    : sets.filter((s) => s.hasReview);
  const runtimeOf = (s: EstimableSet) => (mode === "cram" ? s.runtimeSec : s.reviewRuntimeSec);

  const known = relevant.map(runtimeOf).filter((v): v is number => typeof v === "number" && v > 0);
  const missing = relevant.length - known.length;
  const total = known.reduce((a, b) => a + b, 0);
  if (missing === 0) return { seconds: total, measured: true };

  const average = known.length ? total / known.length : FALLBACK_CRAM_SEC;
  return { seconds: Math.round(total + missing * average), measured: false };
}

/** The whole plan's cost. Modes are additive because they are done in sequence — a student who
 *  picks Cram and Practice watches the video AND then works the questions; neither replaces the
 *  other. `measured` is false if ANY selected mode guessed, because a total is only as honest as
 *  its least honest part. */
export function estimatePlan(modes: StudyMode[], sets: EstimableSet[]): ModeEstimate {
  const chosen = STUDY_MODES.filter((m) => modes.includes(m));
  if (chosen.length === 0) return { seconds: 0, measured: true };
  let seconds = 0;
  let measured = true;
  for (const m of chosen) {
    const e = estimateMode(m, sets);
    seconds += e.seconds;
    measured &&= e.measured;
  }
  return { seconds, measured };
}

/** "1 hr 34 min" / "12 min" / "Under a minute". Never "0 min", which reads as broken. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "Under a minute";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hrs} hr` : `${hrs} hr ${rest} min`;
}

// ── WHAT THE STUDENT COMMITTED TO vs WHAT THEY DID ────────────────────────────────────────────
//
// Two records, stored apart, ON PURPOSE. Lee wants to compare them later: "she said Cram +
// Practice and 94 minutes" against "she watched 3 videos and stopped". Merging them into one
// mutable object would destroy exactly the comparison — every completion would overwrite the
// intention it was supposed to be measured against.
//
// localStorage, not a table: no schema changes in this pass. That means it is per-device and
// disposable, which is honest about what it is — a signal, not a record. Anything that needs to
// survive a cleared browser needs the migration this pass is not allowed to write.

const COMMIT_KEY = "sa-learn-plan-commit";
const PROGRESS_KEY = "sa-learn-plan-progress";

export type PlanCommitment = {
  modes: StudyMode[];
  grade: TargetGrade;
  /** What we told them it would take, at the moment they agreed to it. Frozen deliberately: the
   *  tree grows, and re-deriving this later would compare their effort against a promise nobody
   *  ever made them. */
  estimatedSeconds: number;
  /** Was that number measured or guessed? Stored so a later comparison knows what it is reading. */
  estimateMeasured: boolean;
  /** Epoch ms. Passed in rather than read from a clock, so this file stays pure. */
  committedAt: number;
  /** Which exam they were looking at. */
  examNum: number | null;
};

export type PlanProgress = {
  /** Set ids completed, per mode. */
  done: Partial<Record<StudyMode, string[]>>;
  updatedAt: number;
};

function readJson<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode — the plan simply is not remembered */ }
}

export const readCommitment = (): PlanCommitment | null => readJson<PlanCommitment>(COMMIT_KEY);
export const writeCommitment = (c: PlanCommitment): void => writeJson(COMMIT_KEY, c);
export const clearCommitment = (): void => { try { window.localStorage.removeItem(COMMIT_KEY); } catch { /* ignore */ } };

export const readProgress = (): PlanProgress => readJson<PlanProgress>(PROGRESS_KEY) ?? { done: {}, updatedAt: 0 };

/** Records a completion WITHOUT touching the commitment. Idempotent — finishing the same video
 *  twice is one completion, not two. */
export function recordCompletion(mode: StudyMode, setId: string, now: number): PlanProgress {
  const prev = readProgress();
  const list = prev.done[mode] ?? [];
  if (list.includes(setId)) return prev;
  const next: PlanProgress = { done: { ...prev.done, [mode]: [...list, setId] }, updatedAt: now };
  writeJson(PROGRESS_KEY, next);
  return next;
}

/** Committed vs done, as a fraction, for the comparison Lee asked to be able to make. Returns
 *  null when nothing was committed — an unplanned student has no plan to be behind on. */
export function planAdherence(commitment: PlanCommitment | null, progress: PlanProgress, totalSets: number): {
  completed: number;
  expected: number;
  fraction: number;
} | null {
  if (!commitment || totalSets <= 0) return null;
  const completed = commitment.modes.reduce((a, m) => a + (progress.done[m]?.length ?? 0), 0);
  const expected = commitment.modes.length * totalSets;
  return { completed, expected, fraction: expected === 0 ? 0 : completed / expected };
}
