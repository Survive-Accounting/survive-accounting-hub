// PLAYER V2 "TONIGHT'S PLAN" — the plan model (2026-08-27).
//
// THREE LAYERS, NEVER CONFLATED (spec §2):
//   THE MAP           — the canonical exam content: exam-path's buildPath() output, untouched.
//   TONIGHT'S PLAN    — a FILTER over those steps, derived from mode + goal + preview tiers.
//   STUDENT OVERRIDES — local per-topic depth additions; browsing never mutates the plan.
//
// Completed work belongs to the STUDENT: completion stays in the guided path's own store
// (`sa-path-steps`, shared with the live player — a done step is done everywhere). The plan is a
// separate, additive record (`sa-v2-plan`). Changing mode/goal/depth only re-filters the
// remaining path; nothing ever erases a done step (spec §19).
//
// Pure functions + localStorage; client-safe; no server imports. The player consumes this only
// through the PlannerV2Bridge type (landing.tsx imports the TYPE alone, so none of this code
// enters the live bundle).
import type { ReactNode } from "react";

import type { PathStep } from "@/lib/exam-path";
import type { SetStage } from "@/lib/set-flow";
import { PREVIEW_RULES, SET_TIER_OVERRIDES, V2_TIME, type PriorityTier } from "./planner-config";

export type StudyMode = "cram" | "practice" | "full_review" | "choose_as_i_go";
export type StudyGoal = "pass" | "b" | "a";

export interface PlanState {
  mode: StudyMode;
  /** null only for choose_as_i_go (no restrictive plan). */
  goal: StudyGoal | null;
  /** Local depth: topicKey → stages the student added FOR THAT TOPIC ONLY (spec §20). */
  overrides: Record<string, SetStage[]>;
  createdAt: number;
}

// ── persistence (same local-first pattern as exam-path) ───────────────────────────────────────
export const V2_PLAN_KEY = "sa-v2-plan";

export function readPlan(): PlanState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(V2_PLAN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PlanState;
    return p && typeof p === "object" && p.mode ? { ...p, overrides: p.overrides ?? {} } : null;
  } catch { return null; }
}
export function writePlan(plan: PlanState): void {
  try {
    localStorage.setItem(V2_PLAN_KEY, JSON.stringify(plan));
    window.dispatchEvent(new CustomEvent("sa-v2-plan"));
  } catch { /* private mode */ }
}
export function clearPlan(): void {
  try {
    localStorage.removeItem(V2_PLAN_KEY);
    window.dispatchEvent(new CustomEvent("sa-v2-plan"));
  } catch { /* ignore */ }
}

// ── vocabulary ────────────────────────────────────────────────────────────────────────────────
/** Cumulative depth: each mode CONTAINS the ones before it (spec §7). */
export const MODE_STAGES: Record<Exclude<StudyMode, "choose_as_i_go">, SetStage[]> = {
  cram: ["cram"],
  practice: ["cram", "practice"],
  full_review: ["cram", "practice", "review"],
};

export const modeLabel = (m: StudyMode): string =>
  m === "cram" ? "Cram" : m === "practice" ? "Practice" : m === "full_review" ? "Full Review" : "Choose as I go";
export const goalLabel = (g: StudyGoal): string => (g === "pass" ? "Just Pass" : g === "b" ? "Solid B" : "Go for an A");
/** The clickable plan identity: "PRACTICE · SOLID B". */
export const planIdentity = (plan: PlanState): string =>
  plan.mode === "choose_as_i_go" ? "BROWSING THE MAP" : `${modeLabel(plan.mode).toUpperCase()}${plan.goal ? ` · ${goalLabel(plan.goal).toUpperCase()}` : ""}`;

// ── priority tiers (preview implementation — see planner-config header) ───────────────────────
export function stepTier(step: PathStep, allSteps: PathStep[]): PriorityTier {
  const explicit = SET_TIER_OVERRIDES[step.setId];
  if (explicit) return explicit;
  if (PREVIEW_RULES.easyTopicPattern.test(step.topicName)) return "easy";
  if (step.kind === "practice_set") {
    const prac = allSteps.filter((s) => s.topicKey === step.topicKey && s.kind === "practice_set");
    if (prac.length >= PREVIEW_RULES.bToALastPracticeMinSteps && prac[prac.length - 1]!.id === step.id) return "b_to_a";
  }
  return "core";
}

