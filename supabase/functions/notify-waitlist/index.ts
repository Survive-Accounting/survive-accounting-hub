// Texts Lee a summary the moment a waitlist signup lands (DB trigger -> here).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_MSID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "";
const LEE_PHONE = (Deno.env.get("LEE_PERSONAL_PHONE") ?? "").replace(/[^+\d]/g, "");
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!TWILIO_SID || !TWILIO_TOKEN || !LEE_PHONE) {
    return new Response(JSON.stringify({ ok: true, skipped: "twilio or phone not configured" }));
  }

  const { record } = await req.json().catch(() => ({ record: null }));
  if (!record) return new Response(JSON.stringify({ error: "no record" }), { status: 400 });

  // Send from the main line so Lee's phone threads it consistently.
  const { data: main } = await admin
    .from("campus_phone_numbers").select("phone_e164").is("campus_id", null).maybeSingle();
  if (!main?.phone_e164) return new Response(JSON.stringify({ ok: true, skipped: "no main line yet" }));

  const wants = [record.wants_text ? "text" : null, record.wants_call ? "call" : null].filter(Boolean).join(" + ") || "no preference";
  const lines = [
    `📋 Waitlist: ${record.name || "No name"} — ${record.campus_text || "campus?"}${record.course_text ? ` (${record.course_text})` : ""}`,
    `${record.email}${record.phone ? ` · ${record.phone}` : ""}`,
    `Wants: ${wants}`,
  ];
  if (!TWILIO_MSID) {
    return new Response(JSON.stringify({ ok: true, skipped: "TWILIO_MESSAGING_SERVICE_SID not configured" }));
  }
  // Use the messaging service so the carrier-approved sender pool picks the From number.
  void main; // kept above only to gate on "main line provisioned" before notifying Lee.
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ MessagingServiceSid: TWILIO_MSID, To: LEE_PHONE, Body: lines.join("\n") }),
  });
  return new Response(JSON.stringify({ ok: true }));
});
