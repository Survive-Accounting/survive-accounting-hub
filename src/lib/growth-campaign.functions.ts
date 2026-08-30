// LAUNCH CAMPAIGNS — schedule a campus's outreach, auto-approve with a review window,
// and let a cron fire the due ones. The pure rules (when it sends, whether it may queue)
// live in growth-campaign-core.ts; this is the data + lifecycle around them.
//
// Emails reuse the existing queue (growth_outreach_events, tagged by campaign_tag) and
// the existing sender (growthSendApproved). A campaign is the scheduled wrapper.
//
// LAW: ships to the client bundle — service-role client + admin gate imported
// dynamically inside handlers only. The cron path takes a service-role db directly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  nextBusinessSendTime,
  sendTimeLabel,
  validateCampaign,
  type CampaignRecipient,
  type ValidationFailure,
} from "@/lib/growth-campaign-core";
import { logPartnerActivity } from "@/lib/growth-tranche.functions";

type DB = { from: (t: string) => any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
const whoNow = async (): Promise<string> => {
  const { adminSessionOk } = await import("@/lib/admin-session.functions");
  return (await adminSessionOk())?.email ?? "admin";
};

// Daily send limits (the safety ceiling under auto-approve).
const CAMPUS_DAILY_LIMIT = 40;
const GLOBAL_DAILY_LIMIT = 500;

// ── global kill switch (site_settings.growthOutboundPaused) ──────────────────────────
export async function isOutboundPaused(db: DB): Promise<boolean> {
  const { data } = await db.from("site_settings").select("id,settings").limit(1).maybeSingle();
  return !!data?.settings?.growthOutboundPaused;
}
async function setOutboundPaused(db: DB, paused: boolean): Promise<void> {
  const { data } = await db.from("site_settings").select("id,settings").limit(1).maybeSingle();
  if (!data) return;
  await db
    .from("site_settings")
    .update({ settings: { ...data.settings, growthOutboundPaused: paused } })
    .eq("id", data.id);
}

// ── context for pre-send validation ──────────────────────────────────────────────────
async function validationContext(db: DB, campusId: string, addresses: string[]) {
  const since = new Date(Date.now() - 14 * 24 * 3_600_000).toISOString();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [{ data: recent }, campusToday, globalToday] = await Promise.all([
    addresses.length
      ? db
          .from("growth_outreach_events")
          .select("email")
          .eq("direction", "outbound")
          .gte("occurred_at", since)
          .in("email", addresses)
      : Promise.resolve({ data: [] }),
    db
      .from("growth_outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("campus_id", campusId)
      .eq("direction", "outbound")
      .not("message_id", "is", null)
      .gte("occurred_at", todayStart.toISOString()),
    db
      .from("growth_outreach_events")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .not("message_id", "is", null)
      .gte("occurred_at", todayStart.toISOString()),
  ]);
  return {
    recentlyContacted: new Set(
      ((recent?.data ?? recent ?? []) as any[])
        .map((r: any) => String(r.email ?? "").toLowerCase())
        .filter(Boolean),
    ),
    campusDailyCount: (campusToday as any)?.count ?? 0,
    campusDailyLimit: CAMPUS_DAILY_LIMIT,
    globalDailyCount: (globalToday as any)?.count ?? 0,
    globalDailyLimit: GLOBAL_DAILY_LIMIT,
  };
}

export interface LaunchResult {
  ok: boolean;
  campaignId?: string;
  emailCount?: number;
  dmCount?: number;
  sendAtLabel?: string;
  failures?: ValidationFailure[];
}

/** Build the outreach queue for a campus from an approved template and SCHEDULE it for the
 *  next business day. Validates first; a failing check blocks the whole campaign with a
 *  specific, fixable message and nothing is queued. */
export const growthLaunchCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        partnerId: z.string().uuid().nullable().optional(),
        templateKey: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<LaunchResult> => {
    const db = await adminDb();
    const who = await whoNow();

    // Emailable + IG-only priority contacts for this campus.
    const { data: elig } = await db
      .from("growth_outreach_eligibility")
      .select("qc_id,email,instagram,outreach_eligible")
      .eq("campus_id", data.campusId);
    const rows = (elig ?? []) as any[];
    const emailQcIds = rows
      .filter((r) => r.outreach_eligible && r.email)
      .map((r) => r.qc_id)
      .filter(Boolean);
    const dmCount = rows.filter((r) => !r.email && r.instagram).length;
    if (!emailQcIds.length && !dmCount)
      return { ok: false, failures: [{ recipientId: null, recipient: null, problem: "No reachable contacts on this campus yet." }] };

    const tag = `launch-${data.campusId.slice(0, 8)}-${Date.now().toString(36)}`;

    // Reuse the assembler to render + queue the emails under our tag.
    let queued = 0;
    if (emailQcIds.length) {
      const { growthAssembleQueue } = await import("@/lib/growth-queue.functions");
      const r = await growthAssembleQueue({
        data: { campusId: data.campusId, qcIds: emailQcIds, templateKey: data.templateKey, campaignId: tag },
      });
      queued = r.queued;
    }

    // Validate the freshly-queued messages; roll back and block on any failure.
    const { data: events } = await db
      .from("growth_outreach_events")
      .select("id,email,subject,body")
      .eq("campaign_id", tag);
    const recipients: CampaignRecipient[] = ((events ?? []) as any[]).map((e) => ({
      id: e.id,
      name: e.email,
      channel: "email",
      address: e.email,
      subject: e.subject,
      body: e.body,
    }));
    const ctx = await validationContext(
      db,
      data.campusId,
      recipients.map((r) => (r.address ?? "").toLowerCase()).filter(Boolean),
    );
    const failures = validateCampaign(recipients, ctx);
    if (failures.length) {
      await db.from("growth_outreach_events").delete().eq("campaign_id", tag); // rollback
      return { ok: false, failures };
    }

    // Template version stamp — so a reply-rate change traces to a copy change.
    const { data: tpl } = await db
      .from("growth_outreach_templates")
      .select("key,updated_at")
      .eq("key", data.templateKey)
      .maybeSingle();
    const templateVersion = tpl?.updated_at ?? null;

    const sendAt = nextBusinessSendTime(new Date());
    const { data: created, error } = await db
      .from("launch_campaigns")
      .insert({
        partner_id: data.partnerId ?? null,
        campus_id: data.campusId,
        campaign_tag: tag,
        template_key: data.templateKey,
        template_version: templateVersion,
        status: "pending",
        scheduled_send_at: sendAt.toISOString(),
        email_count: queued,
        dm_count: dmCount,
        auto_approved: true,
        created_by: who,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await logPartnerActivity(db, {
      partnerId: data.partnerId ?? null,
      campusId: data.campusId,
      kind: "campaign_launched",
      summary: `Campaign launched — ${queued} emails, ${dmCount} DMs · sends ${sendTimeLabel(sendAt)}`,
      meta: { campaignId: created?.id, tag, template: data.templateKey, emailCount: queued, dmCount, by: who },
    });
    // Lee notification with a deep link straight to the rendered messages.
    await notifyLee(db, {
      campaignId: created?.id ?? null,
      campusId: data.campusId,
      emailCount: queued,
      dmCount,
      template: data.templateKey,
      sendAtLabel: sendTimeLabel(sendAt),
    });

    return { ok: true, campaignId: created?.id, emailCount: queued, dmCount, sendAtLabel: sendTimeLabel(sendAt) };
  });

async function notifyLee(
  db: DB,
  n: { campaignId: string | null; campusId: string; emailCount: number; dmCount: number; template: string; sendAtLabel: string },
): Promise<void> {
  try {
    const { data: campus } = await db
      .from("campuses")
      .select("display_name,name")
      .eq("id", n.campusId)
      .maybeSingle();
    const link = n.campaignId
      ? `https://surviveaccounting.com/admin/growth/campaigns?open=${n.campaignId}`
      : "https://surviveaccounting.com/admin/growth/campaigns";
    const { sendResendEmail } = await import("@/lib/email.server");
    const body =
      `Campaign launched\n\n` +
      `Campus: ${campus?.display_name || campus?.name || n.campusId}\n` +
      `Recipients: ${n.emailCount} emails, ${n.dmCount} DMs\n` +
      `Template: ${n.template}\n` +
      `Sends: ${n.sendAtLabel}\n\n` +
      `Review (opens the outgoing messages): ${link}`;
    await sendResendEmail({
      to: "lee@surviveaccounting.com",
      subject: `Campaign queued · ${campus?.display_name || "campus"}`,
      text: body,
    });
  } catch {
    /* notification is best-effort — never blocks the launch */
  }
}

export interface CampaignView {
  id: string;
  campusId: string;
  campusName: string | null;
  campaignTag: string;
  templateKey: string;
  status: string;
  scheduledSendAt: string;
  scheduledLabel: string;
  emailCount: number;
  dmCount: number;
  autoApproved: boolean;
  createdBy: string | null;
  createdAt: string;
}

/** Campaigns for the monitor / review surface. Pending first, newest first. */
export const growthCampaignsList = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ status: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ campaigns: CampaignView[]; paused: boolean }> => {
    const db = await adminDb();
    let q = db
      .from("launch_campaigns")
      .select(
        "id,campus_id,campaign_tag,template_key,status,scheduled_send_at,email_count,dm_count,auto_approved,created_by,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows } = await q;
    const list = (rows ?? []) as any[];
    const campusIds = [...new Set(list.map((c) => c.campus_id))];
    const names = new Map<string, string>();
    if (campusIds.length) {
      const { data: cs } = await db
        .from("campuses")
        .select("id,display_name,name")
        .in("id", campusIds);
      for (const c of (cs ?? []) as any[]) names.set(c.id, c.display_name || c.name);
    }
    const campaigns: CampaignView[] = list.map((c) => ({
      id: c.id,
      campusId: c.campus_id,
      campusName: names.get(c.campus_id) ?? null,
      campaignTag: c.campaign_tag,
      templateKey: c.template_key,
      status: c.status,
      scheduledSendAt: c.scheduled_send_at,
      scheduledLabel: sendTimeLabel(new Date(c.scheduled_send_at)),
      emailCount: c.email_count,
      dmCount: c.dm_count,
      autoApproved: c.auto_approved,
      createdBy: c.created_by ?? null,
      createdAt: c.created_at,
    }));
    return { campaigns, paused: await isOutboundPaused(db) };
  });

/** Lee's controls inside the review window: send now, hold, or cancel. */
export const growthCampaignAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        action: z.enum(["approve_now", "hold", "resume", "cancel"]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; sent?: number }> => {
    const db = await adminDb();
    const { data: c } = await db
      .from("launch_campaigns")
      .select("id,campus_id,partner_id,campaign_tag,status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!c) throw new Error("Campaign not found");
    if (c.status === "sent") throw new Error("This campaign already sent.");

    if (data.action === "cancel") {
      await db.from("growth_outreach_events").delete().eq("campaign_id", c.campaign_tag);
      await db
        .from("launch_campaigns")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", c.id);
      await logPartnerActivity(db, {
        partnerId: c.partner_id,
        campusId: c.campus_id,
        kind: "campaign_canceled",
        summary: "Campaign canceled before send",
        meta: { campaignId: c.id },
      });
      return { ok: true };
    }
    if (data.action === "hold") {
      await db.from("launch_campaigns").update({ status: "held" }).eq("id", c.id);
      return { ok: true };
    }
    if (data.action === "resume") {
      await db.from("launch_campaigns").update({ status: "pending" }).eq("id", c.id);
      return { ok: true };
    }
    // approve_now — send immediately.
    const sent = await sendCampaign(db, c);
    return { ok: true, sent };
  });

/** Freeze / unfreeze every pending campaign across all partners at once. */
export const growthPauseAllOutbound = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ paused: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await adminDb();
    const who = await whoNow();
    await setOutboundPaused(db, data.paused);
    await logPartnerActivity(db, {
      partnerId: null,
      kind: data.paused ? "paused_all" : "resumed_all",
      summary: data.paused
        ? "ALL OUTBOUND PAUSED — nothing sends until resumed"
        : "Outbound resumed",
      meta: { by: who },
    });
    return { ok: true };
  });

