// THE PRODUCTION RUN — one Blast Off set, start to finish, as data. Pure: no React, no
// network, no clocks (every action takes `now`), so the widget, the server fns and Step 5
// all read the same document and none of them can disagree about a minute.
//
// Lee, 2026-09-07: "'start timer - review' etc should be much more simple. In background...
// like if I come to /talkthrough, when I first hit start recording, that starts the timer.
// When I stop recording, background timer stops. For others, like step2, it can open a popup
// modal that's like ready to start?, and same with step 3 film, step 4 post. I'd like to skip
// sometimes, although I plan to do it often. I want to gather data on time spent, tasks worked
// on, possible bottlenecks, etc. The goal is to get faster and faster with every new set we do."
//
// And: "I think we need to make this have a checkbox step by step approach. … let me pause this
// timer, but make that require confirmation. I'm only going to pause if I literally have to
// stop, but my goal is to do start to finish in one sitting, so if I get distracted by something
// else, then I will have to suffer the consequence of messing up my average, fix it going
// forward. Which tasks do I get distracted most?"
//
// THE SHAPE. A run has the four timed steps (the fifth, Iterate — "Improve Process" until Lee
// renamed it on 2026-09-07 — reads; it's never timed: lib/production-time.ts). A step has a checklist of tasks, a note ("what sucked, what
// would've been better"), and its pauses — each pause remembers which task it hit, because
// "which tasks do I get distracted most?" is the whole point of making pausing cost something.
//
// TIME IS DERIVED, NEVER COUNTED. Every duration here is a difference of timestamps minus the
// pauses that overlap it, so a reload, a closed tab or a sleeping laptop can't lose a second —
// the old widget's setInterval counter died with the tab (ProductionTimer.tsx, 2026-09-05).
//
// THE RULE FOR THE AVERAGE (decided with Lee, 2026-09-07): a run with a skipped step is shown
// but EXCLUDED from Time-to-beat — "only complete runs count". A skipped Brainstorm is a
// shorter run, not a faster one.
import type { TTDoc } from "@/components/canvas/talkthrough";

import { fmtDuration, fmtElapsed, type ProductionStep } from "./production-time";
// Type-only, so the cycle with improve-brief.ts (which imports the run) costs nothing at runtime.
// `unknown` here broke every server fn that returns a run: TanStack Start refuses to type a
// non-serializable field (2026-09-07).
import type { ImproveSuggestions } from "./improve-brief";

// ------------------------------------------------------------------ the steps

/** The four timed steps, by their StepBar ids (components/v3/StepBar.tsx STEPS) — the URL
 *  segments, so the widget can name a step straight from the address bar. */
export const RUN_STEPS = ["talkthrough", "results", "film", "post"] as const;
export type RunStepId = (typeof RUN_STEPS)[number];
export const isRunStep = (v: unknown): v is RunStepId => typeof v === "string" && (RUN_STEPS as readonly string[]).includes(v);

export const RUN_STEP_LABEL: Record<RunStepId, string> = {
  talkthrough: "Brainstorm", results: "Editor", film: "Rehearse & Film", post: "Cross-post",
};

/** The production_time_log vocabulary this step logs under (production-time.ts keeps the old
 *  spellings as the schema: the Editor is "review" there). One row per finished step goes into
 *  that table too, so productionBottleneckReport and set-stage's "filmed?" keep working. */
export const LOG_STEP: Record<RunStepId, ProductionStep> = { talkthrough: "talkthrough", results: "review", film: "film", post: "post" };

// ------------------------------------------------------------------ the task lists

export interface TaskDef { key: string; label: string }
export type TaskLists = Record<RunStepId, TaskDef[]>;

/** THE TASK LISTS (decided with Lee, 2026-09-07) — code defaults, editable from Step 5 and
 *  kept in site_settings.settings.productionTasks with this same shape. "talk" is the one
 *  automatic task: the recorder starts and stops it (see recordingSignal). */
