// EXAM REMINDER (server) — "when's your exam? I'll text you before it."
//
// IT DOES NOT SEND ANYTHING. It queues one row into sms_outbox with a send_at days in the future,
// and the every-minute sms-process-outbox worker delivers it. That worker re-reads the
// conversation at SEND time and cancels the row unless it is still 'active', which is what makes
// a STOP received tomorrow stop a reminder queued today. Reimplementing delivery here would throw
// that property away.
//
// THE CONSENT RECORD. Automated SMS from a web form is regulated. exam_reminders stores the
// timestamp and the exact disclosure the student was shown, verbatim, and lives apart from every
// contact and marketing table so these numbers cannot be swept into outreach by a query nobody
// thought about.
//
// NIGHT-TIME. A reminder that arrives at 3am is worse than none, so send_at is pinned to late
// morning in the campus's own timezone. A campus with no timezone on file falls back to Central,
// which is where the business is and what the rest of the codebase already assumes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** The disclosure rendered under the form. Stored verbatim on every row — if this copy changes,
 *  existing rows keep the text their student actually agreed to. */
export const REMINDER_DISCLOSURE = "One text. Reply STOP anytime. Msg & data rates may apply.";

/** Campus-local hour the reminder goes out: late enough to wake nobody, early enough that "in 5
 *  days" still leaves the whole day to act on it. */
const SEND_HOUR_LOCAL = 10;
const FALLBACK_TZ = "America/Chicago";

const schema = z.object({
  phone: z.string().trim().min(7).max(32),
  examDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  offsetDays: z.number().int().min(1).max(14),
  campusId: z.string().uuid().nullable().optional(),
  courseCode: z.string().trim().max(40).nullable().optional(),
  ref: z.string().trim().max(120).nullable().optional(),
});

export type ExamReminderResult =
  | { ok: true; sendOnISO: string; immediate: boolean }
  | { ok: false; reason: "past" | "bad-phone" | "unavailable" };

/** The UTC instant of a local wall-clock hour on a date in `tz`. Asks Intl what a UTC guess looks
 *  like in that zone and corrects by the difference — DST-correct without a timezone library. */
function localHourToUtc(dateISO: string, hourLocal: number, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hourLocal, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const seen = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return new Date(guess + (guess - seen));
}

/** Whole days from today to the exam date, both read as calendar days. */
function daysUntil(dateISO: string, now: Date): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const exam = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((exam - today) / 86400000);
}

/** THE OFFSETS STILL IN THE FUTURE for an exam N days out. An exam on Friday cannot have a
 *  five-day warning on Wednesday, and offering one is offering a text that never arrives. */
export function allowedOffsets(daysOut: number): number[] {
  return [5, 4, 3, 2, 1].filter((n) => n <= Math.max(1, daysOut));
}

export const scheduleExamReminder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<ExamReminderResult> => {
    const now = new Date();
    const daysOut = daysUntil(data.examDate, now);
    if (daysOut < 0) return { ok: false, reason: "past" };

    const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");
    const phone = normalizePhoneE164(data.phone);
    if (!phone) return { ok: false, reason: "bad-phone" };

    // Clamp to something still ahead of us. An exam inside a day gets its text now rather than a
    // scheduled one it would never live to receive.
    const offsets = allowedOffsets(daysOut);
    const offset = offsets.includes(data.offsetDays) ? data.offsetDays : (offsets[0] ?? 1);
    const immediate = daysOut <= 1;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => Record<string, (...args: unknown[]) => unknown>;
    };

    let tz = FALLBACK_TZ;
    if (data.campusId) {
      const q = db.from("campuses") as unknown as { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { timezone?: string | null } | null }> } } };
      const { data: campus } = await q.select("timezone").eq("id", data.campusId).maybeSingle();
      if (campus?.timezone) tz = campus.timezone;
    }

    const [y, m, d] = data.examDate.split("-").map(Number);
    const sendDayISO = new Date(Date.UTC(y, m - 1, d - offset)).toISOString().slice(0, 10);
    const sendOn = immediate ? new Date(now.getTime() + 30000) : localHourToUtc(sendDayISO, SEND_HOUR_LOCAL, tz);

    const course = data.courseCode?.trim() || "accounting";
    const link = data.ref ? `surviveaccounting.com/?ref=${encodeURIComponent(data.ref)}` : "surviveaccounting.com";
    const body = immediate
      ? `Your ${course} exam is coming up. Everything on Exam 1 is free — ${link} — Lee`
      : `Your ${course} exam is in ${offset} ${offset === 1 ? "day" : "days"}. Everything on Exam 1 is free — ${link} — Lee`;

    const { enqueueReminder } = await import("@/lib/exam-reminder.server");
    return enqueueReminder({
      phone, body, sendOn, immediate,
      examDate: data.examDate, offset,
      campusId: data.campusId ?? null, courseCode: data.courseCode ?? null, ref: data.ref ?? null,
    });
  });
