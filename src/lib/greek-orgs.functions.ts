// Greek org enrichment — server-side ProPublica Nonprofit Explorer fetch. ONE API
// call per EIN, cached in greek_org_propublica_cache so re-enriching is free. Pulls
// the org's name/address + per-year 990 financials into greek_org_filings.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  orgId: z.string().uuid(),
  einOrUrl: z.string().min(2),
});

/** Pull a 9-digit EIN from a raw EIN ("23-7219356"), a ProPublica org URL, or text. */
function extractEin(s: string): string | null {
  const url = s.match(/(?:organizations|nonprofits)\/(\d{9})/);
  if (url) return url[1];
  const dash = s.match(/\b(\d{2})-?(\d{7})\b/);
  if (dash) return dash[1] + dash[2];
  return null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" ? v : v != null && !Number.isNaN(Number(v)) ? Number(v) : null;

/** Per-year efile object ids, scraped from the ProPublica org page. These power
 *  the /organizations/{ein}/{object_id}/full render links (VA copies officers +
 *  preparer from the render). NOT derivable from the API: the pdf_url filename
 *  suffix is a submission timestamp, not an object id. Best-effort — {} on error. */
async function fetchObjectIds(ein: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`https://projects.propublica.org/nonprofits/organizations/${ein}`, {
      headers: { "User-Agent": "surviveaccounting-research/1.0" },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (!res.ok) return map;
    const html = await res.text();
    // Filing sections are `id='filing{YYYY}'` blocks, each containing its /full link.
    for (const part of html.split(/id=['"]filing/).slice(1)) {
      const year = part.match(/^(\d{4})['"]/)?.[1];
      const oid = part.match(/\/organizations\/\d{9}\/(\d{15,})\/full/)?.[1];
      if (year && oid) map.set(Number(year), oid);
    }
  } catch {
    // render links just won't show
  }
  return map;
}

type EnrichResult =
  | { ok: false; error: string }
  | { ok: true; ein: string; org_name: string; years: number[]; filings: number };

export const enrichGreekOrgFilings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<EnrichResult> => {
    const ein = extractEin(data.einOrUrl);
    if (!ein) return { ok: false, error: "Couldn't read a 9-digit EIN from that input." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cache = () => supabaseAdmin.from("greek_org_propublica_cache" as never) as any;
    const orgs = () => supabaseAdmin.from("greek_orgs" as never) as any;
    const filings = () => supabaseAdmin.from("greek_org_filings" as never) as any;

    // Cache first — one call per EIN.
    let payload: any = null;
    const { data: cached } = await cache().select("response").eq("ein", ein).maybeSingle();
    if (cached?.response) {
      payload = cached.response;
    } else {
      let res: Response;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        res = await fetch(
          `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`,
          { headers: { "User-Agent": "surviveaccounting-research/1.0" }, signal: ctrl.signal },
        ).finally(() => clearTimeout(t));
      } catch {
        return { ok: false, error: "ProPublica request failed (network/timeout)." };
      }
      if (!res.ok) return { ok: false, error: `ProPublica returned ${res.status} for EIN ${ein}.` };
      payload = await res.json();
      await cache().upsert(
        { ein, response: payload, fetched_at: new Date().toISOString() },
        { onConflict: "ein" },
      );
    }

    const org = payload?.organization ?? {};
    const address =
      [org.address, org.city, org.state, org.zipcode].filter(Boolean).join(", ") || null;
    await orgs()
      .update({
        ein,
        address,
        propublica_url: `https://projects.propublica.org/nonprofits/organizations/${ein}`,
        ...(org.name ? { name: org.name } : {}),
      })
      .eq("id", data.orgId);

    const objectIds = await fetchObjectIds(ein);
    const rows = (payload?.filings_with_data ?? []).map((f: any) => ({
      org_id: data.orgId,
      tax_year: num(f.tax_prd_yr),
      revenue: num(f.totrevenue),
      expenses: num(f.totfuncexpns),
      assets_eoy: num(f.totassetsend),
      liabilities_eoy: num(f.totliabend),
      // Itemized fields the ProPublica JSON exposes directly (rest are manual):
      contributions: num(f.totcntrbgfts),
      salaries: num(f.othrsalwages),
      fundraiser_fee: num(f.profndraising),
      mortgages_payable: num(f.secrdmrtgsend),
      pdf_url: f.pdf_url ?? null,
      object_id: objectIds.get(num(f.tax_prd_yr) as number) ?? null,
      source: "propublica",
    }));
    const withYear = rows.filter((r: any) => r.tax_year != null);
    // Years with a /full render but no extracted API data yet (usually the newest
    // filing) still get a row so the queue can link its render. Same shape as the
    // API rows — PostgREST bulk upserts need uniform keys.
    const apiYears = new Set(withYear.map((r: any) => r.tax_year));
    for (const [year, oid] of objectIds) {
      if (apiYears.has(year)) continue;
      withYear.push({
        org_id: data.orgId,
        tax_year: year,
        revenue: null,
        expenses: null,
        assets_eoy: null,
        liabilities_eoy: null,
        contributions: null,
        salaries: null,
        fundraiser_fee: null,
        mortgages_payable: null,
        pdf_url: null,
        object_id: oid,
        source: "propublica",
      });
    }
    if (withYear.length) {
      const { error } = await filings().upsert(withYear, { onConflict: "org_id,tax_year" });
      if (error) return { ok: false, error: error.message };
    }

    return {
      ok: true,
      ein,
      org_name: org.name ?? "",
      years: withYear.map((r: any) => r.tax_year).sort((a: number, b: number) => b - a),
      filings: withYear.length,
    };
  });