export const DEFAULT_TASK_LISTS: TaskLists = {
  talkthrough: [
    { key: "skim", label: "Skim the set" },
    { key: "talk", label: "Talk it through" },
    { key: "stamp", label: "Stamp and submit" },
  ],
  results: [
    { key: "order", label: "Order and skip slides" },
    { key: "cards", label: "Fix the cards" },
    { key: "callouts", label: "Drop in callouts from the board" },
    { key: "pictures", label: "Illustrations" },
    { key: "camera", label: "Camera, template and backdrop" },
  ],
  film: [
    { key: "setup", label: "Set up OBS, the 9:16 pop-out and the teleprompter" },
    { key: "r1", label: "Rehearse round 1" },
    { key: "lines", label: "Review the lines" },
    { key: "r2", label: "Rehearse round 2" },
    { key: "take", label: "Film the take" },
    { key: "wrap", label: "Stop and save the file" },
  ],
  post: [
    { key: "captions", label: "Captions" },
    { key: "export", label: "Trim and export" },
    { key: "youtube", label: "YouTube" },
    { key: "instagram", label: "Instagram" },
    { key: "tiktok", label: "TikTok" },
    { key: "site", label: "Mark posted on the site" },
  ],
};

export const TASK_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** A saved task-list document, validated: every step present, every task a {key,label} with a
 *  slug key (unique within its step) and a non-empty label. Anything else → null, and the
 *  caller falls back to the code default — a half-valid settings row must never half-work. */
export function normalizeTaskLists(raw: unknown): TaskLists | null {
  if (!raw || typeof raw !== "object") return null;
  const out = {} as TaskLists;
  for (const step of RUN_STEPS) {
    const list = (raw as Record<string, unknown>)[step];
    if (!Array.isArray(list) || list.length === 0 || list.length > 30) return null;
    const seen = new Set<string>();
    const tasks: TaskDef[] = [];
    for (const t of list) {
      if (!t || typeof t !== "object") return null;
      const key = (t as { key?: unknown }).key, label = (t as { label?: unknown }).label;
      if (typeof key !== "string" || !TASK_KEY_RE.test(key) || seen.has(key)) return null;
      if (typeof label !== "string" || !label.trim() || label.length > 120) return null;
      seen.add(key);
      tasks.push({ key, label: label.trim() });
    }
    out[step] = tasks;
  }
  return out;
}

