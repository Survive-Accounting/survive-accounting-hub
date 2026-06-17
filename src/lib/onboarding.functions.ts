// Server functions for the /o/{short_ref} onboarding wizard.
// Resolves a SMS short_ref to its linked student_intake_submissions row and
// drives Phase 2 wizard: contact → campus/course → stress → pricing → extras.
// Lee is notified once when required onboarding (through pricing) completes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const shortRefSchema = z.object({ shortRef: z.coerce.number().int().positive() });

export type CampusLite = { id: string; name: string };

export type OnboardingSnapshot = {
  shortRef: number;
  submissionId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  campusId: string | null;
  campus: string | null;
  course: string | null;
  stressFactors: string[];
  pricingReaction: string | null;
  isGreekMember: boolean | null;
  greekOrgName: string | null;
  futureInterests: string | null;
  contactInfoCompletedAt: string | null;
  requiredOnboardingCompletedAt: string | null;
  syllabusUploadedAt: string | null;
};

async function loadByShortRef(shortRef: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: convo, error: convoErr } = await supabaseAdmin
    .from("sms_conversations")
    .select("id, short_ref, submission_id, campus_id, course, student_phone")
    .eq("short_ref", shortRef)
    .maybeSingle();
  if (convoErr) throw new Error(convoErr.message);
  if (!convo) throw new Error("Onboarding link not found.");

  let submissionId = convo.submission_id as string | null;
  if (!submissionId) {
    let schoolName: string | null = null;
    if (convo.campus_id) {
      const { data: campus } = await supabaseAdmin
        .from("campuses").select("name").eq("id", convo.campus_id).maybeSingle();
      schoolName = (campus?.name as string | undefined) ?? null;
    }
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("student_intake_submissions").insert({
        phone: convo.student_phone,
        campus_id: convo.campus_id,
        school_name: schoolName,
        course_code_or_name: convo.course,
        source: "sms_inbound",
      }).select("id").single();
    if (subErr) throw new Error(subErr.message);
    submissionId = sub.id as string;
    await supabaseAdmin.from("sms_conversations")
      .update({ submission_id: submissionId }).eq("id", convo.id);
  }

  return { supabaseAdmin, convo, submissionId };
}

function parseStress(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const getOnboarding = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => shortRefSchema.parse(data))
  .handler(async ({ data }): Promise<OnboardingSnapshot> => {
    const { supabaseAdmin, convo, submissionId } = await loadByShortRef(data.shortRef);

    const { data: sub } = await supabaseAdmin
      .from("student_intake_submissions")
      .select("first_name,last_name,email,phone,campus_id,school_name,course_code_or_name,stress_factors,pricing_reaction,is_greek_member,greek_org_name,future_interests,contact_info_completed_at,required_onboarding_completed_at,syllabus_uploaded_at,onboarding_opened_at")
      .eq("id", submissionId).single();

    if (sub && !sub.onboarding_opened_at) {
      await supabaseAdmin.from("student_intake_submissions")
        .update({ onboarding_opened_at: new Date().toISOString() })
        .eq("id", submissionId);
    }

    return {
      shortRef: convo.short_ref as number,
      submissionId,
      firstName: (sub?.first_name as string | null) ?? null,
      lastName: (sub?.last_name as string | null) ?? null,
      email: (sub?.email as string | null) ?? null,
      phone: (sub?.phone as string | null) ?? null,
      campusId: (sub?.campus_id as string | null) ?? null,
      campus: (sub?.school_name as string | null) ?? null,
      course: (sub?.course_code_or_name as string | null) ?? null,
      stressFactors: parseStress((sub?.stress_factors as string | null) ?? null),
      pricingReaction: (sub?.pricing_reaction as string | null) ?? null,
      isGreekMember: (sub?.is_greek_member as boolean | null) ?? null,
      greekOrgName: (sub?.greek_org_name as string | null) ?? null,
      futureInterests: (sub?.future_interests as string | null) ?? null,
      contactInfoCompletedAt: (sub?.contact_info_completed_at as string | null) ?? null,
      requiredOnboardingCompletedAt: (sub?.required_onboarding_completed_at as string | null) ?? null,
      syllabusUploadedAt: (sub?.syllabus_uploaded_at as string | null) ?? null,
    };
  });

// --- Step 1: Contact ---
const saveContactSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
});

