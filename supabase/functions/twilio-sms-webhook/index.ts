// Inbound SMS webhook (Twilio). Handles:
// 1) Student texts a campus number → create conversation, send a generic
//    auto-reply with their personal /o/{short_ref} link, notify Lee. The
//    auto-reply re-sends on a cooldown (AUTO_REPLY_COOLDOWN_HOURS), so a
//    returning student gets their link again but isn't spammed mid-conversation.
// 2) Student replies (within the cooldown) → store, extract structured data
//    (Claude, optional), text Lee a summary from the same campus number
//    (reply-to-relay). No second student auto-reply.
// 3) Lee texts a campus number from his personal phone → relay his words to
//    the active student conversation on that number (use "#ref " prefix to
//    disambiguate when multiple are active).
//
// Tester phones (SMS_TESTER_PHONES, comma-separated E.164) bypass the cooldown
// so the auto-reply re-runs every time you re-text from the test number.
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

// How long after an automated reply before we'll send another one to the same
// student. Keeps mid-conversation texts from getting spammed, while a student
// returning days later still gets their link again.
const AUTO_REPLY_COOLDOWN_HOURS = 12;

// Fallback copy used only if a template row is missing in the DB.
// One generic, recurring auto-reply that works for any inbound text — new
// student, returning student, or a support question — and always hands them
// their personal /o/{short_ref} link. No pricing or booking language here; that
// all lives behind the link. Tokens: {SITE_ORIGIN}, {short_ref}.
const FALLBACK_AUTO_REPLY =
  "Hey! It's Lee 👋 Thanks for reaching out. Here's your link to get started, " +
  "pick up where you left off, or manage everything:\n\n" +
  "{SITE_ORIGIN}/o/{short_ref}\n\n" +
  "Reply here anytime with questions — I read every text.";
const FALLBACK_ACK = "Got it — passing this along to Lee. He'll text you back personally when he gets a moment.";
const FALLBACK_LEE_NEW =
  '#{ref} New student text — {campus}{tester_flag}\nFrom {from}: "{body}"\nAuto-reply sent. Reply to this thread to jump in yourself.';
const FALLBACK_LEE_FOLLOWUP =
  '#{ref} {campus}{tester_flag} — "{body}"{facts}\nReply to this thread to text them back.';

function render(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? "");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// Flatten Unicode punctuation that iOS autocorrect inserts (curly quotes,
// em/en dashes, ellipsis, non-breaking spaces) to plain GSM-7 equivalents.
// Keeps Lee's outbound texts in 160-char segments instead of 70-char Unicode
// segments — same readable message, ~4x cheaper per send.
function normalizeForGsm(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u2022/g, "*")
    .replace(/[\u2010\u2011]/g, "-");
}

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
  if (res.ok) return j?.sid ?? null;
  console.error("twilio-sms-webhook: Twilio send failed", JSON.stringify(j));
  return null;
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
  const TPL_AUTO = tplMap.get("auto_reply_generic") || FALLBACK_AUTO_REPLY;

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
      relayBody = normalizeForGsm(relayBody);

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

    // Dedupe: if the same body arrived from this student in the last 10 min,
    // skip the Lee summary on the duplicate (Brody's carrier resent — two
    // distinct MessageSids, identical body).
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: priorSame } = await admin.from("sms_messages")
      .select("id")
      .eq("conversation_id", convo.id)
      .eq("direction", "in")
      .eq("body", body)
      .gte("created_at", tenMinAgo)
      .limit(1);
    const isDuplicateBody = (priorSame ?? []).length > 0;

    await admin.from("sms_messages").insert({ conversation_id: convo.id, direction: "in", author: "student", body, twilio_sid: sid });

    const campusLabel = campus?.name ?? to;
    const isTester = isTesterPhone || convo.is_tester === true;

    // First-time text: create a minimal student_intake_submissions row and
    // link it back to the conversation so /o/{short_ref} can resolve to it.
    if (!convo.submission_id) {
      const { data: sub } = await admin.from("student_intake_submissions").insert({
        phone: from,
        campus_id: campus?.id ?? null,
        school_name: campus?.name ?? null,
        source: "sms_inbound",
      }).select("id").single();
      if (sub?.id) {
        await admin.from("sms_conversations").update({ submission_id: sub.id }).eq("id", convo.id);
        convo.submission_id = sub.id;
      }
    }

    // Generic auto-reply on a cooldown (replaces the one-time opener). A brand-
    // new texter gets it; a student mid-conversation within the cooldown does
    // NOT get spammed (they fall through to the Lee-summary-only path below); a
    // student returning after the cooldown gets their link again. Tester phones
    // bypass the cooldown so the full flow re-runs on every test text. If a send
    // fails we leave `last_auto_reply_at` unset so the next inbound retries.
    const lastAutoReplyAt = convo.last_auto_reply_at ? Date.parse(convo.last_auto_reply_at) : 0;
    const cooldownMs = AUTO_REPLY_COOLDOWN_HOURS * 60 * 60 * 1000;
    const cooldownPassed = isTester || !lastAutoReplyAt || (Date.now() - lastAutoReplyAt) > cooldownMs;

    if (cooldownPassed) {
      // Personal link, with a /start fallback if short_ref is somehow missing.
      const hasRef = convo.short_ref != null && String(convo.short_ref).length > 0;
      let autoBody = render(TPL_AUTO, {
        SITE_ORIGIN,
        short_ref: hasRef ? String(convo.short_ref) : "",
      });
      if (!hasRef) autoBody = autoBody.replace(`${SITE_ORIGIN}/o/`, `${SITE_ORIGIN}/start`);

      const sentSid = await twilioSend(to, from, autoBody);
      await admin.from("sms_messages").insert({
        conversation_id: convo.id, direction: "out", author: "auto", body: autoBody, twilio_sid: sentSid,
      });
      // Cooldown is the gate now; keep `opener_sent` updated for backward-compat.
      if (sentSid) {
        await admin.from("sms_conversations")
          .update({ last_auto_reply_at: new Date().toISOString(), opener_sent: true })
          .eq("id", convo.id);
      }

      if (LEE_PHONE && !isDuplicateBody) {
        const summary = render(TPL_LEE_NEW, {
          ref: String(convo.short_ref),
          campus: campusLabel,
          tester_flag: isTester ? " [TESTER]" : "",
          from,
          body,
        });
        await twilioSend(to, LEE_PHONE, sentSid ? summary : `${summary}\n\nAuto-reply failed to send; retrying on the student's next text.`);
      }
      await finalizeRaw(sentSid ? "auto_reply_sent" : "auto_reply_send_failed", sentSid ? null : "Twilio did not accept auto-reply send", convo.id);
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
    void TPL_ACK;

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

    if (LEE_PHONE && !isDuplicateBody) {
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
