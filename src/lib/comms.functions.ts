// COMMS SERVER FUNCTIONS — the public unsubscribe/preferences endpoints and the ADMIN surface
// (test harness, previews, broadcast, demand list). Admin fns take the caller's access token and
// check ADMIN_EMAILS the same way the rep queue does. Nothing here is reachable anonymously
// except the token-gated preference endpoints.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ALL_TEMPLATES, renderTemplate, SAMPLE_CTX, type TemplateCtx, type TemplateKey } from "@/lib/comms/templates";
import { INTAKE_KINDS, type IntakeKind } from "@/lib/comms/kinds";
import { ADMIN_EMAILS } from "@/lib/admin-emails";

type DB = { from: (t: string) => any; auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string | null } | null } }> } };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
async function adminEmail(db: DB, token: string): Promise<string | null> {
  try {
    const { data } = await db.auth.getUser(token);
    const e = (data?.user?.email ?? "").toLowerCase();
    return e && ADMIN_EMAILS.includes(e) ? e : null;
  } catch { return null; }
}
const TEMPLATE_KEYS = ALL_TEMPLATES.map((t) => t.key) as [TemplateKey, ...TemplateKey[]];

// ---- public: preferences / unsubscribe ---------------------------------------------------------
export const getPreferences = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; email?: string; unsubscribed?: boolean }> => {
    const db = await admin();
    const { data: c } = await db.from("comms_contacts").select("email").eq("token", data.token).maybeSingle();
    if (!c?.email) return { ok: false };
    const { isSuppressed } = await import("@/lib/comms/send.server");
    return { ok: true, email: c.email, unsubscribed: await isSuppressed(db, { email: c.email }) };
  });

export const setPreferences = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid(), unsubscribe: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    const { data: c } = await db.from("comms_contacts").select("email").eq("token", data.token).maybeSingle();
    if (!c?.email) return { ok: false };
    const { suppress } = await import("@/lib/comms/send.server");
    if (data.unsubscribe) await suppress(db, { email: c.email }, "unsubscribe", "link");
    else await db.from("comms_suppressions").delete().ilike("email", c.email);
    return { ok: true };
  });

// ---- admin: previews + test harness ------------------------------------------------------------
export const previewTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), key: z.enum(TEMPLATE_KEYS), ctx: z.record(z.string(), z.unknown()).optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    if (!(await adminEmail(db, data.accessToken))) return null;
    const ctx: TemplateCtx = { ...SAMPLE_CTX, ...(data.ctx as Partial<TemplateCtx> | undefined), isTest: true };
    return renderTemplate(data.key, ctx);
  });

/** "Send me one of each" / per-template re-send — everything goes to LEE, [TEST]-flagged. */
export const sendTestMessages = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    keys: z.array(z.enum(TEMPLATE_KEYS)).min(1),
    toEmail: z.string().email(),
    toPhone: z.string().min(7).optional().nullable(),
    ctx: z.record(z.string(), z.unknown()).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ results: { key: TemplateKey; email?: string; sms?: string }[] } | null> => {
    const db = await admin();
    if (!(await adminEmail(db, data.accessToken))) return null;
    const comms = await import("@/lib/comms/send.server");
    const ctx: TemplateCtx = { ...SAMPLE_CTX, ...(data.ctx as Partial<TemplateCtx> | undefined), isTest: true, email: data.toEmail, phone: data.toPhone ?? SAMPLE_CTX.phone };
    const results: { key: TemplateKey; email?: string; sms?: string }[] = [];
    for (const key of data.keys) {
      const meta = ALL_TEMPLATES.find((t) => t.key === key)!;
      const r: { key: TemplateKey; email?: string; sms?: string } = { key };
      if (key === "founder_priority") {
        const f = await comms.founderAlert({ db, ctx, isTest: true, toEmail: data.toEmail, toPhone: data.toPhone ?? undefined });
        r.email = f.email.status + (f.email.reason ? ` (${f.email.reason})` : ""); r.sms = f.sms.status + (f.sms.reason ? ` (${f.sms.reason})` : "");
      } else {
        if (!meta.smsOnly) { const e = await comms.sendTemplateEmail({ db, key, ctx, to: data.toEmail, isTest: true }); r.email = e.status + (e.reason ? ` (${e.reason})` : ""); }
        if (meta.hasSms && data.toPhone) { const s = await comms.sendTemplateSms({ db, key, ctx, to: data.toPhone, isTest: true, consented: true }); r.sms = s.status + (s.reason ? ` (${s.reason})` : ""); }
      }
      results.push(r);
    }
    return { results };
  });

// ---- admin: demand list (the mounted WaitlistCard's data) ---------------------------------------
export interface DemandRow {
  id: string; kind: IntakeKind | null; channel: string | null; name: string | null; email: string | null; phone: string | null;
  campus_text: string | null; course_code: string | null; professor: string | null; exam: number | null; topic: string | null;
  chapter: string | null; note: string | null; file_paths: string[] | null; is_test: boolean; contacted_at: string | null; created_at: string;
}
export const listDemand = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), kind: z.enum(INTAKE_KINDS).optional().nullable(), includeTest: z.boolean().optional(), limit: z.number().int().min(1).max(500).optional() }).parse(d))
  .handler(async ({ data }): Promise<DemandRow[] | null> => {
    const db = await admin();
    if (!(await adminEmail(db, data.accessToken))) return null;
    let q = db.from("campus_waitlist").select("id,kind,channel,name,email,phone,campus_text,course_code,professor,exam,topic,chapter,note,file_paths,is_test,contacted_at,created_at").order("created_at", { ascending: false }).limit(data.limit ?? 200);
    if (data.kind) q = q.eq("kind", data.kind);
    if (!data.includeTest) q = q.eq("is_test", false);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows as DemandRow[];
  });

