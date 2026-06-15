// Buys a Twilio local number for an approved campus (matching the campus's
// state when possible), wires it to the SMS + voice webhooks, and records it.
// Invoke: { campus_id }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const PROJECT_FN = `${SUPABASE_URL}/functions/v1`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const twilioAuth = "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!TWILIO_SID || !TWILIO_TOKEN) {
      return new Response(JSON.stringify({ error: "Twilio secrets not set" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const body = await req.json().catch(() => ({}));
    const { campus_id, global: isGlobal, release_sid, release_campus_id } = body as {
      campus_id?: string; global?: boolean; release_sid?: string; release_campus_id?: string;
    };

    // Release mode — relinquish a Twilio number and drop its row.
    if (release_sid || release_campus_id) {
      let sid = release_sid ?? null;
      let row: { id: string; twilio_sid: string; phone_e164: string } | null = null;
      if (release_campus_id) {
        const { data } = await admin.from("campus_phone_numbers")
          .select("id,twilio_sid,phone_e164").eq("campus_id", release_campus_id).maybeSingle();
        row = (data as any) ?? null;
        sid = sid ?? row?.twilio_sid ?? null;
      } else if (sid) {
        const { data } = await admin.from("campus_phone_numbers")
          .select("id,twilio_sid,phone_e164").eq("twilio_sid", sid).maybeSingle();
        row = (data as any) ?? null;
      }
      if (!sid) return new Response(JSON.stringify({ error: "no twilio_sid to release" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      const del = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${sid}.json`, {
        method: "DELETE", headers: { Authorization: twilioAuth },
      });
      const twilioOk = del.status === 204 || del.status === 404;
      const twilioBody = twilioOk ? null : await del.text().catch(() => "");
      if (row?.id) await admin.from("campus_phone_numbers").delete().eq("id", row.id);
      return new Response(JSON.stringify({
        ok: twilioOk, released_sid: sid, released_phone: row?.phone_e164 ?? null,
        twilio_status: del.status, twilio_error: twilioOk ? null : twilioBody,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (!campus_id && !isGlobal) return new Response(JSON.stringify({ error: "campus_id or global required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    let q = admin.from("campus_phone_numbers").select("phone_e164");
    q = campus_id ? q.eq("campus_id", campus_id) : q.is("campus_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing) return new Response(JSON.stringify({ ok: true, phone: existing.phone_e164, existing: true }), { headers: { ...cors, "Content-Type": "application/json" } });

    let campus: { name: string; state: string | null } | null = null;
    if (campus_id) {
      const { data } = await admin.from("campuses").select("name,state").eq("id", campus_id).single();
      if (!data) return new Response(JSON.stringify({ error: "campus not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      campus = data as any;
    } else {
      campus = { name: "Main Line", state: "MS" }; // Lee's home turf for the area code
    }

    // Find a local number in the campus's state; fall back to any US local.
    const search = async (qs: string) => {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&VoiceEnabled=true&PageSize=1${qs}`,
        { headers: { Authorization: twilioAuth } });
      const j = await r.json().catch(() => ({}));
      return j?.available_phone_numbers?.[0]?.phone_number ?? null;
    };
    const candidate = (campus!.state ? await search(`&InRegion=${encodeURIComponent(campus!.state)}`) : null) ?? (await search(""));
    if (!candidate) return new Response(JSON.stringify({ error: "No numbers available right now" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });

    const buy = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json`, {
      method: "POST",
      headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        PhoneNumber: candidate,
        FriendlyName: `SA — ${campus!.name}`.slice(0, 64),
        SmsUrl: `${PROJECT_FN}/twilio-sms-webhook`,
        SmsMethod: "POST",
        VoiceUrl: `${PROJECT_FN}/twilio-voice-webhook`,
        VoiceMethod: "POST",
      }),
    });
    const bought = await buy.json().catch(() => ({}));
    if (!buy.ok) return new Response(JSON.stringify({ error: "Twilio purchase failed", details: bought }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });

    await admin.from("campus_phone_numbers").insert({
      campus_id: campus_id ?? null, phone_e164: bought.phone_number, twilio_sid: bought.sid,
    });
    return new Response(JSON.stringify({ ok: true, phone: bought.phone_number }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
