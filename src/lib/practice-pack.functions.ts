// practice-pack.functions.ts — "Email me the pack →". We EMAIL the link rather
// than direct-download: the email is the point (the lead magnet).
//
//   · CAPTURE first, send second: the row in campus_waitlist (via the unified
//     intake, kind "practice_pack", source "practice_pdf") is the record; a
//     failed send never loses the lead.
//   · RATE-LIMITED per email (one send per RESEND_WINDOW); asking again inside
//     the window is IDEMPOTENT — same link, no duplicate email, honest reply.
//   · The link is stable (/api/practice-pack) and always serves the CURRENT
//     bank, so a resend is the same link by construction.
//   · Free content only — enforced by the endpoint itself (assertPackSafety);
//     this fn never touches bank content.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RESEND_WINDOW_MS = 10 * 60 * 1000;

const Input = z.object({
  email: z.string().trim().email().max(200),
  campusId: z.string().uuid().optional().nullable(),
  campusName: z.string().trim().max(160).optional().nullable(),
  campusSlug: z.string().trim().max(120).optional().nullable(),
  courseCode: z.string().trim().max(40).optional().nullable(),
  chapterId: z.string().trim().max(120).optional().nullable(),
  sourcePath: z.string().trim().max(300).optional().nullable(),
  isTest: z.boolean().optional(),
});

export type RequestPackResult = { ok: true; already: boolean } | { ok: false; error: string };

export const requestPracticePack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<RequestPackResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const email = data.email.toLowerCase();

    // Rate limit / idempotency: a recent practice_pdf row for this email means
    // the link is already in their inbox — same link, no second email.
    const since = new Date(Date.now() - RESEND_WINDOW_MS).toISOString();
    // Rows whose send FAILED don't count — a retry after a failure must
    // actually send, not claim "already on its way".
    const { data: recent } = await db.from("campus_waitlist")
      .select("id,created_at").eq("source", "practice_pdf").eq("email", email)
      .gte("created_at", since).not("note", "ilike", "%send failed%").limit(1);
    if ((recent ?? []).length > 0) return { ok: true, already: true };

    // 1) THE RECORD — unified intake (founder digest routing included); the
    //    pack email below is ours, so the kind confirmation is skipped.
    let captureId: string | null = null;
    try {
      const { runIntake } = await import("@/lib/comms/intake.server");
      const res = await runIntake({
        kind: "practice_pack", email,
        campusId: data.campusId ?? null, campusName: data.campusName ?? null, campusSlug: data.campusSlug ?? null,
        courseCode: data.courseCode ?? null,
        chapter: data.chapterId ?? null,
        sourcePath: data.sourcePath ?? null,
        source: "practice_pdf",
        note: "Requested the Exam 1 practice pack PDF",
        skipConfirmation: true,
        isTest: !!data.isTest,
      });
      captureId = res.id;
    } catch (e) {
      return { ok: false, error: `Could not save your request — ${(e as Error).message}` };
    }

    // 2) THE EMAIL — the stable link (always the current bank).
    const origin = process.env.SITE_ORIGIN || "https://surviveaccounting.com";
    const qp = new URLSearchParams();
    if (data.campusSlug) qp.set("school", data.campusSlug);
    if (data.courseCode) qp.set("code", data.courseCode);
    const packUrl = `${origin}/api/practice-pack${qp.size ? `?${qp}` : ""}`;
    const playerUrl = `${origin}/${data.campusSlug ?? ""}?via=pdf`;
    const course = data.courseCode ?? "your intro course";

    const { sendResendEmail } = await import("@/lib/email.server");
    const sent = await sendResendEmail({
      to: email,
      subject: `Your ${course} practice pack ⚡`,
      text: `Here's your printable Exam 1 practice pack:\n\n${packUrl}\n\nPrint it, mark it up, and when you want the cram videos that go with it: ${playerUrl}\n\n— Lee`,
      html: [
        `<p>Here's your printable <b>Exam 1 practice pack</b>:</p>`,
        `<p><a href="${packUrl}">Download the pack (PDF)</a></p>`,
        `<p>Print it, mark it up, and when you want the cram videos that go with it: <a href="${playerUrl}">start here</a>.</p>`,
        `<p>— Lee</p>`,
      ].join(""),
    });
    if (!sent.ok) {
      // The lead is captured either way; flag the row so the rate limit lets
      // an immediate retry actually send.
      if (captureId) await db.from("campus_waitlist").update({ note: "Requested the Exam 1 practice pack PDF (send failed)" }).eq("id", captureId);
      return { ok: false, error: sent.error ?? "The email didn't send — try again." };
    }
    return { ok: true, already: false };
  });
