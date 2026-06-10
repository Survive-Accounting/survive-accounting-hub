// Sends a single outreach email via Resend using the active template.
// Ported from the original app; adapted for the new model:
// - leads link by campus_id (campuses table), not the legacy outreach_schools
// - the SurviveAccounting.com link is the professor's personalized landing URL
//   (/outreach/school/{slug}?p={landing_token}) when the campus is approved
// - PLAYGROUND: no login exists yet, so any project-key caller is treated as
//   Lee but capped at 50 sends/day. Lock down when auth ships.
//
// Secrets required: RESEND_API_KEY

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
const BOOKING_LINK = "https://surviveaccounting.com/book";
const DEFAULT_ORIGIN = "https://surviveaccounting.com";
const DAILY_CAP = 50;

type Body = {
  lead_id?: string;
  include_landing_page?: boolean;
  follow_up?: 0 | 1 | 2 | 3;
  sender_email?: string; // honored for service-role calls (scheduler)
  // Test mode: send a draft to one of the allowed test recipients.
  test_to?: string;
  test_subject?: string;
  test_body?: string;
};

// Only these addresses can receive test sends — keeps the endpoint abuse-proof.
const TEST_RECIPIENTS = ["lee@survivestudios.com", "jking.cim@gmail.com"];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const SA_LINK_TOKEN = "@@SA_LINK@@";

