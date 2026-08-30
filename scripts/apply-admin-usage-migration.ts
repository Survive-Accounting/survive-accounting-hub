// One-shot: apply the admin usage-telemetry tables to the LIVE Supabase project via the
// Management API. Idempotent SQL — safe to re-run.  bun scripts/apply-admin-usage-migration.ts
// Requires SUPABASETOKEN (a Management PAT) in .env.vercel or the environment
// (run `vercel env pull .env.vercel` first if you don't have it).
import { readFileSync } from "node:fs";

const REF = "unvxagsledbsdoremqeb";
const sql = readFileSync("migration/supabase-migrations/20260829_1200_admin_usage_telemetry.sql", "utf8");

let token = process.env.SUPABASETOKEN ?? "";
if (!token) { try { token = /^SUPABASETOKEN=(.+)$/m.exec(readFileSync(".env.vercel", "utf8"))?.[1]?.trim().replace(/^"|"$/g, "") ?? ""; } catch { /* */ } }
if (!token) { console.error("No SUPABASETOKEN — run `vercel env pull .env.vercel`, or paste the SQL into the Supabase SQL editor."); process.exit(1); }

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
console.log(res.status, (await res.text()).slice(0, 500));
process.exit(res.ok ? 0 : 1);
