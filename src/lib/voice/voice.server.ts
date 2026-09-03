// VOICE ON THE MAIN LINE (server-only — imported by the /api/voice/* route handlers).
//
// LEE'S RULES (2026-09-02): nothing ever rings him. Every inbound call hears the greeting and can
// leave a voicemail; he gets a text THE MOMENT the call comes in (so he knows who it was before
// the voicemail lands) and another when a voicemail is left, both pointing at /x/<ref>. He calls
// back three ways, all showing the main line as caller ID:
//
//   bridge        /x/<ref> "Call my phone": Twilio rings Lee's cell, then dials the person
//   dial-through  Lee calls the main line from his own cell, keys the ref, is connected
//   browser       /x/<ref> "Call from this computer": the Voice JS SDK, via a TwiML App
//
// Every webhook here verifies X-Twilio-Signature, so a stranger who finds a URL cannot make Twilio
// dial anyone or plant a fake voicemail. Threads live in sms_conversations/sms_messages (migration
// 20260902_1500) so the same #ref that texts also calls.
import { ORIGIN, type TemplateCtx } from "@/lib/comms/templates";

type DB = { from: (t: string) => any };
const adminDb = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const TWILIO_SID = () => process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = () => process.env.TWILIO_AUTH_TOKEN ?? "";
/** REST auth: a scoped API key when present, else the account SID + auth token. */
const twilioAuthHeader = () => {
  const user = process.env.TWILIO_API_KEY_SID || TWILIO_SID();
  const pass = process.env.TWILIO_API_KEY_SECRET || TWILIO_TOKEN();
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
};
/** Lee's cell: what the bridge rings and what dial-through recognises. */
export const leeCell = (): string => (process.env.FOUNDER_ALERT_PHONE || process.env.LEE_PERSONAL_PHONE || "").replace(/[^+\d]/g, "");
export const voiceConfig = () => ({
  rest: !!(TWILIO_SID() && (process.env.TWILIO_API_KEY_SECRET || TWILIO_TOKEN())),
  bridge: !!(TWILIO_SID() && (process.env.TWILIO_API_KEY_SECRET || TWILIO_TOKEN()) && leeCell()),
  browser: !!(TWILIO_SID() && process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET && process.env.TWILIO_TWIML_APP_SID),
  transcribe: process.env.VOICEMAIL_TRANSCRIBE !== "0",
});

// ---- TwiML ----------------------------------------------------------------------------------
export const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const twiml = (inner: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } });
export const say = (text: string) => `<Say voice="Polly.Matthew">${xmlEsc(text)}</Say>`;

export const GREETING =
  "Hey, you've reached Lee at Survive Accounting. I can't pick up right now, but I call everyone back. " +
  "After the beep, tell me who you are and what it's about, or text this same number, and I'll get right back to you.";

// ---- request parsing + signature ------------------------------------------------------------
export interface TwilioPost { params: Record<string, string>; valid: boolean; reason?: string; url: string }

/** Parse Twilio's form POST and verify its signature. Behind a proxy the request can be seen at
 *  more than one URL, so the public origin + path is tried as well as the URL the runtime saw. In
 *  development with no auth token the check is SKIPPED, loudly; in production it is required. */
export async function readTwilioPost(request: Request): Promise<TwilioPost> {
  const params: Record<string, string> = {};
  try {
    const text = await request.text();
    for (const [k, v] of new URLSearchParams(text)) params[k] = v;
  } catch { return { params, valid: false, reason: "unreadable body", url: request.url }; }
  const seen = new URL(request.url);
  const candidates = new Set<string>([request.url, `${ORIGIN}${seen.pathname}${seen.search}`]);
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (fwdHost) candidates.add(`${fwdProto}://${fwdHost}${seen.pathname}${seen.search}`);
  const token = TWILIO_TOKEN();
  if (!token) {
    if (process.env.NODE_ENV === "production") return { params, valid: false, reason: "TWILIO_AUTH_TOKEN not set", url: request.url };
    console.warn("[voice] TWILIO_AUTH_TOKEN not set — signature check SKIPPED (development only)");
    return { params, valid: true, url: request.url };
  }
  const { twilioSignatureValid } = await import("@/lib/voice/twilio-signature");
  const ok = twilioSignatureValid(token, request.headers.get("x-twilio-signature"), [...candidates], params);
  return { params, valid: ok, reason: ok ? undefined : "bad signature", url: request.url };
}

