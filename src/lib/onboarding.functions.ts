// Server functions for the /o/{short_ref} onboarding wizard.
// Resolves a SMS short_ref to its linked student_intake_submissions row and
// drives Phase 2 wizard: contact → campus/course → stress → pricing → extras.
// Lee is notified once when required onboarding (through pricing) completes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const shortRefSchema = z.object({ shortRef: z.coerce.number().int().positive() });

// Creates a fresh sms_conversations row for a web-originated onboarding visit
// (no inbound text yet). Returns the short_ref so the caller can redirect
// to /o/{short_ref}. Uses synthetic phone/campus_number markers so the
// existing UNIQUE (student_phone, campus_number) constraint never collides.
export const createWebOnboarding = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const marker = `web:${crypto.randomUUID()}`;
    const { data, error } = await supabaseAdmin
      .from("sms_conversations")
      .insert({
        student_phone: marker,
        campus_number: "web",
        status: "active",
      })
      .select("short_ref")
      .single();
    if (error) throw new Error(error.message);
    return { shortRef: data.short_ref as number };
  });


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
  futureInterests: string[];
  accountingMajorStatus: "yes" | "no" | "definitely_not" | null;
  contactInfoCompletedAt: string | null;
  requiredOnboardingCompletedAt: string | null;
  greekCompletedAt: string | null;
  futureInterestsCompletedAt: string | null;
  syllabusStepCompletedAt: string | null;
  syllabusUploadedAt: string | null;
  onboardingFinishedAt: string | null;
  bookingConfirmedAt: string | null;
  bookingStepCompletedAt: string | null;
  leePhone: string | null;
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
      .select("first_name,last_name,email,phone,campus_id,school_name,course_code_or_name,stress_factors,pricing_reaction,is_greek_member,greek_org_name,future_interests,accounting_major_status,contact_info_completed_at,required_onboarding_completed_at,greek_completed_at,future_interests_completed_at,syllabus_step_completed_at,syllabus_uploaded_at,onboarding_finished_at,onboarding_opened_at")
      .eq("id", submissionId).single();

    if (sub && !sub.onboarding_opened_at) {
      await supabaseAdmin.from("student_intake_submissions")
        .update({ onboarding_opened_at: new Date().toISOString() })
        .eq("id", submissionId);
    }

    // Booking columns (migration 0025) are read separately and defensively: if
    // the migration hasn't been applied yet, this query just returns no row
    // (PostgREST 400 → null data, no throw) instead of breaking the whole
    // snapshot, so the rest of onboarding keeps working.
    const { data: booking } = await (supabaseAdmin.from("student_intake_submissions" as never) as any)
      .select("booking_confirmed_at,booking_step_completed_at")
      .eq("id", submissionId).maybeSingle();

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
      futureInterests: parseStress((sub?.future_interests as string | null) ?? null),
      accountingMajorStatus: (sub?.accounting_major_status as OnboardingSnapshot["accountingMajorStatus"]) ?? null,
      contactInfoCompletedAt: (sub?.contact_info_completed_at as string | null) ?? null,
      requiredOnboardingCompletedAt: (sub?.required_onboarding_completed_at as string | null) ?? null,
      greekCompletedAt: (sub?.greek_completed_at as string | null) ?? null,
      futureInterestsCompletedAt: (sub?.future_interests_completed_at as string | null) ?? null,
      syllabusStepCompletedAt: (sub?.syllabus_step_completed_at as string | null) ?? null,
      syllabusUploadedAt: (sub?.syllabus_uploaded_at as string | null) ?? null,
      onboardingFinishedAt: (sub?.onboarding_finished_at as string | null) ?? null,
      bookingConfirmedAt: (booking?.booking_confirmed_at as string | null) ?? null,
      bookingStepCompletedAt: (booking?.booking_step_completed_at as string | null) ?? null,
      leePhone: process.env.LEE_PERSONAL_PHONE
        ? process.env.LEE_PERSONAL_PHONE.replace(/[^+\d]/g, "")
        : null,
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
    const update: {
      course_code_or_name: string | null;
      campus_id?: string | null;
      school_name?: string | null;
    } = {
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
    let query = supabaseAdmin
      .from("campuses")
      .select("id,name")
      .eq("ready_for_outreach", true)
      .order("name")
      .limit(20);
    if (data.q) query = query.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ id: r.id as string, name: (r.name as string) ?? "" }));
  });

