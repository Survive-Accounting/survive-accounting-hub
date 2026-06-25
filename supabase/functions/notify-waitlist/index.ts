// Notifies Lee the moment a campus_waitlist row is created (DB trigger ->
// here). Sends BOTH:
//   1. An email to Lee (Resend) with the full signup details.
//   2. A short SMS summary to Lee's PERSONAL phone via the approved A2P
//      Messaging Service.
// When the signup includes a phone, we also find-or-create an sms_conversation
// on the main work line so the lead shows up in the Texts panel AND Lee can
// reply straight from his phone with "#<ref> <message>" — that relay goes out
// from the WORK number (twilio-sms-webhook handles it), keeping his personal
// number private. If there's no phone, the reply path is email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_MSID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "";
// REST auth: prefer a scoped API key (SK…); the Account SID (AC…) always stays
// in the URL path. Falls back to AccountSid:AuthToken if no API key is set.
const TWILIO_AUTH_USER = (Deno.env.get("TWILIO_API_KEY_SID") ?? "") || TWILIO_SID;
const TWILIO_AUTH_PASS = (Deno.env.get("TWILIO_API_KEY_SECRET") ?? "") || TWILIO_TOKEN;
const LEE_PHONE = (Deno.env.get("LEE_PERSONAL_PHONE") ?? "").replace(/[^+\d]/g, "");
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "Lee Ingram <lee@mail.surviveaccounting.com>";
const REPLY_TO = "lee@surviveaccounting.com";
// Where the internal alert email lands (defaults to Lee's inbox).
const LEE_EMAIL = Deno.env.get("LEE_ALERT_EMAIL") ?? "lee@surviveaccounting.com";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const PLAN_LABELS: Record<string, string> = {
  test_pass: "Just One Test",
  membership: "Semester Membership",
  prepay: "Premium 1-on-1",
  free_videos: "Free videos",
};

/** Human-readable plan from the structured tier or the encoded `source`. */
function planLabel(rec: Record<string, unknown>): string {
  const tier = String(rec.tier_interest ?? "").trim();
  if (tier && PLAN_LABELS[tier]) return PLAN_LABELS[tier];
  const src = String(rec.source ?? "").trim();
  const key = src.replace(/^onboarding_/, "").replace(/^pricing_page_/, "");
  if (PLAN_LABELS[key]) return PLAN_LABELS[key];
  return tier || src || "—";
}

/** Normalize a free-text phone to E.164 (US-friendly), or null if unusable. */
function normPhone(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (raw.includes("web:")) return null; // synthetic web marker, not a real phone
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const d = trimmed.replace(/[^\d]/g, "");
    return d.length >= 11 ? "+" + d : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function sendLeeSms(body: string): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_AUTH_PASS || !LEE_PHONE) return { ok: false, error: "twilio or LEE_PERSONAL_PHONE not configured" };
  if (!TWILIO_MSID) return { ok: false, error: "TWILIO_MESSAGING_SERVICE_SID not configured" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_AUTH_USER}:${TWILIO_AUTH_PASS}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ MessagingServiceSid: TWILIO_MSID, To: LEE_PHONE, Body: body }),
    });
    if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendLeeEmail(rec: Record<string, unknown>, plan: string, phone: string | null, shortRef: number | null): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  const name = String(rec.name ?? "").trim() || "No name given";
  const email = String(rec.email ?? "").trim();
  const created = rec.created_at ? new Date(String(rec.created_at)) : new Date();
  const when = created.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });

  const fields: [string, string | null][] = [
    ["Name", String(rec.name ?? "") || null],
    ["Email", email || null],
    ["Phone", String(rec.phone ?? "") || null],
    ["School", String(rec.campus_text ?? "") || null],
    ["Course", String(rec.course_text ?? "") || null],
    ["Plan", plan],
    ["Accounting major", String(rec.accounting_major ?? "") || null],
    ["Source", String(rec.source ?? "") || null],
    ["Signed up", `${when} CT`],
  ];
  const tableRows = fields
    .map(([k, v]) =>
      `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap">${k}</td><td style="padding:5px 0;font-weight:600;color:#14213D">${escapeHtml(v ?? "—")}</td></tr>`)
    .join("");

  const reply = phone
    ? `<b>Reply path:</b> open the <b>Texts</b> panel and reply, or text <b>#${shortRef}</b> from your phone — it goes out from your work number, never your personal cell.`
    : `<b>Reply path:</b> no phone provided — reply by email${email ? ` to <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ""}.`;

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:540px;color:#14213D">
    <h2 style="margin:0 0 2px;color:#14213D">New waitlist signup</h2>
    <p style="margin:0 0 18px;color:#6b7280">${escapeHtml(name)} just joined the list (${escapeHtml(plan)}).</p>
    <table style="border-collapse:collapse;font-size:14px">${tableRows}</table>
    <p style="margin:18px 0 0;font-size:13px;color:#374151;line-height:1.5;border-top:1px solid #e5e7eb;padding-top:12px">${reply}</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [LEE_EMAIL],
        reply_to: phone ? REPLY_TO : (email || REPLY_TO),
        subject: `New waitlist: ${name} — ${plan}`,
        html,
      }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { record } = await req.json().catch(() => ({ record: null }));
  if (!record) return new Response(JSON.stringify({ error: "no record" }), { status: 400 });

  const plan = planLabel(record);
  const phone = normPhone(record.phone);

  // Find-or-create an sms_conversation on the main line so this lead is
  // reply-able from the work number. Best-effort — failure here never blocks
  // the email/SMS alerts.
  let shortRef: number | null = null;
  if (phone) {
    try {
      const { data: main } = await admin
        .from("campus_phone_numbers").select("phone_e164").is("campus_id", null).maybeSingle();
      const mainLine = main?.phone_e164 ?? null;
      if (mainLine) {
        const { data: existing } = await admin
          .from("sms_conversations").select("id, short_ref")
          .eq("student_phone", phone).eq("campus_number", mainLine).maybeSingle();
        if (existing) {
          shortRef = existing.short_ref;
          const patch: Record<string, string> = {};
          if (record.course_text) patch.course = String(record.course_text);
          if (record.accounting_major) patch.major = String(record.accounting_major);
          if (Object.keys(patch).length) await admin.from("sms_conversations").update(patch).eq("id", existing.id);
        } else {
          const { data: created } = await admin
            .from("sms_conversations")
            .insert({
              student_phone: phone,
              campus_number: mainLine,
              campus_id: null,
              status: "active",
              course: record.course_text ? String(record.course_text) : null,
              major: record.accounting_major ? String(record.accounting_major) : null,
            })
            .select("id, short_ref").single();
          shortRef = created?.short_ref ?? null;
        }
      }
    } catch (_e) { /* non-fatal */ }
  }

  // SMS summary to Lee's personal phone.
  const name = String(record.name ?? "").trim() || "No name";
  const school = String(record.campus_text ?? "").trim() || "school?";
  const phoneDisp = String(record.phone ?? "").trim() || "no phone";
  let smsBody = `📋 New waitlist: ${name} · ${school} · ${plan} · ${phoneDisp}`;
  smsBody += shortRef != null
    ? `\nReply #${shortRef} to text them back (from your work line).`
    : `\nNo phone — reply by email.`;

  const [smsRes, emailRes] = await Promise.all([
    sendLeeSms(smsBody),
    sendLeeEmail(record, plan, phone, shortRef),
  ]);

  return new Response(JSON.stringify({
    ok: true,
    short_ref: shortRef,
    sms: smsRes,
    email: emailRes,
  }), { headers: { "Content-Type": "application/json" } });
});
