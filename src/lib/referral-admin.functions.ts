// referral-admin.functions.ts — server functions for /admin/reps (partners · links · conversions ·
// commissions). Service-role reads/writes on the referral_* tables, reached behind the AdminGate.
//
// LAW (client-bundle strip): only createServerFn + zod + pure shared imports live at module scope.
// Every server-only import (supabaseAdmin, referral.server, referral-stats.server, react-start/server)
// is pulled in with `await import(...)` INSIDE the handler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  COMMISSION_STATUSES,
  COMMISSION_TYPES,
  CONVERSION_KINDS,
  PARTNER_STATUSES,
  PARTNER_TYPES,
  effectiveRule,
  type CommissionRow,
  type ConversionRow,
  type FunnelStats,
  type LinkRow,
  type PartnerRow,
} from "@/lib/referral-shared";

// A link row decorated with the ready-to-copy short URL (built from the caller's origin) + stats.
export type LinkListRow = LinkRow & { shortUrl: string; stats: FunnelStats };
export type PartnerListRow = PartnerRow & { stats: FunnelStats };

const emptyStats = (): FunnelStats => ({
  clicks: 0,
  signups: 0,
  purchases: 0,
  revenueCents: 0,
  commissionCents: 0,
});

// ── helpers reused across handlers (defined at module scope but only CALLED inside handlers) ──
function originFromReq(req: Request): string {
  try {
    const h = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").trim();
    if (h) {
      const proto =
        req.headers.get("x-forwarded-proto") || (h.startsWith("localhost") ? "http" : "https");
      return `${proto}://${h}`;
    }
    return new URL(req.url).origin;
  } catch {
    return "https://surviveaccounting.com";
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// PARTNERS
// ────────────────────────────────────────────────────────────────────────────────
export const searchPartners = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().max(120).optional() }).parse(d))
  .handler(async ({ data }): Promise<PartnerRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    let q = db
      .from("referral_partners")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data.q)
      q = q.or(`name.ilike.%${data.q}%,email.ilike.%${data.q}%,social_handle.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as PartnerRow[];
  });

export const listPartners = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        includeTest: z.boolean().default(false),
        status: z.enum(PARTNER_STATUSES).optional(),
        q: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<PartnerListRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadFunnel } = await import("@/lib/referral-stats.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    let q = db
      .from("referral_partners")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!data.includeTest) q = q.eq("is_test", false);
    if (data.status) q = q.eq("status", data.status);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const funnel = await loadFunnel(data.includeTest);
    return (rows ?? []).map((p: PartnerRow) => ({
      ...p,
      stats: funnel.byPartner[p.id] ?? emptyStats(),
    }));
  });

export const upsertPartner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(160),
        type: z.enum(PARTNER_TYPES),
        email: z.string().trim().max(200).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
        socialHandle: z.string().trim().max(120).optional().nullable(),
        status: z.enum(PARTNER_STATUSES).default("active"),
        defaultCommissionType: z.enum(COMMISSION_TYPES).default("percent"),
        defaultCommissionRate: z.number().min(0).max(100000).default(10),
        campusId: z.string().uuid().optional().nullable(),
        notes: z.string().trim().max(4000).optional().nullable(),
        isTest: z.boolean().default(false),
        who: z.string().trim().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<PartnerRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const row: Record<string, unknown> = {
      name: data.name,
      type: data.type,
      email: data.email || null,
      phone: data.phone || null,
      social_handle: data.socialHandle || null,
      status: data.status,
      default_commission_type: data.defaultCommissionType,
      default_commission_rate: data.defaultCommissionRate,
      campus_id: data.campusId || null,
      notes: data.notes || null,
      is_test: data.isTest,
    };
    if (data.id) {
      row.updated_at = new Date().toISOString();
      const { data: up, error } = await db
        .from("referral_partners")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return up as PartnerRow;
    }
    row.created_by = data.who || null;
    const { data: ins, error } = await db
      .from("referral_partners")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return ins as PartnerRow;
  });

// ────────────────────────────────────────────────────────────────────────────────
// LINKS — the Scratch Link Lab. Create a link in seconds: pick/create a partner, paste a
// destination, set a campaign + commission (or inherit), get a short URL + QR back immediately.
// ────────────────────────────────────────────────────────────────────────────────
const commissionOverride = z
  .object({ type: z.enum(COMMISSION_TYPES), rate: z.number().min(0).max(100000) })
  .nullable()
  .optional();

export const createLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        // Either an existing partner id, or a name+type to create one on the fly.
        partnerId: z.string().uuid().optional(),
        newPartnerName: z.string().trim().max(160).optional(),
        newPartnerType: z.enum(PARTNER_TYPES).optional(),
        destinationUrl: z.string().trim().min(1).max(2000),
        label: z.string().trim().max(160).optional(),
        campaign: z.string().trim().max(160).optional(),
        commission: commissionOverride, // null/undefined = inherit partner default
        utmSource: z.string().trim().max(120).optional(),
        utmMedium: z.string().trim().max(120).optional(),
        utmCampaign: z.string().trim().max(120).optional(),
        utmContent: z.string().trim().max(120).optional(),
        isTest: z.boolean().default(false),
        who: z.string().trim().max(80).optional(),
      })
      .refine((v) => v.partnerId || (v.newPartnerName && v.newPartnerType), {
        message: "Provide an existing partnerId or a newPartnerName + newPartnerType.",
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ link: LinkRow; shortUrl: string; qrDataUri: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateUniqueCode } = await import("@/lib/referral.server");
    const { qrDataUri } = await import("@/lib/referral-qr.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    // Resolve or create the partner.
    let partnerId = data.partnerId ?? null;
    let partnerIsTest = data.isTest;
    if (!partnerId) {
      const { data: p, error: pErr } = await db
        .from("referral_partners")
        .insert({
          name: data.newPartnerName,
          type: data.newPartnerType,
          is_test: data.isTest,
          created_by: data.who || null,
        })
        .select("id,is_test")
        .single();
      if (pErr) throw new Error(pErr.message);
      partnerId = p.id as string;
      partnerIsTest = !!p.is_test;
    } else {
      const { data: p } = await db
        .from("referral_partners")
        .select("is_test")
        .eq("id", partnerId)
        .maybeSingle();
      partnerIsTest = !!p?.is_test;
    }

    const code = await generateUniqueCode();
    const linkRow: Record<string, unknown> = {
      code,
      partner_id: partnerId,
      label: data.label || null,
      destination_url: data.destinationUrl,
      campaign: data.campaign || null,
      commission_type: data.commission?.type ?? null,
      commission_rate: data.commission?.rate ?? null,
      utm_source: data.utmSource || null,
      utm_medium: data.utmMedium || null,
      utm_campaign: data.utmCampaign || null,
      utm_content: data.utmContent || null,
      is_test: data.isTest || partnerIsTest,
      created_by: data.who || null,
    };
    const { data: link, error } = await db
      .from("referral_links")
      .insert(linkRow)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const origin = originFromReq(getRequest());
    const shortUrl = `${origin}/r/${code}`;
    const qr = await qrDataUri(shortUrl);
    return { link: link as LinkRow, shortUrl, qrDataUri: qr };
  });

export const listLinks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ includeTest: z.boolean().default(false), partnerId: z.string().uuid().optional() })
      .parse(d),
  )
  .handler(async ({ data }): Promise<LinkListRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadFunnel } = await import("@/lib/referral-stats.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    let q = db
      .from("referral_links")
      .select("*, referral_partners(name,type)")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!data.includeTest) q = q.eq("is_test", false);
    if (data.partnerId) q = q.eq("partner_id", data.partnerId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const funnel = await loadFunnel(data.includeTest);
    const origin = originFromReq(getRequest());
    return (rows ?? []).map((r: any) => {
      const { referral_partners, ...link } = r;
      return {
        ...link,
        partner_name: referral_partners?.name ?? null,
        partner_type: referral_partners?.type ?? null,
        shortUrl: `${origin}/r/${link.code}`,
        stats: funnel.byLink[link.id] ?? emptyStats(),
      } as LinkListRow;
    });
  });

export const getLinkDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadFunnel } = await import("@/lib/referral-stats.server");
    const { qrDataUri } = await import("@/lib/referral-qr.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    const { data: link, error } = await db
      .from("referral_links")
      .select("*")
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!link) throw new Error("Link not found");
    const { data: partner } = await db
      .from("referral_partners")
      .select("*")
      .eq("id", link.partner_id)
      .maybeSingle();

    const funnel = await loadFunnel(true); // detail view always includes test rows for this one link
    const stats = funnel.byLink[link.id] ?? emptyStats();

    const { data: convs } = await db
      .from("referral_conversions")
      .select(
        "id,code,partner_id,link_id,kind,subject_type,subject_id,email,amount_cents,occurred_at,is_test",
      )
      .eq("link_id", link.id)
      .order("occurred_at", { ascending: false })
      .limit(25);

    const origin = originFromReq(getRequest());
    const shortUrl = `${origin}/r/${link.code}`;
    const qr = await qrDataUri(shortUrl);
    const rule = partner
      ? effectiveRule(
          { commission_type: link.commission_type, commission_rate: link.commission_rate },
          {
            default_commission_type: partner.default_commission_type,
            default_commission_rate: partner.default_commission_rate,
          },
        )
      : { type: "none" as const, rate: 0 };

    return {
      link: link as LinkRow,
      partner: (partner ?? null) as PartnerRow | null,
      stats,
      shortUrl,
      qrDataUri: qr,
      rule,
      recentConversions: (convs ?? []) as ConversionRow[],
    };
  });

export const setLinkActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { error } = await db
      .from("referral_links")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ────────────────────────────────────────────────────────────────────────────────
// CONVERSIONS + COMMISSIONS
// ────────────────────────────────────────────────────────────────────────────────
export const listConversions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        includeTest: z.boolean().default(false),
        kind: z.enum(CONVERSION_KINDS).optional(),
        partnerId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ConversionRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    let q = db
      .from("referral_conversions")
      .select(
        "id,code,partner_id,link_id,kind,subject_type,subject_id,email,amount_cents,occurred_at,is_test, referral_partners(name)",
      )
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (!data.includeTest) q = q.eq("is_test", false);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.partnerId) q = q.eq("partner_id", data.partnerId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const { referral_partners, ...rest } = r;
      return { ...rest, partner_name: referral_partners?.name ?? null } as ConversionRow;
    });
  });

export const listCommissions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        includeTest: z.boolean().default(false),
        status: z.enum(COMMISSION_STATUSES).optional(),
        partnerId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CommissionRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    let q = db
      .from("referral_commissions")
      .select(
        "id,conversion_id,partner_id,link_id,basis_cents,commission_type,commission_rate,commission_cents,status,is_test,notes,created_at, referral_partners(name)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (!data.includeTest) q = q.eq("is_test", false);
    if (data.status) q = q.eq("status", data.status);
    if (data.partnerId) q = q.eq("partner_id", data.partnerId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => {
      const { referral_partners, ...rest } = r;
      return { ...rest, partner_name: referral_partners?.name ?? null } as CommissionRow;
    });
  });

export const setCommissionStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(COMMISSION_STATUSES),
        who: z.string().trim().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { error } = await db
      .from("referral_commissions")
      .update({
        status: data.status,
        status_changed_at: new Date().toISOString(),
        status_changed_by: data.who || null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// KPIs for the overall funnel row.
export const getAttributionKpis = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ includeTest: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }): Promise<FunnelStats> => {
    const { loadFunnel } = await import("@/lib/referral-stats.server");
    const funnel = await loadFunnel(data.includeTest);
    return funnel.overall;
  });

// Manual conversion entry / correction (admin). Resolves the link by code directly (no cookie).
export const recordManualConversion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().trim().min(1).max(40),
        kind: z.enum(CONVERSION_KINDS).default("purchase"),
        email: z.string().trim().max(200).optional(),
        amountCents: z.number().int().min(0).max(100_000_00).default(0),
        subjectType: z.string().trim().max(40).optional(),
        subjectId: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { recordConversionByCode } = await import("@/lib/referral.server");
    return recordConversionByCode(data.code, {
      kind: data.kind,
      email: data.email ?? null,
      amountCents: data.amountCents,
      subjectType: data.subjectType ?? "manual",
      subjectId: data.subjectId ?? null,
    });
  });

// ────────────────────────────────────────────────────────────────────────────────
// RECONCILE — turn attributed order LEADS into PURCHASES + commissions from real, server-side order
// revenue. A signup conversion (subject_type='order') is the durable attribution join written at
// order-submit from the ref cookie. This scans those, reads each order's CURRENT total_cents/status
// from the orders table (trusted), and for any that is now priced+paid with no purchase conversion
// yet, records the purchase + commission. Idempotent (the unique conversion guard).
// ────────────────────────────────────────────────────────────────────────────────
const PAID_STATUSES = new Set(["paid", "approved", "delivered"]);

export const reconcileOrderPurchases = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(2000).default(500) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ checked: number; created: number; skipped: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordConversionByCode } = await import("@/lib/referral.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    // Order signup conversions that carry a code (the attribution join).
    const { data: signups, error } = await db
      .from("referral_conversions")
      .select("id,code,subject_id,email,is_test")
      .eq("kind", "signup")
      .eq("subject_type", "order")
      .not("code", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    let created = 0;
    let skipped = 0;
    const list = signups ?? [];
    for (const s of list) {
      if (!s.subject_id) {
        skipped++;
        continue;
      }
      const { data: order } = await db
        .from("orders")
        .select("id,total_cents,status")
        .eq("id", s.subject_id)
        .maybeSingle();
      const total = Number(order?.total_cents ?? 0);
      const paid = order && PAID_STATUSES.has(order.status) && total > 0;
      if (!paid) {
        skipped++;
        continue;
      }
      const res = await recordConversionByCode(s.code, {
        kind: "purchase",
        subjectType: "order",
        subjectId: s.subject_id,
        email: s.email,
        amountCents: total,
        forceTest: !!s.is_test,
      });
      if (res.attributed && !res.deduped) created++;
      else skipped++;
    }
    return { checked: list.length, created, skipped };
  });