// ── the send itself (shared by approve-now and the cron) ─────────────────────────────
async function sendCampaign(db: DB, c: any): Promise<number> {
  const { sendResendEmail } = await import("@/lib/email.server");
  const { data: events } = await db
    .from("growth_outreach_events")
    .select("id,email,subject,body,status,message_id")
    .eq("campaign_id", c.campaign_tag)
    .eq("direction", "outbound")
    .eq("channel", "email");
  let sent = 0;
  for (const ev of (events ?? []) as any[]) {
    if (ev.message_id || !ev.email) continue; // already sent / unreachable
    try {
      const res = await sendResendEmail({ to: ev.email, subject: ev.subject ?? "", text: ev.body ?? "" });
      if (res.ok) {
        await db
          .from("growth_outreach_events")
          .update({ status: "sent", message_id: res.id ?? null, occurred_at: new Date().toISOString() })
          .eq("id", ev.id);
        sent++;
      }
    } catch {
      /* one bad recipient never stops the batch */
    }
  }
  await db
    .from("launch_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", c.id);
  await logPartnerActivity(db, {
    partnerId: c.partner_id ?? null,
    campusId: c.campus_id,
    kind: "campaign_sent",
    summary: `Campaign sent — ${sent} emails delivered`,
    meta: { campaignId: c.id, sent },
  });
  return sent;
}

