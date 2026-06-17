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
  // Broadcast mode (service-role only): send custom subject/body to a lead,
  // with full merge-tag support.
  custom_subject?: string;
  custom_body?: string;
  broadcast_id?: string;
};

const OPT_OUT_LINE = "If you'd rather not get these, just reply and I'll stop.";

// Only these addresses can receive test sends — keeps the endpoint abuse-proof.
const TEST_RECIPIENTS = ["lee@survivestudios.com", "jking.cim@gmail.com"];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const SA_LINK_TOKEN = "@@SA_LINK@@";

/** "ACCY 201" -> "ACCY"; most common prefix across a campus's codes. */
function coursePrefix(codes: string[]): string {
  const counts = new Map<string, number>();
  for (const c of codes) {
    const m = c.trim().match(/^([A-Za-z&-]+)/);
    if (m) counts.set(m[1].toUpperCase(), (counts.get(m[1].toUpperCase()) ?? 0) + 1);
  }
  let best = "", n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

function prettyPhone(e164: string): string {
  const d = e164.replace(/[^\d]/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return e164;
}

/**
 * Format course codes for an email, collapsing a shared prefix:
 *   ["ACCY 201","ACCY 202","ACCY 303","ACCY 304"] -> "ACCY 201, 202, 303, and 304"
 *   ["ACCY 201","BUS 250"] -> "ACCY 201 and BUS 250"
 *   ["ACCY 201","BUS 250","FIN 300"] -> "ACCY 201, BUS 250, and FIN 300"
 * Uses an Oxford comma for 3+ items.
 */
function joinCourses(codes: string[]): string {
  if (codes.length === 0) return "";
  if (codes.length === 1) return codes[0];

  // Split each "PREFIX 123" into [prefix, number]; fall back to raw if no space.
  const parts = codes.map((c) => {
    const m = c.trim().match(/^([A-Za-z]+)\s+(.+)$/);
    return m ? { prefix: m[1].toUpperCase(), num: m[2], raw: c.trim() } : { prefix: "", num: "", raw: c.trim() };
  });
  const firstPrefix = parts[0].prefix;
  const allSamePrefix = firstPrefix && parts.every((p) => p.prefix === firstPrefix);

  const tokens = allSamePrefix
    ? [parts[0].raw, ...parts.slice(1).map((p) => p.num)]
    : parts.map((p) => p.raw);

  if (tokens.length === 2) return `${tokens[0]} and ${tokens[1]}`;
  return tokens.slice(0, -1).join(", ") + ", and " + tokens[tokens.length - 1];
}

/** Like joinCourses, but always keeps the full code on every entry (never collapses prefix). */
function joinCoursesFull(codes: string[]): string {
  const cleaned = codes.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return cleaned.slice(0, -1).join(", ") + ", and " + cleaned[cleaned.length - 1];
}

/** Render **bold** and _italic_ markdown in a pre-escaped string segment. */
function applyBold(html: string): string {
  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^A-Za-z0-9_])_([^\n_]+?)_(?=$|[^A-Za-z0-9_])/g, "$1<em>$2</em>");
}

