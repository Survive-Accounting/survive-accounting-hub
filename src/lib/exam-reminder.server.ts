// EXAM REMINDER — the database half. Split from the server FN so the Supabase juggling lives in
// one place and the function above stays readable.
//
// The whole job: find (or open) the student's conversation on the main line, queue ONE message
// with a future send_at, and write the consent record that entitles us to send it. Delivery,
// retries and opt-out are the outbox worker's business, not ours.
import { REMINDER_DISCLOSURE, type ExamReminderResult } from "./exam-reminder.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export async function enqueueReminder(a: {
  phone: string;
  body: string;
  sendOn: Date;
  immediate: boolean;
  examDate: string;
  offset: number;
  campusId: string | null;
  courseCode: string | null;
  ref: string | null;
}): Promise<ExamReminderResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as Db;

  // The conversation on the main line is what threads replies to Lee AND what the outbox worker
  // re-checks for opt-out before sending. No main line ⇒ nothing can be queued, and we say so
  // rather than taking a number for a text that will never go out.
  const { data: main } = await db.from("campus_phone_numbers").select("phone_e164").is("campus_id", null).limit(1).maybeSingle();
  const mainLine: string | undefined = main?.phone_e164;
  if (!mainLine) return { ok: false, reason: "unavailable" };

  let convo = (await db.from("sms_conversations").select("id,status").eq("student_phone", a.phone).eq("campus_number", mainLine).maybeSingle()).data;
  if (!convo) {
    convo = (await db.from("sms_conversations").insert({ student_phone: a.phone, campus_number: mainLine, status: "active" }).select("id,status").single()).data;
  }
  // Already opted out: honour it silently rather than resurrecting them with a fresh consent row.
  if (!convo?.id || convo.status === "opted_out") return { ok: false, reason: "unavailable" };

  // SAME PHONE, SAME EXAM ⇒ MOVE THE EXISTING TEXT. Cancel what was queued before writing the
  // replacement, so a student who resubmits with a corrected date gets one message, not two.
  const { data: prior } = await db.from("exam_reminders").select("id,outbox_id").eq("phone_e164", a.phone).eq("exam_date", a.examDate).maybeSingle();
  if (prior?.outbox_id) {
    await db.from("sms_outbox").update({ status: "canceled" }).eq("id", prior.outbox_id).eq("status", "queued");
  }

  const { data: queued, error: qErr } = await db.from("sms_outbox")
    .insert({ conversation_id: convo.id, body: a.body, author: "auto", send_at: a.sendOn.toISOString(), status: "queued" })
    .select("id").single();
  if (qErr || !queued?.id) return { ok: false, reason: "unavailable" };

  const { error: upErr } = await db.from("exam_reminders").upsert({
    phone_e164: a.phone,
    exam_date: a.examDate,
    offset_days: a.offset,
    campus_id: a.campusId,
    course_code: a.courseCode,
    ref: a.ref,
    consent_at: new Date().toISOString(),
    consent_text: REMINDER_DISCLOSURE,
    outbox_id: queued.id,
    status: "scheduled",
    updated_at: new Date().toISOString(),
  }, { onConflict: "phone_e164,exam_date" });

  if (upErr) {
    // The consent record IS the entitlement. Without it we must not keep a queued message —
    // better to fail loudly than to hold a text we cannot prove we were allowed to send.
    await db.from("sms_outbox").update({ status: "canceled" }).eq("id", queued.id);
    throw new Error(upErr.message);
  }
  return { ok: true, sendOnISO: a.sendOn.toISOString(), immediate: a.immediate };
}
