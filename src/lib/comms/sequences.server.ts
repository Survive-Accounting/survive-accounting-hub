// FOLLOW-UP SEQUENCES (spec §4) — run DAILY by /api/cron/comms-sequences (and on demand from the
// admin harness). Sparse by design: each message is useful alone. Order = priority:
//   A  exam-date triggered (T-10 email, T-3 email, T-1 SMS)      ← wins the frequency cap
//   B  post-Exam-1 (+1d "How'd it go?", +7d "Exam 2 is up" if no purchase)
//   C  meet Lee (+2d after first signup, everyone)
//   D  dormant → falls into A when an exam date exists; otherwise NOTHING (no "we miss you").
// The 2-emails-per-7-days cap and suppression are enforced inside sendTemplateEmail; the
// per-step dedupe key guarantees each step goes to a lead at most once. Test rows never qualify.
import { PAID_EXAM_PRICE } from "@/lib/comms/pricing";
import type { TemplateCtx } from "@/lib/comms/templates";

type DB = { from: (t: string) => any; auth: { admin: { listUsers: (o: { page: number; perPage: number }) => Promise<{ data: { users: { id: string; email?: string | null }[] } }> } } };

interface Lead { id: string; email: string; name: string | null; campus_id: string | null; campus_text: string | null; course_code: string | null; phone: string | null; consent_sms_at: string | null; created_at: string; kind: string | null }
export interface SequenceReport { ran_at: string; dryRun: boolean; examT10: number; examT3: number; examT1: number; postD1: number; postD7: number; meetLee: number; skipped: number; notes: string[] }

const day = 864e5;
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / day);