// ── the plan filter ───────────────────────────────────────────────────────────────────────────
/** Tonight's Plan = the canonical steps that survive mode + goal + overrides. Order is always
 *  the canonical map order — priority is metadata/filtering, never a second taxonomy (§12). */
export function planSteps(allSteps: PathStep[], plan: PlanState): PathStep[] {
  if (plan.mode === "choose_as_i_go") return allSteps;
  const modeStages = new Set<SetStage>(MODE_STAGES[plan.mode]);
  const goal: StudyGoal = plan.goal ?? "b";
  return allSteps.filter((s) => {
    const overridden = !!plan.overrides[s.topicKey]?.includes(s.stage);
    if (!modeStages.has(s.stage) && !overridden) return false;
    const tier = stepTier(s, allSteps);
    // A-material stays out until the goal asks for it — go-deeper adds DEPTH, not A-material.
    if (tier === "b_to_a" && goal !== "a") return false;
    if (!overridden && goal === "pass" && tier === "core" && s.kind === "practice_set" && PREVIEW_RULES.passKeepsFirstPracticeOnly) {
      const corePrac = allSteps.filter((x) => x.topicKey === s.topicKey && x.kind === "practice_set" && stepTier(x, allSteps) !== "b_to_a");
      if (corePrac.length > 0 && corePrac[0]!.id !== s.id) return false;
    }
    return true;
  });
}

// ── time estimates (V1 engine — configurable, honest, range-based; spec §18) ──────────────────
export interface MinRange { low: number; high: number }

export function stepMinutes(step: PathStep): MinRange {
  if (step.kind === "practice_set") {
    return { low: step.questions * V2_TIME.minPerQuestionLow, high: step.questions * V2_TIME.minPerQuestionHigh };
  }
  const mins = step.runtimeSec ? step.runtimeSec / 60 : step.kind === "cram_video" ? V2_TIME.defaultCramMin : V2_TIME.defaultReviewMin;
  return { low: mins, high: mins };
}
export function sumMinutes(steps: PathStep[]): MinRange {
  return steps.reduce<MinRange>((a, s) => { const m = stepMinutes(s); return { low: a.low + m.low, high: a.high + m.high }; }, { low: 0, high: 0 });
}
export const midMin = (r: MinRange): number => (r.low + r.high) / 2;
export const remainingSteps = (steps: PathStep[], done: Record<string, number>): PathStep[] => steps.filter((s) => !done[s.id]);