export type CampusCourseCodes = {
  intro_1: string | null;
  intro_2: string | null;
  intermediate_1: string | null;
  intermediate_2: string | null;
};

export const getCampusCourseCodes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ campusId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<CampusCourseCodes> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("campuses")
      .select("course_family_codes_json")
      .eq("id", data.campusId)
      .maybeSingle();
    // Tolerate double-encoded jsonb: some campus rows stored course_family_codes_json
    // as a JSON *string* rather than an object. Parse the string form when needed.
    let raw: unknown = row?.course_family_codes_json;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
    const codes = (raw && typeof raw === "object" ? raw : {}) as Record<string, string | null>;
    return {
      intro_1: codes.intro_1 ?? null,
      intro_2: codes.intro_2 ?? null,
      intermediate_1: codes.intermediate_1 ?? null,
      intermediate_2: codes.intermediate_2 ?? null,
    };
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

// --- Step 5: Greek ---
const saveGreekSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  isGreekMember: z.boolean().nullable(),
  greekOrgName: z.string().trim().max(120).nullable().optional(),
  skipped: z.boolean().optional(),
});

export const saveOnboardingGreek = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveGreekSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      is_greek_member: data.skipped ? null : data.isGreekMember,
      greek_org_name: data.skipped ? null : (data.isGreekMember ? (data.greekOrgName ?? null) : null),
      greek_completed_at: new Date().toISOString(),
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --- Step 6: Future interests ---
const saveFutureSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  futureInterests: z.array(z.string().trim().min(1).max(120)).max(20),
  skipped: z.boolean().optional(),
});

export const saveOnboardingFutureInterests = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveFutureSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      future_interests: data.skipped
        ? null
        : (data.futureInterests.length ? JSON.stringify(data.futureInterests) : null),
      future_interests_completed_at: new Date().toISOString(),
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --- Step 7: Syllabus upload + skip/later ---
const uploadSyllabusSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  base64: z.string().min(1).max(15_000_000),
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
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      syllabus_uploaded_at: now,
      syllabus_step_completed_at: now,
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const, path };
  });

export const completeOnboardingSyllabusStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => shortRefSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      syllabus_step_completed_at: new Date().toISOString(),
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const finishOnboarding = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => shortRefSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const { data: current } = await supabaseAdmin
      .from("student_intake_submissions")
      .select("onboarding_finished_at").eq("id", submissionId).single();
    if (current?.onboarding_finished_at) return { ok: true as const };
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      onboarding_finished_at: new Date().toISOString(),
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// --- One-shot submit for the simplified 3-step flow ---
const submitSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
  campusId: z.string().uuid().nullable().optional(),
  schoolName: z.string().trim().max(200).nullable().optional(),
  courseCodeOrName: z.string().trim().max(200).nullable().optional(),
  pricingReaction: z.enum(["sounds_good", "more_than_expected"]),
  stressFactors: z.array(z.string().trim().min(1).max(80)).max(20),
  isGreekMember: z.boolean().nullable().optional(),
  greekOrgName: z.string().trim().max(120).nullable().optional(),
  futureInterests: z.array(z.string().trim().min(1).max(120)).max(20),
  accountingMajorStatus: z.enum(["yes", "no", "definitely_not"]).nullable().optional(),
});

export const submitOnboarding = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, convo, submissionId } = await loadByShortRef(data.shortRef);

    const { data: current } = await supabaseAdmin
      .from("student_intake_submissions")
      .select("onboarding_finished_at,required_onboarding_completed_at")
      .eq("id", submissionId).single();
    const alreadyFinished = !!current?.onboarding_finished_at;

    let schoolName = data.schoolName ?? null;
    if (data.campusId) {
      const { data: c } = await supabaseAdmin.from("campuses")
        .select("name").eq("id", data.campusId).maybeSingle();
      schoolName = (c?.name as string | undefined) ?? schoolName;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      first_name: data.firstName,
      last_name: data.lastName ?? null,
      email: data.email,
      phone: data.phone,
      campus_id: data.campusId ?? null,
      school_name: schoolName,
      course_code_or_name: data.courseCodeOrName ?? null,
      pricing_reaction: data.pricingReaction,
      stress_factors: data.stressFactors.length ? JSON.stringify(data.stressFactors) : null,
      is_greek_member: data.isGreekMember ?? null,
      greek_org_name: data.isGreekMember ? (data.greekOrgName ?? null) : null,
      future_interests: data.futureInterests.length ? JSON.stringify(data.futureInterests) : null,
      accounting_major_status: data.accountingMajorStatus ?? null,
      contact_info_completed_at: now,
      required_onboarding_completed_at: current?.required_onboarding_completed_at ?? now,
      greek_completed_at: now,
      future_interests_completed_at: now,
      syllabus_step_completed_at: now,
      onboarding_finished_at: current?.onboarding_finished_at ?? now,
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);

    if (!alreadyFinished) {
      const body =
        `New tutoring request.\n\n` +
        `${data.firstName}${data.lastName ? " " + data.lastName : ""}\n` +
        `${schoolName ?? "—"} • ${data.courseCodeOrName ?? "—"}\n` +
        `Pricing: ${data.pricingReaction}\n\n` +
        `Open:\nhttps://surviveaccounting.com/o/${convo.short_ref}`;
      await notifyLee(body);
    }
    return { ok: true as const };
  });

