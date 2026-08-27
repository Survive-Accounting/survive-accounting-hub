// INTAKE CORE (server-only) — the body of submitIntake, callable directly from OTHER server
// functions (syllabus upload, chapter claims, rep applications) so they don't round-trip through
// a second server-fn invocation. Client code calls submitIntake in intake.functions.ts.
import { PRIORITY_KINDS } from "@/lib/comms/kinds";
import { confirmTemplateFor, ORIGIN, type TemplateCtx } from "@/lib/comms/templates";
import type { IntakeInput, IntakeResult } from "@/lib/intake.functions";

export async function runIntake(data: IntakeInput): Promise<IntakeResult> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");

    const email = data.email ? data.email.toLowerCase() : null;
    const phone = data.phone ? normalizePhoneE164(data.phone) : null;
    if (!email && !phone) throw new Error("A valid email or phone is required.");
    const channel = email && phone ? "both" : phone ? "phone" : "email";
    const isTest = !!data.isTest;

    // Campus context — resolve name/slug from the id when the caller only had the id.
    let campusName = data.campusName ?? null, campusSlug = data.campusSlug ?? null;
    if (data.campusId && (!campusName || !campusSlug)) {
      try {
        const { data: c } = await db.from("campuses").select("name,slug").eq("id", data.campusId).maybeSingle();
        campusName = campusName ?? c?.name ?? null; campusSlug = campusSlug ?? c?.slug ?? null;
      } catch { /* context is optional */ }
    }

    // greek_member fires on every tag; one welcome per person is enough.
    if (data.kind === "greek_member" && email) {
      const { data: prior } = await db.from("campus_waitlist").select("id").eq("kind", "greek_member").ilike("email", email).eq("is_test", isTest).limit(1);
      if (prior?.length) return { id: prior[0].id, kind: data.kind, confirmation: { email: false, sms: false } };
    }

    const row = {
      kind: data.kind,
      channel,
      email, phone,
      name: data.name ?? null,
      campus_id: data.campusId ?? null,
      campus_text: campusName,
      course_text: data.courseCode ?? data.topic ?? null,
      course_code: data.courseCode ?? null,
      professor: data.professor ?? null,
      exam: data.exam ?? null,
      topic: data.topic ?? null,
      chapter: data.chapter ?? null,
      source_path: data.sourcePath ?? null,
      note: data.note ?? null,
      file_paths: data.filePaths?.length ? data.filePaths : null,
      source: data.source ?? `intake:${data.kind}`,
      is_test: isTest,
      consent_sms_at: phone && data.smsConsent ? new Date().toISOString() : null,
    };
    const { data: ins, error } = await db.from("campus_waitlist").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    const id = ins.id as string;

    // ---- comms (best-effort; the row above is the truth) ------------------------------------
    const ctx: TemplateCtx = {
      name: data.name, email, phone,
      school: campusName, campusSlug,
      courseCode: data.courseCode, professor: data.professor,
      chapter: data.chapter, chapterLink: data.chapterLink, role: data.role,
      exam: data.exam, topic: data.topic, note: data.note,
      kind: data.kind, adminLink: data.adminLink || `${ORIGIN}/outreach/demand?lead=${id}`, isTest,
    };
    const confirmation = { email: false, sms: false };
    try {
      const comms = await import("@/lib/comms/send.server");
      if (!data.skipConfirmation) {
        const key = confirmTemplateFor(data.kind);
        if (email) confirmation.email = (await comms.sendTemplateEmail({ db, key, ctx, to: email, leadId: id, isTest })).ok;
        if (phone) confirmation.sms = (await comms.sendTemplateSms({ db, key, ctx, to: phone, leadId: id, isTest, consented: !!data.smsConsent })).ok;
      }
      if (PRIORITY_KINDS.includes(data.kind)) await comms.founderAlert({ db, ctx, leadId: id, isTest });
    } catch (e) { console.warn("intake comms failed (row saved)", e instanceof Error ? e.message : e); }

    return { id, kind: data.kind, confirmation };
}
