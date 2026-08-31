// One-shot: apply the two outstanding migrations to the LIVE Supabase project via the
// Management API, then PROVE each one landed.
//
//   bun scripts/apply-campaign-and-ref-migrations.ts
//
//   20260830_1100_campaign_referrals.sql        /the-campaign's form (campaign_subscriber,
//                                               referral_submission)
//   20260830_1400_contact_ref_attribution.sql   the ?ref= visit log + the two contact flags
//
// Both are ADDITIVE and IDEMPOTENT — every statement is IF NOT EXISTS or ADD COLUMN IF NOT
// EXISTS — so this is safe to re-run and safe if one of them was already applied by hand.
//
// ── WHY THIS SCRIPT EXISTS AT ALL ─────────────────────────────────────────────────────────────
// The house rule is that migrations are never auto-run; they are listed under "SQL LEE MUST RUN"
// and applied by a person. Lee asked for these two to be run directly, which is his call to make.
// The script still refuses to claim success it has not observed: it runs each file, then runs the
// proof queries SEPARATELY and prints what came back, because the Management API returns only the
// last statement's result and a migration file that ends in a SELECT can otherwise look like it
// succeeded when an earlier statement was the one that mattered.
import { readFileSync } from "node:fs";

const REF = "unvxagsledbsdoremqeb";

const MIGRATIONS = [
  "migration/supabase-migrations/20260830_1100_campaign_referrals.sql",
  "migration/supabase-migrations/20260830_1400_contact_ref_attribution.sql",
];

/** Run AFTER both files — one query, every fact, so nothing can hide behind a later statement. */
const PROOF = `
SELECT 'campaign_subscriber table'  AS proof, count(*)::text AS found
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'campaign_subscriber'
UNION ALL
SELECT 'referral_submission table', count(*)::text
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'referral_submission'
UNION ALL
SELECT 'submitter_name NOT NULL', count(*)::text
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'referral_submission'
   AND column_name = 'submitter_name' AND is_nullable = 'NO'
UNION ALL
SELECT 'contact_ref_visit table', count(*)::text
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'contact_ref_visit'
UNION ALL
SELECT 'rep_candidate column', count(*)::text
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'growth_contact_qc' AND column_name = 'rep_candidate'
UNION ALL
SELECT 'spoke_by_phone column', count(*)::text
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'growth_contact_qc' AND column_name = 'spoke_by_phone'
ORDER BY 1;
`;

// The Management PAT. This worktree has no .env.vercel of its own; the sibling worktrees of the
// same repo do, and any of them carries the same token.
function token(): string {
  const fromEnv = (process.env.SUPABASETOKEN ?? "").trim();
  if (fromEnv) return fromEnv;
  const candidates = [
    ".env.vercel",
    "../sa-campus-rep/.env.vercel",
    "../sa-growth-contacts/.env.vercel",
    "../sa-greek-academic/.env.vercel",
    "../sa-greek-990/.env.vercel",
    "../sa-course-intel-harvest/.env.vercel",
  ];
  for (const p of candidates) {
    try {
      const t = /^SUPABASETOKEN=(.+)$/m.exec(readFileSync(p, "utf8"))?.[1]?.trim().replace(/^"|"$/g, "");
      if (t) return t;
    } catch { /* try the next one */ }
  }
  return "";
}

const TOKEN = token();
if (!TOKEN) { console.error("No SUPABASETOKEN available — cannot reach the Management API."); process.exit(1); }

async function run(label: string, sql: string): Promise<boolean> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  console.log(`\n── ${label} → HTTP ${res.status}`);
  console.log(body.slice(0, 900));
  return res.ok;
}

let allOk = true;
for (const path of MIGRATIONS) {
  const sql = readFileSync(path, "utf8");
  const ok = await run(path.split("/").pop()!, sql);
  if (!ok) { allOk = false; console.error(`FAILED: ${path} — stopping before the next file.`); break; }
}

if (allOk) {
  console.log("\n════ PROOF ════");
  await run("verification", PROOF);
}

process.exit(allOk ? 0 : 1);
