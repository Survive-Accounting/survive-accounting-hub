// ProfIntel V2 — pure teaching-evidence rollup + targeting score. No I/O, no
// framework deps, so it's unit-testable in isolation. Given a professor's dated
// RMP reviews and a campus's four target course codes, it computes the target-
// course match rollup, recency/terms estimates, a confidence label, and a score.
//
// IMPORTANT: RMP rating dates are REVIEW dates, not official teaching assignments.
// Everything here is "RMP evidence / estimated", never a guaranteed schedule.

export type TargetFamilyKey = "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2";
export const TARGET_FAMILY_KEYS: TargetFamilyKey[] = [
  "intro_1",
  "intro_2",
  "intermediate_1",
  "intermediate_2",
];
export const TARGET_FAMILY_LABEL: Record<TargetFamilyKey, string> = {
  intro_1: "Intro 1",
  intro_2: "Intro 2",
  intermediate_1: "IA1",
  intermediate_2: "IA2",
};

export interface RatingLite {
  class_label: string | null;
  rated_at: string | null; // ISO or null
}

export interface SignalInput {
  ratings: RatingLite[];
  targetCodes: Partial<Record<TargetFamilyKey, string>>;
  email: string | null;
  numRatings: number | null;
  rmpRating: number | null;
  difficulty: number | null;
  /** True when we have a real faculty-page source (not RMP-only). */
  hasFacultySource: boolean;
  now?: Date;
}

export interface TargetSignal {
  counts: Record<TargetFamilyKey, number>;
  totalMatch: number;
  hasExact: boolean;
  latestTargetCode: string | null;
  latestTargetDate: string | null;
  termsTaught: number; // floor: distinct terms with >=1 matching dated review
  termsList: string[]; // e.g. ["Fall 2025", "Spring 2026"]
  recentMatch: boolean; // latest target review within 12 months
  thisTimeLastYear: boolean;
  confidence: "high" | "medium" | "low" | null;
  score: number;
  reason: string;
}

/** Uppercase + strip non-alphanumerics: "ACCY 201" / "accy201" → "ACCY201". */
export function normCode(s: string): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A valid matchable target code needs a prefix + a digit and >= 5 chars, so a
 *  bare "ACCT" can't false-match everything. */
function normedTarget(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = normCode(raw);
  return t.length >= 5 && /[0-9]/.test(t) ? t : null;
}

/** date → academic term label: Jan–May Spring, Jun–Jul Summer, Aug–Dec Fall. */
export function termOf(d: Date): string {
  const m = d.getUTCMonth(); // 0-11
  const season = m <= 4 ? "Spring" : m <= 6 ? "Summer" : "Fall";
  return `${season} ${d.getUTCFullYear()}`;
}

function monthYear(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function monthsBetween(a: Date, b: Date): number {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

export function computeTargetSignal(input: SignalInput): TargetSignal {
  const now = input.now ?? new Date();
  const counts: Record<TargetFamilyKey, number> = {
    intro_1: 0,
    intro_2: 0,
    intermediate_1: 0,
    intermediate_2: 0,
  };
  const targets: Partial<Record<TargetFamilyKey, string>> = {};
  for (const fam of TARGET_FAMILY_KEYS) {
    const nt = normedTarget(input.targetCodes[fam]);
    if (nt) targets[fam] = nt;
  }

  let totalMatch = 0;
  let hasExact = false;
  const matched: { fam: TargetFamilyKey; code: string; date: Date | null }[] = [];

  for (const r of input.ratings) {
    const nc = normCode(r.class_label ?? "");
    if (!nc) continue;
    let fam: TargetFamilyKey | null = null;
    let exact = false;
    // Prefer an exact code match.
    for (const k of TARGET_FAMILY_KEYS) {
      if (targets[k] && nc === targets[k]) {
        fam = k;
        exact = true;
        break;
      }
    }
    if (!fam) {
      for (const k of TARGET_FAMILY_KEYS) {
        if (targets[k] && nc.includes(targets[k]!)) {
          fam = k;
          break;
        }
      }
    }
    if (!fam) continue;
    counts[fam] += 1;
    totalMatch += 1;
    if (exact) hasExact = true;
    const d = r.rated_at ? new Date(r.rated_at) : null;
    matched.push({
      fam,
      code: input.targetCodes[fam] ?? fam,
      date: d && !Number.isNaN(d.getTime()) ? d : null,
    });
  }

  const dated = matched.filter((m) => m.date) as {
    fam: TargetFamilyKey;
    code: string;
    date: Date;
  }[];
  dated.sort((a, b) => b.date.getTime() - a.date.getTime());
  const latest = dated[0] ?? null;
  const latestTargetDate = latest ? latest.date.toISOString() : null;
  const latestTargetCode = latest ? latest.code : (matched[0]?.code ?? null);

  const termSet = new Set<string>();
  for (const m of dated) termSet.add(termOf(m.date));
  const termsList = Array.from(termSet).sort((a, b) => a.localeCompare(b));

  const monthsSinceLatest = latest ? monthsBetween(now, latest.date) : Infinity;
  const within12 = monthsSinceLatest <= 12;
  const within24 = monthsSinceLatest <= 24;
  const recentMatch = within12;

  // "This time last year": a matching review in the same academic term one year ago.
  const currentSeason = termOf(now).split(" ")[0];
  const lastYearTerm = `${currentSeason} ${now.getUTCFullYear() - 1}`;
  const thisTimeLastYear = dated.some((m) => termOf(m.date) === lastYearTerm);

  let confidence: TargetSignal["confidence"] = null;
  if (totalMatch > 0) {
    if (hasExact && within24) confidence = "high";
    else if (hasExact) confidence = "medium";
    else confidence = "low";
  }

  // Score.
  let score = 0;
  if (within12) score += 30;
  else if (within24) score += 20;
  if (thisTimeLastYear) score += 20;
  if (totalMatch >= 10) score += 15;
  if ((input.numRatings ?? 0) >= 25) score += 10;
  if ((input.difficulty ?? 0) >= 3.8) score += 10;
  if (input.rmpRating != null && input.rmpRating <= 3.5) score += 10;
  if (input.email) score += 10;
  else score -= 25;
  if (!input.hasFacultySource) score -= 10;
  // No target-course evidence → not a target; score is meaningless (filtered out
  // of the default view). Zero it so the number never misleads.
  if (totalMatch === 0) score = 0;

  // Human-readable reason.
  let reason: string;
  if (totalMatch === 0) {
    reason = "No target-course RMP evidence yet.";
  } else {
    const parts: string[] = [];
    parts.push(
      `${latestTargetCode ?? "target course"} appears ${totalMatch} time${totalMatch === 1 ? "" : "s"} on RMP`,
    );
    if (latest) parts.push(`latest target-course review ${monthYear(latest.date)}`);
    else parts.push("no review dates");
    if (input.rmpRating != null) parts.push(`rating ${input.rmpRating}`);
    if (input.difficulty != null) parts.push(`difficulty ${input.difficulty}`);
    if (!input.email) parts.push("no email");
    reason = parts.join("; ") + ".";
  }

  return {
    counts,
    totalMatch,
    hasExact,
    latestTargetCode,
    latestTargetDate,
    termsTaught: termSet.size,
    termsList,
    recentMatch,
    thisTimeLastYear,
    confidence,
    score,
    reason,
  };
}
