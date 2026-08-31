// REP EARNINGS (server) — the YOUR EARNINGS panel's one data source. Commission comes straight
// from the existing ledger; the signing bonus is DERIVED live from source tables (conversions,
// links, claims), so a voided row reverses its bonus automatically and there is no second ledger
// to reconcile. See rep-earnings.ts for the contract; every rule there is exercised by tests.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  activatedChapters, eventCounts, isQualifyingSale, payingFlyers, signingBonus,
  type SigningBonus,
} from "@/lib/rep-earnings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export type FlyerStat = { label: string; signups: number; scans: number; paying: boolean };
export type ChapterSignupStat = { chapterId: string; name: string; signups: number; activated: boolean };
export type ClaimStat = { chapterName: string; at: string };

export type RepEarnings = {
  ok: true;
  commission: { pendingCents: number; approvedCents: number; paidCents: number };
  bonus: SigningBonus;
  /** null = no qualifying sale yet (bonus locked). */
  firstSaleAt: string | null;
  perChapter: ChapterSignupStat[];   // which house produced what
  perFlyer: FlyerStat[];             // signups pay; scans are the diagnostic
  claims: ClaimStat[];
};
export type RepEarningsResult = RepEarnings | { ok: false; error: string };

/** The whole computation, by partner id — shared by the rep's own view and admin surfaces. */
export async function computeRepEarnings(db: DB, rep: { id: string; is_test: boolean }): Promise<RepEarnings> {
  // links (chapter FK + which ones are flyer QRs)
  const { data: linkRows } = await db.from("referral_links")
    .select("id,code,label,campus_greek_chapter_id,utm_content").eq("partner_id", rep.id).limit(500);
  const links = (linkRows ?? []) as Array<{ id: string; code: string; label: string | null; campus_greek_chapter_id: string | null; utm_content: string | null }>;
  const linkById = new Map(links.map((l) => [l.id, l]));
  const flyerLinks = links.filter((l) => l.utm_content === "flyer");

  // conversions — the verified event stream
  let convQ = db.from("referral_conversions").select("link_id,kind,amount_cents,occurred_at").eq("partner_id", rep.id).limit(20000);
  if (!rep.is_test) convQ = convQ.eq("is_test", false);
  const { data: convRows } = await convQ;
  const conversions = (convRows ?? []) as Array<{ link_id: string | null; kind: string; amount_cents: number; occurred_at: string }>;

  // THE GATE: first $1,000+ chapter sale
  let firstSaleMs: number | null = null;
  for (const c of conversions) {
    if (isQualifyingSale(c.kind, c.amount_cents ?? 0)) {
      const t = Date.parse(c.occurred_at);
      if (firstSaleMs === null || t < firstSaleMs) firstSaleMs = t;
    }
  }

  // free signups (before the sale), grouped by chapter and by flyer
  const signupsByChapter: Record<string, number> = {};
  const signupsByFlyer: Record<string, number> = {};
  let signupCount = 0;
  for (const c of conversions) {
    if (c.kind !== "signup") continue;
    if (!eventCounts(Date.parse(c.occurred_at), firstSaleMs)) continue;
    signupCount++;
    const link = c.link_id ? linkById.get(c.link_id) : undefined;
    if (link?.campus_greek_chapter_id) signupsByChapter[link.campus_greek_chapter_id] = (signupsByChapter[link.campus_greek_chapter_id] ?? 0) + 1;
    if (link?.utm_content === "flyer") signupsByFlyer[link.id] = (signupsByFlyer[link.id] ?? 0) + 1;
  }

  // flyer scans — diagnostic only (a flyer with 40 scans and 1 signup is a placement problem)
  const scansByFlyer = new Map<string, number>();
  if (flyerLinks.length) {
    let clickQ = db.from("referral_clicks").select("link_id").in("link_id", flyerLinks.map((l) => l.id)).eq("is_bot", false).limit(20000);
    if (!rep.is_test) clickQ = clickQ.eq("is_test", false);
    const { data: clicks } = await clickQ;
    for (const r of (clicks ?? []) as Array<{ link_id: string }>) scansByFlyer.set(r.link_id, (scansByFlyer.get(r.link_id) ?? 0) + 1);
  }

  // rep-attributed page claims — APPROVED only (a rep could file the public claim form
  // themselves; Lee's approval call is what verifies it)
  const { data: claimRows } = await db.from("greek_chapter_claims")
    .select("campus_greek_chapter_id,status,created_at,decided_at").eq("sourcing_partner_id", rep.id)
    .eq("status", "approved").limit(200);
  const claims = ((claimRows ?? []) as Array<{ campus_greek_chapter_id: string; created_at: string; decided_at: string | null }>)
    .filter((c) => eventCounts(Date.parse(c.decided_at ?? c.created_at), firstSaleMs));

  // names for every chapter we mention
  const chapterIds = Array.from(new Set([...Object.keys(signupsByChapter), ...claims.map((c) => c.campus_greek_chapter_id)]));
  const nameById = new Map<string, string>();
  for (let i = 0; i < chapterIds.length; i += 100) {
    const { data: chs } = await db.from("campus_greek_chapters").select("id,slug,nickname,greek_org_id").in("id", chapterIds.slice(i, i + 100));
    const rows = (chs ?? []) as Array<{ id: string; slug: string; nickname: string | null; greek_org_id: string | null }>;
    const orgIds = Array.from(new Set(rows.map((r) => r.greek_org_id).filter(Boolean))) as string[];
    const orgNames = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
      for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) orgNames.set(o.id, o.name);
    }
    for (const r of rows) nameById.set(r.id, r.nickname || (r.greek_org_id ? orgNames.get(r.greek_org_id) : null) || r.slug);
  }

  const activated = new Set(activatedChapters(signupsByChapter));
  const paying = new Set(payingFlyers(signupsByFlyer));

  // commission from the real ledger
  let pendingCents = 0, approvedCents = 0, paidCents = 0;
  {
    let q = db.from("referral_commissions").select("commission_cents,status").eq("partner_id", rep.id).limit(20000);
    if (!rep.is_test) q = q.eq("is_test", false);
    const { data: comm } = await q;
    for (const r of (comm ?? []) as Array<{ commission_cents: number; status: string }>) {
      if (r.status === "pending") pendingCents += r.commission_cents ?? 0;
      else if (r.status === "approved") approvedCents += r.commission_cents ?? 0;
      else if (r.status === "paid") paidCents += r.commission_cents ?? 0;
    }
  }

  const bonus = signingBonus({
    signups: signupCount,
    flyersProducing: paying.size,
    pagesClaimed: claims.length,
    chaptersActivated: activated.size,
  }, firstSaleMs === null);

  return {
    ok: true,
    commission: { pendingCents, approvedCents, paidCents },
    bonus,
    firstSaleAt: firstSaleMs === null ? null : new Date(firstSaleMs).toISOString(),
    perChapter: Object.entries(signupsByChapter)
      .map(([chapterId, signups]) => ({ chapterId, name: nameById.get(chapterId) ?? "?", signups, activated: activated.has(chapterId) }))
      .sort((a, b) => b.signups - a.signups),
    perFlyer: flyerLinks.map((l) => ({
      label: l.label ?? l.code, signups: signupsByFlyer[l.id] ?? 0,
      scans: scansByFlyer.get(l.id) ?? 0, paying: paying.has(l.id),
    })).sort((a, b) => b.signups - a.signups),
    claims: claims.map((c) => ({ chapterName: nameById.get(c.campus_greek_chapter_id) ?? "?", at: c.decided_at ?? c.created_at })),
  };
}

export const getRepEarnings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ legacyToken: z.string().max(80).optional().nullable() }).parse(d))
  .handler(async ({ data }): Promise<RepEarningsResult> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    return computeRepEarnings(db, s.rep);
  });
