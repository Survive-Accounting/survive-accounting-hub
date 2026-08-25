// IRS EO Business Master File (EO BMF) — download + parse + in-memory index.
//
// Source: https://www.irs.gov/pub/irs-soi/eo_<st>.csv  (state-level extracts).
// These are the authoritative list of tax-exempt orgs (EIN, name, city, state,
// group-exemption number, subsection, affiliation, NTEE, amounts). We cache the
// raw CSVs on disk (brief §2) so reruns never re-download.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const BMF_DIR = join(import.meta.dir, "..", "..", "..", "data", "greek-990", "cache", "bmf");

// SEC campus states + common national Greek-HQ states (Indianapolis/Ohio/etc.)
export const SEC_STATES = ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "MO", "OK", "SC", "TN", "TX"];
export const NATIONAL_HQ_STATES = ["IN", "OH", "IL", "VA", "CO", "MI", "WI", "PA", "NY", "MD", "DC", "KS", "NC", "CT", "NJ"];
export const ALL_STATES = [...new Set([...SEC_STATES, ...NATIONAL_HQ_STATES])];
// Every US state + DC — used by the nationwide parent/GEN pass so a national HQ in any state resolves.
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
];

export interface BmfRow {
  ein: string;
  name: string;
  ico: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  group: string; // GEN (group exemption number); "0000" = none
  subsection: string;
  affiliation: string; // 3=independent, 6=central, 9=subordinate-in-group
  classification: string;
  ruling: string;
  deductibility: string;
  foundation: string;
  status: string;
  tax_period: string;
  asset_amt: number;
  income_amt: number;
  revenue_amt: number;
  ntee: string;
  sort_name: string;
}

export function bmfUrl(state: string) {
  return `https://www.irs.gov/pub/irs-soi/eo_${state.toLowerCase()}.csv`;
}
export function bmfPath(state: string) {
  return join(BMF_DIR, `eo_${state.toLowerCase()}.csv`);
}

/** Download one state's EO BMF CSV to cache, unless already present & non-trivial. */
export async function downloadState(state: string, force = false): Promise<{ state: string; bytes: number; cached: boolean }> {
  mkdirSync(BMF_DIR, { recursive: true });
  const path = bmfPath(state);
  if (!force && existsSync(path) && statSync(path).size > 1000) {
    return { state, bytes: statSync(path).size, cached: true };
  }
  const res = await fetch(bmfUrl(state), { headers: { "User-Agent": "surviveaccounting-research/1.0" } });
  if (!res.ok) throw new Error(`BMF download failed for ${state}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  await Bun.write(path, buf);
  return { state, bytes: buf.byteLength, cached: false };
}

// Greek-letter words (uppercase) for pre-filtering BMF rows to Greek-relevant orgs.
const GREEK = new Set([
  "ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "ETA", "THETA", "IOTA",
  "KAPPA", "LAMBDA", "MU", "NU", "XI", "OMICRON", "PI", "RHO", "SIGMA", "TAU",
  "UPSILON", "PHI", "CHI", "PSI", "OMEGA",
]);
/** True if a BMF name plausibly belongs to a Greek-letter organization. */
export function isGreekRelevant(name: string): boolean {
  const up = name.toUpperCase();
  for (const w of up.split(/[^A-Z]+/)) if (GREEK.has(w)) return true;
  return false;
}

// Minimal CSV parser (BMF fields are simple; NAME can contain commas inside quotes — rare but handled).
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const numOr0 = (s: string) => { const n = Number((s || "").trim()); return Number.isFinite(n) ? n : 0; };

/** Load a cached state CSV into typed rows. Throws if not downloaded yet. */
export async function loadState(state: string): Promise<BmfRow[]> {
  const path = bmfPath(state);
  if (!existsSync(path)) throw new Error(`BMF for ${state} not cached — run download-bmf.ts first`);
  const text = await Bun.file(path).text();
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toUpperCase());
  const idx = (k: string) => header.indexOf(k);
  const iEIN = idx("EIN"), iNAME = idx("NAME"), iICO = idx("ICO"), iSTREET = idx("STREET"),
    iCITY = idx("CITY"), iSTATE = idx("STATE"), iZIP = idx("ZIP"), iGROUP = idx("GROUP"),
    iSUB = idx("SUBSECTION"), iAFF = idx("AFFILIATION"), iCLASS = idx("CLASSIFICATION"),
    iRUL = idx("RULING"), iDED = idx("DEDUCTIBILITY"), iFOUND = idx("FOUNDATION"),
    iSTATUS = idx("STATUS"), iTP = idx("TAX_PERIOD"), iASSET = idx("ASSET_AMT"),
    iINCOME = idx("INCOME_AMT"), iREV = idx("REVENUE_AMT"), iNTEE = idx("NTEE_CD"), iSORT = idx("SORT_NAME");
  const rows: BmfRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const f = parseCsvLine(l);
    if (!f[iEIN]) continue;
    rows.push({
      ein: (f[iEIN] || "").trim(),
      name: (f[iNAME] || "").trim(),
      ico: (f[iICO] || "").trim(),
      street: (f[iSTREET] || "").trim(),
      city: (f[iCITY] || "").trim(),
      state: (f[iSTATE] || "").trim(),
      zip: (f[iZIP] || "").trim(),
      group: (f[iGROUP] || "").trim(),
      subsection: (f[iSUB] || "").trim(),
      affiliation: (f[iAFF] || "").trim(),
      classification: (f[iCLASS] || "").trim(),
      ruling: (f[iRUL] || "").trim(),
      deductibility: (f[iDED] || "").trim(),
      foundation: (f[iFOUND] || "").trim(),
      status: (f[iSTATUS] || "").trim(),
      tax_period: (f[iTP] || "").trim(),
      asset_amt: numOr0(f[iASSET]),
      income_amt: numOr0(f[iINCOME]),
      revenue_amt: numOr0(f[iREV]),
      ntee: (f[iNTEE] || "").trim(),
      sort_name: (f[iSORT] || "").trim(),
    });
  }
  return rows;
}

/** Load only the Greek-letter-name rows for a state (much smaller in-memory pool). */
export async function loadStateGreek(state: string): Promise<BmfRow[]> {
  return (await loadState(state)).filter((r) => isGreekRelevant(r.name));
}