export async function runSequences(opts: { dryRun?: boolean; now?: Date } = {}): Promise<SequenceReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as DB;
  const comms = await import("@/lib/comms/send.server");
  const now = opts.now ?? new Date();
  const dry = !!opts.dryRun;
  const rep: SequenceReport = { ran_at: now.toISOString(), dryRun: dry, examT10: 0, examT3: 0, examT1: 0, postD1: 0, postD7: 0, meetLee: 0, skipped: 0, notes: [] };

  // One lead per email — the EARLIEST row is "first signup" (meet-Lee timing); the latest campus
  // context wins for links. Phone + consent come from any row that has them.
  const { data: rows, error } = await db.from("campus_waitlist")
    .select("id,email,name,campus_id,campus_text,course_code,phone,consent_sms_at,created_at,kind")
    .eq("is_test", false).not("email", "is", null).order("created_at", { ascending: true });
  if (error) { rep.notes.push(`load failed: ${error.message}`); return rep; }
  const byEmail = new Map<string, Lead>();
  for (const r of (rows ?? []) as Lead[]) {
    const e = r.email.toLowerCase();
    const cur = byEmail.get(e);
    if (!cur) byEmail.set(e, { ...r, email: e });
    else byEmail.set(e, { ...cur, campus_id: r.campus_id ?? cur.campus_id, campus_text: r.campus_text ?? cur.campus_text, course_code: r.course_code ?? cur.course_code, name: cur.name ?? r.name, phone: cur.phone ?? r.phone, consent_sms_at: cur.consent_sms_at ?? r.consent_sms_at });
  }
  const leads = [...byEmail.values()];
  const slugCache = new Map<string, string | null>();
  const slugOf = async (campusId: string | null) => {
    if (!campusId) return null;
    if (!slugCache.has(campusId)) { const { data: c } = await db.from("campuses").select("slug").eq("id", campusId).maybeSingle(); slugCache.set(campusId, c?.slug ?? null); }
    return slugCache.get(campusId) ?? null;
  };
  const ctxFor = async (l: Lead, extra: Partial<TemplateCtx> = {}): Promise<TemplateCtx> => ({ name: l.name, email: l.email, phone: l.phone, school: l.campus_text, campusSlug: await slugOf(l.campus_id), courseCode: l.course_code, price: PAID_EXAM_PRICE, ...extra });
  const email = async (l: Lead, key: "seq_exam_t10" | "seq_exam_t3" | "seq_post_exam1_d1" | "seq_post_exam1_d7" | "seq_meet_lee", dedupe: string, extra: Partial<TemplateCtx> = {}) => {
    if (dry) return true;
    const r = await comms.sendTemplateEmail({ db: db as never, key, ctx: await ctxFor(l, extra), to: l.email, leadId: l.id, dedupeKey: dedupe });
    if (!r.ok) rep.skipped++;
    return r.ok;
  };

  // ---- A: exam-date triggered ----------------------------------------------------------------
  try {
    const { data: dates } = await db.from("campus_exam_dates").select("id,campus_id,course_code,exam,exam_date");
    for (const d of (dates ?? []) as { id: string; campus_id: string; course_code: string | null; exam: number; exam_date: string }[]) {
      const daysOut = daysBetween(new Date(`${d.exam_date}T12:00:00Z`), now);
      if (daysOut < 1 || daysOut > 10) continue;
      const matches = leads.filter((l) => l.campus_id === d.campus_id && (!d.course_code || !l.course_code || l.course_code.replace(/\s/g, "").toLowerCase() === d.course_code.replace(/\s/g, "").toLowerCase()));
      for (const l of matches) {
        const extra = { exam: d.exam, examDate: d.exam_date, daysOut };
        if (daysOut >= 8 && (await email(l, "seq_exam_t10", `seq_exam_t10:${d.id}`, extra))) rep.examT10++;
        else if (daysOut >= 2 && daysOut <= 3 && (await email(l, "seq_exam_t3", `seq_exam_t3:${d.id}`, extra))) rep.examT3++;
        else if (daysOut === 1 && l.phone && l.consent_sms_at) {
          if (dry) { rep.examT1++; continue; }
          const r = await comms.sendTemplateSms({ db: db as never, key: "seq_exam_t1", ctx: await ctxFor(l, extra), to: l.phone, leadId: l.id, dedupeKey: `seq_exam_t1:${d.id}`, consented: true });
          if (r.ok) rep.examT1++; else rep.skipped++;
        }
      }
    }
  } catch (e) { rep.notes.push(`A: ${(e as Error).message}`); }

  // ---- B: post-Exam-1 (threshold: 3+ sets complete, via the auth user behind the email) --------
  try {
    const userByEmail = new Map<string, string>();
    for (let page = 1; page <= 20; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      for (const u of data?.users ?? []) if (u.email) userByEmail.set(u.email.toLowerCase(), u.id);
      if (!data?.users?.length || data.users.length < 200) break;
    }
    for (const l of leads) {
      const uid = userByEmail.get(l.email);
      if (!uid) continue;
      const { count } = await db.from("student_set_progress").select("set_id", { count: "exact", head: true }).eq("user_id", uid).eq("state", "complete");
      if ((count ?? 0) < 3) continue;
      const d1Sent = await comms.alreadySent(db as never, l.id, "seq_post_exam1_d1");
      if (!d1Sent) { if (await email(l, "seq_post_exam1_d1", "seq_post_exam1_d1")) rep.postD1++; continue; }
      // +7 days after d1, only if no purchase (entitlements) and not yet sent.
      const { data: d1 } = await db.from("comms_sends").select("sent_at").eq("lead_id", l.id).eq("dedupe_key", "seq_post_exam1_d1").eq("is_test", false).maybeSingle();
      if (!d1?.sent_at || daysBetween(now, new Date(d1.sent_at)) < 7) continue;
      const { count: ents } = await db.from("entitlements").select("id", { count: "exact", head: true }).eq("user_id", uid);
      if ((ents ?? 0) > 0) continue;
      if (await email(l, "seq_post_exam1_d7", "seq_post_exam1_d7")) rep.postD7++;
    }
  } catch (e) { rep.notes.push(`B: ${(e as Error).message}`); }

  // ---- C: meet Lee, 2 days after first signup, everyone ----------------------------------------
  try {
    for (const l of leads) {
      if (daysBetween(now, new Date(l.created_at)) < 2) continue;
      if (await comms.alreadySent(db as never, l.id, "seq_meet_lee")) continue;
      if (await email(l, "seq_meet_lee", "seq_meet_lee")) rep.meetLee++;
    }
  } catch (e) { rep.notes.push(`C: ${(e as Error).message}`); }

  // ---- D: dormant — deliberately nothing beyond A. ---------------------------------------------
  rep.notes.push("D: dormant leads get sequence A when an exam date exists; no generic re-engagement by design.");
  return rep;
}
