// QA smoke test: run every .from("table").select("cols") pair used by the Growth V1
// server functions against live PostgREST (service role) to catch table/column typos
// that TypeScript cannot see (the DB handle is typed loosely on purpose).
// Usage: node scripts/growth-priority/qa-smoke.mjs
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_0-9]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const files = [
  "src/lib/growth-dashboard.functions.ts",
  "src/lib/growth-queue.functions.ts",
  "src/lib/growth-topicmap.functions.ts",
  "src/lib/growth-enrichment.functions.ts",
  "src/lib/growth-priority-data.server.ts",
];

const pairs = new Set();
for (const f of files) {
  const src = readFileSync(join(root, f), "utf8");
  // match .from("t") ... .select("cols") within a chain (whitespace/newlines between)
  const re = /\.from\("([a-z_0-9]+)"\)\s*(?:as any\))?\s*[\s\S]{0,200}?\.select\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) pairs.add(JSON.stringify([m[1], m[2]]));
  // selectAll(db, "table", "cols") helper calls
  const re2 = /selectAll(?:<[^>]*>)?\(\s*db,\s*\n?\s*"([a-z_0-9]+)",\s*\n?\s*"([^"]+)"/g;
  while ((m = re2.exec(src))) pairs.add(JSON.stringify([m[1], m[2]]));
}

let fail = 0, ok = 0;
for (const p of [...pairs].sort()) {
  const [table, cols] = JSON.parse(p);
  if (cols.includes("(")) { continue; } // embedded joins — skip (none expected)
  const url = `${URL_}/rest/v1/${table}?select=${encodeURIComponent(cols.replace(/\s/g, ""))}&limit=1`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (res.ok) { ok++; }
  else { fail++; console.log(`FAIL ${table} [${cols}] -> ${res.status} ${(await res.text()).slice(0, 160)}`); }
}
console.log(`\n${ok} query shapes OK, ${fail} failed`);
process.exit(fail ? 1 : 0);