function renderHtml(body: string, surviveLinkUrl: string) {
  const anchor = `<a href="${escapeHtml(surviveLinkUrl)}" style="color:#CE1126;text-decoration:underline;">SurviveAccounting.com</a>`;
  const paras = body.split(/\n\n+/).map((p) => {
    // Escape + linebreaks + bold across the WHOLE paragraph first so that
    // **bold spans crossing the {surviveaccounting.com} token still pair up.
    const rendered = applyBold(escapeHtml(p).replace(/\n/g, "<br/>"));
    const withLinks = rendered.split(SA_LINK_TOKEN).join(anchor);
    return `<p style="margin:0 0 14px;line-height:1.55;color:#1f2937;font-size:15px;">${withLinks}</p>`;
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
      const samplePogram = "School of Accountancy";
      const oleMissCodes = ["ACCY 201", "ACCY 202", "ACCY 303", "ACCY 304"];
      const sampleCourses = joinCourses(oleMissCodes);
      const sampleFullCodes = joinCoursesFull(oleMissCodes);
      const samplePhone = "(662) 565-8818";
      const samplePrefix = "ACCY";
      const surviveLinkUrl = "https://surviveaccounting.com";
      const rawBody = body.test_body ?? "";
      const rawSubject = body.test_subject ?? "";
      if (!rawSubject.trim() || !rawBody.trim()) {
        return new Response(JSON.stringify({ error: "test_subject and test_body required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const mergedBody = rawBody
        .replace(/\{\s*first\s*name\s*\}/gi, sampleFirst)
        .replace(/\{\s*recipient\s*name\s*\}/gi, "Dr. Smith")
        .replace(/\{\s*(?:campus\s*)?course\s*prefix\s*\}/gi, samplePrefix)
        .replace(/\{\s*program\s*\}/gi, samplePogram)
        .replace(/\{\s*courses\s*\}/gi, sampleCourses)
        .replace(/\{\s*phone\s*\}/gi, samplePhone)
        .replace(/\{\s*full\s*codes\s*\}/gi, sampleFullCodes)
        .replace(/\{\s*surviveaccounting\.com\s*\}/gi, SA_LINK_TOKEN)
        .replace(/\[First Name\]/g, sampleFirst)
        .replace(/\[Booking Link\]/g, BOOKING_LINK)
        .replace(/\[SurviveAccounting\.com\]/g, SA_LINK_TOKEN);
      const subject = "[TEST] " + rawSubject
        .replace(/\{\s*first\s*name\s*\}/gi, sampleFirst)
        .replace(/\{\s*recipient\s*name\s*\}/gi, "Dr. Smith")
        .replace(/\{\s*(?:campus\s*)?course\s*prefix\s*\}/gi, samplePrefix)
        .replace(/\[First Name\]/g, sampleFirst);
      const textBody = mergedBody.replaceAll(SA_LINK_TOKEN, `SurviveAccounting.com (${surviveLinkUrl})`).replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[^A-Za-z0-9_])_([^\n_]+?)_(?=$|[^A-Za-z0-9_])/g, "$1$2");

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
    let programName = "";
    let coursesText = "";
    let fullCoursesText = "";
    let prefixText = "";
    let usePersonalPhone = false;
    if (lead.campus_id) {
      const { data: campus } = await admin
        .from("campuses")
        .select("slug, approval_status, course_family_status_json, accounting_department_name, course_codes_json, use_personal_phone")
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
      programName = (campus?.accounting_department_name ?? "").trim();
      if (Array.isArray(campus?.course_codes_json)) {
        const codes = (campus.course_codes_json as unknown[]).filter((x): x is string => typeof x === "string");
        coursesText = joinCourses(codes);
        fullCoursesText = joinCoursesFull(codes);
        prefixText = coursePrefix(codes);
      }
      usePersonalPhone = !!campus?.use_personal_phone;
    }
    // Graceful fallbacks when research hasn't captured these yet.
    const programMerge = programName || "accounting program";
    const coursesMerge = coursesText || "Intro and Intermediate Accounting";
    const fullCoursesMerge = fullCoursesText || coursesMerge;
    const prefixMerge = prefixText || "accounting";

    // {phone} merge — hardcoded to Lee's main line.
    void usePersonalPhone;
    const campusPhone = "(662) 565-8818";

    // Use the bare URL (no UTM params) — query strings on links tend to
    // trip Gmail's promotions-tab heuristics for cold outreach.
    const surviveLinkUrl = "https://surviveaccounting.com";

    // Custom broadcast content (service-role only) overrides template lookup.
    const isCustom = !!(body.custom_subject && body.custom_body);
    if (isCustom && !isServiceRole) {
      return new Response(JSON.stringify({ error: "custom sends are service-role only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve template — pick the best active variant for this lead.
    const step = Math.max(0, Math.min(3, Number(body.follow_up ?? 0))) as 0 | 1 | 2 | 3;
    const kind = isCustom ? "broadcast" : step === 0 ? "initial" : `follow_up_${step}`;
    const candidates = isCustom
      ? [{ subject: body.custom_subject!, body: body.custom_body!, variant: "default" }]
      : (await admin
          .from("outreach_email_templates")
          .select("subject, body, variant")
          .eq("is_active", true)
          .eq("kind", kind)).data ?? [];
    if (candidates.length === 0) {
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
    // Safety: never send a broken sentence — if the template uses {phone}
    // but this campus has no texting number, refuse with a clear error.
    if (/\{\s*phone\s*\}/i.test(template.body + " " + template.subject) && !campusPhone) {
      return new Response(JSON.stringify({
        error: "template_uses_phone_without_number",
        message: "This template uses {phone}, but this campus has no texting number yet. Provision one first (Campuses tab) or use a template without {phone}.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let mergedBody = template.body
      .replace(/\{\s*first\s*name\s*\}/gi, greetingName)
      .replace(/\{\s*recipient\s*name\s*\}/gi, greetingName)
      .replace(/\{\s*(?:campus\s*)?course\s*prefix\s*\}/gi, prefixMerge)
      .replace(/\{\s*program\s*\}/gi, programMerge)
      .replace(/\{\s*courses\s*\}/gi, coursesMerge)
      .replace(/\{\s*phone\s*\}/gi, campusPhone)
      .replace(/\{\s*surviveaccounting\.com\s*\}/gi, SA_LINK_TOKEN)
      .replace(/\[First Name\]/g, greetingName)
      .replace(/\[Booking Link\]/g, BOOKING_LINK)
      .replace(/\[SurviveAccounting\.com\]/g, SA_LINK_TOKEN);

    if (body.include_landing_page && campusApproved && landingUrl) {
      mergedBody += `\n\nA quick landing page made for your students:\n${landingUrl}`;
    }

    // Every outreach email carries the human opt-out line — append if missing.
    if (!/reply.{0,30}(stop|let me know)/i.test(mergedBody)) {
      mergedBody += `\n\n${OPT_OUT_LINE}`;
    }

    const subject = template.subject
      .replace(/\{\s*first\s*name\s*\}/gi, greetingName)
      .replace(/\{\s*recipient\s*name\s*\}/gi, greetingName)
      .replace(/\{\s*(?:campus\s*)?course\s*prefix\s*\}/gi, prefixMerge)
      .replace(/\{\s*program\s*\}/gi, programMerge)
      .replace(/\{\s*courses\s*\}/gi, coursesMerge)
      .replace(/\{\s*phone\s*\}/gi, campusPhone)
      .replace(/\[First Name\]/g, greetingName);

    const textBody = mergedBody.replaceAll(SA_LINK_TOKEN, `SurviveAccounting.com (${surviveLinkUrl})`).replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[^A-Za-z0-9_])_([^\n_]+?)_(?=$|[^A-Za-z0-9_])/g, "$1$2");

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
    if (isCustom) { /* broadcasts don't advance the follow-up sequence */ }
    else if (step === 1) patch.follow_up_1_sent_at = now;
    else if (step === 2) patch.follow_up_2_sent_at = now;
    else if (step === 3) patch.follow_up_3_sent_at = now;
    else { patch.sent_at = now; patch.scheduled_send_at = null; }

    await admin.from("outreach_leads").update(patch).eq("id", lead.id);
    await admin.from("outreach_send_log").insert({ sender_email: senderEmail, lead_id: lead.id, sent_at: now });
    await admin.from("outreach_email_events").insert({
      lead_id: lead.id,
      message_id: messageId,
      event_type: "sent",
      payload: { subject, follow_up: body.follow_up ?? 0, sender: senderEmail, variant: chosenVariant, broadcast_id: body.broadcast_id ?? null, kind },
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
