// Sends due queued SMS. Called every minute by pg_cron (x-cron-secret) and
// opportunistically by the dashboard after composing a reply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const TWILIO_MSID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  // Accept either the cron secret or any project JWT (dashboard nudge).
  if (CRON_SECRET && headerSecret !== CRON_SECRET && !auth.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { data: due } = await admin
    .from("sms_outbox")
    .select("id, body, conversation_id, author")
    .eq("status", "queued")
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true })
    .limit(20);

  let sent = 0, failed = 0;
  for (const row of due ?? []) {
    const { data: convo } = await admin.from("sms_conversations")
      .select("student_phone, campus_number, status").eq("id", row.conversation_id).single();
    if (!convo || convo.status !== "active") {
      await admin.from("sms_outbox").update({ status: "canceled" }).eq("id", row.id);
      continue;
    }
    if (!TWILIO_MSID) {
      await admin.from("sms_outbox").update({ status: "failed", error: "TWILIO_MESSAGING_SERVICE_SID is not configured" }).eq("id", row.id);
      failed++;
      continue;
    }
    const sendParams = new URLSearchParams({
      MessagingServiceSid: TWILIO_MSID,
      To: convo.student_phone,
      Body: row.body,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: sendParams,
      },
    );
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      await admin.from("sms_outbox").update({ status: "sent" }).eq("id", row.id);
      await admin.from("sms_messages").insert({
        conversation_id: row.conversation_id, direction: "out", author: row.author ?? "auto",
        body: row.body, twilio_sid: j?.sid ?? null,
      });
      await admin.from("sms_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", row.conversation_id);
      sent++;
    } else {
      await admin.from("sms_outbox").update({ status: "failed", error: JSON.stringify(j).slice(0, 500) }).eq("id", row.id);
      failed++;
    }
  }
  return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