export const setContacted = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), id: z.string().uuid(), contacted: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    if (!(await adminEmail(db, data.accessToken))) return { ok: false };
    const { error } = await db.from("campus_waitlist").update({ contacted_at: data.contacted ? new Date().toISOString() : null }).eq("id", data.id);
    return { ok: !error };
  });

// ---- admin: broadcast ------------------------------------------------------------------------------
/** Who would get "Exam N videos are live": notify_exam leads for that exam (or exam-less notify
 *  leads when `includeUnspecified`), de-duped by email, minus suppressed, minus already-sent. */
async function broadcastAudience(db: DB, exam: number, topic: string | null, includeUnspecified: boolean) {
  const dedupe = `broadcast:exam${exam}${topic ? `:${topic}` : ""}`;
  let q = db.from("campus_waitlist").select("id,email,name,campus_id,campus_text,course_code,exam,topic").eq("kind", "notify_exam").eq("is_test", false).not("email", "is", null);
  q = includeUnspecified ? q.or(`exam.eq.${exam},exam.is.null`) : q.eq("exam", exam);
  const { data: rows } = await q;
  const { isSuppressed, alreadySent } = await import("@/lib/comms/send.server");
  const seen = new Set<string>();
  const out: { id: string; email: string; name: string | null; campus_id: string | null; campus_text: string | null; course_code: string | null }[] = [];
  let suppressed = 0, already = 0, dupes = 0;
  for (const r of (rows ?? []) as { id: string; email: string; name: string | null; campus_id: string | null; campus_text: string | null; course_code: string | null }[]) {
    const e = r.email.toLowerCase();
    if (seen.has(e)) { dupes++; continue; }
    seen.add(e);
    if (await isSuppressed(db, { email: e })) { suppressed++; continue; }
    if (await alreadySent(db, r.id, dedupe)) { already++; continue; }
    out.push(r);
  }
  return { audience: out, suppressed, already, dupes, dedupe };
}

export const previewBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), exam: z.number().int().min(1).max(99), topic: z.string().trim().max(120).optional().nullable(), includeUnspecified: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    if (!(await adminEmail(db, data.accessToken))) return null;
    const a = await broadcastAudience(db, data.exam, data.topic ?? null, !!data.includeUnspecified);
    const sample = renderTemplate("broadcast_exam_live", { ...SAMPLE_CTX, exam: data.exam, topic: data.topic ?? null, isTest: false });
    return { count: a.audience.length, suppressed: a.suppressed, alreadySent: a.already, duplicates: a.dupes, sample: { subject: sample.subject, html: sample.html, text: sample.text }, campuses: [...new Set(a.audience.map((r) => r.campus_text).filter(Boolean))].slice(0, 20) };
  });

export const sendBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), exam: z.number().int().min(1).max(99), topic: z.string().trim().max(120).optional().nullable(), includeUnspecified: z.boolean().optional(), confirmCount: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; sent: number; skipped: number; error?: string } | null> => {
    const db = await admin();
    const who = await adminEmail(db, data.accessToken);
    if (!who) return null;
    const a = await broadcastAudience(db, data.exam, data.topic ?? null, !!data.includeUnspecified);
    // The count the admin confirmed must still be the count — a new signup between preview and send is fine, a different number isn't.
    if (a.audience.length !== data.confirmCount) return { ok: false, sent: 0, skipped: 0, error: `Audience changed (${a.audience.length} now vs ${data.confirmCount} confirmed). Preview again.` };
    const comms = await import("@/lib/comms/send.server");
    const { data: b } = await db.from("comms_broadcasts").insert({ exam: data.exam, topic: data.topic ?? null, subject: renderTemplate("broadcast_exam_live", { exam: data.exam, topic: data.topic ?? null }).subject, recipient_count: a.audience.length, created_by: who }).select("id").single();
    let sent = 0, skipped = 0;
    // Campus slug per lead for the right link — resolved once per campus.
    const slugByCampus = new Map<string, string | null>();
    for (const r of a.audience) {
      let slug: string | null = null;
      if (r.campus_id) {
        if (!slugByCampus.has(r.campus_id)) { const { data: c } = await db.from("campuses").select("slug").eq("id", r.campus_id).maybeSingle(); slugByCampus.set(r.campus_id, c?.slug ?? null); }
        slug = slugByCampus.get(r.campus_id) ?? null;
      }
      const res = await comms.sendTemplateEmail({ db, key: "broadcast_exam_live", ctx: { name: r.name, email: r.email, school: r.campus_text, campusSlug: slug, courseCode: r.course_code, exam: data.exam, topic: data.topic ?? null }, to: r.email, leadId: r.id, dedupeKey: a.dedupe });
      if (res.ok) sent++; else skipped++;
    }
    if (b?.id) await db.from("comms_broadcasts").update({ sent_count: sent }).eq("id", b.id);
    return { ok: true, sent, skipped };
  });

// ---- admin: run the sequences now (same code the daily cron runs) -----------------------------------
export const runSequencesNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), dryRun: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    if (!(await adminEmail(db, data.accessToken))) return null;
    const { runSequences } = await import("@/lib/comms/sequences.server");
    return runSequences({ dryRun: !!data.dryRun });
  });
