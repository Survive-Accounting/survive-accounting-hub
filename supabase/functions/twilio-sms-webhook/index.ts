// Inbound SMS webhook (Twilio). Handles:
// 1) Student texts a campus number → create conversation, send scripted opener,
//    notify Lee.
// 2) Student replies → store, extract structured data (Claude, optional),
//    text Lee a summary from the same campus number (reply-to-relay).
// 3) Lee texts a campus number from his personal phone → relay his words to
//    the active student conversation on that number (use "#ref " prefix to
//    disambiguate when multiple are active).
//
// Tester phones (SMS_TESTER_PHONES, comma-separated E.164) bypass the
// "already-sent-booking-link" guard so the full auto flow re-runs every time
// you re-text from the test number. Real returning students get a single
// low-key acknowledgement at most once per 24h.
//
// Every inbound is logged to sms_inbound_raw BEFORE any business logic so we
// can prove whether a missing reply was a Twilio problem or a logic problem.
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, LEE_PERSONAL_PHONE,
//          ANTHROPIC_API_KEY (optional — extraction skipped without it),
//          SMS_TESTER_PHONES (optional, comma-separated),
//          SITE_ORIGIN (optional, default https://surviveaccounting.com)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_MSID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "";
const LEE_PHONE = (Deno.env.get("LEE_PERSONAL_PHONE") ?? "").replace(/[^+\d]/g, "");
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SITE_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://surviveaccounting.com";
const TESTER_PHONES = new Set(
  (Deno.env.get("SMS_TESTER_PHONES") ?? "")
    .split(",")
    .map((s) => s.trim().replace(/[^+\d]/g, ""))
    .filter(Boolean),
);

// Fallback copy used only if a template row is missing in the DB.
// Fallback copy used only if a template row is missing in the DB.
// New flow (Phase 3): the opener IS the booking link — we no longer ask
// course/exam/topic questions by SMS. /start collects all of that.
const FALLBACK_OPENER =
  "Need tutoring?\n\n" +
  "Upload your syllabus to book sessions\n" +
  "https://surviveaccounting.com/start\n\n" +
  "Questions? Just reply here.\n\n" +
  "Big thanks!\n" +
  "Lee";
const FALLBACK_BOOKING =
  FALLBACK_OPENER;
const FALLBACK_ACK = "Got it — passing this along to Lee. He'll text you back personally when he gets a moment.";
const FALLBACK_LEE_NEW =
  '#{ref} New student text — {campus}{tester_flag}\nFrom {from}: "{body}"\nAuto-questions sent. Reply to this thread to jump in yourself.';
const FALLBACK_LEE_FOLLOWUP =
  '#{ref} {campus}{tester_flag} — "{body}"{facts}\nReply to this thread to text them back.';