/** "Fix the cards" → "fix-the-cards", unique within the step (for the Step 5 editor). */
export function taskKeyFor(label: string, existing: readonly TaskDef[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "task";
  let k = base, n = 2;
  while (existing.some((t) => t.key === k)) k = `${base}-${n++}`;
  return k;
}

// ------------------------------------------------------------------ the run

export type TaskStatus = "pending" | "running" | "done" | "skipped";
export type StepStatus = "pending" | "running" | "done" | "skipped";
export type RunStatus = "running" | "done" | "abandoned";

export interface TaskRun {
  key: string;
  label: string;
  status: TaskStatus;
  startedAt: string | null;
  endedAt: string | null;
  /** Pause-adjusted seconds, stamped when the task ends. Live tasks use taskSeconds(). */
  seconds: number;
}

export interface Pause {
  /** The task that was running when Lee had to stop (null: none was). */
  taskKey: string | null;
  startedAt: string;
  endedAt: string | null;
  reason: string;
}

export interface StepRun {
  status: StepStatus;
  startedAt: string | null;
  endedAt: string | null;
  tasks: TaskRun[];
  /** "What sucked, what would've been better?" — Step 5 reads these. */
  note: string | null;
  /** THE RETRO'S TAGS (2026-09-07, additive; retro-brief.ts). Lee talks the retro, the model
   *  returns the one-line note above plus a few bottleneck tags ("waiting on Recraft",
   *  "re-recorded slide 4 ×3") — the consultant reads tags, not prose. Absent on every run
   *  written before this field existed, and on a step finished without the mic. */
  tags?: string[];
  pauses: Pause[];
}

export interface ProductionRun {
  id: string;
  /** The canonical set id (BoothSetInfo.id — what production_time_log and illustration_library key on). */
  setId: string;
  setName: string;
  topicSlug: string;
  topicName: string;
  /** The set's URL slug, so Step 5 can link straight to another run's Improve page. */
  setSlug: string;
  startedAt: string;
  endedAt: string | null;
  status: RunStatus;
  steps: Record<RunStepId, StepRun>;
  createdBy: string | null;
  /** ITERATE'S DECISIONS (2026-09-07, additive). Lee: "part of the iterate step is for me to
   *  NOT make these decisions… I want to have AI help make them for me, suggest what I should
   *  do, and I either agree or dont." Keyed by the recommendation's id (improve-brief.ts
   *  recommendationId — a hash of its text, so the same suggestion asked twice keeps its
   *  answer). Absent on every run written before this field existed. */
  decisions?: Record<string, Decision>;
  /** The consultant's latest answer, kept on the run so a later visit shows the same list the
   *  decisions were made on (the model doesn't repeat itself verbatim). Additive; untyped here
   *  on purpose — improve-brief.ts owns the shape and re-parses it defensively. */
  suggestions?: { at: string; data: ImproveSuggestions | null } | null;
}

export type Decision = "agree" | "skip";

export const newRunId = (now = new Date()): string =>
  `run_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;

const emptyStep = (tasks: readonly TaskDef[]): StepRun => ({
  status: "pending", startedAt: null, endedAt: null, note: null, pauses: [],
  tasks: tasks.map((t) => ({ key: t.key, label: t.label, status: "pending", startedAt: null, endedAt: null, seconds: 0 })),
});

export function newRun(input: {
  id?: string; setId: string; setName: string; topicSlug: string; topicName: string; setSlug: string;
  createdBy?: string | null; lists?: TaskLists; now: Date; startedAt?: string;
}): ProductionRun {
  const lists = input.lists ?? DEFAULT_TASK_LISTS;
  return {
    id: input.id ?? newRunId(input.now),
    setId: input.setId, setName: input.setName, topicSlug: input.topicSlug, topicName: input.topicName, setSlug: input.setSlug,
    startedAt: input.startedAt ?? input.now.toISOString(), endedAt: null, status: "running",
    steps: { talkthrough: emptyStep(lists.talkthrough), results: emptyStep(lists.results), film: emptyStep(lists.film), post: emptyStep(lists.post) },
    createdBy: input.createdBy ?? null,
  };
}

/** A stored document, defended: the shape above or null. Steps missing from an older row are
 *  filled in as pending so a run written before a task list changed still renders. */
export function normalizeRun(raw: unknown): ProductionRun | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
  if (!str(r.id) || !str(r.setId) || !str(r.startedAt)) return null;
  const status: RunStatus = r.status === "done" || r.status === "abandoned" ? r.status : "running";
  const steps = (r.steps && typeof r.steps === "object" ? r.steps : {}) as Record<string, unknown>;
  const out = {} as Record<RunStepId, StepRun>;
  for (const step of RUN_STEPS) {
    const s = (steps[step] && typeof steps[step] === "object" ? steps[step] : {}) as Record<string, unknown>;
    const tasks = Array.isArray(s.tasks) ? s.tasks : [];
    const pauses = Array.isArray(s.pauses) ? s.pauses : [];
    out[step] = {
      status: s.status === "running" || s.status === "done" || s.status === "skipped" ? s.status : "pending",
      startedAt: typeof s.startedAt === "string" ? s.startedAt : null,
      endedAt: typeof s.endedAt === "string" ? s.endedAt : null,
      note: typeof s.note === "string" ? s.note : null,
      // Present in the output only when the row had them — the round-trip of an older document stays exact.
      ...(Array.isArray(s.tags) ? { tags: s.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 5) } : {}),
      tasks: tasks.filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && typeof t.key === "string").map((t) => ({
        key: t.key as string, label: str(t.label, t.key as string),
        status: t.status === "running" || t.status === "done" || t.status === "skipped" ? t.status : "pending",
        startedAt: typeof t.startedAt === "string" ? t.startedAt : null, endedAt: typeof t.endedAt === "string" ? t.endedAt : null,
        seconds: typeof t.seconds === "number" && Number.isFinite(t.seconds) ? Math.max(0, t.seconds) : 0,
      })),
      pauses: pauses.filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof p.startedAt === "string").map((p) => ({
        taskKey: typeof p.taskKey === "string" ? p.taskKey : null, startedAt: p.startedAt as string,
        endedAt: typeof p.endedAt === "string" ? p.endedAt : null, reason: str(p.reason),
      })),
    };
  }
  return {
    id: str(r.id), setId: str(r.setId), setName: str(r.setName, str(r.setId)), topicSlug: str(r.topicSlug), topicName: str(r.topicName),
    setSlug: str(r.setSlug, str(r.setId)), startedAt: str(r.startedAt), endedAt: typeof r.endedAt === "string" ? r.endedAt : null,
    status, steps: out, createdBy: typeof r.createdBy === "string" ? r.createdBy : null,
    ...normalizeIterate(r),
  };
}

/** The additive Iterate fields — present in the output only when the row had them, so the
 *  round-trip of an older document stays exact. */
function normalizeIterate(r: Record<string, unknown>): Pick<ProductionRun, "decisions" | "suggestions"> {
  const out: Pick<ProductionRun, "decisions" | "suggestions"> = {};
  if (r.decisions && typeof r.decisions === "object") {
    const d: Record<string, Decision> = {};
    for (const [k, v] of Object.entries(r.decisions as Record<string, unknown>)) if ((v === "agree" || v === "skip") && k.length <= 120) d[k] = v;
    out.decisions = d;
  }
  const s = r.suggestions;
  if (s && typeof s === "object" && typeof (s as { at?: unknown }).at === "string") out.suggestions = { at: (s as { at: string }).at, data: ((s as { data?: unknown }).data ?? null) as ImproveSuggestions | null };
  else if (s === null) out.suggestions = null;
  return out;
}

/** Agree / Not now on one recommendation — a new document, the rest untouched. Works on a
 *  finished run too (Iterate is read after the run is over). */
export function decideRecommendation(run: ProductionRun, id: string, decision: Decision): ProductionRun {
  return { ...run, decisions: { ...(run.decisions ?? {}), [id]: decision } };
}

// ------------------------------------------------------------------ time, derived

const ms = (iso: string): number => new Date(iso).getTime();

/** Seconds of [from, to] that fall inside pauses (each pause clipped to the window; an open
 *  pause runs to `to`). */
function pausedWithin(pauses: readonly Pause[], from: number, to: number): number {
  let total = 0;
  for (const p of pauses) {
    const a = Math.max(from, ms(p.startedAt)), b = Math.min(to, p.endedAt ? ms(p.endedAt) : to);
    if (b > a) total += (b - a) / 1000;
  }
  return total;
}

/** The step's pause-adjusted seconds — to its end, or to `now` while it's running. */
export function stepSeconds(step: StepRun, now: Date): number {
  if (!step.startedAt) return 0;
  const from = ms(step.startedAt), to = step.endedAt ? ms(step.endedAt) : now.getTime();
  return Math.max(0, Math.round((to - from) / 1000 - pausedWithin(step.pauses, from, to)));
}

/** A task's seconds: what was stamped when it ended, or the live count while it runs. */
export function taskSeconds(task: TaskRun, step: StepRun, now: Date): number {
  if (task.status !== "running" || !task.startedAt) return task.seconds;
  const from = ms(task.startedAt), to = now.getTime();
  return Math.max(0, Math.round((to - from) / 1000 - pausedWithin(step.pauses, from, to)));
}

export const runTotalSeconds = (run: ProductionRun, now: Date): number =>
  RUN_STEPS.reduce((sum, s) => sum + stepSeconds(run.steps[s], now), 0);

/** The whole run's pauses, in order, with the step and the task's label. */
export function runPauses(run: ProductionRun): (Pause & { step: RunStepId; taskLabel: string | null; seconds: number })[] {
  const out: (Pause & { step: RunStepId; taskLabel: string | null; seconds: number })[] = [];
  for (const step of RUN_STEPS) {
    for (const p of run.steps[step].pauses) {
      const task = p.taskKey ? run.steps[step].tasks.find((t) => t.key === p.taskKey) : undefined;
      out.push({ ...p, step, taskLabel: task?.label ?? null, seconds: p.endedAt ? Math.max(0, Math.round((ms(p.endedAt) - ms(p.startedAt)) / 1000)) : 0 });
    }
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export const isPaused = (step: StepRun): boolean => step.pauses.some((p) => !p.endedAt);
export const runningTask = (step: StepRun): TaskRun | undefined => step.tasks.find((t) => t.status === "running");
/** The running step, else null. (Steps are started one at a time by the widget, but a run
 *  written by hand could have two — the first in step order wins.) */
export const currentStep = (run: ProductionRun): RunStepId | null => RUN_STEPS.find((s) => run.steps[s].status === "running") ?? null;
export const nextPendingStep = (run: ProductionRun): RunStepId | null => RUN_STEPS.find((s) => run.steps[s].status === "pending") ?? null;
/** True once every step has been decided (done or skipped) — the run is over. */
export const allStepsDecided = (run: ProductionRun): boolean => RUN_STEPS.every((s) => run.steps[s].status === "done" || run.steps[s].status === "skipped");

// ------------------------------------------------------------------ the reducer

export type RunAction =
  | { type: "startStep"; step: RunStepId }
  | { type: "startTask"; step: RunStepId; key: string }
  /** `seconds`: credit a still-pending task with a duration measured elsewhere (a rehearsal
   *  round's own clock), so completing it doesn't record zero. */
  | { type: "completeTask"; step: RunStepId; key: string; seconds?: number }
  | { type: "skipTask"; step: RunStepId; key: string }
  | { type: "pause"; step: RunStepId; reason: string }
  | { type: "resume"; step: RunStepId }
  | { type: "skipStep"; step: RunStepId }
  | { type: "finishStep"; step: RunStepId; note: string | null }
  | { type: "abandon" };

const withStep = (run: ProductionRun, step: RunStepId, next: StepRun): ProductionRun => ({ ...run, steps: { ...run.steps, [step]: next } });

/** A finished task, stamped: seconds is pause-adjusted from its own start. */
const endTask = (t: TaskRun, step: StepRun, now: Date, status: "done" | "skipped"): TaskRun =>
  ({ ...t, status, endedAt: now.toISOString(), seconds: t.status === "running" ? taskSeconds(t, step, now) : t.seconds });

/** Close an open pause (resume). */
const closePauses = (step: StepRun, now: Date): StepRun =>
  ({ ...step, pauses: step.pauses.map((p) => (p.endedAt ? p : { ...p, endedAt: now.toISOString() })) });

/** Start a pending task; a step whose first task starts also starts (the modal's "Start"). */
function startTask(step: StepRun, key: string, now: Date): StepRun {
  const iso = now.toISOString();
  const started: StepRun = step.status === "pending" ? { ...step, status: "running", startedAt: iso } : step;
  if (started.status !== "running") return step;
  const t = started.tasks.find((x) => x.key === key);
  if (!t || t.status !== "pending") return started;
  return { ...started, tasks: started.tasks.map((x) => (x.key === key ? { ...x, status: "running", startedAt: iso } : x)) };
}

/** Every step decided → the run is done. Called after any step-ending action. */
function settle(run: ProductionRun, now: Date): ProductionRun {
  if (run.status !== "running") return run;
  return allStepsDecided(run) ? { ...run, status: "done", endedAt: now.toISOString() } : run;
}

export function reduceRun(run: ProductionRun, action: RunAction, now: Date): ProductionRun {
  if (run.status !== "running" && action.type !== "abandon") return run;
  const iso = now.toISOString();
  switch (action.type) {
    case "startStep": {
      const s = run.steps[action.step];
      if (s.status !== "pending") return run;
      // The checkbox flow starts on the first task — Lee shouldn't have to click twice.
      const first = s.tasks.find((t) => t.status === "pending");
      return withStep(run, action.step, first ? startTask(s, first.key, now) : { ...s, status: "running", startedAt: iso });
    }
    case "startTask": {
      const s = run.steps[action.step];
      if (s.status === "done" || s.status === "skipped") return run;
      return withStep(run, action.step, startTask(s, action.key, now));
    }
    case "completeTask": {
      let s = run.steps[action.step];
      if (s.status === "done" || s.status === "skipped") return run;
      const i = s.tasks.findIndex((t) => t.key === action.key);
      if (i < 0) return run;
      const t = s.tasks[i];
      if (t.status === "done" || t.status === "skipped") return run;
      if (s.status === "pending") s = { ...s, status: "running", startedAt: iso };
      // A pending task checked straight to done records what it was credited with (a round's
      // own clock) — otherwise zero. Never a guess.
      const done: TaskRun = t.status === "running"
        ? endTask(t, s, now, "done")
        : { ...t, status: "done", seconds: Math.max(0, Math.round(action.seconds ?? 0)), startedAt: new Date(now.getTime() - Math.max(0, Math.round(action.seconds ?? 0)) * 1000).toISOString(), endedAt: iso };
      let tasks = s.tasks.map((x, j) => (j === i ? done : x));
      // "Completing a task starts the next pending one" — the next AFTER it, and only when
      // nothing else is still running (a task checked out of order leaves the earlier one
      // running until it's checked — two clocks, honestly). The last task starts nothing.
      if (!tasks.some((x) => x.status === "running")) {
        const nextI = tasks.findIndex((x, j) => j > i && x.status === "pending");
        if (nextI >= 0) tasks = tasks.map((x, j) => (j === nextI ? { ...x, status: "running", startedAt: iso } : x));
      }
      return withStep(run, action.step, { ...s, tasks });
    }
    case "skipTask": {
      const s = run.steps[action.step];
      if (s.status === "done" || s.status === "skipped") return run;
      const t = s.tasks.find((x) => x.key === action.key);
      if (!t || t.status === "done" || t.status === "skipped") return run;
      return withStep(run, action.step, { ...s, tasks: s.tasks.map((x) => (x.key === action.key ? endTask(x, s, now, "skipped") : x)) });
    }
    case "pause": {
      const s = run.steps[action.step];
      // Nothing running, or already paused — nothing to pause. (Lee: "make that require
      // confirmation" — the widget confirms; this just refuses the meaningless case.)
      if (s.status !== "running" || isPaused(s)) return run;
      const t = runningTask(s);
      if (!t) return run;
      return withStep(run, action.step, { ...s, pauses: [...s.pauses, { taskKey: t.key, startedAt: iso, endedAt: null, reason: action.reason.trim().slice(0, 200) }] });
    }
    case "resume": {
      const s = run.steps[action.step];
      if (!isPaused(s)) return run;
      return withStep(run, action.step, closePauses(s, now));
    }
    case "skipStep": {
      const s = run.steps[action.step];
      if (s.status === "done" || s.status === "skipped") return run;
      const closed = closePauses(s, now);
      const next: StepRun = {
        ...closed, status: "skipped", endedAt: closed.startedAt ? iso : null,
        tasks: closed.tasks.map((t) => (t.status === "running" || t.status === "pending" ? (t.status === "running" ? endTask(t, closed, now, "skipped") : { ...t, status: "skipped" }) : t)),
      };
      return settle(withStep(run, action.step, next), now);
    }
    case "finishStep": {
      const s = run.steps[action.step];
      if (s.status === "done" || s.status === "skipped") return run;
      const closed = closePauses(s, now);
      const startedAt = closed.startedAt ?? iso;
      const next: StepRun = {
        ...closed, status: "done", startedAt, endedAt: iso, note: action.note?.trim() ? action.note.trim().slice(0, 2000) : null,
        // A running task is finished with the step; one never started is marked skipped —
        // "done" would claim work that didn't happen.
        tasks: closed.tasks.map((t) => (t.status === "running" ? endTask(t, closed, now, "done") : t.status === "pending" ? { ...t, status: "skipped" } : t)),
      };
      return settle(withStep(run, action.step, next), now);
    }
    case "abandon": {
      if (run.status !== "running") return run;
      const steps = { ...run.steps };
      for (const step of RUN_STEPS) {
        const s = closePauses(steps[step], now);
        steps[step] = s.status === "running"
          ? { ...s, status: "skipped", endedAt: iso, tasks: s.tasks.map((t) => (t.status === "running" ? endTask(t, s, now, "skipped") : t)) }
          : s;
      }
      return { ...run, steps, status: "abandoned", endedAt: iso };
    }
  }
}

// ------------------------------------------------------------------ the reads (Step 5)

export interface StepTotal { step: RunStepId; label: string; status: StepStatus; seconds: number; pauses: number }
export interface TaskTotal { step: RunStepId; stepLabel: string; key: string; label: string; status: TaskStatus; seconds: number; share: number; pauses: number }

/** Per step and per task, tasks sorted by time desc (Lee: "maybe just rank by total time
 *  spent on each?, descending order?"). `share` is the task's fraction of the run total. */
export function runTotals(run: ProductionRun, now: Date): { total: number; steps: StepTotal[]; tasks: TaskTotal[] } {
  const total = runTotalSeconds(run, now);
  const steps: StepTotal[] = RUN_STEPS.map((step) => ({
    step, label: RUN_STEP_LABEL[step], status: run.steps[step].status, seconds: stepSeconds(run.steps[step], now), pauses: run.steps[step].pauses.length,
  }));
  const tasks: TaskTotal[] = RUN_STEPS.flatMap((step) => run.steps[step].tasks.map((t) => {
    const seconds = taskSeconds(t, run.steps[step], now);
    return {
      step, stepLabel: RUN_STEP_LABEL[step], key: t.key, label: t.label, status: t.status, seconds,
      share: total > 0 ? seconds / total : 0, pauses: run.steps[step].pauses.filter((p) => p.taskKey === t.key).length,
    };
  })).sort((a, b) => b.seconds - a.seconds);
  return { total, steps, tasks };
}

/** "Only complete runs count": finished, every step done, none skipped. */
export const isCompleteRun = (run: ProductionRun): boolean =>
  run.status === "done" && RUN_STEPS.every((s) => run.steps[s].status === "done");

const runEnd = (run: ProductionRun): Date => new Date(run.endedAt ?? run.startedAt);

/** The mean total of the complete runs, in seconds — null when there isn't one yet. */
export function timeToBeat(runs: readonly ProductionRun[]): number | null {
  const complete = runs.filter(isCompleteRun);
  if (!complete.length) return null;
  return Math.round(complete.reduce((sum, r) => sum + runTotalSeconds(r, runEnd(r)), 0) / complete.length);
}

/** Per step, the same mean over the complete runs — Step 5's "this run vs the average" bars. */
export function stepAverages(runs: readonly ProductionRun[]): Partial<Record<RunStepId, number>> {
  const complete = runs.filter(isCompleteRun);
  if (!complete.length) return {};
  const out: Partial<Record<RunStepId, number>> = {};
  for (const step of RUN_STEPS) out[step] = Math.round(complete.reduce((sum, r) => sum + stepSeconds(r.steps[step], runEnd(r)), 0) / complete.length);
  return out;
}

export interface PauseHit { step: RunStepId; key: string; label: string; count: number; seconds: number }
export interface DistractionStats {
  /** Every pause across the runs, newest first, with what it hit. */
  pauses: (Pause & { runId: string; setName: string; step: RunStepId; taskLabel: string | null; seconds: number })[];
  totalPaused: number;
  /** Tasks by how often they were paused on, desc. */
  byTask: PauseHit[];
  /** "Which tasks do I get distracted most?" — the top of byTask, or null. */
  mostPaused: PauseHit | null;
}

export function distractionStats(runs: readonly ProductionRun[]): DistractionStats {
  const pauses = runs.flatMap((r) => runPauses(r).map((p) => ({ ...p, runId: r.id, setName: r.setName })))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const byKey = new Map<string, PauseHit>();
  for (const p of pauses) {
    if (!p.taskKey) continue;
    const id = `${p.step}/${p.taskKey}`;
    const hit = byKey.get(id) ?? { step: p.step, key: p.taskKey, label: p.taskLabel ?? p.taskKey, count: 0, seconds: 0 };
    hit.count += 1; hit.seconds += p.seconds;
    byKey.set(id, hit);
  }
  const byTask = [...byKey.values()].sort((a, b) => b.count - a.count || b.seconds - a.seconds);
  return { pauses, totalPaused: pauses.reduce((s, p) => s + p.seconds, 0), byTask, mostPaused: byTask[0] ?? null };
}

/** "~12 min" — the display figure ("Time to beat: ~# minutes"). Under a minute says so. */
export const fmtMin = (seconds: number): string => (seconds < 60 ? "<1 min" : `~${Math.round(seconds / 60)} min`);
export { fmtElapsed, fmtDuration };

// ------------------------------------------------------------------ the signals

/** Which timed step a Blast Off URL is on. `post` is the cross-set page (/v3/post) and names
 *  no set; `improve` is Step 5 (never timed, but the pill offers the way there). */
export type PathStep =
  | { kind: "set"; topicSlug: string; setSlug: string; step: RunStepId | "improve" }
  | { kind: "post" };

export function runStepFromPath(pathname: string): PathStep | null {
  if (/^\/v3\/post(?:\/|$)/.test(pathname)) return { kind: "post" };
  const m = /^\/v3\/([^/]+)\/([^/]+)\/blast-off\/(talkthrough|results|arrange|film|improve)(?:[/?#]|$)/.exec(pathname);
  if (!m) return null;
  const page = m[3];
  return { kind: "set", topicSlug: m[1], setSlug: m[2], step: page === "arrange" ? "results" : (page as RunStepId | "improve") };
}

/** THE RECORDER'S SIGNAL (Lee: "when I first hit start recording, that starts the timer. When
 *  I stop recording, background timer stops") — read off the local-first Talkthrough store
 *  without touching Booth.tsx. The V3 Brainstorm page opens a session the moment it mounts, so
 *  "a session exists" isn't "recording started"; the first SEGMENT landing for the open session
 *  is (the recorder writes one per finalised sentence). The session gaining endedAt (End
 *  Session → Review) is the stop. The widget watches for the transitions. */
export interface RecordingSignal { sessionId: string; startedAt: string; recording: boolean; ended: boolean }
export function recordingSignal(doc: TTDoc, setId: string): RecordingSignal | null {
  const s = doc.sessions.filter((x) => x.setId === setId && !x.archivedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!s) return null;
  const recording = doc.segments.some((g) => g.sessionId === s.id && !g.archivedAt);
  return { sessionId: s.id, startedAt: s.startedAt, recording, ended: !!s.endedAt };
}

/** "Editor · Fix the cards · 4:12" — the pill. */
export function pillLabel(run: ProductionRun, now: Date): string {
  const step = currentStep(run);
  const total = fmtElapsed(runTotalSeconds(run, now));
  if (!step) return run.status === "done" ? `Run done · ${total}` : `Run · ${total}`;
  const s = run.steps[step];
  const t = runningTask(s);
  const paused = isPaused(s) ? " · paused" : "";
  return `${RUN_STEP_LABEL[step]}${t ? ` · ${t.label}` : ""} · ${total}${paused}`;
}
