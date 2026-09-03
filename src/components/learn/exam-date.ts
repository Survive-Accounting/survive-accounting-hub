// EXAM DATE (learn feed, 09-02) — one question, asked once, answered in the header's ticker.
//
// The student tells us when their exam is; we turn "41 min of cram left" into "41 min of cram
// left, 6 days out". Stored per exam number in localStorage only — there is no data home for it
// server-side yet (flagged for Lee: campus-level exam dates would be worth a table), so nothing
// here writes to the DB. Every read/write is guarded: a private window that throws just means the
// ticker never shows a countdown.

const key = (examNum: number) => `sa-exam-date-${examNum}`;

/** ISO date ("YYYY-MM-DD") or null. */
export function readExamDate(examNum: number): string | null {
  try {
    const v = localStorage.getItem(key(examNum));
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch { return null; }
}

/** Fired after every write so anything else showing the date (the plan's "in N days") re-reads. */
export const EXAM_DATE_EVENT = "sa-exam-date";
export function writeExamDate(examNum: number, iso: string | null): void {
  try {
    if (iso) localStorage.setItem(key(examNum), iso);
    else localStorage.removeItem(key(examNum));
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(EXAM_DATE_EVENT)); } catch { /* ignore */ }
}

/** Whole calendar days from today (local) to the date. Negative = already happened. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** "Exam 1 · today" / "· tomorrow" / "· 6 days out" / "· was 2 days ago". */
export function countdownLabel(examLabel: string, days: number): string {
  if (days === 0) return `${examLabel} · today`;
  if (days === 1) return `${examLabel} · tomorrow`;
  if (days > 1) return `${examLabel} · ${days} days out`;
  return `${examLabel} · was ${-days} day${days === -1 ? "" : "s"} ago`;
}