function render(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? "");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function twilioSend(from: string, to: string, body: string): Promise<string | null> {
  if (!TWILIO_SID || !TWILIO_TOKEN) return null;
  if (!TWILIO_MSID) {
    console.error("twilio-sms-webhook: TWILIO_MESSAGING_SERVICE_SID not configured; refusing to send outbound SMS");
    return null;
  }
  // Always route outbound through the approved A2P Messaging Service.
  // `from` (the campus number the student texted) is intentionally ignored —
  // the messaging service's sender pool picks the From number.
  void from;
  const params = new URLSearchParams({ MessagingServiceSid: TWILIO_MSID, To: to, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const j = await res.json().catch(() => ({}));
  return res.ok ? (j?.sid ?? null) : null;
}

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
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const from = (params.get("From") ?? "").trim();
  const to = (params.get("To") ?? "").trim();
  const body = (params.get("Body") ?? "").trim();
  const sid = params.get("MessageSid");
  const payloadObj: Record<string, string> = {};
  params.forEach((v, k) => { payloadObj[k] = v; });

  // Forensic landing — write the raw inbound before doing anything else so a
  // later crash still leaves a trace.
  let rawRowId: string | null = null;
  try {
    const { data: rawRow } = await admin
      .from("sms_inbound_raw")
      .insert({
        from_number: from || null,
        to_number: to || null,
        body: body || null,
        twilio_sid: sid,
        raw_payload: payloadObj,
        parse_status: "received",
      })
      .select("id")
      .single();
    rawRowId = (rawRow as { id?: string } | null)?.id ?? null;
  } catch (_) { /* never let logging fail the webhook */ }

  const finalizeRaw = async (status: string, error: string | null, conversationId: string | null) => {
    if (!rawRowId) return;
    try {
      await admin
        .from("sms_inbound_raw")
        .update({ parse_status: status, error, conversation_id: conversationId })
        .eq("id", rawRowId);
    } catch (_) { /* swallow */ }
  };

  const twiml = (msg?: string) =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ""}</Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );

  if (!from || !to) {
    await finalizeRaw("missing_from_or_to", "From or To header missing", null);
    return twiml();
  }
  // Load editable templates from DB (graceful fallback to baked-in copy).
  const { data: tplRows } = await admin.from("sms_templates").select("key,body");
  const tplMap = new Map<string, string>((tplRows ?? []).map((r: any) => [r.key, r.body]));
  const TPL_OPENER = tplMap.get("opener_questions") || FALLBACK_OPENER;
  const TPL_BOOKING = tplMap.get("booking_reply") || FALLBACK_BOOKING;
  const TPL_ACK = tplMap.get("ack_reply") || FALLBACK_ACK;
  const TPL_LEE_NEW = tplMap.get("lee_new_summary") || FALLBACK_LEE_NEW;
  const TPL_LEE_FOLLOWUP = tplMap.get("lee_followup_summary") || FALLBACK_LEE_FOLLOWUP;

  try {
    // ---------- Lee relay: his personal phone texting a campus number ----------
    if (LEE_PHONE && from.replace(/[^+\d]/g, "") === LEE_PHONE) {
      let targetRef: number | null = null;
      let relayBody = body;
      const m = body.match(/^#(\d+)\s+([\s\S]+)/);
      if (m) { targetRef = Number(m[1]); relayBody = m[2].trim(); }

      let q = admin.from("sms_conversations").select("*").eq("campus_number", to).eq("status", "active");
      if (targetRef != null) q = q.eq("short_ref", targetRef);
      const { data: convos } = await q.order("last_message_at", { ascending: false }).limit(2);

      if (!convos?.length) {
        await finalizeRaw("lee_relay_no_target", null, null);
        return twiml("No active conversation on this number.");
      }
      if (convos.length > 1 && targetRef == null) {
        await finalizeRaw("lee_relay_ambiguous", null, null);
        return twiml(`Multiple active students here — start your reply with #${convos[0].short_ref} (latest) or the ref from the summary.`);
      }
      const convo = convos[0];
      const msgSid = await twilioSend(to, convo.student_phone, relayBody);
      await admin.from("sms_messages").insert({ conversation_id: convo.id, direction: "out", author: "lee", body: relayBody, twilio_sid: msgSid });
      await admin.from("sms_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convo.id);
      await finalizeRaw("lee_relayed", null, convo.id);
      return twiml();
    }

    // ---------- Student message ----------
    const fromNorm = from.replace(/[^+\d]/g, "");
    const isTesterPhone = TESTER_PHONES.has(fromNorm);

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
      await finalizeRaw("opted_out", null, existing?.id ?? null);
      return twiml();
    }

    let convo: any = existing;
    const isFirst = !existing;
    if (!convo) {
      const { data: created } = await admin.from("sms_conversations")
        .insert({ student_phone: from, campus_number: to, campus_id: campus?.id ?? null, is_tester: isTesterPhone })
        .select("*").single();
      convo = created;
    } else {
      const patch: Record<string, unknown> = { last_message_at: new Date().toISOString(), status: "active" };
      if (isTesterPhone && !existing.is_tester) patch.is_tester = true;
      await admin.from("sms_conversations").update(patch).eq("id", convo.id);
    }
    if (!convo) {
      await finalizeRaw("convo_create_failed", "unable to upsert conversation", null);
      return twiml();
    }

    await admin.from("sms_messages").insert({ conversation_id: convo.id, direction: "in", author: "student", body, twilio_sid: sid });

    const campusLabel = campus?.name ?? to;
    const isTester = isTesterPhone || convo.is_tester === true;

    // First message in conversation: send scripted opener.
    if (isFirst && !convo.opener_sent) {
      const sentSid = await twilioSend(to, from, TPL_OPENER);
      await admin.from("sms_messages").insert({
        conversation_id: convo.id, direction: "out", author: "auto", body: TPL_OPENER, twilio_sid: sentSid,
      });
      await admin.from("sms_conversations").update({ opener_sent: true }).eq("id", convo.id);

      if (LEE_PHONE) {
        const summary = render(TPL_LEE_NEW, {
          ref: String(convo.short_ref),
          campus: campusLabel,
          tester_flag: isTester ? " [TESTER]" : "",
          from,
          body,
        });
        await twilioSend(to, LEE_PHONE, summary);
      }
      await finalizeRaw("first_message_opener_sent", null, convo.id);
      return twiml();
    }

    // Subsequent reply — fetch history for transcript extraction.
    // Policy: NEVER auto-reply to the student after the initial opener.
    // Only forward a status update to Lee's personal cell.
    const { data: history } = await admin.from("sms_messages")
      .select("direction,author,body,created_at")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: true })
      .limit(60);
    // Reference template constants so the linter doesn't complain about them
    // now that we've removed the subsequent auto-reply sends.
    void TPL_BOOKING; void TPL_ACK;

    // Extract structured facts from the running transcript.
    const transcript = (history ?? [])
      .concat([{ direction: "in", author: "student", body, created_at: new Date().toISOString() }])
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
      const summary = render(TPL_LEE_FOLLOWUP, {
        ref: String(convo.short_ref),
        campus: campusLabel,
        tester_flag: isTester ? " [TESTER]" : "",
        body,
        facts: facts ? `\n${facts}` : "",
      });
      await twilioSend(to, LEE_PHONE, summary);
    }

    await finalizeRaw("reply_no_auto", null, convo.id);
    return twiml();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finalizeRaw("error", msg, null);
    console.error("twilio-sms-webhook error", msg);
    return twiml();
  }
});

// Reference SITE_ORIGIN so the linter doesn't trim the import if we later use it.
void SITE_ORIGIN;