/** CRON path: send every due pending campaign, unless outbound is paused globally or the
 *  campaign's partner has auto-approve turned off (then it waits for Lee). Takes a
 *  service-role db directly — no admin session. */
export async function runDueCampaigns(db: DB): Promise<{ paused: boolean; sent: number; campaigns: number }> {
  if (await isOutboundPaused(db)) return { paused: true, sent: 0, campaigns: 0 };
  const nowIso = new Date().toISOString();
  const { data: due } = await db
    .from("launch_campaigns")
    .select("id,campus_id,partner_id,campaign_tag,status,auto_approved")
    .eq("status", "pending")
    .lte("scheduled_send_at", nowIso);
  const list = (due ?? []) as any[];
  // Which partners have auto-approve OFF → those campaigns wait for a manual approve_now.
  const partnerIds = [...new Set(list.map((c) => c.partner_id).filter(Boolean))];
  const manualPartners = new Set<string>();
  if (partnerIds.length) {
    const { data: ps } = await db
      .from("referral_partners")
      .select("id,auto_approve_outbound")
      .in("id", partnerIds);
    for (const p of (ps ?? []) as any[]) if (p.auto_approve_outbound === false) manualPartners.add(p.id);
  }
  let sent = 0;
  let fired = 0;
  for (const c of list) {
    if (c.partner_id && manualPartners.has(c.partner_id)) continue; // blocking review for this partner
    sent += await sendCampaign(db, c);
    fired++;
  }
  return { paused: false, sent, campaigns: fired };
}