export const saveOnboardingContact = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveContactSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const now = new Date().toISOString();
    const [firstName, ...rest] = data.name.trim().split(/\s+/);
    const lastName = rest.join(" ") || null;

    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      first_name: firstName,
      last_name: lastName,
      email: data.email,
      contact_info_completed_at: now,
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --- Step 2: Campus + Course ---
const saveCampusCourseSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  campusId: z.string().uuid().nullable().optional(),
  schoolName: z.string().trim().max(200).nullable().optional(),
  courseCodeOrName: z.string().trim().max(200).nullable().optional(),
});

export const saveOnboardingCampusCourse = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveCampusCourseSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const update: Record<string, unknown> = {
      course_code_or_name: data.courseCodeOrName ?? null,
    };
    if (data.campusId) {
      update.campus_id = data.campusId;
      // also persist the campus display name when we know it
      const { data: c } = await supabaseAdmin.from("campuses")
        .select("name").eq("id", data.campusId).maybeSingle();
      update.school_name = (c?.name as string | undefined) ?? data.schoolName ?? null;
    } else {
      update.campus_id = null;
      update.school_name = data.schoolName ?? null;
    }
    const { error } = await supabaseAdmin.from("student_intake_submissions")
      .update(update).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const searchCampuses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ q: z.string().trim().max(80) }).parse(data))
  .handler(async ({ data }): Promise<CampusLite[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin.from("campuses").select("id,name").order("name").limit(20);
    if (data.q) query = query.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ id: r.id as string, name: (r.name as string) ?? "" }));
  });

// --- Step 3: Stress ---
const saveStressSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  stressFactors: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});

export const saveOnboardingStress = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveStressSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      stress_factors: JSON.stringify(data.stressFactors),
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --- Step 4: Pricing reaction (completes required onboarding + notifies Lee) ---
async function notifyLee(body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID ?? "";
  const lee = (process.env.LEE_PERSONAL_PHONE ?? "").replace(/[^+\d]/g, "");
  if (!sid || !token || !msid || !lee) {
    console.warn("notifyLee: missing Twilio env, skipping");
    return;
  }
  try {
    const params = new URLSearchParams({ MessagingServiceSid: msid, To: lee, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!res.ok) console.warn("notifyLee twilio error", res.status, await res.text());
  } catch (e) {
    console.warn("notifyLee failed", (e as Error).message);
  }
}

const savePricingSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  pricingReaction: z.enum(["sounds_good", "more_than_expected"]),
});

export const saveOnboardingPricing = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => savePricingSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, convo, submissionId } = await loadByShortRef(data.shortRef);
    const { data: current } = await supabaseAdmin
      .from("student_intake_submissions")
      .select("required_onboarding_completed_at,school_name,course_code_or_name")
      .eq("id", submissionId).single();

    const now = new Date().toISOString();
    const alreadyDone = !!current?.required_onboarding_completed_at;
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      pricing_reaction: data.pricingReaction,
      required_onboarding_completed_at: current?.required_onboarding_completed_at ?? now,
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);

    if (!alreadyDone) {
      const campus = (current?.school_name as string | null) ?? "—";
      const course = (current?.course_code_or_name as string | null) ?? "—";
      const body =
        `A student completed onboarding.\n\n` +
        `Details:\n${campus} • ${course}\n` +
        `Pricing: ${data.pricingReaction}\n\n` +
        `Open:\nhttps://surviveaccounting.com/o/${convo.short_ref}`;
      await notifyLee(body);
    }
    return { ok: true as const };
  });

// --- Step 5: Optional extras ---
const saveExtrasSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  isGreekMember: z.boolean().nullable().optional(),
  greekOrgName: z.string().trim().max(120).nullable().optional(),
  futureInterests: z.string().trim().max(2000).nullable().optional(),
});

export const saveOnboardingExtras = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveExtrasSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const update: Record<string, unknown> = {};
    if (data.isGreekMember !== undefined) update.is_greek_member = data.isGreekMember;
    if (data.greekOrgName !== undefined) update.greek_org_name = data.greekOrgName;
    if (data.futureInterests !== undefined) update.future_interests = data.futureInterests;
    if (Object.keys(update).length === 0) return { ok: true as const };
    const { error } = await supabaseAdmin.from("student_intake_submissions")
      .update(update).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const uploadSyllabusSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  base64: z.string().min(1).max(15_000_000), // ~11MB binary
});

export const uploadOnboardingSyllabus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uploadSyllabusSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const bytes = Buffer.from(data.base64, "base64");
    const safeName = data.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${submissionId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("student-syllabi")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      syllabus_uploaded_at: new Date().toISOString(),
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const, path };
  });
