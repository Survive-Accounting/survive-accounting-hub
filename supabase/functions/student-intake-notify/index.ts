// Sends post-intake notifications (email always when possible; SMS only when a
// conversation already exists for that phone/campus). NEVER throws — caller
// records success/error in student_intake_submissions.notification_log.
//
// POST body: { submission_id: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Lee Ingram <lee@mail.surviveaccounting.com>";
const REPLY_TO = "lee@surviveaccounting.com";

interface NotifyOutcome { channel: "email" | "sms"; ok: boolean; error?: string; at: string }

async function sendEmail(to: string, subject: string, html: string): Promise<NotifyOutcome> {
  const at = new Date().toISOString();
  if (!RESEND_API_KEY) return { channel: "email", ok: false, error: "RESEND_API_KEY missing", at };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }),
    });
    if (!res.ok) return { channel: "email", ok: false, error: `Resend ${res.status}: ${await res.text()}`, at };
    return { channel: "email", ok: true, at };
  } catch (e) {
    return { channel: "email", ok: false, error: (e as Error).message, at };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildEmail(routing: string, firstName: string, bookingUrl: string | null) {
  const name = escapeHtml(firstName || "there");
  if (routing === "bookable_ready") {
    return {
      subject: "Book your tutoring session",
      html: `<p>Hi ${name},</p><p>Thanks for the info — now let's get you some tutoring!</p>${
        bookingUrl ? `<p><a href="${escapeHtml(bookingUrl)}" style="background:#CE1126;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Book Zoom Tutoring</a></p>` : `<p>Lee will follow up shortly with a booking link.</p>`
      }<p>— Lee</p>`,
    };
  }
  if (routing === "bookable_needs_syllabus") {
    return {
      subject: "Upload your syllabus to unlock booking",
      html: `<p>Hi ${name},</p><p>Almost done — upload your syllabus to unlock the booking link. Reply to this email with the PDF or revisit the form on surviveaccounting.com/start.</p><p>— Lee</p>`,
    };
  }
  return {
    subject: "You're on the waitlist",
    html: `<p>Hi ${name},</p><p>You're on the waitlist. I'll review your course and respond within 2 business days.</p><p>— Lee</p>`,
  };
}

function buildSms(routing: string, bookingUrl: string | null) {
  if (routing === "bookable_ready") {
    return bookingUrl
      ? `Now, let's get you some tutoring! Book your Zoom session here: ${bookingUrl}`
      : `You're approved for tutoring — Lee will text you a booking link shortly.`;
  }
  if (routing === "bookable_needs_syllabus") {
    return `Almost done — upload your syllabus at surviveaccounting.com/start to unlock the booking link.`;
  }
  return `You're on the waitlist. Lee will review your course and respond within 2 business days.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const log: NotifyOutcome[] = [];

  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return new Response(JSON.stringify({ ok: false, error: "submission_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error } = await sb
      .from("student_intake_submissions")
      .select("id,first_name,email,phone,campus_id,routing_result,booking_link_shown")
      .eq("id", submission_id)
      .maybeSingle();
    if (error || !row) {
      return new Response(JSON.stringify({ ok: false, error: error?.message ?? "not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const routing = row.routing_result ?? "waitlist_review";

    // Resolve booking URL from settings (same source as client routing)
    let bookingUrl: string | null = null;
    if (routing === "bookable_ready") {
      const { data: s } = await sb.from("outreach_settings").select("*").eq("id", 1).maybeSingle();
      bookingUrl = s?.square_booking_url ?? null;
    }

    // Email
    if (row.email) {
      const { subject, html } = buildEmail(routing, row.first_name ?? "", bookingUrl);
      log.push(await sendEmail(row.email, subject, html));
    }

    // SMS — only if a conversation already exists for this phone
    if (row.phone) {
      const at = new Date().toISOString();
      try {
        const { data: convo } = await sb
          .from("sms_conversations")
          .select("id")
          .eq("student_phone", row.phone)
          .limit(1)
          .maybeSingle();
        if (convo?.id) {
          const { error: insErr } = await sb.from("sms_outbox").insert({
            conversation_id: convo.id,
            body: buildSms(routing, bookingUrl),
            author: "lee",
            send_at: at,
          });
          log.push({ channel: "sms", ok: !insErr, error: insErr?.message, at });
        } else {
          log.push({ channel: "sms", ok: false, error: "no existing sms_conversation for phone", at });
        }
      } catch (e) {
        log.push({ channel: "sms", ok: false, error: (e as Error).message, at });
      }
    }

    // Merge log
    const { data: existing } = await sb
      .from("student_intake_submissions").select("notification_log").eq("id", submission_id).maybeSingle();
    const prior = Array.isArray(existing?.notification_log) ? existing!.notification_log : [];
    await sb.from("student_intake_submissions")
      .update({ notification_log: [...prior, ...log] })
      .eq("id", submission_id);

    return new Response(JSON.stringify({ ok: true, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, log }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
