// COMMS SEND LAYER (server-only — import DYNAMICALLY from *.functions.ts handlers). The ONE
// place anything leaves for a student or for Lee: suppression is checked here, the marketing
// frequency cap is enforced here, every send is logged here, [TEST] is applied here.
//
// Email  → Resend (src/lib/email.server.ts), from Lee on mail.surviveaccounting.com.
// SMS    → sms_outbox on the campus main line (drained every minute by sms-process-outbox), so
//          STOP handling + the conversation thread Lee already replies in keep working. Falls
//          back to a direct Twilio send when no main line is provisioned.
// Founder→ email to FOUNDER_ALERT_EMAIL (default lee@survivestudios.com) + SMS to
//          FOUNDER_ALERT_PHONE (falls back to LEE_PERSONAL_PHONE), rate-limited 30/hour with the
//          held count reported on the next message that gets through.
import { categoryOf, ORIGIN, renderTemplate, type TemplateCtx, type TemplateKey } from "@/lib/comms/templates";

type DB = { from: (t: string) => any };
const adminDb = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export const FOUNDER_EMAIL = process.env.FOUNDER_ALERT_EMAIL || "lee@survivestudios.com";
export const FOUNDER_PHONE = (process.env.FOUNDER_ALERT_PHONE || process.env.LEE_PERSONAL_PHONE || "").replace(/[^+\d]/g, "");
const MARKETING_CAP = 2;          // emails per rolling 7 days (transactional excluded)
const FOUNDER_RATE = 30;          // alerts per rolling hour

export type SendOutcome = { ok: boolean; status: "sent" | "queued" | "skipped" | "held" | "failed"; reason?: string; id?: string };

// ---- suppression + contacts -----------------------------------------------------------------
export async function isSuppressed(db: DB, who: { email?: string | null; phone?: string | null }): Promise<boolean> {
  try {
    if (who.email) {
      const { data } = await db.from("comms_suppressions").select("id").ilike("email", who.email.trim()).limit(1);
      if (data?.length) return true;
    }
    if (who.phone) {
      const { data } = await db.from("comms_suppressions").select("id").eq("phone", who.phone).limit(1);
      if (data?.length) return true;
    }
  } catch { /* table not applied yet — never block a send on a missing suppression table */ }
  return false;
}

export async function suppress(db: DB, who: { email?: string | null; phone?: string | null }, reason: string, source: string): Promise<void> {
  const row: Record<string, unknown> = { reason, source };
  if (who.email) row.email = who.email.trim().toLowerCase();
  if (who.phone) row.phone = who.phone;
  if (!row.email && !row.phone) return;
  await db.from("comms_suppressions").upsert(row, { onConflict: row.email ? "email" : "phone", ignoreDuplicates: true }).then(() => undefined, () => undefined);
}

/** The per-email unsubscribe/preferences token (CAN-SPAM link). Created on first use. */
export async function contactLinks(db: DB, email: string | null | undefined): Promise<{ unsubscribeLink: string; preferencesLink: string }> {
  const fallback = { unsubscribeLink: `${ORIGIN}/u`, preferencesLink: `${ORIGIN}/u` };
  if (!email) return fallback;
  try {
    const e = email.trim().toLowerCase();
    let { data } = await db.from("comms_contacts").select("token").eq("email", e).maybeSingle();
    if (!data) { const ins = await db.from("comms_contacts").insert({ email: e }).select("token").single(); data = ins.data; }
    if (!data?.token) return fallback;
    return { unsubscribeLink: `${ORIGIN}/u/${data.token}?unsubscribe=1`, preferencesLink: `${ORIGIN}/u/${data.token}` };
  } catch { return fallback; }
}

// ---- send log + caps ------------------------------------------------------------------------
async function logSend(db: DB, row: {
  lead_id?: string | null; to_email?: string | null; to_phone?: string | null; medium: "email" | "sms";
  template: string; category: string; subject?: string | null; dedupe_key?: string | null; is_test: boolean;
  status: string; error?: string | null; provider_id?: string | null;
}): Promise<void> {
  await db.from("comms_sends").insert(row).then(() => undefined, (e: unknown) => console.warn("comms_sends log failed", e));
}

async function marketingCapReached(db: DB, email: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const { count } = await db.from("comms_sends").select("id", { count: "exact", head: true })
      .ilike("to_email", email).eq("category", "marketing").eq("medium", "email").eq("status", "sent").eq("is_test", false).gte("sent_at", since);
    return (count ?? 0) >= MARKETING_CAP;
  } catch { return false; }
}

