// Notifies Lee the moment an `orders` row is created (DB trigger -> here).
// Mirrors notify-waitlist near-verbatim, adapted to the made-to-order payload:
//   1. Email to Lee (Resend) with the full order + its chapters.
//   2. Short SMS summary to Lee's PERSONAL phone via the approved A2P Messaging Service.
// When the order has a phone, we find-or-create an sms_conversation on the main
// work line so the student is reply-able from the work number (#<ref>), keeping
// Lee's personal number private.
//
// Auth: the orders trigger posts `x-order-secret` (loaded from Vault, NOT in the
// repo). We verify it against the ORDER_NOTIFY_SECRET function secret.
// config.toml sets verify_jwt = false for this function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_MSID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "";
const TWILIO_AUTH_USER = (Deno.env.get("TWILIO_API_KEY_SID") ?? "") || TWILIO_SID;
const TWILIO_AUTH_PASS = (Deno.env.get("TWILIO_API_KEY_SECRET") ?? "") || TWILIO_TOKEN;
const LEE_PHONE = (Deno.env.get("LEE_PERSONAL_PHONE") ?? "").replace(/[^+\d]/g, "");
const ORDER_NOTIFY_SECRET = Deno.env.get("ORDER_NOTIFY_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "Lee Ingram <lee@mail.surviveaccounting.com>";
const REPLY_TO = "lee@surviveaccounting.com";
const LEE_EMAIL = Deno.env.get("LEE_ALERT_EMAIL") ?? "lee@surviveaccounting.com";
const SITE_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://surviveaccounting.com";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const TIER_LABELS: Record<string, string> = {
  free_teaser: "Free teaser",
  made_to_order: "Made-to-order",
  one_on_one: "Premium 1-on-1",
  something_else: "Something else",
};

function tierLabel(rec: Record<string, unknown>): string {
  return TIER_LABELS[String(rec.tier ?? "").trim()] ?? String(rec.tier ?? "—");
}

// Student-facing labels for the multi-select requested_options.
const OPTION_LABEL: Record<string, string> = {
  made_to_order: "Exam prep video",
  one_on_one: "1-on-1 tutoring",
  something_else: "Something else",
  free_teaser: "Free teaser",
};
const OPTION_PRIORITY = ["made_to_order", "one_on_one", "something_else", "free_teaser"];
function chosenOptionsLabel(rec: Record<string, unknown>): string {
  const raw = Array.isArray(rec.requested_options) ? (rec.requested_options as unknown[]).map(String) : [];
  const opts = OPTION_PRIORITY.filter((o) => raw.includes(o));
  if (opts.length) return opts.map((o) => OPTION_LABEL[o] ?? o).join(", ");
  return tierLabel(rec);
}

