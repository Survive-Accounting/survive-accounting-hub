// Inbound voice webhook (Twilio): plays Lee's "text me instead" greeting and
// logs the missed call into the conversation stream for that campus number.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const GREETING =
  "Hey, you've reached Lee with Survive Accounting. I'm probably in a tutoring session right now. " +
  "Shoot me a text at this same number and I'll get right back to you. Talk soon!";

Deno.serve(async (req) => {
  const params = new URLSearchParams(await req.text());
  const from = (params.get("From") ?? "").trim();
  const to = (params.get("To") ?? "").trim();

  if (from && to) {
    const { data: existing } = await admin.from("sms_conversations")
      .select("id").eq("student_phone", from).eq("campus_number", to).maybeSingle();
    let convoId = existing?.id;
    if (!convoId) {
      const { data: numberRow } = await admin.from("campus_phone_numbers")
        .select("campus_id").eq("phone_e164", to).maybeSingle();
      const { data: created } = await admin.from("sms_conversations")
        .insert({ student_phone: from, campus_number: to, campus_id: numberRow?.campus_id ?? null })
        .select("id").single();
      convoId = created?.id;
    }
    if (convoId) {
      await admin.from("sms_messages").insert({
        conversation_id: convoId, direction: "in", author: "student", body: "[Called — heard the text-me greeting]",
      });
      await admin.from("sms_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convoId);
    }
  }

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">${GREETING}</Say></Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
});
