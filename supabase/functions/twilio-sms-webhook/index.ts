// Inbound SMS webhook (Twilio). Handles:
// 1) Student texts a campus number → create conversation, queue Lee's scripted
//    opener (randomized human delay) + follow-up questions, notify Lee.
// 2) Student replies → store, extract structured data (Claude, optional),
//    text Lee a summary from the same campus number (reply-to-relay).
// 3) Lee texts a campus number from his personal phone → relay his words to
//    the active student conversation on that number (use "#ref " prefix to
//    disambiguate when multiple are active).
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, LEE_PERSONAL_PHONE,
//          ANTHROPIC_API_KEY (optional — extraction skipped without it),
//          SITE_ORIGIN (optional, default https://surviveaccounting.com)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const LEE_PHONE = (Deno.env.get("LEE_PERSONAL_PHONE") ?? "").replace(/[^+\d]/g, "");
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SITE_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://surviveaccounting.com";

// Human-feel delay for the scripted opener (Lee-approved range).
const OPENER_DELAY_MIN_SECONDS = 4 * 60;
const OPENER_DELAY_MAX_SECONDS = 9 * 60;
const FOLLOWUP_GAP_SECONDS = 90;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function twilioSend(from: string, to: string, body: string): Promise<string | null> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    },
  );
  const j = await res.json().catch(() => ({}));
  return res.ok ? (j?.sid ?? null) : null;
}

function openerBody(slug: string | null): string {
  // Campus-specific numbers link straight to that campus page; the main line
  // links to the campus selector at /start.
  const link = slug ? `${SITE_ORIGIN}/t/${slug}` : `${SITE_ORIGIN}/start`;
  return `Hey! Thanks for reaching out. I'd be happy to help you. You can book with me here: ${link}`;
}

const FOLLOWUP_BODY =
  "Also, which course are you in, and how's it going so far? When is your next exam? What chapters/topics are you struggling with most?\n\nLooking forward to hearing back!\nLee";