// Friendly reference code — MUST match the client's (order.tsx): {CAMPUS}-{initials}-{4-char id tail}.
const CAMPUS_ABBR: Record<string, string> = {
  "7b92a320-b196-43f2-a241-77a0805816fe": "UM",
  "e330e87c-5467-4c05-9d3d-6cd2398de036": "AUB",
  "698dd98f-dd92-46c1-8f28-e930568cb15d": "LSU",
  "95246fc8-1ce6-409e-b454-d03c82766719": "MSST",
  "92e4a5d9-eeb3-4065-ac8a-5a4390fbc584": "TAMU",
  "b3af67c6-99a5-4677-83d5-aa7d11a89c17": "ALA",
  "e631c8de-37a3-4aae-a948-a64bd20ea4c5": "ARK",
  "4c5126b1-3fe0-48fe-a1db-1e41d06e4642": "UF",
  "3f570e37-5394-4058-baab-508948befedb": "UGA",
  "ae339230-577e-4569-a7d1-d1e45d1cfe91": "UK",
  "f16686c2-edc6-43f8-9638-6890f52c829a": "MIZ",
  "91e62f9c-43b0-41f3-a84d-002824754da6": "OU",
  "5f5bd18d-b92f-4d56-aced-23bce4c983d5": "SC",
  "9c4775be-7d82-4a3e-840c-349c5e15d8e8": "TENN",
  "faad6039-be72-4f5c-8ad5-ca7b95e2889f": "UT",
  "972451c3-bc5e-48d7-9f88-868a55378efa": "VAN",
};
function campusAbbrFor(rec: Record<string, unknown>): string {
  const id = rec.campus_id ? String(rec.campus_id) : "";
  if (id && CAMPUS_ABBR[id]) return CAMPUS_ABBR[id];
  const name = String(rec.campus_text ?? "").trim();
  const words = name.replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean)
    .filter((w) => !/^(of|the|at|university|univ|college|state|and)$/i.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return "SA";
}
function refCode(rec: Record<string, unknown>): string {
  const first = String(rec.first_name ?? "").trim();
  const last = String(rec.last_name ?? "").trim();
  const initials = ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "XX";
  const tail = String(rec.short_ref ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase() || "0000";
  return `${campusAbbrFor(rec)}-${initials}-${tail}`;
}

function money(cents: unknown): string {
  const n = Number(cents ?? 0);
  return `$${Math.round(n / 100)}`;
}

function examLabel(rec: Record<string, unknown>): string {
  const d = String(rec.exam_date ?? "").trim();
  if (d) return d;
  const tf = String(rec.exam_timeframe ?? "").trim();
  if (tf === "this_week") return "this week";
  if (tf === "next_week") return "next week";
  if (tf === "not_sure") return "not sure yet";
  return "—";
}

function normPhone(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (raw.includes("web:")) return null;
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

/** Resolve a human campus label: free-text first, else look up by id. */
async function campusLabel(rec: Record<string, unknown>): Promise<string> {
  const txt = String(rec.campus_text ?? "").trim();
  if (txt) return txt;
  const id = rec.campus_id ? String(rec.campus_id) : null;
  if (id) {
    try {
      const { data } = await admin.from("campuses").select("name").eq("id", id).maybeSingle();
      if (data?.name) return String(data.name);
    } catch (_e) { /* ignore */ }
  }
  return "school?";
}

type Chapter = { chapter_label: string; struggle_note: string | null; position: number };
async function loadChapters(orderId: string): Promise<Chapter[]> {
  try {
    const { data } = await admin
      .from("order_chapters")
      .select("chapter_label,struggle_note,position")
      .eq("order_id", orderId)
      .order("position", { ascending: true });
    return (data ?? []) as Chapter[];
  } catch (_e) {
    return [];
  }
}

async function sendSmsTo(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_AUTH_PASS || !to) return { ok: false, error: "twilio or recipient not configured" };
  if (!TWILIO_MSID) return { ok: false, error: "TWILIO_MESSAGING_SERVICE_SID not configured" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_AUTH_USER}:${TWILIO_AUTH_PASS}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ MessagingServiceSid: TWILIO_MSID, To: to, Body: body }),
    });
    if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
const sendLeeSms = (body: string) => LEE_PHONE ? sendSmsTo(LEE_PHONE, body) : Promise.resolve({ ok: false, error: "LEE_PERSONAL_PHONE not configured" });

// Confirmation text to the student the moment they submit. Sent from the work
// line (Messaging Service) so their reply threads back to Lee, not his cell.
function studentConfirmationBody(rec: Record<string, unknown>): string {
  const first = String(rec.first_name ?? "").trim() || "there";
  const course = String(rec.course_code ?? "").trim() || String(rec.course_name ?? "").trim() || "your course";
  return `Hey ${first}, it's Lee with Survive Accounting — got your exam prep request for ${course}! ` +
    `I'll review it and text you a gameplan within 1 business day. No payment until you approve. Questions? Just reply here.`;
}

