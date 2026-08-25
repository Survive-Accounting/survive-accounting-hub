// One-time import: COMPETITIVE_CAMPUS_AGGREGATES.json -> campus_competitive_intel.
// The dataset is frozen for V1; re-running is a full idempotent upsert by campus_id.
// Usage: node scripts/competitive-intel/import-aggregates.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_0-9]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");

const agg = JSON.parse(
  readFileSync(join(root, "competitive-intel-output", "COMPETITIVE_CAMPUS_AGGREGATES.json"), "utf8"),
);
const rows = agg.campuses.map((c) => ({
  campus_id: c.campus_id,
  paid_market_status: c.paid_market_status ?? null,
  intro_accounting_paid_market_status: c.intro_accounting_paid_market_status ?? null,
  competition_intensity: c.competition_intensity ?? null,
  market_status: c.market_status ?? null,
  validated_paid_market: c.validated_paid_market ?? null,
  white_space: c.white_space ?? null,
  study_edge_present: c.study_edge_present ?? null,
  ads_observed: c.ads_observed ?? null,
  brand_conquest_candidate: c.brand_conquest_candidate ?? null,
  nonbrand_search_candidate: c.nonbrand_search_candidate == null ? null : String(c.nonbrand_search_candidate),
  course_code_network_present: c.course_code_network_present ?? null,
  university_free_support: c.university_free_support ?? null,
  evidence_confidence: c.evidence_confidence ?? null,
  paid_competitors: c.paid_competitors ?? null,
  intro_accounting_competitors: c.intro_accounting_competitors ?? null,
  course_specific_competitors: c.course_specific_competitors ?? null,
  strongest_competitor_name: c.strongest_competitor?.name ?? null,
  strongest_competitor_domain: c.strongest_competitor?.domain ?? null,
  strongest_competitor_type: c.strongest_competitor?.type ?? null,
  strongest_competitor_course_specific: c.strongest_competitor?.course_specific ?? null,
  competitor_price_context: c.competitor_price_context ?? null,
  top_competitor_domains: c.top_competitor_domains ?? null,
}));

console.log(`Importing ${rows.length} campus competitive rows…`);
let ok = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const res = await fetch(`${URL_}/rest/v1/campus_competitive_intel?on_conflict=campus_id`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) throw new Error(`batch ${i}: HTTP ${res.status} ${await res.text()}`);
  ok += batch.length;
}
console.log(`Done. Upserted ${ok} rows.`);
