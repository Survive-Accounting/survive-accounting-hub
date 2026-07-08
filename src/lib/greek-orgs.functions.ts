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

    const rows = (payload?.filings_with_data ?? []).map((f: any) => ({
      org_id: data.orgId,
      tax_year: num(f.tax_prd_yr),
      revenue: num(f.totrevenue),
      expenses: num(f.totfunctexpns),
      assets_eoy: num(f.totassetsend),
      liabilities_eoy: num(f.totliabend),
      pdf_url: f.pdf_url ?? null,
      object_id: f.object_id != null ? String(f.object_id) : null,
      source: "propublica",
    }));
    const withYear = rows.filter((r: any) => r.tax_year != null);
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