async function sendLeeEmail(
  rec: Record<string, unknown>, school: string, chapters: Chapter[], shortRef: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  const name = `${String(rec.first_name ?? "").trim()} ${String(rec.last_name ?? "").trim()}`.trim() || "No name";
  const email = String(rec.email ?? "").trim();
  const tier = tierLabel(rec);
  const isMTO = String(rec.tier ?? "") === "made_to_order";
  const created = rec.created_at ? new Date(String(rec.created_at)) : new Date();
  const when = created.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });

  const courseDisp = [String(rec.course_code ?? "").trim(), String(rec.course_name ?? "").trim()].filter(Boolean).join(" · ") || "—";
  const fields: [string, string | null][] = [
    ["Name", name],
    ["Email", email || null],
    ["Phone", String(rec.phone ?? "") || null],
    ["School", school],
    ["Course", courseDisp],
    ["Professor", String(rec.professor_name ?? "") || null],
    ["Textbook", String(rec.textbook_name ?? "") || null],
    ["Exam", examLabel(rec)],
    ["Option", tier],
  ];
  if (isMTO) {
    fields.push(["Chapters", String(rec.chapter_count ?? chapters.length)]);
    fields.push(["Total (pay on delivery)", `${money(rec.total_cents)}${rec.rush ? " (incl. rush)" : ""}`]);
    if (rec.delivery_target_date) fields.push(["Ready by", String(rec.delivery_target_date)]);
  }

  const tableRows = fields
    .map(([k, v]) =>
      `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap">${k}</td><td style="padding:5px 0;font-weight:600;color:#14213D">${escapeHtml(v ?? "—")}</td></tr>`)
    .join("");

  const chapterList = chapters.length
    ? `<div style="margin-top:16px"><div style="font-weight:600;color:#14213D;margin-bottom:6px">Chapters</div><ul style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:1.6">${
        chapters.map((c) => `<li>${escapeHtml(c.chapter_label)}${c.struggle_note ? ` — <i>${escapeHtml(c.struggle_note)}</i>` : ""}</li>`).join("")
      }</ul></div>`
    : "";

  const reply = shortRef
    ? `<b>Reply path:</b> open the <b>Texts</b> panel and reply, or text <b>#${shortRef}</b> from your phone — it goes out from your work number, never your personal cell.`
    : `<b>Reply path:</b> reply by email${email ? ` to <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ""}.`;

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#14213D">
    <h2 style="margin:0 0 2px;color:#14213D">New order — ${escapeHtml(tier)}</h2>
    <p style="margin:0 0 18px;color:#6b7280">${escapeHtml(name)} placed an order (${escapeHtml(when)} CT).</p>
    <table style="border-collapse:collapse;font-size:14px">${tableRows}</table>
    ${chapterList}
    <p style="margin:18px 0 0;font-size:13px;color:#374151;line-height:1.5;border-top:1px solid #e5e7eb;padding-top:12px">${reply}</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [LEE_EMAIL],
        reply_to: email || REPLY_TO,
        subject: `New order: ${name} — ${tier}${isMTO ? ` (${money(rec.total_cents)})` : ""}`,
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
  if (!ORDER_NOTIFY_SECRET || req.headers.get("x-order-secret") !== ORDER_NOTIFY_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { record } = await req.json().catch(() => ({ record: null }));
  if (!record) return new Response(JSON.stringify({ error: "no record" }), { status: 400 });

  const phone = normPhone(record.phone);
  const school = await campusLabel(record);
  const chapters = await loadChapters(String(record.id));

  // Find-or-create an sms_conversation on the main line so this order is
  // reply-able from the work number. Best-effort — never blocks the alerts.
  let shortRef: string | null = null;
  let convoId: string | null = null;
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
          convoId = String(existing.id);
          shortRef = String(existing.short_ref);
          const patch: Record<string, string> = {};
          if (record.course_code || record.course_name) patch.course = String(record.course_code || record.course_name);
          if (Object.keys(patch).length) await admin.from("sms_conversations").update(patch).eq("id", existing.id);
        } else {
          const { data: created } = await admin
            .from("sms_conversations")
            .insert({
              student_phone: phone,
              campus_number: mainLine,
              campus_id: record.campus_id ?? null,
              status: "active",
              course: record.course_code || record.course_name || null,
            })
            .select("id, short_ref").single();
          convoId = created?.id != null ? String(created.id) : null;
          shortRef = created?.short_ref != null ? String(created.short_ref) : null;
        }
      }
    } catch (_e) { /* non-fatal */ }
  }

  const name = `${String(record.first_name ?? "").trim()} ${String(record.last_name ?? "").trim()}`.trim() || "No name";
  const courseLine = [String(record.course_code ?? "").trim(), String(record.course_name ?? "").trim()].filter(Boolean).join(" ");
  const adminLink = `${SITE_ORIGIN}/outreach/orders?ref=${encodeURIComponent(String(record.short_ref ?? ""))}`;

  // New-request alert to Lee. Friendly ref up top (matches what the student saw);
  // the numeric #ref at the bottom is the reply code for the work-line thread.
  const leeLines = [
    `New Request! (${refCode(record)})`,
    "",
    name,
    school,
    ...(courseLine ? [courseLine] : []),
    "",
    chosenOptionsLabel(record),
    "",
    adminLink,
  ];
  if (shortRef != null) leeLines.push("", `Reply with #${shortRef}`);
  const leeSms = leeLines.join("\n");

  const [smsRes, emailRes, studentRes] = await Promise.all([
    sendLeeSms(leeSms),
    sendLeeEmail(record, school, chapters, shortRef),
    phone ? sendSmsTo(phone, studentConfirmationBody(record)) : Promise.resolve({ ok: false, error: "no phone" }),
  ]);

  // The confirmation text is the student's "opener" — mark the thread so their
  // reply goes straight to Lee instead of the form auto-responder.
  if (phone && studentRes.ok && convoId) {
    try {
      await admin.from("sms_conversations")
        .update({ opener_sent: true, last_auto_reply_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
        .eq("id", convoId);
    } catch (_e) { /* non-fatal */ }
  }

  return new Response(JSON.stringify({
    ok: true,
    ref: refCode(record),
    short_ref: shortRef,
    sms: smsRes,
    email: emailRes,
    student_sms: studentRes,
  }), { headers: { "Content-Type": "application/json" } });
});