/** Claude extraction — fills course/exam_date/struggles/major/sentiment. */
async function extract(conversationText: string, courseCodes: string[]): Promise<Record<string, string | null> | null> {
  if (!ANTHROPIC_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{
          role: "user",
          content:
            `Extract structured data from this SMS conversation between a tutor's intake line and an accounting student. Known course codes at this campus: ${courseCodes.join(", ") || "unknown"}.\n\nConversation:\n${conversationText}\n\nRespond ONLY with JSON (no prose, no markdown): {"course": string|null (match to a known code when possible), "exam_date": string|null (as said, e.g. "next Thursday" or "Oct 14"), "struggles": string|null (short summary), "major": string|null, "sentiment": "positive"|"neutral"|"stressed"|null}`,
        }],
      }),
    });
    const j = await res.json();
    const text = j?.content?.find((b: any) => b.type === "text")?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Twilio posts application/x-www-form-urlencoded
  const params = new URLSearchParams(await req.text());
  const from = (params.get("From") ?? "").trim();
  const to = (params.get("To") ?? "").trim();
  const body = (params.get("Body") ?? "").trim();
  const sid = params.get("MessageSid");

  const twiml = (msg?: string) =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ""}</Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );

  if (!from || !to) return twiml();

  // ---------- Lee relay: his personal phone texting a campus number ----------
  if (LEE_PHONE && from.replace(/[^+\d]/g, "") === LEE_PHONE) {
    let targetRef: number | null = null;
    let relayBody = body;
    const m = body.match(/^#(\d+)\s+([\s\S]+)/);
    if (m) { targetRef = Number(m[1]); relayBody = m[2].trim(); }

    let q = admin.from("sms_conversations").select("*").eq("campus_number", to).eq("status", "active");
    if (targetRef != null) q = q.eq("short_ref", targetRef);
    const { data: convos } = await q.order("last_message_at", { ascending: false }).limit(2);

    if (!convos?.length) return twiml("No active conversation on this number.");
    if (convos.length > 1 && targetRef == null) {
      return twiml(`Multiple active students here — start your reply with #${convos[0].short_ref} (latest) or the ref from the summary.`);
    }
    const convo = convos[0];
    const msgSid = await twilioSend(to, convo.student_phone, relayBody);
    await admin.from("sms_messages").insert({ conversation_id: convo.id, direction: "out", author: "lee", body: relayBody, twilio_sid: msgSid });
    await admin.from("sms_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convo.id);
    return twiml();
  }

  // ---------- Student message ----------
  // Resolve the campus behind this number.
  const { data: numberRow } = await admin
    .from("campus_phone_numbers").select("campus_id").eq("phone_e164", to).maybeSingle();
  let campus: { id: string; name: string; slug: string; course_codes_json: unknown } | null = null;
  if (numberRow?.campus_id) {
    const { data } = await admin.from("campuses")
      .select("id,name,slug,course_codes_json").eq("id", numberRow.campus_id).single();
    campus = data as any;
  }

  // Find or create the conversation.
  const { data: existing } = await admin.from("sms_conversations")
    .select("*").eq("student_phone", from).eq("campus_number", to).maybeSingle();

  // Opt-out keywords — respect immediately, cancel anything queued.
  if (/^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i.test(body)) {
    if (existing) {
      await admin.from("sms_conversations").update({ status: "opted_out" }).eq("id", existing.id);
      await admin.from("sms_outbox").update({ status: "canceled" }).eq("conversation_id", existing.id).eq("status", "queued");
      await admin.from("sms_messages").insert({ conversation_id: existing.id, direction: "in", author: "student", body, twilio_sid: sid });
    }
    return twiml(); // Twilio's own opt-out handling sends the confirmation
  }

  let convo = existing;
  const isFirst = !existing;
  if (!convo) {
    const { data: created } = await admin.from("sms_conversations")
      .insert({ student_phone: from, campus_number: to, campus_id: campus?.id ?? null })
      .select("*").single();
    convo = created;
  } else {
    await admin.from("sms_conversations").update({ last_message_at: new Date().toISOString(), status: "active" }).eq("id", convo.id);
  }
  if (!convo) return twiml();

  await admin.from("sms_messages").insert({ conversation_id: convo.id, direction: "in", author: "student", body, twilio_sid: sid });

  const campusLabel = campus?.name ?? to;

  if (isFirst && !convo.opener_sent) {
    // Queue Lee's scripted opener with a human-feel delay, then the follow-up.
    const delay = OPENER_DELAY_MIN_SECONDS + Math.floor(Math.random() * (OPENER_DELAY_MAX_SECONDS - OPENER_DELAY_MIN_SECONDS));
    const t1 = new Date(Date.now() + delay * 1000).toISOString();
    const t2 = new Date(Date.now() + (delay + FOLLOWUP_GAP_SECONDS) * 1000).toISOString();
    await admin.from("sms_outbox").insert([
      { conversation_id: convo.id, body: openerBody(campus?.slug ?? null), send_at: t1 },
      { conversation_id: convo.id, body: FOLLOWUP_BODY, send_at: t2 },
    ]);
    await admin.from("sms_conversations").update({ opener_sent: true }).eq("id", convo.id);

    if (LEE_PHONE) {
      await twilioSend(to, LEE_PHONE,
        `#${convo.short_ref} New student text — ${campusLabel}\nFrom ${from}: "${body}"\nAuto-reply queued (~${Math.round(delay / 60)} min). Reply to this thread to jump in yourself.`);
    }
    return twiml();
  }

  // Subsequent reply: extract structured data, then summarize to Lee.
  const { data: history } = await admin.from("sms_messages")
    .select("direction,author,body").eq("conversation_id", convo.id)
    .order("created_at", { ascending: true }).limit(30);
  const transcript = (history ?? [])
    .map((m: any) => `${m.direction === "in" ? "Student" : m.author === "lee" ? "Lee" : "Lee (auto)"}: ${m.body}`)
    .join("\n");
  const codes = Array.isArray(campus?.course_codes_json)
    ? (campus!.course_codes_json as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const extracted = await extract(transcript, codes);
  if (extracted) {
    const patch: Record<string, string> = {};
    for (const k of ["course", "exam_date", "struggles", "major", "sentiment"] as const) {
      const v = extracted[k];
      if (typeof v === "string" && v.trim()) patch[k] = v.trim();
    }
    if (Object.keys(patch).length) await admin.from("sms_conversations").update(patch).eq("id", convo.id);
  }

  if (LEE_PHONE) {
    const facts = [
      extracted?.course ? `Course: ${extracted.course}` : null,
      extracted?.exam_date ? `Exam: ${extracted.exam_date}` : null,
      extracted?.struggles ? `Struggling with: ${extracted.struggles}` : null,
      extracted?.major ? `Major: ${extracted.major}` : null,
    ].filter(Boolean).join(" | ");
    await twilioSend(to, LEE_PHONE,
      `#${convo.short_ref} ${campusLabel} — "${body}"${facts ? `\n${facts}` : ""}\nReply to this thread to text them back.`);
  }

  return twiml();
});