export const forbidden = (why: string): Response => new Response(`Forbidden: ${why}`, { status: 403 });

// ---- who is this number? --------------------------------------------------------------------
export interface CallerIdentity {
  label: string | null;       // "Jordan Ellis, ΣX claim" / "Jordan Ellis, campus rep" / null
  school: string | null;
  campusId: string | null;
  kind: "claim" | "rep" | "student" | "unknown";
}

/** Name the caller from what we already know about the phone: a chapter claim first (the person
 *  most likely to be calling about money), then a rep, then a texting student. */
export async function resolveCaller(db: DB, phone: string): Promise<CallerIdentity> {
  try {
    const { data: claim } = await db.from("greek_chapter_claims").select("name,position,campus_greek_chapter_id,status")
      .eq("phone", phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (claim?.name) {
      const { data: roster } = await db.from("campus_greek_chapters").select("campus_id,greek_org_id,letters").eq("id", claim.campus_greek_chapter_id).maybeSingle();
      const { data: campus } = roster?.campus_id ? await db.from("campuses").select("name,short_name").eq("id", roster.campus_id).maybeSingle() : { data: null };
      const { data: org } = roster?.greek_org_id ? await db.from("greek_orgs").select("name").eq("id", roster.greek_org_id).maybeSingle() : { data: null };
      const { chapterSmsLabel } = await import("@/lib/greek-letters");
      const letters = chapterSmsLabel((org?.name as string) ?? null, (roster?.letters as string) ?? null);
      return { label: `${claim.name as string}, ${letters} claim`, school: (campus?.short_name as string) || (campus?.name as string) || null, campusId: (roster?.campus_id as string) ?? null, kind: "claim" };
    }
  } catch { /* fall through */ }
  try {
    const { data: rep } = await db.from("referral_partners").select("name,campus_id").eq("type", "campus_rep").eq("phone", phone).limit(1).maybeSingle();
    if (rep?.name) {
      const { data: campus } = rep.campus_id ? await db.from("campuses").select("name,short_name").eq("id", rep.campus_id).maybeSingle() : { data: null };
      return { label: `${rep.name as string}, campus rep`, school: (campus?.short_name as string) || (campus?.name as string) || null, campusId: (rep.campus_id as string) ?? null, kind: "rep" };
    }
  } catch { /* fall through */ }
  try {
    const { data: convo } = await db.from("sms_conversations").select("*").eq("student_phone", phone).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
    if (convo) {
      const { data: campus } = convo.campus_id ? await db.from("campuses").select("name,short_name").eq("id", convo.campus_id).maybeSingle() : { data: null };
      const label = (convo.subject as string | null) ?? (convo.course ? `student, ${convo.course as string}` : null);
      return { label, school: (campus?.short_name as string) || (campus?.name as string) || null, campusId: (convo.campus_id as string) ?? null, kind: "student" };
    }
  } catch { /* fall through */ }
  return { label: null, school: null, campusId: null, kind: "unknown" };
}

// ---- the flows ------------------------------------------------------------------------------
const norm = (p: string | undefined | null) => (p ?? "").replace(/[^+\d]/g, "");

/** POST /api/voice/inbound — the Twilio number's Voice URL. */
export async function handleInbound(request: Request): Promise<Response> {
  const post = await readTwilioPost(request);
  if (!post.valid) return forbidden(post.reason ?? "invalid");
  const from = norm(post.params.From), to = norm(post.params.To), callSid = post.params.CallSid ?? "";
  if (!from || !to) return twiml(say("Sorry, something went wrong.") + "<Hangup/>");

  // DIAL-THROUGH: Lee calling his own line from his cell. Nobody else ever hears this prompt.
  if (leeCell() && from === leeCell()) {
    return twiml(
      `<Gather input="dtmf" finishOnKey="#" timeout="10" action="${ORIGIN}/api/voice/dial-through" method="POST">` +
      say("Enter the ref number, then pound.") + "</Gather>" + say("No ref entered. Bye.") + "<Hangup/>",
    );
  }

  const db = await adminDb();
  const { ensureConversationRef, logThreadEvent, actionLink } = await import("@/lib/comms/refs.server");
  const who = await resolveCaller(db, from);
  const ref = await ensureConversationRef(db, { phone: from, campusId: who.campusId, kind: who.kind === "unknown" ? "caller" : who.kind === "student" ? "student" : who.kind, subject: who.label ? `${who.label}${who.school ? ` (${who.school})` : ""}` : null });
  if (ref) await logThreadEvent(db, { conversationId: ref.conversationId, direction: "in", author: "student", body: "[Called the main line]", kind: "call", callSid });

  // THE "CALLING NOW" TEXT. Fires before the greeting finishes, so Lee has the name in hand.
  try {
    const { founderAlert } = await import("@/lib/comms/send.server");
    const ctx: TemplateCtx = { ref: ref?.shortRef ?? null, actionLink: actionLink(ref?.shortRef), callerLabel: who.label, school: who.school, phone: from, name: who.label };
    await founderAlert({ db, ctx, key: "founder_call", priority: true });
  } catch (e) { console.warn("[voice] calling-now alert failed (call still answered):", (e as Error).message); }

  const cfg = voiceConfig();
  const record =
    `<Record maxLength="120" playBeep="true" timeout="5" action="${ORIGIN}/api/voice/recorded" method="POST"` +
    (cfg.transcribe ? ` transcribe="true" transcribeCallback="${ORIGIN}/api/voice/transcript"` : "") + "/>";
  return twiml(say(GREETING) + record + say("I didn't catch a message. Text me at this number and I'll get right back to you.") + "<Hangup/>");
}

/** POST /api/voice/recorded — the <Record> action: the voicemail exists (or the caller hung up). */
export async function handleRecorded(request: Request): Promise<Response> {
  const post = await readTwilioPost(request);
  if (!post.valid) return forbidden(post.reason ?? "invalid");
  const from = norm(post.params.From), callSid = post.params.CallSid ?? "";
  const recordingUrl = post.params.RecordingUrl ?? "";
  const recordingSid = post.params.RecordingSid ?? "";
  const duration = Number(post.params.RecordingDuration ?? "0") || 0;
  if (!recordingUrl || duration < 1) return twiml(say("Okay. Text me at this number and I'll get right back to you.") + "<Hangup/>");

  const db = await adminDb();
  const { ensureConversationRef, logThreadEvent, actionLink } = await import("@/lib/comms/refs.server");
  const who = await resolveCaller(db, from);
  const ref = await ensureConversationRef(db, { phone: from, campusId: who.campusId, kind: who.kind === "unknown" ? "caller" : who.kind === "student" ? "student" : who.kind });
  const cfg = voiceConfig();
  if (ref) {
    await logThreadEvent(db, {
      conversationId: ref.conversationId, direction: "in", author: "student", kind: "voicemail",
      body: `[Voicemail, ${duration}s]`, callSid, recordingSid, recordingUrl, durationSeconds: duration,
      transcriptStatus: cfg.transcribe ? "pending" : "off",
    });
  }
  try {
    const { founderAlert } = await import("@/lib/comms/send.server");
    const ctx: TemplateCtx = { ref: ref?.shortRef ?? null, actionLink: actionLink(ref?.shortRef), callerLabel: who.label, school: who.school, phone: from, name: who.label, durationSeconds: duration, transcript: null };
    // SMS now; the email follows with the transcript (handleTranscript). With transcription off
    // there is no second callback, so the email goes now too.
    await founderAlert({ db, ctx, key: "founder_voicemail", priority: true, channels: { sms: true, email: !cfg.transcribe } });
  } catch (e) { console.warn("[voice] voicemail alert failed (voicemail saved):", (e as Error).message); }
  return twiml(say("Got it. I'll call you back soon.") + "<Hangup/>");
}

/** POST /api/voice/transcript — Twilio's transcribeCallback. Completes the voicemail row and sends
 *  the email with the text. Email only: the phone already buzzed for this voicemail. */
export async function handleTranscript(request: Request): Promise<Response> {
  const post = await readTwilioPost(request);
  if (!post.valid) return forbidden(post.reason ?? "invalid");
  const recordingSid = post.params.RecordingSid ?? "";
  const status = post.params.TranscriptionStatus ?? "failed";
  const text = status === "completed" ? (post.params.TranscriptionText ?? "").trim() : "";
  const from = norm(post.params.From);
  const db = await adminDb();
  let convoId: string | null = null, duration: number | null = null;
  if (recordingSid) {
    const { data: row } = await db.from("sms_messages").select("id,conversation_id,duration_seconds").eq("recording_sid", recordingSid).maybeSingle();
    if (row?.id) {
      convoId = row.conversation_id as string; duration = (row.duration_seconds as number) ?? null;
      await db.from("sms_messages").update({ body: text ? text : `[Voicemail, ${duration ?? "?"}s — transcription ${status}]`, transcript_status: status }).eq("id", row.id);
    }
  }
  let ref: number | null = null, campusId: string | null = null;
  if (convoId) {
    const { data: c } = await db.from("sms_conversations").select("short_ref,campus_id").eq("id", convoId).maybeSingle();
    ref = (c?.short_ref as number) ?? null; campusId = (c?.campus_id as string) ?? null;
  }
  void campusId;
  try {
    const who = from ? await resolveCaller(db, from) : { label: null, school: null, campusId: null, kind: "unknown" as const };
    const { founderAlert } = await import("@/lib/comms/send.server");
    const { actionLink } = await import("@/lib/comms/refs.server");
    const ctx: TemplateCtx = { ref, actionLink: actionLink(ref), callerLabel: who.label, school: who.school, phone: from || null, name: who.label, durationSeconds: duration, transcript: text || null };
    await founderAlert({ db, ctx, key: "founder_voicemail", priority: true, channels: { sms: false, email: true } });
  } catch (e) { console.warn("[voice] transcript email failed (transcript saved):", (e as Error).message); }
  return new Response("ok", { status: 200 });
}

/** POST /api/voice/dial-through — Lee keyed a ref from his cell; connect him as the main line. */
export async function handleDialThrough(request: Request): Promise<Response> {
  const post = await readTwilioPost(request);
  if (!post.valid) return forbidden(post.reason ?? "invalid");
  const from = norm(post.params.From), to = norm(post.params.To);
  if (!leeCell() || from !== leeCell()) return forbidden("not the founder's phone");
  const digits = (post.params.Digits ?? "").replace(/\D/g, "");
  const db = await adminDb();
  const retry = (msg: string) =>
    twiml(`<Gather input="dtmf" finishOnKey="#" timeout="10" action="${ORIGIN}/api/voice/dial-through" method="POST">` + say(`${msg} Enter the ref number, then pound.`) + "</Gather>" + say("Bye.") + "<Hangup/>");
  if (!digits) return retry("No ref entered.");
  const { data: convo } = await db.from("sms_conversations").select("*").eq("short_ref", Number(digits)).maybeSingle();
  if (!convo?.student_phone) return retry(`No conversation with ref ${digits.split("").join(" ")}.`);
  const { logThreadEvent } = await import("@/lib/comms/refs.server");
  await logThreadEvent(db, { conversationId: convo.id as string, direction: "out", author: "lee", body: "[Lee called (dial-through)]", kind: "call", callSid: post.params.CallSid ?? null });
  const label = (convo.subject as string | null) ?? `ref ${digits}`;
  return twiml(say(`Calling ${label}.`) + `<Dial callerId="${xmlEsc(to)}" timeLimit="3600"><Number>${xmlEsc(convo.student_phone as string)}</Number></Dial>`);
}

/** POST /api/voice/bridge?c=<conversationId> — Lee answered the bridge call; now dial the person.
 *  Only Twilio can reach this (signature), and only startBridgeCall makes Twilio use this URL. */
export async function handleBridge(request: Request): Promise<Response> {
  const post = await readTwilioPost(request);
  if (!post.valid) return forbidden(post.reason ?? "invalid");
  const convoId = new URL(request.url).searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(convoId)) return twiml(say("Bad bridge link.") + "<Hangup/>");
  // A bridge call answered by voicemail must not dial the person into Lee's voicemail box.
  if ((post.params.AnsweredBy ?? "").startsWith("machine")) return twiml("<Hangup/>");
  const db = await adminDb();
  const { data: convo } = await db.from("sms_conversations").select("*").eq("id", convoId).maybeSingle();
  if (!convo?.student_phone) return twiml(say("That conversation no longer exists.") + "<Hangup/>");
  const { logThreadEvent, mainLineNumber } = await import("@/lib/comms/refs.server");
  const callerId = (convo.campus_number as string) || (await mainLineNumber(db));
  await logThreadEvent(db, { conversationId: convo.id as string, direction: "out", author: "lee", body: "[Lee called (bridge)]", kind: "call", callSid: post.params.CallSid ?? null });
  return twiml(say(`Connecting you to ${(convo.subject as string | null) ?? "them"}.`) + `<Dial callerId="${xmlEsc(callerId)}" timeLimit="3600"><Number>${xmlEsc(convo.student_phone as string)}</Number></Dial>`);
}

