// Shared DB helpers for the Greek 990 / Legal-Entity Intelligence pipeline.
//
// Two access paths, mirroring the rest of the repo:
//   * PostgREST + service-role key   → row reads/writes (dataQuery / dataWrite)
//   * Management API + PAT           → raw SQL (schema introspection, bulk ops) (sql)
//
// Env is loaded from .env and .env.vercel (both gitignored). Run scripts with:
//   bun run scripts/greek-990/<script>.ts
// Bun auto-loads .env; .env.vercel is loaded explicitly below.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── env bootstrap ────────────────────────────────────────────────────────────
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const txt = readFileSync(path, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let [, k, v] = m;
    v = v.replace(/^["']|["']$/g, "");
    if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
  }
}
const ROOT = join(import.meta.dir, "..", "..");
loadEnvFile(join(ROOT, ".env"));
loadEnvFile(join(ROOT, ".env.vercel"));

export const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID || "";
export const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || (PROJECT_ID ? `https://${PROJECT_ID}.supabase.co` : "");
export const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const MGMT_TOKEN =
  process.env.SUPABASETOKEN || process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN_1 || "";
export const AI_GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.warn("[_db] WARNING: SUPABASE_URL or SERVICE_ROLE missing — PostgREST calls will fail.");
}

// ── Management API: run raw SQL, returns rows as JSON ────────────────────────
export async function sql<T = any>(query: string): Promise<T[]> {
  if (!MGMT_TOKEN) throw new Error("MGMT_TOKEN (SUPABASETOKEN) missing — cannot run SQL via Management API.");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (HTTP ${res.status}): ${text.slice(0, 800)}`);
  const trimmed = text.trim();
  return trimmed && trimmed !== "" ? JSON.parse(trimmed) : [];
}

// ── PostgREST read (paged; PostgREST caps at 1000 rows/page) ─────────────────
export async function dataQuery<T = any>(path: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  const PAGE = 1000;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${SUPABASE_URL}/rest/v1/${path}${sep}limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    if (!res.ok) throw new Error(`dataQuery failed (HTTP ${res.status}) ${path}: ${(await res.text()).slice(0, 500)}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

// ── PostgREST write (upsert) ─────────────────────────────────────────────────
export async function dataWrite<T = any>(
  table: string,
  rows: any[],
  opts: { onConflict?: string; returning?: boolean } = {},
): Promise<T[]> {
  if (!rows.length) return [];
  const prefer = ["resolution=merge-duplicates", opts.returning ? "return=representation" : "return=minimal"].join(",");
  const sep = opts.onConflict ? `?on_conflict=${opts.onConflict}` : "";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${sep}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`dataWrite failed (HTTP ${res.status}) ${table}: ${(await res.text()).slice(0, 800)}`);
  return opts.returning ? await res.json() : [];
}

export function nowIso() {
  return new Date().toISOString();
}
