// REP PORTAL — the self-serve server functions. TOKEN-GATED, not admin-gated: a rep is not an
// admin, so access is the unguessable dashboard_token issued at signup (emailed, bookmarked). Every
// function resolves the rep from that token and scopes every read/write to that one partner_id — a
// token can only ever see and change its own rep. The admin console (/admin/reps) still uses a real
// admin session; this is the OTHER audience.
//
// Reuses the referral engine wholesale: a rep IS a referral_partner (type 'campus_rep'); links,
// clicks, conversions and commissions are the same referral_* tables the admin sees, so a rep's
// numbers and Lee's numbers are the same numbers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { canonicalSchoolName, schoolBySlug } from "@/lib/schools";
import { commissionCents, effectiveRule, ruleLabel } from "@/lib/referral-shared";
import { nextPayout, normalizeVenmo, type RepDashboardResult, type RepLinkStat } from "@/lib/rep-portal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape the other referral modules use
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const ORIGIN = "https://surviveaccounting.com";

/** A long, URL-safe, unguessable token. Not auth in the password sense — but it cannot be guessed,
 *  and it is the same low-friction "bookmark this link" model the council pages use. */
function newToken(): string {
  const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(28);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (n) => A[n % A.length]).join("");
}

async function testEnabled(): Promise<boolean> {
  try { const { testModeOn } = await import("@/lib/test-mode.server"); return testModeOn(); } catch { return false; }
}

/** Human label for a link's destination — this is the "by org on your campus" breakdown. */
function destinationLabel(url: string): string {
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    const go = path.match(/^\/go\/([^/]+)\/([^/]+)/);
    if (go) {
      const school = canonicalSchoolName(go[1], go[1]);
      const chapter = go[2].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `${school} · ${chapter}`;
    }
    const campus = path.match(/^\/([^/?#]+)/);
    if (campus) return canonicalSchoolName(campus[1], campus[1].replace(/-/g, " "));
    return path || url;
  } catch { return url; }
}

// ── SIGN UP (DEPRECATED — kept only so a stale client can't 500) ────────────────────────────
// Campus-rep V1 replaced instant self-minted active reps with the real lifecycle
// (applyAsRep → admin approve → phone verify → active, see rep-auth.functions.ts). This endpoint
// now creates the SAME thing applyAsRep creates — an applied/paused rep with no links — and no
// longer returns a dashboard token, so the old "active on submit" bypass is closed even for
// direct callers.
export const signUpRep = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    campusSlug: z.string().trim().min(1).max(120),
    venmo: z.string().trim().max(120).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    isTest: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; token?: string; dashboardUrl?: string }> => {
    const db = await admin();
    // is_test is honoured only when the SERVER has Test Mode enabled — a real signup is never test.
    const isTest = !!data.isTest && (await testEnabled());

    const school = schoolBySlug(data.campusSlug);
    let campusId: string | null = null;
    if (school) {
      const { data: c } = await db.from("campuses").select("id").eq("slug", data.campusSlug).maybeSingle();
      campusId = (c?.id as string) ?? null;
    }

    const token = newToken();
    const { data: partner, error } = await db.from("referral_partners").insert({
      name: data.name, type: "campus_rep", email: data.email.toLowerCase(),
      phone: data.phone ?? null, status: "paused", rep_status: "applied",
      default_commission_type: "percent", default_commission_rate: 10,
      campus_id: campusId, venmo: data.venmo ? normalizeVenmo(data.venmo) : null,
      dashboard_token: token, is_test: isTest,
      notes: `self-signup (legacy endpoint)${isTest ? " · TEST" : ""}`,
    }).select("id").maybeSingle();
    if (error || !partner?.id) return { ok: false, error: error?.message ?? "Couldn't create your rep account." };

    return { ok: true };
  });

