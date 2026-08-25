// ProPublica Nonprofit Explorer API v2 client — validates EINs, and pulls org
// metadata + parsed filing financials + filing history. ONE call per EIN, cached
// in the SHARED greek_org_propublica_cache table (reused from the prior system).
import { dataQuery, dataWrite, nowIso } from "../_db";

const num = (v: unknown): number | null =>
  typeof v === "number" ? v : v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

// ProPublica formtype: 0 = 990, 1 = 990-EZ, 2 = 990-PF.
export function formTypeStr(ft: unknown): string {
  const n = num(ft);
  if (n === 0) return "990";
  if (n === 1) return "990EZ";
  if (n === 2) return "990PF";
  return "UNKNOWN";
}

export interface PpFiling {
  tax_year: number;
  form_type: string;
  rich_filing_available: boolean;
  total_revenue: number | null;
  total_expenses: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  net_assets: number | null;
  contributions: number | null;
  program_service_revenue: number | null;
  investment_income: number | null;
  gross_receipts: number | null;
  pdf_url: string | null;
}

export interface PpOrg {
  ein: string;
  name: string;
  subsection: string | null;
  ntee: string | null;
  city: string | null;
  state: string | null;
  filings: PpFiling[];
  // filings reported to exist but with no parsed data (usually 990-N e-postcards or newest returns)
  filingsWithoutData: { tax_year: number; form_type: string }[];
  raw: any;
}

async function readCache(ein: string): Promise<any | null> {
  const rows = await dataQuery<any>(`greek_org_propublica_cache?ein=eq.${ein}&select=response`);
  return rows[0]?.response ?? null;
}
async function writeCache(ein: string, response: any) {
  await dataWrite("greek_org_propublica_cache", [{ ein, response, fetched_at: nowIso() }], { onConflict: "ein" });
}

/** Fetch (cached) a ProPublica org record and normalize it. Returns null on 404 / not found. */
export async function fetchOrg(ein: string, opts: { useCache?: boolean } = {}): Promise<PpOrg | null> {
  const useCache = opts.useCache !== false;
  let payload: any = useCache ? await readCache(ein) : null;
  if (!payload) {
    let res: Response;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      res = await fetch(`https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`, {
        headers: { "User-Agent": "surviveaccounting-research/1.0" },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
    } catch {
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ProPublica ${res.status} for EIN ${ein}`);
    payload = await res.json();
    await writeCache(ein, payload);
  }

  const org = payload?.organization ?? {};
  const filings: PpFiling[] = (payload?.filings_with_data ?? [])
    .map((f: any) => ({
      tax_year: num(f.tax_prd_yr) as number,
      form_type: formTypeStr(f.formtype),
      rich_filing_available: true,
      total_revenue: num(f.totrevenue),
      total_expenses: num(f.totfuncexpns),
      total_assets: num(f.totassetsend),
      total_liabilities: num(f.totliabend),
      net_assets: num(f.totnetassetend) ?? (num(f.totassetsend) != null && num(f.totliabend) != null ? (num(f.totassetsend) as number) - (num(f.totliabend) as number) : null),
      contributions: num(f.totcntrbgfts),
      program_service_revenue: num(f.totprgmrevnue),
      investment_income: num(f.invstmntinc),
      gross_receipts: num(f.grsrcptspublicuse) ?? num(f.totrevenue),
      pdf_url: f.pdf_url ?? null,
    }))
    .filter((f: PpFiling) => f.tax_year != null);

  // Without-data filings: 990-N e-postcards or newest returns not yet parsed.
  const filingsWithoutData = (payload?.filings_without_data ?? [])
    .map((f: any) => ({ tax_year: num(f.tax_prd_yr) as number, form_type: (f.formtype_str || "").includes("EZ") ? "990EZ" : (f.formtype_str || "").includes("EO") || (f.formtype_str || "").includes("990N") ? "990N" : formTypeStr(f.formtype) }))
    .filter((f: any) => f.tax_year != null);

  return {
    ein,
    name: org.name ?? "",
    subsection: org.subseccd != null ? String(org.subseccd) : null,
    ntee: org.ntee_code ?? null,
    city: org.city ?? null,
    state: org.state ?? null,
    filings,
    filingsWithoutData,
    raw: payload,
  };
}