/** POST /api/voice/softphone — the TwiML App's Voice URL: the browser softphone placing a call. */
export async function handleClient(request: Request): Promise<Response> {
  const post = await readTwilioPost(request);
  if (!post.valid) return forbidden(post.reason ?? "invalid");
  const to = norm(post.params.To);
  if (!/^\+\d{8,15}$/.test(to)) return twiml(say("That number doesn't look right.") + "<Hangup/>");
  const db = await adminDb();
  const { logThreadEvent, mainLineNumber } = await import("@/lib/comms/refs.server");
  const mainLine = await mainLineNumber(db);
  const { data: convo } = await db.from("sms_conversations").select("id").eq("student_phone", to).eq("campus_number", mainLine).maybeSingle();
  if (convo?.id) await logThreadEvent(db, { conversationId: convo.id as string, direction: "out", author: "lee", body: "[Lee called (browser)]", kind: "call", callSid: post.params.CallSid ?? null });
  return twiml(`<Dial callerId="${xmlEsc(mainLine)}" timeLimit="3600"><Number>${xmlEsc(to)}</Number></Dial>`);
}

// ---- outbound REST ---------------------------------------------------------------------------
/** Ring Lee's cell from the main line; when he answers, Twilio fetches /api/voice/bridge and dials
 *  the person. Returns the call SID or a reason. */