// ── DASHBOARD (token) ──────────────────────────────────────────────────────────────────────────
export const getRepDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(10).max(80), nowMs: z.number().optional() }).parse(d))
  .handler(async ({ data }): Promise<RepDashboardResult> => {
    const db = await admin();
    const { data: p } = await db.from("referral_partners")
      .select("id,name,email,campus_id,venmo,is_test,default_commission_type,default_commission_rate,rep_status")
      .eq("dashboard_token", data.token).maybeSingle();
    if (!p?.id) return { ok: false, error: "That dashboard link isn't valid. Check the link or sign up again." };
    if (p.rep_status === "paused" || p.rep_status === "deactivated") return { ok: false, error: "This rep account is paused." };

    let campusSlug: string | null = null, campusName: string | null = null;
    if (p.campus_id) {
      const { data: c } = await db.from("campuses").select("slug,name,short_name").eq("id", p.campus_id).maybeSingle();
      campusSlug = (c?.slug as string) ?? null;
      campusName = campusSlug ? canonicalSchoolName(campusSlug, (c?.short_name as string) || (c?.name as string)) : null;
    }

    const { data: linkRows } = await db.from("referral_links")
      .select("id,code,label,destination_url").eq("partner_id", p.id).order("created_at", { ascending: true }).limit(200);
    const links = (linkRows ?? []) as Array<{ id: string; code: string; label: string | null; destination_url: string }>;
    const linkIds = links.map((l) => l.id);

    // Clicks per link. Bounded to this rep's links; counted in JS (no GROUP BY over PostgREST).
    const clicksByLink = new Map<string, number>();
    if (linkIds.length) {
      const { data: clk } = await db.from("referral_clicks").select("link_id").in("link_id", linkIds).limit(20000);
      for (const r of (clk ?? []) as Array<{ link_id: string }>) clicksByLink.set(r.link_id, (clicksByLink.get(r.link_id) ?? 0) + 1);
    }

    // Conversions for this partner → per link, split signup/purchase.
    const convByLink = new Map<string, { signups: number; purchases: number }>();
    let totalSignups = 0, totalPurchases = 0;
    const { data: conv } = await db.from("referral_conversions").select("link_id,kind").eq("partner_id", p.id).limit(20000);
    for (const r of (conv ?? []) as Array<{ link_id: string | null; kind: string }>) {
      const e = convByLink.get(r.link_id ?? "") ?? { signups: 0, purchases: 0 };
      if (r.kind === "signup") { e.signups++; totalSignups++; } else { e.purchases++; totalPurchases++; }
      convByLink.set(r.link_id ?? "", e);
    }

    // Commissions for this partner → per link + by status.
    const earnByLink = new Map<string, number>();
    let pendingCents = 0, approvedCents = 0, paidCents = 0;
    const { data: comm } = await db.from("referral_commissions").select("link_id,commission_cents,status").eq("partner_id", p.id).limit(20000);
    for (const r of (comm ?? []) as Array<{ link_id: string | null; commission_cents: number; status: string }>) {
      const cents = r.commission_cents ?? 0;
      earnByLink.set(r.link_id ?? "", (earnByLink.get(r.link_id ?? "") ?? 0) + cents);
      if (r.status === "pending") pendingCents += cents;
      else if (r.status === "approved") approvedCents += cents;
      else if (r.status === "paid") paidCents += cents;
    }

    let totalClicks = 0;
    const linkStats: RepLinkStat[] = links.map((l) => {
      const clicks = clicksByLink.get(l.id) ?? 0; totalClicks += clicks;
      const cv = convByLink.get(l.id) ?? { signups: 0, purchases: 0 };
      return {
        code: l.code, label: l.label, shortUrl: `${ORIGIN}/r/${l.code}`,
        destinationUrl: l.destination_url, destinationLabel: destinationLabel(l.destination_url),
        clicks, signups: cv.signups, purchases: cv.purchases, earnedCents: earnByLink.get(l.id) ?? 0,
      };
    });

    const rule = effectiveRule({ commission_type: null, commission_rate: null }, { default_commission_type: p.default_commission_type, default_commission_rate: p.default_commission_rate });
    const np = nextPayout(data.nowMs ?? Date.parse("2026-08-23T12:00:00Z"));

    return {
      ok: true, repId: p.id as string, name: p.name as string, email: (p.email as string) ?? null,
      campusSlug, campusName, venmo: (p.venmo as string) ?? null, isTest: !!p.is_test,
      ruleLabel: ruleLabel(rule),
      links: linkStats,
      totals: { clicks: totalClicks, signups: totalSignups, purchases: totalPurchases },
      earnings: { pendingCents, approvedCents, paidCents },
      payout: { nextLabel: np.label, nextIso: np.iso, dueCents: approvedCents },
    };
  });

/** Resolve a rep id from a token, or null. Shared guard for the manage functions below.
 *  V1 lifecycle: a paused/deactivated rep's token stops working here too — the admin brake covers
 *  the legacy endpoints, not just the new session ones. */