/** Already sent this dedupe key to this lead? (sequence steps, broadcasts) */
export async function alreadySent(db: DB, leadId: string, dedupeKey: string): Promise<boolean> {
  try {
    const { data } = await db.from("comms_sends").select("id").eq("lead_id", leadId).eq("dedupe_key", dedupeKey).eq("is_test", false).limit(1);
    return !!data?.length;
  } catch { return false; }
}

// ---- email ----------------------------------------------------------------------------------
export async function sendTemplateEmail(opts: {
  db?: DB; key: TemplateKey; ctx: TemplateCtx; to: string; leadId?: string | null; dedupeKey?: string | null; isTest?: boolean;
  /** Test sends skip suppression + the cap (they go to Lee). */
}): Promise<SendOutcome> {
  const db = opts.db ?? (await adminDb());
  const to = opts.to.trim();
  const category = categoryOf(opts.key);
  const isTest = !!opts.isTest;
  const base = { lead_id: opts.leadId ?? null, to_email: to, medium: "email" as const, template: opts.key, category, dedupe_key: opts.dedupeKey ?? null, is_test: isTest };
  if (!isTest && category !== "founder" && (await isSuppressed(db, { email: to }))) {
    await logSend(db, { ...base, status: "skipped", error: "suppressed" });
    return { ok: false, status: "skipped", reason: "suppressed" };
  }
  if (!isTest && category === "marketing" && (await marketingCapReached(db, to))) {
    await logSend(db, { ...base, status: "skipped", error: "frequency_cap" });
    return { ok: false, status: "skipped", reason: "frequency_cap" };
  }
  if (!isTest && opts.leadId && opts.dedupeKey && (await alreadySent(db, opts.leadId, opts.dedupeKey))) {
    return { ok: false, status: "skipped", reason: "already_sent" };
  }
  const links = category === "founder" ? {} : await contactLinks(db, to);
  const r = renderTemplate(opts.key, { ...opts.ctx, ...links, isTest });
  const { sendResendEmail } = await import("@/lib/email.server");
  const res = await sendResendEmail({ to, subject: r.subject, text: r.text, html: r.html });
  await logSend(db, { ...base, subject: r.subject, status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error ?? "send failed", provider_id: res.id ?? null });
  return res.ok ? { ok: true, status: "sent", id: res.id } : { ok: false, status: "failed", reason: res.error };
}

// ---- SMS -----------------------------------------------------------------------------------
/** Queue a student SMS on the campus main line's conversation (so replies thread to Lee and
 *  STOP cancels anything queued). Direct Twilio fallback when no main line exists. */
export async function sendTemplateSms(opts: {
  db?: DB; key: TemplateKey; ctx: TemplateCtx; to: string; leadId?: string | null; dedupeKey?: string | null; isTest?: boolean; consented?: boolean;
}): Promise<SendOutcome> {
  const db = opts.db ?? (await adminDb());
  const { normalizePhoneE164, sendSms } = await import("@/lib/greek-chapters.functions");
  const dest = normalizePhoneE164(opts.to);
  const category = categoryOf(opts.key);
  const isTest = !!opts.isTest;
  const base = { lead_id: opts.leadId ?? null, to_phone: dest ?? opts.to, medium: "sms" as const, template: opts.key, category, dedupe_key: opts.dedupeKey ?? null, is_test: isTest };
  if (!dest) { await logSend(db, { ...base, status: "failed", error: "bad-phone" }); return { ok: false, status: "failed", reason: "bad-phone" }; }
  // A2P: no consent timestamp on the row ⇒ no student SMS, full stop. (Founder/test exempt.)
  if (!isTest && category !== "founder" && !opts.consented) { await logSend(db, { ...base, status: "skipped", error: "no_consent" }); return { ok: false, status: "skipped", reason: "no_consent" }; }
  if (!isTest && category !== "founder" && (await isSuppressed(db, { phone: dest }))) { await logSend(db, { ...base, status: "skipped", error: "suppressed" }); return { ok: false, status: "skipped", reason: "suppressed" }; }
  if (!isTest && opts.leadId && opts.dedupeKey && (await alreadySent(db, opts.leadId, `${opts.dedupeKey}:sms`))) return { ok: false, status: "skipped", reason: "already_sent" };
  const r = renderTemplate(opts.key, { ...opts.ctx, isTest });
  const body = r.sms;
  if (!body) return { ok: false, status: "skipped", reason: "no_sms_variant" };
  // Prefer the outbox on the main line (threaded, STOP-aware, minute cron).
  try {
    const { data: main } = await db.from("campus_phone_numbers").select("phone_e164").is("campus_id", null).limit(1).maybeSingle();
    const mainLine = main?.phone_e164 as string | undefined;
    if (mainLine && category !== "founder") {
      let { data: convo } = await db.from("sms_conversations").select("id,status").eq("student_phone", dest).eq("campus_number", mainLine).maybeSingle();
      if (convo?.status === "opted_out" && !isTest) { await logSend(db, { ...base, status: "skipped", error: "opted_out" }); return { ok: false, status: "skipped", reason: "opted_out" }; }
      if (!convo) { const ins = await db.from("sms_conversations").insert({ student_phone: dest, campus_number: mainLine, status: "active", is_tester: isTest }).select("id,status").single(); convo = ins.data; }
      if (convo?.id) {
        const { error } = await db.from("sms_outbox").insert({ conversation_id: convo.id, body, author: "auto", send_at: new Date().toISOString(), status: "queued" });
        if (!error) { await logSend(db, { ...base, subject: body.slice(0, 80), dedupe_key: opts.dedupeKey ? `${opts.dedupeKey}:sms` : null, status: "queued" }); return { ok: true, status: "queued" }; }
      }
    }
  } catch { /* fall through to direct send */ }
  const res = await sendSms(dest, body);
  await logSend(db, { ...base, subject: body.slice(0, 80), dedupe_key: opts.dedupeKey ? `${opts.dedupeKey}:sms` : null, status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error ?? "twilio" });
  return res.ok ? { ok: true, status: "sent" } : { ok: false, status: "failed", reason: res.error };
}

