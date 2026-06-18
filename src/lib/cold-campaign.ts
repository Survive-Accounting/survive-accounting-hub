// Pure helpers for the Cold Emails campaign builder.
// No network access; deterministic ranking + schedule math only.
import type { Campus } from "@/lib/outreach-mock";

export interface ColdCriteria {
  secEnabled: boolean;
  secWeight: number;             // 0..10
  tuitionEnrollEnabled: boolean;
  tuitionEnrollWeight: number;   // 0..10
  leadTagEnabled: boolean;
  leadTagWeight: number;         // 0..10
  leadTags: string[];            // ['adjunct','instructor','lecturer']
  rmpEnabled: boolean;
  rmpWeight: number;             // 0..10 — prioritize low rating + high difficulty + low % take-again
}

export interface ColdScheduleConfig {
  dailyCap: number;
  perCampusCap: number;
  sendDays: number[];   // 1=Mon ... 5=Fri (0=Sun, 6=Sat)
  startDate: Date;
}

export interface RmpAggregate {
  ratedCount: number;
  avgRating: number | null;       // 0..5 (lower = worse prof)
  avgDifficulty: number | null;   // 0..5 (higher = harder)
  avgTakeAgain: number | null;    // 0..100 (lower = unpopular)
}

export interface RankedCampus {
  campus: Campus;
  score: number;
  tuitionEnroll: number; // tuition_out_state * total_enrollment
  importedLeads: number;
  rmp: RmpAggregate;
  rmpBadness: number;             // 0..1 — composite "tough/unpopular" score
}

/** 0..1 composite where 1 = worst-rated prof signal (low rating, high difficulty, low take-again). */
export function rmpBadnessScore(agg: RmpAggregate): number {
  if (agg.ratedCount === 0) return 0;
  const parts: number[] = [];
  if (agg.avgRating != null)     parts.push((5 - agg.avgRating) / 5);       // 0..1
  if (agg.avgDifficulty != null) parts.push(agg.avgDifficulty / 5);         // 0..1
  if (agg.avgTakeAgain != null)  parts.push((100 - agg.avgTakeAgain) / 100);// 0..1
  if (parts.length === 0) return 0;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/** Score a campus 0..1000ish, deterministic. */
export function scoreCampus(
  c: Campus,
  importedLeads: number,
  rmp: RmpAggregate,
  crit: ColdCriteria,
  maxTuitionEnroll: number,
): { score: number; tuitionEnroll: number; rmpBadness: number } {
  const tuition = c.tuition_out_state ?? c.tuition_in_state ?? 0;
  const enroll = c.total_enrollment ?? 0;
  const tuitionEnroll = tuition * enroll;
  const rmpBadness = rmpBadnessScore(rmp);

  let score = 0;
  if (crit.secEnabled && c.is_sec) score += crit.secWeight * 100;
  if (crit.tuitionEnrollEnabled && maxTuitionEnroll > 0) {
    score += (tuitionEnroll / maxTuitionEnroll) * crit.tuitionEnrollWeight * 100;
  }
  if (crit.leadTagEnabled && importedLeads > 0) {
    score += Math.min(importedLeads, 25) * crit.leadTagWeight * 2;
  }
  if (crit.rmpEnabled && rmp.ratedCount > 0) {
    score += rmpBadness * crit.rmpWeight * 100;
  }
  return { score, tuitionEnroll, rmpBadness };
}

export function rankCampuses(
  campuses: Campus[],
  importedLeadsByCampus: Record<string, number>,
  rmpByCampus: Record<string, RmpAggregate>,
  crit: ColdCriteria,
): RankedCampus[] {
  const active = campuses.filter((c) => !c.archived);
  const tuitionEnrollVals = active.map((c) => {
    const t = c.tuition_out_state ?? c.tuition_in_state ?? 0;
    const e = c.total_enrollment ?? 0;
    return t * e;
  });
  const maxTE = Math.max(1, ...tuitionEnrollVals);

  const rows = active.map((c) => {
    const importedLeads = importedLeadsByCampus[c.id] ?? 0;
    const rmp = rmpByCampus[c.id] ?? { ratedCount: 0, avgRating: null, avgDifficulty: null, avgTakeAgain: null };
    const { score, tuitionEnroll, rmpBadness } = scoreCampus(c, importedLeads, rmp, crit, maxTE);
    return { campus: c, score, tuitionEnroll, importedLeads, rmp, rmpBadness };
  });

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.tuitionEnroll !== a.tuitionEnroll) return b.tuitionEnroll - a.tuitionEnroll;
    return a.campus.school_name.localeCompare(b.campus.school_name);
  });
  return rows;
}

export interface ScheduleEntry {
  campusId: string;
  sendDate: Date;
  count: number; // emails scheduled for this campus on this date
}

/** Walk the ranked queue, packing emails into M–F days with daily/per-campus caps. */
export function buildSchedule(
  ranked: RankedCampus[],
  cfg: ColdScheduleConfig,
): { entries: ScheduleEntry[]; firstSendByCampus: Record<string, Date>; totalEmails: number; totalDays: number; finishDate: Date | null } {
  const entries: ScheduleEntry[] = [];
  const firstSendByCampus: Record<string, Date> = {};
  if (!ranked.length || cfg.dailyCap < 1 || cfg.perCampusCap < 1 || !cfg.sendDays.length) {
    return { entries, firstSendByCampus, totalEmails: 0, totalDays: 0, finishDate: null };
  }

  // For v1, assume each campus contributes exactly `perCampusCap` emails
  // (placeholder for actual lead counts not yet imported).
  let cursor = startOfDay(cfg.startDate);
  cursor = nextValidDay(cursor, cfg.sendDays);
  let dayTotal = 0;
  let finish: Date = cursor;
  let totalEmails = 0;

  for (const r of ranked) {
    const cap = cfg.perCampusCap;
    if (dayTotal + cap > cfg.dailyCap) {
      // advance to next valid day
      cursor = nextValidDay(addDays(cursor, 1), cfg.sendDays);
      dayTotal = 0;
    }
    entries.push({ campusId: r.campus.id, sendDate: new Date(cursor), count: cap });
    firstSendByCampus[r.campus.id] = new Date(cursor);
    dayTotal += cap;
    totalEmails += cap;
    finish = new Date(cursor);
    if (dayTotal >= cfg.dailyCap) {
      cursor = nextValidDay(addDays(cursor, 1), cfg.sendDays);
      dayTotal = 0;
    }
  }

  const totalDays = uniqueDays(entries).length;
  return { entries, firstSendByCampus, totalEmails, totalDays, finishDate: finish };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function nextValidDay(d: Date, sendDays: number[]): Date {
  let x = startOfDay(d);
  for (let i = 0; i < 14; i++) {
    if (sendDays.includes(x.getDay())) return x;
    x = addDays(x, 1);
  }
  return x;
}
function uniqueDays(entries: ScheduleEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.sendDate.toISOString().slice(0, 10))));
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