async function repIdFromToken(db: DB, token: string): Promise<{ id: string; isTest: boolean } | null> {
  const { data } = await db.from("referral_partners").select("id,is_test,rep_status").eq("dashboard_token", token).maybeSingle();
  if (!data?.id) return null;
  if (data.rep_status === "paused" || data.rep_status === "deactivated") return null;
  return { id: data.id as string, isTest: !!data.is_test };
}

// ── SET VENMO ────────────────────────────────────────────────────────────────────────────────
export const updateRepVenmo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10).max(80), venmo: z.string().trim().max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; venmo?: string; error?: string }> => {
    const db = await admin();
    const rep = await repIdFromToken(db, data.token);
    if (!rep) return { ok: false, error: "Invalid dashboard link." };
    const venmo = data.venmo ? normalizeVenmo(data.venmo) : "";
    const { error } = await db.from("referral_partners").update({ venmo: venmo || null }).eq("id", rep.id);
    return error ? { ok: false, error: error.message } : { ok: true, venmo };
  });

// ── ADD A LINK (per org/chapter) ───────────────────────────────────────────────────────────────
export const createRepLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(10).max(80),
    label: z.string().trim().max(120).optional().nullable(),
    destinationUrl: z.string().trim().min(1).max(300),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; code?: string; shortUrl?: string; error?: string }> => {
    const db = await admin();
    const rep = await repIdFromToken(db, data.token);
    if (!rep) return { ok: false, error: "Invalid dashboard link." };
    // Only same-site destinations — a rep link must point back into Survive, never off-site.
    let dest = data.destinationUrl.trim();
    if (/^https?:\/\//i.test(dest)) {
      try { const u = new URL(dest); if (!/surviveaccounting\.com$/i.test(u.hostname)) return { ok: false, error: "Link must point to a Survive page." }; dest = u.pathname + u.search; } catch { return { ok: false, error: "That doesn't look like a valid link." }; }
    }
    if (!dest.startsWith("/")) dest = "/" + dest;
    const { generateUniqueCode } = await import("@/lib/referral.server");
    const code = await generateUniqueCode();
    const { error } = await db.from("referral_links").insert({
      code, partner_id: rep.id, label: data.label ?? null, destination_url: dest, active: true, is_test: rep.isTest,
    });
    return error ? { ok: false, error: error.message } : { ok: true, code, shortUrl: `${ORIGIN}/r/${code}` };
  });

// ── SIMULATE (test mode only) ────────────────────────────────────────────────────────────────
// Lets a tester see the dashboard fill in without needing a real student to click and buy. Records
// a real conversion + commission through the SAME engine a production event would, forced is_test so
// it never touches real totals. Refuses unless the rep is a test rep AND Test Mode is enabled.
export const simulateRepEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(10).max(80),
    code: z.string().trim().min(3).max(20),
    kind: z.enum(["click", "signup", "purchase"]),
    amountCents: z.number().int().min(0).max(1_000_00).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (!(await testEnabled())) return { ok: false, error: "Test Mode is not enabled." };
    const db = await admin();
    const rep = await repIdFromToken(db, data.token);
    if (!rep || !rep.isTest) return { ok: false, error: "Simulation is only for a test rep." };

    // Confirm the code belongs to THIS rep (never let a token drive another rep's link).
    const { data: link } = await db.from("referral_links").select("id").eq("code", data.code).eq("partner_id", rep.id).maybeSingle();
    if (!link?.id) return { ok: false, error: "That link isn't one of yours." };

    if (data.kind === "click") {
      await db.from("referral_clicks").insert({ link_id: link.id, code: data.code, occurred_at: new Date().toISOString(), is_test: true, meta: { simulated: true } });
      return { ok: true };
    }

    const { recordConversionByCode } = await import("@/lib/referral.server");
    const amount = data.kind === "purchase" ? (data.amountCents ?? 5000) : 0;
    const r = await recordConversionByCode(data.code, {
      kind: data.kind, amountCents: amount, subjectType: "manual", subjectId: `sim-${Date.now()}`,
      email: "sim@testrep.example", forceTest: true,
    });
    return r.attributed ? { ok: true } : { ok: false, error: `not attributed (${r.reason})` };
  });

/** A rep's default earn on a $50 exam, for the signup page's "you'd earn ~$X" line. Pure, no I/O. */
export function exampleEarn(amountCents = 5000): number {
  return commissionCents(amountCents, { type: "percent", rate: 10 });
}