/** "1 hr 45 min" / "45 min" — rounded to 5-minute humanity, floor 5 min. Never fake precision. */
export function fmtClock(minutes: number): string {
  const m = Math.max(5, Math.round(minutes / 5) * 5);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} hr` : `${h} hr ${String(rest).padStart(2, "0")} min`;
}
export const fmtAbout = (r: MinRange): string => `About ${fmtClock(midMin(r))}`;
export const fmtTilde = (r: MinRange): string => `~${fmtClock(midMin(r))}`;
export const fmtPlus = (r: MinRange): string => `+ ~${fmtClock(midMin(r))}`;

// ── payoff-screen rows: the compact topic map (spec §13) ──────────────────────────────────────
export interface PlanTopicRow {
  topicKey: string;
  topicName: string;
  cram: boolean;
  practice: boolean;
  /** "in" = review steps in plan · "coming" = full_review chosen but no review published yet
   *  · "off" = not part of this plan. */
  review: "in" | "coming" | "off";
}
export function planTopicRows(allSteps: PathStep[], planned: PathStep[], plan: PlanState): PlanTopicRow[] {
  const rows: PlanTopicRow[] = [];
  const seen = new Set<string>();
  const inPlan = new Set(planned.map((s) => s.id));
  for (const s of allSteps) {
    if (seen.has(s.topicKey)) continue;
    seen.add(s.topicKey);
    const own = allSteps.filter((x) => x.topicKey === s.topicKey);
    const has = (k: PathStep["kind"]) => own.some((x) => x.kind === k && inPlan.has(x.id));
    const wantsReview = plan.mode === "full_review" || !!plan.overrides[s.topicKey]?.includes("review");
    const reviewExists = own.some((x) => x.kind === "review_video");
    rows.push({
      topicKey: s.topicKey,
      topicName: s.topicName,
      cram: has("cram_video"),
      practice: has("practice_set"),
      review: has("review_video") ? "in" : wantsReview && !reviewExists ? "coming" : "off",
    });
  }
  // Topics none of whose steps made the plan still render (greyed) so the map stays honest —
  // handled by the caller via cram/practice/review all falsy.
  return rows;
}

// ── "Take it to an A" teaser (spec §14) ───────────────────────────────────────────────────────
export interface ATeaser { count: number; minutes: MinRange }
/** The steps GO FOR AN A would add to the current plan (preview tiers). Null when the goal is
 *  already "a", the plan is unrestricted, or nothing would change. */
export function aTeaser(allSteps: PathStep[], plan: PlanState): ATeaser | null {
  if (plan.mode === "choose_as_i_go" || plan.goal === "a") return null;
  const now = new Set(planSteps(allSteps, plan).map((s) => s.id));
  const withA = planSteps(allSteps, { ...plan, goal: "a" }).filter((s) => !now.has(s.id));
  if (withA.length === 0) return null;
  return { count: withA.length, minutes: sumMinutes(withA) };
}

// ── go-deeper options for one topic (spec §20) ────────────────────────────────────────────────
export interface DepthOption { stage: SetStage; label: string; available: boolean; minutes: MinRange | null }
export function depthOptions(allSteps: PathStep[], plan: PlanState, topicKey: string): DepthOption[] {
  if (plan.mode === "choose_as_i_go") return [];
  const planned = new Set(planSteps(allSteps, plan).filter((s) => s.topicKey === topicKey).map((s) => s.stage));
  const own = allSteps.filter((s) => s.topicKey === topicKey);
  const out: DepthOption[] = [];
  const addable = (stage: SetStage): PathStep[] => {
    const trial: PlanState = { ...plan, overrides: { ...plan.overrides, [topicKey]: [...(plan.overrides[topicKey] ?? []), stage] } };
    const now = new Set(planSteps(allSteps, plan).map((s) => s.id));
    return planSteps(allSteps, trial).filter((s) => !now.has(s.id));
  };
  if (!planned.has("practice") || addable("practice").length > 0) {
    const extra = addable("practice");
    if (extra.length > 0) out.push({ stage: "practice", label: "Practice", available: true, minutes: sumMinutes(extra) });
  }
  const reviewExists = own.some((s) => s.kind === "review_video");
  if (!planned.has("review")) {
    const extra = reviewExists ? addable("review") : [];
    out.push({ stage: "review", label: "Full Review", available: reviewExists && extra.length > 0, minutes: extra.length ? sumMinutes(extra) : null });
  }
  return out;
}

/** Add depth to ONE topic. Returns the new plan; the global mode never changes (spec §20). */
export function addDepth(plan: PlanState, topicKey: string, stage: SetStage): PlanState {
  const cur = plan.overrides[topicKey] ?? [];
  if (cur.includes(stage)) return plan;
  return { ...plan, overrides: { ...plan.overrides, [topicKey]: [...cur, stage] } };
}

// ── the bridge the player consumes (type-only import in landing.tsx) ──────────────────────────
export interface PlannerV2Ctx {
  /** The plan-filtered steps the player is walking (its pathSteps). */
  steps: PathStep[];
  /** The canonical available steps (unfiltered map). */
  allSteps: PathStep[];
  done: Record<string, number>;
  curTopicKey?: string | null;
  curTopicName?: string | null;
  goToStep?: (step: PathStep) => void;
}

export interface PlannerV2Bridge {
  /** Tonight's Plan as a filter over the canonical path. */
  filterSteps: (steps: PathStep[]) => PathStep[];
  /** The plan header strip (identity · progress · time left · go deeper), rendered by the
   *  player above the sidebar/panel split. */
  planStrip: (ctx: PlannerV2Ctx) => ReactNode;
  /** Replaces the V1 TopicCompleteCard: Continue in [mode] → / Go deeper on this topic →. */
  topicCompleteCard: (ctx: PlannerV2Ctx & { topicName: string; topicKey: string | null; pct: number; next: PathStep; onContinue: () => void }) => ReactNode;
  /** Fired when the student browses the map (sidebar topic preview). */
  onMapBrowse?: () => void;
}
