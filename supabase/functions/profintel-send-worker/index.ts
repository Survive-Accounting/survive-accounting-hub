// profintel-send-worker — fires due ProfIntel scheduled sends via Resend.
// Cron-triggered (x-cron-secret). Guardrails: a master kill-switch
// (profintel_settings.sending_enabled, default OFF), a daily cap, a per-run
// batch, valid-email check, and idempotent mark-sent (status flips to 'sent'
// so a row can't be sent twice). Body is sent as-is (the opt-out line lives in
// the template). Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// CRON_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const FROM = "Lee Ingram <lee@mail.surviveaccounting.com>";
const REPLY_TO = "lee@surviveaccounting.com";
const BATCH = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// Automatic cold-domain warmup. Cap ramps weekly, anchored to the first send
// date, and never exceeds the configured ceiling (daily_send_cap, default 40).
// Keep in sync with warmupCap() in src/lib/profintel.ts.
const WARMUP_STEPS = [15, 22, 30, 38]; // weeks 1..4; week 5+ = ceiling
function daysSince(startYmd: string | null, todayYmd: string): number {
  if (!startYmd) return 0;
  const a = Date.parse(`${startYmd}T00:00:00Z`);
  const b = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}
function warmupCap(days: number, ceiling: number): number {
  const wk = Math.floor(days / 7);
  const base = wk < WARMUP_STEPS.length ? WARMUP_STEPS[wk] : ceiling;
  return Math.min(base, ceiling);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
/** Plain-text body → simple, deliverability-friendly HTML (links + line breaks). */
function renderHtml(body: string): string {
  const safe = escapeHtml(body)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${safe}</div>`;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500 });
  }

  const { data: settings } = await admin.from("profintel_settings").select("*").eq("id", 1).maybeSingle();
  if (!settings?.sending_enabled) {
    return new Response(JSON.stringify({ skipped: "sending_disabled" }), { headers: { "Content-Type": "application/json" } });
  }

  const today = new Date().toISOString().slice(0, 10);
  let sentToday = settings.sent_today_date === today ? settings.sent_today ?? 0 : 0;
  // Effective cap = automatic warmup ramp, clamped to the configured ceiling.
  const ceiling = settings.daily_send_cap ?? 40;
  const cap = warmupCap(daysSince(settings.warmup_start_date ?? null, today), ceiling);
  const remaining = Math.max(0, cap - sentToday);
  if (remaining === 0) {
    await admin.from("profintel_settings").update({ last_run_at: new Date().toISOString() }).eq("id", 1);
    return new Response(JSON.stringify({ skipped: "daily_cap_reached", sentToday, cap }), { headers: { "Content-Type": "application/json" } });
  }

  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("profintel_sends")
    .select("id,to_email,subject,body")
    .eq("status", "scheduled")
    .eq("ready", true)
    .lte("scheduled_at", nowIso)
    .not("to_email", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(Math.min(BATCH, remaining));

  let sent = 0, failed = 0;
  for (const s of (due ?? []) as Array<{ id: string; to_email: string | null; subject: string | null; body: string | null }>) {
    if (!s.to_email || !EMAIL_RE.test(s.to_email)) {
      await admin.from("profintel_sends").update({ status: "error", send_error: "invalid email" }).eq("id", s.id);
      failed++;
      continue;
    }
    // Claim the row first (idempotency): flip to 'sent' before the network call so
    // a concurrent run can't grab it. Roll back to 'error' on failure.
    const { data: claimed } = await admin
      .from("profintel_sends")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", s.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // someone else took it
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [s.to_email],
          reply_to: REPLY_TO,
          subject: s.subject ?? "",
          html: renderHtml(s.body ?? ""),
          text: s.body ?? "",
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        await admin.from("profintel_sends").update({ status: "error", send_error: `resend ${res.status}: ${t.slice(0, 180)}` }).eq("id", s.id);
        failed++;
        continue;
      }
      const j = await res.json().catch(() => ({} as { id?: string }));
      await admin.from("profintel_sends").update({ resend_message_id: j.id ?? null, send_error: null }).eq("id", s.id);
      sent++;
      sentToday++;
    } catch (e) {
      await admin.from("profintel_sends").update({ status: "error", send_error: String(e).slice(0, 180) }).eq("id", s.id);
      failed++;
    }
  }

  const settingsPatch: Record<string, unknown> = { last_run_at: new Date().toISOString(), sent_today: sentToday, sent_today_date: today };
  // Anchor the warmup ramp to the first day a real email actually goes out.
  if (sent > 0 && !settings.warmup_start_date) settingsPatch.warmup_start_date = today;
  await admin.from("profintel_settings").update(settingsPatch).eq("id", 1);
  return new Response(JSON.stringify({ ok: true, sent, failed, sentToday, cap }), { headers: { "Content-Type": "application/json" } });
});