// ---- founder alerts -------------------------------------------------------------------------
/** Priority alert to Lee — email + SMS, one consolidated format, 30/hour with held-count. */
export async function founderAlert(opts: { db?: DB; ctx: TemplateCtx; leadId?: string | null; isTest?: boolean; toEmail?: string; toPhone?: string }): Promise<{ email: SendOutcome; sms: SendOutcome; held: number }> {
  const db = opts.db ?? (await adminDb());
  const isTest = !!opts.isTest;
  const toEmail = opts.toEmail ?? FOUNDER_EMAIL;
  const toPhone = opts.toPhone ?? FOUNDER_PHONE;
  // Rate limit (real alerts only): count sent founder alerts in the last hour.
  let held = 0;
  if (!isTest) {
    try {
      const hourAgo = new Date(Date.now() - 3600e3).toISOString();
      const { count: sentCount } = await db.from("comms_sends").select("id", { count: "exact", head: true }).eq("category", "founder").eq("medium", "email").eq("status", "sent").eq("is_test", false).gte("sent_at", hourAgo);
      if ((sentCount ?? 0) >= FOUNDER_RATE) {
        await logSend(db, { lead_id: opts.leadId ?? null, to_email: toEmail, medium: "email", template: "founder_priority", category: "founder", is_test: false, status: "held", error: "rate_limit" });
        return { email: { ok: false, status: "held", reason: "rate_limit" }, sms: { ok: false, status: "held", reason: "rate_limit" }, held: 0 };
      }
      // Held since the last alert that went out → reported on this one.
      const { data: last } = await db.from("comms_sends").select("sent_at").eq("category", "founder").eq("medium", "email").eq("status", "sent").eq("is_test", false).order("sent_at", { ascending: false }).limit(1).maybeSingle();
      const { count: heldCount } = await db.from("comms_sends").select("id", { count: "exact", head: true }).eq("category", "founder").eq("status", "held").eq("is_test", false).gte("sent_at", last?.sent_at ?? "1970-01-01");
      held = heldCount ?? 0;
    } catch { /* counts are best-effort */ }
  }
  const ctx: TemplateCtx = { ...opts.ctx, heldCount: held, isTest };
  const email = await sendTemplateEmail({ db, key: "founder_priority", ctx, to: toEmail, leadId: opts.leadId ?? null, isTest });
  let sms: SendOutcome = { ok: false, status: "skipped", reason: "no_founder_phone" };
  if (toPhone) {
    const { sendSms } = await import("@/lib/greek-chapters.functions");
    const r = renderTemplate("founder_priority", ctx);
    const res = await sendSms(toPhone, r.sms ?? r.subject);
    await logSend(db, { lead_id: opts.leadId ?? null, to_phone: toPhone, medium: "sms", template: "founder_priority", category: "founder", subject: (r.sms ?? r.subject).slice(0, 80), is_test: isTest, status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error ?? "twilio" });
    sms = res.ok ? { ok: true, status: "sent" } : { ok: false, status: "failed", reason: res.error };
  }
  return { email, sms, held };
}
