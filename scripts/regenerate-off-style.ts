// REGENERATE THE OFF-STYLE PICTURES — Lee, 2026-09-06, the night riso became the house style:
// "Regenerate all the off-style illustrations in riso."
//
// The same code the bank page (/admin/illustrations) runs — listIllustrationBankCore to find
// them, regenerateIllustrationCore to redraw each one from its saved subject with its own seed
// (same composition, new medium) and write it back onto its frame — run from the build PC, one
// picture at a time, because Recraft rate-limits and every call costs money.
//
//   bun --env-file=.env --env-file=<file with RECRAFT_API_KEY> scripts/regenerate-off-style.ts            # dry run: the list + estimate
//   bun --env-file=.env --env-file=<…> scripts/regenerate-off-style.ts --write [--limit N] [--set <id>]   # do it
//
// Only exam-content sets (target = riso). Strategy shorts keep watercolor and are never touched
// here — their off-style pictures, if any, are a separate decision.
import { listIllustrationBankCore, regenerateIllustrationCore } from "../src/lib/illustrate.functions";
import { estimateCost, usd } from "../src/lib/illustration-bank";

const WRITE = process.argv.includes("--write");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const setArg = process.argv.indexOf("--set");
const ONLY_SET = setArg >= 0 ? process.argv[setArg + 1] : null;

if (!process.env.RECRAFT_API_KEY && WRITE) { console.error("RECRAFT_API_KEY is not set — pass the production env file."); process.exit(1); }

const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const db = supabaseAdmin as unknown as { from: (t: string) => any };

const bank = await listIllustrationBankCore(db);
const todo = bank.rows.filter((r) => r.status === "off-style" && r.topicKind !== "strategy" && (!ONLY_SET || r.setId === ONLY_SET)).slice(0, LIMIT);
console.log(`bank: ${bank.totals.all} pictures · off-style ${bank.totals["off-style"]} · stale ${bank.totals.stale} · current ${bank.totals.current}`);
console.log(`to regenerate in ${bank.defaults.exam.label} v${bank.defaults.exam.version}: ${todo.length}`);
for (const r of todo) console.log(`  ${r.topicName} / ${r.setName} · ${r.frameKind} · ${r.title}  [${r.stylePreset} v${r.styleVersion}${r.seed !== null ? ` · seed ${r.seed}` : ""}]`);
const est = estimateCost(bank.medianCostUsd, todo.length);
console.log(`estimate: ${usd(est.total)} (${usd(est.perPicture)} each — ${est.basis})`);

if (!WRITE) { console.log("\nDRY RUN — nothing generated. Re-run with --write."); process.exit(0); }

let spent = 0, ok = 0, failed = 0;
const t0 = Date.now();
for (let i = 0; i < todo.length; i++) {
  const r = todo[i];
  const started = Date.now();
  process.stdout.write(`${i + 1}/${todo.length} ${r.setName} · ${r.title} … `);
  try {
    const res = await regenerateIllustrationCore(db, { setId: r.setId, frameId: r.frameId, keepSeed: true, who: "lee (script)" });
    ok++;
    if (res.costUsd !== null) spent += res.costUsd;
    console.log(`✓ ${res.costUsd === null ? "cost n/a" : usd(res.costUsd)} · ${Math.round((Date.now() - started) / 1000)}s · ${res.row.assetUrl}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`\ndone — ${ok} regenerated, ${failed} failed, ${usd(spent)} spent, ${Math.round((Date.now() - t0) / 1000)}s`);
