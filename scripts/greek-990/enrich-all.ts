// Enrich every legal entity's filings/financials via ProPublica (cached). Resumable:
// skips EINs that already have a filing row. Officer harvesting is intentionally separate
// and NOT a blocker (brief). Run:  bun run scripts/greek-990/enrich-all.ts
import { dataQuery } from "./_db";
import { fetchOrg } from "./lib/propublica";
import { upsertFilings, upsert990N } from "./lib/persist";

const entities = await dataQuery<any>(`greek_legal_entity?select=id,ein`);
const haveFilings = new Set((await dataQuery<any>(`greek_990_filing?select=ein`)).map((r: any) => r.ein));
const todo = entities.filter((e: any) => !haveFilings.has(e.ein));
console.log(`Entities: ${entities.length}; already enriched: ${entities.length - todo.length}; to do: ${todo.length}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let done = 0, filings = 0, rich = 0, errs = 0;
for (const { id, ein } of todo) {
  try {
    const org = await fetchOrg(ein);
    if (org) {
      const n = await upsertFilings(id, ein, org.filings);
      filings += n;
      if (org.filings.length) rich++;
      const nYears = org.filingsWithoutData.filter((f) => f.form_type === "990N").map((f) => f.tax_year);
      if (nYears.length) await upsert990N(id, ein, nYears);
    }
  } catch { errs++; }
  if (++done % 100 === 0) console.log(`  …${done}/${todo.length} (${filings} filings, ${rich} rich, ${errs} err)`);
  await sleep(120);
}
console.log(`Done: ${done} entities → ${filings} filings; ${rich} had rich data; ${errs} errors.`);
