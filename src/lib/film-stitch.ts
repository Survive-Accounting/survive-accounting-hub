// FILM STITCHES — the pure half: pay per filmed slide, the stats periods, the ledger, trims, the post queue.
// Lee, 2026-09-15: "I want to pretend I'm a tutor that Survive hired and is tracking how much I'm being paid.
// Every video I stitch, let's create a tally for my 'pay' … a log of each video, # of slides, pay amount, with a
// total at bottom … videos completed today, this week, this month, all time."
// The table is migration/supabase-migrations/20260915_1900_film_stitches.sql; lib/film-stitch.functions.ts
// reads and writes it.

/** $5 a filmed slide (Lee: "Every slide a tutor makes, let's say it's $5?"). */
export const PAY_PER_SLIDE_CENTS = 500;

export const MISSING_FILM_STITCHES_HINT = "run migration/supabase-migrations/20260915_1900_film_stitches.sql";

export type StitchStatus = "stitched" | "queued" | "posted";

export interface StitchRecord {
  id: string;
  setId: string;
  takeIndex: number;
  name: string;
  topicKey: string | null;
  setKey: string | null;
  setName: string | null;
  topicName: string | null;
  slides: number;
  rateCents: number;
  payCents: number;
  fingerprint: string;
  sourceUrl: string;
  durationS: number | null;
  trimStartS: number;
  trimEndS: number | null;
  fileUrl: string;
  outroTrimS: number;
  socialUrl: string | null;
  endCta: "try" | "unlock" | null;
  status: StitchStatus;
  queuePos: number | null;
  queuedAt: string | null;
  postedAt: string | null;
  postedLink: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The key a video goes by, in the queue and the popout. */
export const videoKey = (setId: string, takeIndex: number): string => `${setId}#${takeIndex}`;

/** WHICH TAKES MADE THE VIDEO. The same kept takes → the same video (watch it again, no new stitch). */
export function takesFingerprint(picks: readonly { take: { file: string }; from: number; to: number }[]): string {
  return picks.map((p) => `${p.from}-${p.to}:${p.take.file}`).join("|");
}

export const payFor = (slides: number, rateCents = PAY_PER_SLIDE_CENTS): number => Math.max(0, Math.round(slides)) * rateCents;

export function money(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export type Period = "today" | "week" | "month" | "all";
export const PERIODS: readonly Period[] = ["today", "week", "month", "all"];
export const PERIOD_LABEL: Record<Period, string> = { today: "Today", week: "This week", month: "This month", all: "All time" };

/** Where a period starts, in the viewer's local time: midnight · Monday · the 1st · (all time) null. */
export function periodStart(p: Period, now: Date = new Date()): Date | null {
  if (p === "all") return null;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (p === "month") d.setDate(1);
  return d;
}

/** A video counts in the period it was FIRST stitched (a re-stitch doesn't pay it twice). */
export function inPeriod(r: Pick<StitchRecord, "createdAt">, p: Period, now: Date = new Date()): boolean {
  const start = periodStart(p, now);
  return !start || new Date(r.createdAt).getTime() >= start.getTime();
}

export function statsFor(records: readonly StitchRecord[], p: Period, now: Date = new Date()): { videos: number; slides: number; payCents: number } {
  const hit = records.filter((r) => inPeriod(r, p, now));
  return { videos: hit.length, slides: hit.reduce((n, r) => n + r.slides, 0), payCents: hit.reduce((n, r) => n + r.payCents, 0) };
}

/** THE LEDGER: oldest first, each row with its running total. */
export function ledgerRows(records: readonly StitchRecord[]): (StitchRecord & { runningCents: number })[] {
  let run = 0;
  return [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => ({ ...r, runningCents: (run += r.payCents) }));
}

/** THE POST QUEUE, in the order he sent them. */
export function queueOf(records: readonly StitchRecord[]): StitchRecord[] {
  return records.filter((r) => r.status === "queued").sort((a, b) => (a.queuePos ?? 0) - (b.queuePos ?? 0) || (a.queuedAt ?? "").localeCompare(b.queuedAt ?? ""));
}
export const nextQueuePos = (records: readonly StitchRecord[]): number => records.reduce((m, r) => (r.queuePos != null && r.queuePos > m ? r.queuePos : m), 0) + 1;

/** A trim kept honest: in the file, at least half a second of video left. */
export const MIN_KEEP_S = 0.5;
export function clampTrim(startS: number, endS: number, durationS: number): { startS: number; endS: number } {
  const dur = Math.max(0, durationS);
  let s = Math.min(Math.max(0, startS), Math.max(0, dur - MIN_KEEP_S));
  let e = Math.max(Math.min(dur, endS), s + MIN_KEEP_S);
  if (e > dur) { e = dur; s = Math.max(0, Math.min(s, e - MIN_KEEP_S)); }
  return { startS: round2(s), endS: round2(e) };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Is anything trimmed off the site video? */
export const isTrimmed = (r: Pick<StitchRecord, "trimStartS" | "trimEndS" | "durationS">): boolean =>
  r.trimStartS > 0.01 || (r.trimEndS != null && r.durationS != null && r.trimEndS < r.durationS - 0.01);

export function clock(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "–:––";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}

/** The file name a download gets. */
export function downloadName(name: string, social: boolean): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "video"}${social ? "-social" : ""}.mp4`;
}
