// UNIFIED INTAKE (spec §1) — the ONE server function every web capture calls. Writes one
// campus_waitlist row (kind + channel + context), then — in the same request, best-effort —
// sends the student's confirmation (email primary, SMS one-liner if consented) and pages Lee
// for priority kinds. Comms failures NEVER fail the capture: the row is the record; sends log
// their own outcome to comms_sends.
//
// Client code imports ONLY submitIntake from here. Everything that touches Resend/Twilio lives
// in src/lib/comms/send.server.ts and is imported dynamically inside the handler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { INTAKE_KINDS, type IntakeKind } from "@/lib/comms/kinds";

const IntakeInput = z.object({
  kind: z.enum(INTAKE_KINDS),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().min(7).optional().nullable(),
  name: z.string().trim().max(120).optional().nullable(),
  campusId: z.string().uuid().optional().nullable(),
  campusName: z.string().trim().max(160).optional().nullable(),
  campusSlug: z.string().trim().max(120).optional().nullable(),
  courseCode: z.string().trim().max(40).optional().nullable(),
  professor: z.string().trim().max(120).optional().nullable(),
  exam: z.number().int().min(1).max(99).optional().nullable(),
  topic: z.string().trim().max(160).optional().nullable(),
  chapter: z.string().trim().max(160).optional().nullable(),
  chapterLink: z.string().trim().max(300).optional().nullable(),
  sourcePath: z.string().trim().max(300).optional().nullable(),
  note: z.string().trim().max(4000).optional().nullable(),
  filePaths: z.array(z.string()).max(10).optional().nullable(),
  /** A2P: true only when the SmsConsentNote was rendered beside the phone field the student submitted. */
  smsConsent: z.boolean().optional(),
  isTest: z.boolean().optional(),
  /** Skip the student confirmation (e.g. a second capture in the same session). Founder alert still fires. */
  skipConfirmation: z.boolean().optional(),
}).refine((d) => !!d.email || !!d.phone, { message: "email or phone required" });

export type IntakeInput = z.infer<typeof IntakeInput>;
export type IntakeResult = {
  id: string;
  kind: IntakeKind;
  /** What went out, for honest UI copy ("I just emailed you" only when true). */
  confirmation: { email: boolean; sms: boolean };
};

export const submitIntake = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => IntakeInput.parse(d))
  .handler(async ({ data }): Promise<IntakeResult> => {
    const { runIntake } = await import("@/lib/comms/intake.server");
    return runIntake(data);
  });
