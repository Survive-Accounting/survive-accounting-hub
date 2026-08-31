// One-shot: apply migration/supabase-migrations/20260831_1200_find_contacts.sql to the LIVE
// Supabase project via the Management API. Idempotent SQL — safe to re-run.
//   bun scripts/apply-rep-v1-migration.ts
// Requires SUPABASETOKEN (a Management PAT) in .env.vercel or the environment.
import { readFileSync } from "node:fs";

const REF = "unvxagsledbsdoremqeb";
const sql = readFileSync("migration/supabase-migrations/20260831_1200_find_contacts.sql", "utf8");

let token = process.env.SUPABASETOKEN ?? "";
if (!token) {
  try {
    const env = readFileSync(".env.vercel", "utf8");
    token = /^SUPABASETOKEN=(.+)$/m.exec(env)?.[1]?.trim().replace(/^"|"$/g, "") ?? "";
  } catch { /* fall through */ }
}
if (!token) { console.error("No SUPABASETOKEN available"); process.exit(1); }

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
console.log(res.status, body.slice(0, 500));
process.exit(res.ok ? 0 : 1);