export async function createBridgeCall(i: { conversationId: string; mainLine: string }): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const cfg = voiceConfig();
  if (!cfg.bridge) return { ok: false, error: leeCell() ? "Twilio credentials are not set on the server." : "FOUNDER_ALERT_PHONE / LEE_PERSONAL_PHONE is not set, so there is no phone to ring." };
  const params = new URLSearchParams({
    To: leeCell(), From: i.mainLine,
    Url: `${ORIGIN}/api/voice/bridge?c=${i.conversationId}`, Method: "POST",
    MachineDetection: "Enable", Timeout: "25",
  });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID()}/Calls.json`, {
      method: "POST", headers: { Authorization: twilioAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" }, body: params,
    });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${j.message ?? "call not created"}` };
    return { ok: true, sid: j.sid };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Stream a recording (mp3) with Twilio's credentials; the browser never sees them. */
export async function fetchRecording(recordingSid: string): Promise<Response> {
  if (!/^RE[0-9a-f]{32}$/i.test(recordingSid)) return new Response("bad recording id", { status: 400 });
  if (!voiceConfig().rest) return new Response("Twilio credentials are not set on the server.", { status: 503 });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID()}/Recordings/${recordingSid}.mp3`, { headers: { Authorization: twilioAuthHeader() } });
  if (!r.ok) return new Response(`Twilio ${r.status}`, { status: 502 });
  return new Response(r.body, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
}
