// Refresh the growth_campus_priority ranking from the live DB.
// Usage: bun scripts/growth-priority/refresh.ts   (reads .env for service key)
import { readFileSync } from "fs";
import { join } from "path";

for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_0-9]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { supabaseAdmin } = await import("../../src/integrations/supabase/client.server");
const { refreshGrowthPriority } = await import("../../src/lib/growth-priority-data.server");

const res = await refreshGrowthPriority(supabaseAdmin as any);
console.log(`Ranked ${res.ranked} campuses (growth_priority_v1).`);
console.log("Top 25:");
for (const r of res.top) {
  console.log(
    `${String(r.rank).padStart(3)} ${r.score.toFixed(1).padStart(6)}  ${r.campusId}  [${r.why.join(" · ")}]  ` +
    `m=${r.components.market} g=${r.components.growth} r=${r.components.reach} p=${r.components.paid} rd=${r.components.readiness} d=${r.components.demandBoost}`,
  );
}