// --- Booking step (free 30-minute call) ---
// Server-side replica of the wizard's courseNameToFamilyKey, so we can resolve a
// stored course display name back to a course-family key without importing the
// client component.
const BOOKING_FAMILY_KEYS = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"] as const;
type BookingFamilyKey = (typeof BOOKING_FAMILY_KEYS)[number];

function courseFamilyFromSubmission(
  courseFamily: string | null,
  courseName: string | null,
): BookingFamilyKey | null {
  // Prefer an explicit course_family value when it's already a known key.
  if (courseFamily && (BOOKING_FAMILY_KEYS as readonly string[]).includes(courseFamily)) {
    return courseFamily as BookingFamilyKey;
  }
  const n = (courseName ?? "").trim().toLowerCase();
  if (!n) return null;
  if (n === "intro 1" || n === "intro accounting 1" || n === "introduction to financial accounting") return "intro_1";
  if (n === "intro 2" || n === "intro accounting 2" || n === "introduction to managerial accounting") return "intro_2";
  if (n === "ia1" || n === "intermediate accounting 1" || n === "intermediate financial accounting 1") return "intermediate_1";
  if (n === "ia2" || n === "intermediate accounting 2" || n === "intermediate financial accounting 2") return "intermediate_2";
  return null;
}

export type OnboardingBookingInfo = { bookingUrl: string | null; family: BookingFamilyKey | null };

// Resolves the Square booking URL for this student by their course family.
// Each family (intro_1/intro_2/intermediate_1/intermediate_2) has one global
// link in outreach_settings (id=1); every student in that family gets it,
// regardless of campus. Returns bookingUrl=null only when we can't determine a
// family (e.g. "Not sure" / free-text course) or no link is configured — the UI
// then shows the "I'll text you a time" fallback instead of a dead button.
export const getOnboardingBookingUrl = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => shortRefSchema.parse(data))
  .handler(async ({ data }): Promise<OnboardingBookingInfo> => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);

    const { data: sub } = await supabaseAdmin
      .from("student_intake_submissions")
      .select("course_family,course_code_or_name")
      .eq("id", submissionId)
      .single();

    const family = courseFamilyFromSubmission(
      (sub?.course_family as string | null) ?? null,
      (sub?.course_code_or_name as string | null) ?? null,
    );
    if (!family) return { bookingUrl: null, family: null };

    // Per-family Square links live on outreach_settings (singleton row id=1).
    // Cast to `any`: these columns aren't in the generated types.
    const { data: settings } = await (supabaseAdmin.from("outreach_settings" as never) as any)
      .select("square_booking_url_intro_1,square_booking_url_intro_2,square_booking_url_intermediate_1,square_booking_url_intermediate_2")
      .eq("id", 1)
      .maybeSingle();

    const bookingUrl: string | null = settings?.[`square_booking_url_${family}`] || null;
    return { bookingUrl, family };
  });

const confirmBookingSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  confirmed: z.boolean(),
});

export const confirmOnboardingBooking = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => confirmBookingSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, submissionId } = await loadByShortRef(data.shortRef);
    const now = new Date().toISOString();
    const update: { booking_step_completed_at: string; booking_confirmed_at?: string } = {
      booking_step_completed_at: now,
    };
    if (data.confirmed) update.booking_confirmed_at = now;
    // Cast: booking_* columns are added by migration 0025, not yet in types.
    const { error } = await (supabaseAdmin.from("student_intake_submissions") as any)
      .update(update)
      .eq("id", submissionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
