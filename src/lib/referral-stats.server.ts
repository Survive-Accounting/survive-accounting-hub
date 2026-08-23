// referral-stats.server.ts — server-only read/aggregation for the referral funnel. Kept separate
// from referral.server.ts (write path) so the admin's KPI math lives in one place. Aggregation is
// done in JS over paged reads (PostgREST caps a plain select at 1000 rows) — three queries total,
// keyed by link and partner. Bots are excluded from click counts; voided commissions are excluded
// from earned totals. `includeTest=false` drops every is_test row (the real-money view).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FunnelStats } from "@/lib/referral-shared";

const db = supabaseAdmin as unknown as { from: (t: string) => any };
const PAGE = 1000;
const HARD_CAP = 200_000;

async function pagedSelect(
  table: string,
  columns: string,
  applyFilter?: (q: any) => any,
): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (applyFilter) q = applyFilter(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE || out.length >= HARD_CAP) break;
  }
  return out;
}

function empty(): FunnelStats {
  return { clicks: 0, signups: 0, purchases: 0, revenueCents: 0, commissionCents: 0 };
}
function bump(map: Record<string, FunnelStats>, key: string | null | undefined): FunnelStats {
  if (!key) return empty(); // untracked bucket (shouldn't persist), kept off the maps
  if (!map[key]) map[key] = empty();
  return map[key];
}

export type FunnelBundle = {
  overall: FunnelStats;
  byLink: Record<string, FunnelStats>;
  byPartner: Record<string, FunnelStats>;
};

export async function loadFunnel(includeTest: boolean): Promise<FunnelBundle> {
  const testGate = (q: any) => (includeTest ? q : q.eq("is_test", false));

  const [links, clicks, convs, comms] = await Promise.all([
    pagedSelect("referral_links", "id,partner_id"),
    pagedSelect("referral_clicks", "link_id,is_test", (q) => testGate(q).eq("is_bot", false)),
    pagedSelect("referral_conversions", "link_id,partner_id,kind,amount_cents,is_test", testGate),
    pagedSelect("referral_commissions", "link_id,partner_id,commission_cents,is_test", (q) =>
      testGate(q).neq("status", "void"),
    ),
  ]);

  const partnerOfLink = new Map<string, string>();
  for (const l of links) partnerOfLink.set(l.id, l.partner_id);

  const overall = empty();
  const byLink: Record<string, FunnelStats> = {};
  const byPartner: Record<string, FunnelStats> = {};

  for (const c of clicks) {
    overall.clicks++;
    bump(byLink, c.link_id).clicks++;
    bump(byPartner, partnerOfLink.get(c.link_id)).clicks++;
  }
  for (const v of convs) {
    const isPurchase = v.kind === "purchase" || v.kind === "chapter_purchase";
    const pid = v.partner_id ?? partnerOfLink.get(v.link_id);
    if (isPurchase) {
      overall.purchases++;
      overall.revenueCents += v.amount_cents ?? 0;
      const bl = bump(byLink, v.link_id);
      bl.purchases++;
      bl.revenueCents += v.amount_cents ?? 0;
      const bp = bump(byPartner, pid);
      bp.purchases++;
      bp.revenueCents += v.amount_cents ?? 0;
    } else {
      overall.signups++;
      bump(byLink, v.link_id).signups++;
      bump(byPartner, pid).signups++;
    }
  }
  for (const m of comms) {
    const pid = m.partner_id ?? partnerOfLink.get(m.link_id);
    overall.commissionCents += m.commission_cents ?? 0;
    bump(byLink, m.link_id).commissionCents += m.commission_cents ?? 0;
    bump(byPartner, pid).commissionCents += m.commission_cents ?? 0;
  }

  return { overall, byLink, byPartner };
}
