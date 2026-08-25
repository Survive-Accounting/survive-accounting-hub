// Download & cache IRS EO BMF state extracts for the SEC pilot + national HQ states.
//   bun run scripts/greek-990/download-bmf.ts            # SEC + national HQ states
//   bun run scripts/greek-990/download-bmf.ts AL FL      # specific states
//   bun run scripts/greek-990/download-bmf.ts --force    # re-download all
import { ALL_STATES, downloadState, loadState } from "./lib/bmf";

const args = process.argv.slice(2);
const force = args.includes("--force");
const wanted = args.filter((a) => !a.startsWith("--"));
const states = wanted.length ? wanted.map((s) => s.toUpperCase()) : ALL_STATES;

console.log(`Downloading EO BMF for ${states.length} states: ${states.join(", ")}`);
let totalBytes = 0, totalRows = 0;
for (const st of states) {
  try {
    const r = await downloadState(st, force);
    const rows = await loadState(st);
    totalBytes += r.bytes;
    totalRows += rows.length;
    console.log(`  ${st}: ${(r.bytes / 1e6).toFixed(1)} MB, ${rows.length.toLocaleString()} rows ${r.cached ? "(cached)" : "(downloaded)"}`);
  } catch (e: any) {
    console.error(`  ${st}: FAILED — ${e.message}`);
  }
}
console.log(`\nTotal: ${(totalBytes / 1e6).toFixed(1)} MB across ${states.length} states, ${totalRows.toLocaleString()} org rows.`);
