// Shared DB helpers for Campus Market Intelligence (read/write via PostgREST).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function loadEnv() {
  const env = {};
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}

export const ENV = loadEnv();
export const SUPABASE_URL = ENV.SUPABASE_URL;
export const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
export const REST = `${SUPABASE_URL}/rest/v1`;

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// fetch with retry/backoff for transient network hiccups
export async function rfetch(url, opts = {}, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status >= 500 && i < tries - 1) { await sleep(500 * (i + 1)); continue; }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

// Paged select — PostgREST caps at 1000 rows per request.
export async function selectAll(table, { select = '*', filter = '', order = '', pageSize = 1000 } = {}) {
  const out = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    let url = `${REST}/${table}?select=${encodeURIComponent(select)}`;
    if (filter) url += `&${filter}`;
    if (order) url += `&order=${encodeURIComponent(order)}`;
    const res = await rfetch(url, { headers: { ...H, Range: `${from}-${to}`, Prefer: 'count=exact' } });
    if (!res.ok) throw new Error(`selectAll ${table} ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export async function count(table, filter = '') {
  let url = `${REST}/${table}?select=id`;
  if (filter) url += `&${filter}`;
  const res = await rfetch(url, { headers: { ...H, Range: '0-0', Prefer: 'count=exact' } });
  const cr = res.headers.get('content-range') || '';
  return cr.split('/')[1];
}

// List all tables/views exposed by PostgREST via the OpenAPI root.
export async function listTables() {
  const res = await rfetch(`${REST}/`, { headers: H });
  const spec = await res.json();
  return Object.keys(spec.definitions || spec.paths || {}).filter((k) => !k.startsWith('/'));
}

export async function columns(table) {
  const res = await rfetch(`${REST}/`, { headers: H });
  const spec = await res.json();
  const def = (spec.definitions || {})[table];
  return def ? Object.keys(def.properties || {}) : null;
}

// Upsert rows (merge on PK). Returns {ok, status, error}. Batches of 500.
export async function upsert(table, rows, { onConflict } = {}) {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    let url = `${REST}/${table}`;
    if (onConflict) url += `?on_conflict=${onConflict}`;
    const res = await rfetch(url, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  }
  return { ok: true };
}

export async function insertOne(table, row) {
  const res = await rfetch(`${REST}/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row),
  });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  const j = await res.json();
  return { ok: true, row: j[0] };
}

export { H as HEADERS };
