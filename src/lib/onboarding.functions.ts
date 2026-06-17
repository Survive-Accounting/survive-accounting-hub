// Public server functions for the /o/{short_ref} onboarding flow.
// Resolves a SMS short_ref to its linked student_intake_submissions row,
// lets the student save name + email, and notifies Lee when required
// onboarding is complete. No auth — knowing the short_ref grants access.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const shortRefSchema = z.object({ shortRef: z.coerce.number().int().positive() });

export type OnboardingSnapshot = {
  shortRef: number;
  submissionId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  campus: string | null;
  course: string | null;
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

  // Lazily create a linked submission if one wasn't created at inbound time
  // (e.g., legacy conversations from before Phase 1).
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

export const getOnboarding = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => shortRefSchema.parse(data))
  .handler(async ({ data }): Promise<OnboardingSnapshot> => {
    const { supabaseAdmin, convo, submissionId } = await loadByShortRef(data.shortRef);

    // Stamp onboarding_opened_at the first time the link is opened.
    const { data: sub } = await supabaseAdmin
      .from("student_intake_submissions")
      .select("first_name,last_name,email,phone,school_name,course_code_or_name,contact_info_completed_at,required_onboarding_completed_at,syllabus_uploaded_at,onboarding_opened_at")
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
      campus: (sub?.school_name as string | null) ?? null,
      course: (sub?.course_code_or_name as string | null) ?? null,
      contactInfoCompletedAt: (sub?.contact_info_completed_at as string | null) ?? null,
      requiredOnboardingCompletedAt: (sub?.required_onboarding_completed_at as string | null) ?? null,
      syllabusUploadedAt: (sub?.syllabus_uploaded_at as string | null) ?? null,
    };
  });

const saveContactSchema = z.object({
  shortRef: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
});

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

export const saveOnboardingContact = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveContactSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin, convo, submissionId } = await loadByShortRef(data.shortRef);
    const now = new Date().toISOString();
    const [firstName, ...rest] = data.name.trim().split(/\s+/);
    const lastName = rest.join(" ") || null;

    const { data: current } = await supabaseAdmin
      .from("student_intake_submissions")
      .select("required_onboarding_completed_at,school_name,course_code_or_name")
      .eq("id", submissionId).single();

    const { error } = await supabaseAdmin.from("student_intake_submissions").update({
      first_name: firstName,
      last_name: lastName,
      email: data.email,
      contact_info_completed_at: now,
      required_onboarding_completed_at: current?.required_onboarding_completed_at ?? now,
    }).eq("id", submissionId);
    if (error) throw new Error(error.message);

    // Notify Lee the first time required onboarding completes.
    if (!current?.required_onboarding_completed_at) {
      const { data: full } = await supabaseAdmin
        .from("student_intake_submissions")
        .select("school_name,course_code_or_name,pricing_reaction")
        .eq("id", submissionId).single();
      const campus = (full?.school_name as string | null) ?? "—";
      const course = (full?.course_code_or_name as string | null) ?? "—";
      const pricing = (full?.pricing_reaction as string | null) ?? "—";
      const body =
        `A student completed onboarding.\n\n` +
        `Details:\n${campus} • ${course}\n` +
        `Pricing: ${pricing}\n\n` +
        `Open:\nhttps://surviveaccounting.com/o/${convo.short_ref}`;
      await notifyLee(body);
    }

    return { ok: true as const };
  });
