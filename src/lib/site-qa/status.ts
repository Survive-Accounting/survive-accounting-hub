// QA status — the four states the cockpit shows, and how they're derived.
// Pure + dependency-free (used by both server and browser).

export type QaStatus = "verified" | "changed" | "error" | "never";

export interface QaStatusMeta {
  label: string;
  dot: string; // emoji marker used in copy / fallbacks
  /** Tailwind text color token for the status word. */
  tone: string;
}

export const QA_STATUS_META: Record<QaStatus, QaStatusMeta> = {
  error: { label: "Error detected", dot: "🔴", tone: "text-red-600" },
  changed: { label: "Changed since verified", dot: "🟠", tone: "text-amber-600" },
  never: { label: "Never verified", dot: "⚪", tone: "text-slate-400" },
  verified: { label: "Verified", dot: "✓", tone: "text-emerald-600" },
};

export interface DeriveStatusInput {
  /** Current build hash for the template (from virtual:site-qa-versions). */
  currentVersion: string | null;
  /** Hash recorded when the template was last marked verified. */
  verifiedVersion: string | null;
  /** ISO timestamp of last verification, or null if never. */
  verifiedAt: string | null;
  /** Count of recent errors attributed to this template (Sentry), or null if
   *  Sentry is not configured / unavailable. */
  recentErrors: number | null;
}

/** The single rule that turns raw signals into one of the four states.
 *  Errors win over everything (a broken page needs eyes even if "verified");
 *  otherwise: never-verified → changed → verified. */
export function deriveStatus(i: DeriveStatusInput): QaStatus {
  if (i.recentErrors != null && i.recentErrors > 0) return "error";
  if (!i.verifiedAt || !i.verifiedVersion) return "never";
  if (i.currentVersion && i.verifiedVersion !== i.currentVersion) return "changed";
  return "verified";
}

/** Sort weight for the "Needs review" view: error first, then changed, then
 *  never, then verified. Lower = more urgent. Traffic breaks ties (handled by
 *  the caller). Verified pages are pushed to the bottom. */
export function statusUrgency(s: QaStatus): number {
  switch (s) {
    case "error":
      return 0;
    case "changed":
      return 1;
    case "never":
      return 2;
    case "verified":
      return 3;
  }
}

/** True when a template should surface in the default "Needs review" list. */
export function needsReview(s: QaStatus): boolean {
  return s !== "verified";
}
