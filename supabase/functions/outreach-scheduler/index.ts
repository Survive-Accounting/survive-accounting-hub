// outreach-scheduler — runs every 15 minutes (pg_cron). Three jobs:
// 1) Initial emails whose scheduled_send_at has arrived (set at lead import).
// 2) Relative follow-ups (+7/+14/+21 days) — only when an active template
//    exists for that follow-up kind, so creating the template enables the step.
// 3) Due broadcasts (custom/seasonal batch emails).
//
// Suppression everywhere: replied, bounced, complained (spam), opted-out
// (sequence_stopped_at), unsubscribed. Daily cap shared with manual sends.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SEND_URL = `${SUPABASE_URL}/functions/v1/outreach-send-email`;
const DAILY_CAP = 50;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function sentTodayCount(): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from("outreach_send_log")
    .select("*", { count: "exact", head: true })
    .gte("sent_at", since.toISOString());
  return count ?? 0;
}

async function sendViaFunction(payload: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, sender_email: "lee@surviveaccounting.com" }),
  });
  return res.ok;
}

const SUPPRESSED = "replied_at.is.null,bounced_at.is.null,complained_at.is.null,sequence_stopped_at.is.null";

function notSuppressed(q: any) {
  return q
    .is("replied_at", null)
    .is("bounced_at", null)
    .is("complained_at", null)
    .is("sequence_stopped_at", null);
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${SERVICE_ROLE}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
  }

  const report: Record<string, number | string> = {};
  let budget = Math.max(0, DAILY_CAP - (await sentTodayCount()));
  void SUPPRESSED;

  // ---------- 1) Due initial sends ----------
  if (budget > 0) {
    const { data: due } = await notSuppressed(
      admin.from("outreach_leads")
        .select("id")
        .not("scheduled_send_at", "is", null)
        .lte("scheduled_send_at", new Date().toISOString())
        .is("sent_at", null),
    ).limit(Math.min(budget, 15));
    let sent = 0;
    for (const lead of due ?? []) {
      if (budget <= 0) break;
      if (await sendViaFunction({ lead_id: lead.id, follow_up: 0 })) { sent++; budget--; }
      else await admin.from("outreach_leads").update({ scheduled_send_at: null }).eq("id", lead.id); // park failures for manual review
    }
    report.initial_sent = sent;
  }

  // ---------- 2) Relative follow-ups (+7 / +14 / +21 days) ----------
  const { data: activeKinds } = await admin
    .from("outreach_email_templates")
    .select("kind")
    .eq("is_active", true);
  const enabled = new Set((activeKinds ?? []).map((t: any) => t.kind));

  const steps: { n: 1 | 2 | 3; kind: string; afterDays: number; sentCol: string; prevCol: string }[] = [
    { n: 1, kind: "follow_up_1", afterDays: 7, sentCol: "follow_up_1_sent_at", prevCol: "sent_at" },
    { n: 2, kind: "follow_up_2", afterDays: 14, sentCol: "follow_up_2_sent_at", prevCol: "sent_at" },
    { n: 3, kind: "follow_up_3", afterDays: 21, sentCol: "follow_up_3_sent_at", prevCol: "sent_at" },
  ];
  for (const step of steps) {
    if (budget <= 0 || !enabled.has(step.kind)) continue;
    const cutoff = new Date(Date.now() - step.afterDays * 24 * 3600 * 1000).toISOString();
    const { data: due } = await notSuppressed(
      admin.from("outreach_leads")
        .select("id")
        .not("sent_at", "is", null)
        .lte(step.prevCol, cutoff)
        .is(step.sentCol, null),
    ).limit(Math.min(budget, 10));
    let sent = 0;
    for (const lead of due ?? []) {
      if (budget <= 0) break;
      if (await sendViaFunction({ lead_id: lead.id, follow_up: step.n })) { sent++; budget--; }
    }
    report[step.kind] = sent;
  }

  // ---------- 3) Due broadcasts ----------
  const { data: broadcasts } = await admin
    .from("outreach_broadcasts")
    .select("*")
    .eq("status", "scheduled")
    .lte("send_at", new Date().toISOString())
    .limit(1);
  const b = broadcasts?.[0];
  if (b) {
    await admin.from("outreach_broadcasts").update({ status: "sending" }).eq("id", b.id);
    let q = admin.from("outreach_leads").select("id, replied_at")
      .is("bounced_at", null)
      .is("complained_at", null)
      .is("sequence_stopped_at", null)
      .not("sent_at", "is", null); // broadcasts go to people we've already introduced ourselves to
    if (Array.isArray(b.campus_ids) && b.campus_ids.length > 0) q = q.in("campus_id", b.campus_ids);
    if (!b.include_replied) q = q.is("replied_at", null);
    const { data: audience } = await q.limit(500);

    // Resume-safe: skip leads who already got this broadcast (cap interruptions).
    const { data: already } = await admin
      .from("outreach_email_events")
      .select("lead_id")
      .eq("event_type", "sent")
      .eq("payload->>broadcast_id", b.id);
    const alreadySet = new Set((already ?? []).map((r: any) => r.lead_id));

    let sent = b.sent_count ?? 0, skipped = b.skipped_count ?? 0;
    for (const lead of audience ?? []) {
      if (alreadySet.has(lead.id)) continue;
      if (budget <= 0) { skipped++; continue; }
      const ok = await sendViaFunction({
        lead_id: lead.id,
        custom_subject: b.subject,
        custom_body: b.body,
        broadcast_id: b.id,
      });
      if (ok) { sent++; budget--; } else skipped++;
    }
    const ranOutOfBudget = budget <= 0 && skipped > 0;
    await admin.from("outreach_broadcasts").update({
      sent_count: sent,
      skipped_count: skipped,
      // If the daily cap interrupted it, leave it scheduled — tomorrow's runs
      // pick up the remainder (already-sent leads are skipped by status).
      status: ranOutOfBudget ? "scheduled" : "sent",
      send_at: ranOutOfBudget ? new Date(Date.now() + 12 * 3600 * 1000).toISOString() : b.send_at,
    }).eq("id", b.id);
    report.broadcast = `${b.name}: ${sent} sent, ${skipped} skipped`;
  }

  report.budget_left = budget;
  return new Response(JSON.stringify({ ok: true, report }), { headers: { "Content-Type": "application/json" } });
});
