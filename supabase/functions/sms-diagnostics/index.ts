// SMS diagnostics for the operator dashboard: verifies the purchased number's
// webhook settings and shows recent provider-side message delivery results.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const PROJECT_FN = `${SUPABASE_URL}/functions/v1`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function twilioHeaders() {
  return { Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`) };
}

async function twilioJson(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.twilio.com${path}`, {
    ...init,
    headers: { ...twilioHeaders(), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!TWILIO_SID || !TWILIO_TOKEN) {
      return new Response(JSON.stringify({ error: "SMS provider credentials are missing" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: mainLine } = await admin
      .from("campus_phone_numbers")
      .select("phone_e164,twilio_sid")
      .is("campus_id", null)
      .maybeSingle();

    if (!mainLine?.twilio_sid || !mainLine?.phone_e164) {
      return new Response(JSON.stringify({ error: "Main SMS line is not provisioned" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const expectedSmsUrl = `${PROJECT_FN}/twilio-sms-webhook`;
    const expectedVoiceUrl = `${PROJECT_FN}/twilio-voice-webhook`;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.action !== "resync") {
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }
      await twilioJson(`/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${mainLine.twilio_sid}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          SmsUrl: expectedSmsUrl,
          SmsMethod: "POST",
          VoiceUrl: expectedVoiceUrl,
          VoiceMethod: "POST",
        }),
      });
    }

    const number = await twilioJson(`/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${mainLine.twilio_sid}.json`);
    const messagesBody = await twilioJson(`/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=30`);
    const recentMessages = (messagesBody.messages ?? [])
      .filter((m: any) => m.from === mainLine.phone_e164 || m.to === mainLine.phone_e164)
      .slice(0, 12)
      .map((m: any) => ({
        sid: m.sid,
        date_created: m.date_created,
        date_sent: m.date_sent,
        direction: m.direction,
        from: m.from,
        to: m.to,
        status: m.status,
        error_code: m.error_code,
        body: typeof m.body === "string" ? m.body.slice(0, 220) : "",
      }));

    const alertsBody = await fetch("https://monitor.twilio.com/v1/Alerts?PageSize=12", { headers: twilioHeaders() })
      .then((r) => r.ok ? r.json() : { alerts: [] })
      .catch(() => ({ alerts: [] }));
    const recentAlerts = (alertsBody.alerts ?? []).map((a: any) => ({
      sid: a.sid,
      date_generated: a.date_generated,
      error_code: a.error_code,
      log_level: a.log_level,
      resource_sid: a.resource_sid,
      more_info: a.more_info,
    }));

    return new Response(JSON.stringify({
      ok: true,
      checked_at: new Date().toISOString(),
      main_line: mainLine.phone_e164,
      expected_sms_url: expectedSmsUrl,
      number: {
        phone_number: number.phone_number,
        friendly_name: number.friendly_name,
        status: number.status,
        sms_url: number.sms_url,
        sms_method: number.sms_method,
        voice_url: number.voice_url,
        voice_method: number.voice_method,
        capabilities: number.capabilities,
      },
      webhook_ok: number.sms_url === expectedSmsUrl && number.sms_method === "POST",
      recent_messages: recentMessages,
      recent_alerts: recentAlerts,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});