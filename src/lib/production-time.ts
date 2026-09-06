// THE PRODUCTION TIMER — pure helpers only (no React, no network), shared by the widget
// (components/v3/ProductionTimer.tsx) and the server fns (production-time.functions.ts).
//
// Lee, 2026-09-05: "I want to time how long it takes for each step for blast offs, talkthrough,
// review, film... starting with the next CEQ set." Four named steps — "post" doesn't have a
// page yet (Lee's own Step 4 plan), but the step vocabulary is fixed now so the schema and the
// report never need a second migration when it arrives.

export const PRODUCTION_STEPS = ["talkthrough", "review", "film", "post"] as const;
export type ProductionStep = (typeof PRODUCTION_STEPS)[number];
export function isProductionStep(v: unknown): v is ProductionStep {
  return typeof v === "string" && (PRODUCTION_STEPS as readonly string[]).includes(v);
}

export const STEP_LABEL: Record<ProductionStep, string> = {
  talkthrough: "Talkthrough", review: "Review", film: "Film", post: "Post",
};

/** Which step a Blast Off URL is on, and the topic/set slugs — auto-detected so starting the
 *  timer never asks Lee to pick anything. "results" is the Review page (its own head title is
 *  literally "Review — Blast Off"); "arrange" folds into Review too — Lee named three steps,
 *  not four, and Arrange is review-time rearranging, not a step of its own. Absent (a page this
 *  can't place, or off /v3 entirely) → null: the widget simply has nothing to auto-start. */
export function blastOffStepFromPath(pathname: string): { topicSlug: string; setSlug: string; step: ProductionStep } | null {
  // "post" isn't in this match on purpose: Lee's Post step is a cross-set queue (every topic/set
  // in one list, per his own description), not a page under one set's own URL — it gets its own
  // detection once that page exists. "post" stays a valid STEP for the schema either way.
  const m = /^\/v3\/([^/]+)\/([^/]+)\/blast-off\/(talkthrough|results|arrange|film)(?:\/|$)/.exec(pathname);
  if (!m) return null;
  const page = m[3];
  const step: ProductionStep = page === "talkthrough" ? "talkthrough" : page === "film" ? "film" : "review";
  return { topicSlug: m[1], setSlug: m[2], step };
}

/** "12:04" under an hour, "1:02:04" past it — a running clock, not a duration label. */
export function fmtElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0"), ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** "2h 14m" / "38m" / "45s" — a report's duration label, coarser than the running clock. */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
