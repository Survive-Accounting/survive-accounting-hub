// CAREERS — the public /careers page's one form, for all four listed roles (Campus Rep hands
// off to the existing /rep/join flow instead). Public, unauthenticated on purpose — an applicant
// is never signed in. Every submission is stored (job_applications) AND emailed to Lee
// (src/lib/email.server.ts) — the email is what Lee actually sees; the row is the durable record
// a future admin list can read back.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";

const isMissingTable = (e: { code?: string; message: string }) => isMissingSchema(e, /job_applications/i);

// job_applications is new (migration/supabase-migrations/20260905_2400) and isn't in the
// generated Supabase types yet — same escape hatch as every other new table this session.
type JobsDB = { from: (t: "job_applications") => any };
async function jobsDb(): Promise<JobsDB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as JobsDB;
}

export const JOB_ROLES = ["tutor-content-creator", "national-campaign-manager", "operations-lead", "platform-engineer", "other"] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export const submitJobApplication = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    role: z.enum(JOB_ROLES),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).nullable().optional(),
    subject: z.string().trim().max(200).nullable().optional(),
    why: z.string().trim().max(4000).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    resumeUrl: z.string().url().max(1000).nullable().optional(),
    resumeName: z.string().max(300).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const roleLabel: Record<JobRole, string> = {
      "tutor-content-creator": "Tutor Content Creator",
      "national-campaign-manager": "National Campaign Manager",
      "operations-lead": "Operations Lead",
      "platform-engineer": "Platform Engineer",
      other: "Other",
    };
    // BEST-EFFORT STORAGE. The email below is the real notification — a missing migration or a
    // transient DB error must never swallow an applicant's submission, so nothing here ever
    // blocks reaching the email-send below.
    try {
      const db = await jobsDb();
      const { error } = await db.from("job_applications").insert({
        role: data.role, name: data.name, email: data.email, phone: data.phone ?? null,
        subject: data.subject ?? null, why: data.why ?? null, notes: data.notes ?? null,
        resume_url: data.resumeUrl ?? null, resume_name: data.resumeName ?? null,
      });
      if (error) {
        if (isMissingTable(error)) console.warn("[careers] job_applications table missing — run migration/supabase-migrations/20260905_2400_job_applications.sql");
        else console.warn("[careers] could not store the application (still emailing Lee):", error.message);
      }
    } catch (e) {
      console.warn("[careers] storing the application threw (still emailing Lee):", e instanceof Error ? e.message : String(e));
    }

    try {
      const { sendResendEmail } = await import("@/lib/email.server");
      const lines = [
        `Role: ${roleLabel[data.role]}`,
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        data.phone ? `Phone: ${data.phone}` : "",
        data.subject ? `Subject: ${data.subject}` : "",
        "",
        data.why ? `Why this role:\n${data.why}` : "",
        data.notes ? `\nAnything else:\n${data.notes}` : "",
        data.resumeUrl ? `\nResume: ${data.resumeUrl}` : "\nNo resume attached.",
      ].filter(Boolean).join("\n");
      const r = await sendResendEmail({
        to: "lee@surviveaccounting.com",
        subject: `Careers: ${roleLabel[data.role]} — ${data.name}`,
        text: lines,
      });
      if (!r.ok) return { ok: false, error: r.error ?? "Could not send the notification email." };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
