// Orchestrator: recompute scores from live data + IPEDS cache, then emit CSVs + reports.
// This IS the cheap REFRESH path — re-reads current Greek/council/club/demand data and
// recalculates Distribution Strength, Outreach Priority, and Enrichment Priority (plus the
// full market/growth layer) without re-downloading IPEDS. Run after the structural backfill.
//   node scripts/market-intel/run-all.mjs
// Prereqs (one-time): parse-ipeds.mjs (needs the IPEDS zips) + match.mjs must have produced
// data/ipeds.json and data/matches.json. Optionally: node scripts/market-intel/import.mjs
// afterwards to load the DB tables (once the migration is applied).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('scripts/market-intel/data');
for (const f of ['ipeds.json', 'matches.json']) {
  if (!fs.existsSync(path.join(DATA, f))) {
    console.error(`Missing data/${f}. Run parse-ipeds.mjs then match.mjs first (see README).`);
    process.exit(1);
  }
}
const steps = ['compute.mjs', 'emit-csv.mjs', 'emit-reports.mjs'];
for (const s of steps) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [path.resolve('scripts/market-intel', s)], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`${s} failed`); process.exit(1); }
}
console.log('\nAll outputs refreshed in market-intel-output/.');