function renderHtml(body: string, surviveLinkUrl: string) {
  const paras = body.split(/\n\n+/).map((p) => {
    const parts = p.split(SA_LINK_TOKEN);
    const escaped = parts.map((piece) => escapeHtml(piece).replace(/\n/g, "<br/>"));
    const anchor = `<a href="${escapeHtml(surviveLinkUrl)}" style="color:#CE1126;text-decoration:underline;">SurviveAccounting.com</a>`;
    const joined = escaped.join(anchor);
    return `<p style="margin:0 0 14px;line-height:1.55;color:#1f2937;font-size:15px;">${joined}</p>`;
  }).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;">${paras}</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY secret not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const isServiceRole = !!bearer && bearer === SERVICE_ROLE;

    const body = (await req.json()) as Body;

    // ============ TEST MODE ============
    if (body?.test_to) {
      const to = body.test_to.trim().toLowerCase();
      if (!TEST_RECIPIENTS.includes(to)) {
        return new Response(JSON.stringify({ error: "test_to not in the allowed list" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sampleFirst = "John";
      const surviveLinkUrl = "https://surviveaccounting.com?utm_source=cold_email&utm_medium=email&utm_campaign=professor_outreach";
      const rawBody = body.test_body ?? "";
      const rawSubject = body.test_subject ?? "";
      if (!rawSubject.trim() || !rawBody.trim()) {
        return new Response(JSON.stringify({ error: "test_subject and test_body required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const mergedBody = rawBody
        .replace(/\{\s*first\s*name\s*\}/gi, sampleFirst)
        .replace(/\{\s*surviveaccounting\.com\s*\}/gi, SA_LINK_TOKEN)
        .replace(/\[First Name\]/g, sampleFirst)
        .replace(/\[Booking Link\]/g, BOOKING_LINK)
        .replace(/\[SurviveAccounting\.com\]/g, SA_LINK_TOKEN);
      const subject = "[TEST] " + rawSubject
        .replace(/\{\s*first\s*name\s*\}/gi, sampleFirst)
        .replace(/\[First Name\]/g, sampleFirst);
      const textBody = mergedBody.replaceAll(SA_LINK_TOKEN, `SurviveAccounting.com (${surviveLinkUrl})`);

      const testRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [to],
          reply_to: REPLY_TO,
          subject,
          html: renderHtml(mergedBody, surviveLinkUrl),
          text: textBody,
          tags: [{ name: "campaign", value: "test_send" }],
        }),
      });
      const testJson = await testRes.json();
      if (!testRes.ok) {
        return new Response(JSON.stringify({ error: "Resend error", details: testJson }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, test: true, message_id: testJson?.id ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ============ END TEST MODE ============

    if (!body?.lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PLAYGROUND auth model: service role = scheduler (no cap);
    // anything else = dashboard user, capped. TODO: real user auth.
    const senderEmail = (isServiceRole ? body?.sender_email : null) ?? "lee@surviveaccounting.com";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (!isServiceRole) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { count } = await admin
        .from("outreach_send_log")
        .select("*", { count: "exact", head: true })
        .gte("sent_at", since.toISOString());
      if ((count ?? 0) >= DAILY_CAP) {
        return new Response(JSON.stringify({
          error: "daily_limit_reached",
          message: `Daily limit reached (${DAILY_CAP}/day).`,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fetch lead + campus
    const { data: lead, error: leadErr } = await admin
      .from("outreach_leads")
      .select("id, email, first_name, last_name, campus_id, is_phd, landing_token")
      .eq("id", body.lead_id)
      .single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let landingUrl: string | null = null;
    let campusApproved = false;
    let courseFamilyStatus: Record<string, string> = {};
    if (lead.campus_id) {
      const { data: campus } = await admin
        .from("campuses")
        .select("slug, approval_status, course_family_status_json")
        .eq("id", lead.campus_id)
        .single();
      if (campus?.approval_status === "approved" && campus?.slug) {
        const origin = req.headers.get("origin") ?? DEFAULT_ORIGIN;
        landingUrl = `${origin}/outreach/school/${campus.slug}`;
        if (lead.landing_token) landingUrl += `?p=${lead.landing_token}`;
        campusApproved = true;
      }
      if (campus?.course_family_status_json && typeof campus.course_family_status_json === "object") {
        courseFamilyStatus = campus.course_family_status_json as Record<string, string>;
      }
    }

    const baseSurviveUrl = landingUrl ?? "https://surviveaccounting.com";
    const refQs = "utm_source=cold_email&utm_medium=email&utm_campaign=professor_outreach";
    const surviveLinkUrl = baseSurviveUrl + (baseSurviveUrl.includes("?") ? "&" : "?") + refQs;

    // Resolve template — pick the best active variant for this lead.
    const step = Math.max(0, Math.min(3, Number(body.follow_up ?? 0))) as 0 | 1 | 2 | 3;
    const kind = step === 0 ? "initial" : `follow_up_${step}`;
    const { data: candidates, error: tplErr } = await admin
      .from("outreach_email_templates")
      .select("subject, body, variant")
      .eq("is_active", true)
      .eq("kind", kind);
    if (tplErr || !candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ error: `No active template for ${kind}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const available = new Set<string>(candidates.map((c: any) => c.variant ?? "default"));
    let chosenVariant = "default";
    if (lead.is_phd && available.has("phd")) {
      chosenVariant = "phd";
    } else {
      const matches = Object.entries(courseFamilyStatus).filter(([, v]) => v === "matches").map(([k]) => k);
      if (matches.length === 1) {
        // Supports both the new family keys and the legacy ones.
        const map: Record<string, string> = {
          intro_1: "intro1_only",
          intro_2: "intro2_only",
          intermediate_1: "intermediate1_only",
          intermediate_2: "intermediate2_only",
          "intro-accounting-1": "intro1_only",
          "intro-accounting-2": "intro2_only",
          "intermediate-accounting-1": "intermediate1_only",
          "intermediate-accounting-2": "intermediate2_only",
        };
        const v = map[matches[0]];
        if (v && available.has(v)) chosenVariant = v;
      }
    }
    const template = candidates.find((c: any) => (c.variant ?? "default") === chosenVariant)
      ?? candidates.find((c: any) => (c.variant ?? "default") === "default")
      ?? candidates[0];

    const firstName = (lead.first_name ?? "").trim() || "there";
    // PhD rule: never address PhDs by first name.
    const greetingName = lead.is_phd ? `Dr. ${(lead.last_name ?? "").trim() || firstName}` : firstName;
    let mergedBody = template.body
      .replace(/\{\s*first\s*name\s*\}/gi, greetingName)
      .replace(/\{\s*surviveaccounting\.com\s*\}/gi, SA_LINK_TOKEN)
      .replace(/\[First Name\]/g, greetingName)
      .replace(/\[Booking Link\]/g, BOOKING_LINK)
      .replace(/\[SurviveAccounting\.com\]/g, SA_LINK_TOKEN);

    if (body.include_landing_page && campusApproved && landingUrl) {
      mergedBody += `\n\nA quick landing page made for your students:\n${landingUrl}`;
    }

    const subject = template.subject
      .replace(/\{\s*first\s*name\s*\}/gi, greetingName)
      .replace(/\[First Name\]/g, greetingName);

    const textBody = mergedBody.replaceAll(SA_LINK_TOKEN, `SurviveAccounting.com (${surviveLinkUrl})`);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [lead.email],
        reply_to: REPLY_TO,
        subject,
        html: renderHtml(mergedBody, surviveLinkUrl),
        text: textBody,
        tags: [
          { name: "lead_id", value: lead.id },
          { name: "campaign", value: "professor_outreach" },
          { name: "follow_up", value: String(body.follow_up ?? 0) },
        ],
      }),
    });
    const resendJson = await resendRes.json();
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: "Resend error", details: resendJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageId: string | null = resendJson?.id ?? null;
    const now = new Date().toISOString();

    const patch: Record<string, any> = {
      last_message_id: messageId,
      status: "sent",
    };
    if (step === 1) patch.follow_up_1_sent_at = now;
    else if (step === 2) patch.follow_up_2_sent_at = now;
    else if (step === 3) patch.follow_up_3_sent_at = now;
    else patch.sent_at = now;

    await admin.from("outreach_leads").update(patch).eq("id", lead.id);
    await admin.from("outreach_send_log").insert({ sender_email: senderEmail, lead_id: lead.id, sent_at: now });
    await admin.from("outreach_email_events").insert({
      lead_id: lead.id,
      message_id: messageId,
      event_type: "sent",
      payload: { subject, follow_up: body.follow_up ?? 0, sender: senderEmail, variant: chosenVariant },
    });

    return new Response(JSON.stringify({ ok: true, message_id: messageId, variant: chosenVariant }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
