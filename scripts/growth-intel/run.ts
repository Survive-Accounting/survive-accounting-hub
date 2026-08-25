// Growth Contact Intelligence — bounded batch runner for the §18 test (and later
// staged rollout). DRY-RUN by default; --apply is the only thing that spends.
//
//   bun run scripts/growth-intel/run.ts                 # dry run: plan only, no network
//   bun run scripts/growth-intel/run.ts --apply         # live: real SerpAPI/Firecrawl/AI
//   flags: --budget=6  --chapters=5  --campuses=10  --only=both|clubs|chapters
//          --concurrency=1  --file=scripts/growth-intel/campuses.json  --resume
//
// SAFETY: hard USD budget (stops before exceeding), sequential/low concurrency to
// avoid contending with the running Campus Backfill on the shared provider keys,
// resumable via a checkpoint file, graceful SIGINT. NEVER sends outreach.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { runBusinessClubDiscovery, runChapterDiscovery, newCounters, estCost } from "../../src/lib/growth-intel-core";

const flag = (name: string, def?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : process.argv.includes(`--${name}`) ? "true" : def;
};
const APPLY = process.argv.includes("--apply");
const RESUME = process.argv.includes("--resume");
const BUDGET = parseFloat(flag("budget", "6")!);
const CHAPTERS_RAW = flag("chapters", "5")!;
const CHAPTERS = CHAPTERS_RAW === "all" ? undefined : parseInt(CHAPTERS_RAW, 10); // undefined = no cap
// --councils=ifc,panhel  restricts chapter discovery to those councils (default: all)
const COUNCILS = (flag("councils", "")!)
  .split(",")
  .map((s) => (s.trim() === "panhel" ? "panhellenic" : s.trim()))
  .filter(Boolean);
const MAX_CAMPUSES = parseInt(flag("campuses", "10")!, 10);
const ONLY = (flag("only", "both") as "both" | "clubs" | "chapters")!;
// --categories=wib,invfin  (default both). wib = women_in_business, invfin = investment_finance.
const CATS = (flag("categories", "wib,invfin")!)
  .split(",")
  .map((s) => (s.trim() === "wib" ? "women_in_business" : s.trim() === "invfin" ? "investment_finance" : s.trim()))
  .filter((s) => s === "women_in_business" || s === "investment_finance") as ("women_in_business" | "investment_finance")[];
const FILE = flag("file", "scripts/growth-intel/campuses.json")!;
const CKPT = "scripts/growth-intel/.checkpoint.json";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const keys = { serp: process.env.SERPAPI_API_KEY!, firecrawl: process.env.FIRECRAWL_API_KEY!, ai: process.env.AI_GATEWAY_API_KEY! };

function loadCampuses(): Array<{ id: string; name: string; domain: string | null; kind?: string }> {
  const j = JSON.parse(readFileSync(FILE, "utf8"));
  return (j.campuses ?? j).slice(0, MAX_CAMPUSES);
}
type Ckpt = { runId: string | null; done: string[]; counters: ReturnType<typeof newCounters>; results: any[] };
const loadCkpt = (): Ckpt => (RESUME && existsSync(CKPT) ? JSON.parse(readFileSync(CKPT, "utf8")) : { runId: null, done: [], counters: newCounters(), results: [] });
const saveCkpt = (c: Ckpt) => writeFileSync(CKPT, JSON.stringify(c, null, 2));

async function main() {
  const campuses = loadCampuses();
  console.log(`Growth Contact Intelligence runner`);
  console.log(`  mode:        ${APPLY ? "APPLY (live)" : "DRY RUN (no network)"}`);
  console.log(`  campuses:    ${campuses.length}   only: ${ONLY}   categories: ${CATS.join(",")}   chapters/campus: ${CHAPTERS ?? "all"}${COUNCILS.length ? " (" + COUNCILS.join("+") + ")" : ""}`);
  console.log(`  budget:      $${BUDGET.toFixed(2)}  (unit est: serp $0.008 / firecrawl $0.005 / ai $0.002)`);
  console.log(`  keys:        serp=${keys.serp ? "ok" : "MISSING"} firecrawl=${keys.firecrawl ? "ok" : "MISSING"} ai=${keys.ai ? "ok" : "MISSING"}\n`);

  if (!APPLY) {
    console.log("Would process (dry run — nothing executed):");
    for (const c of campuses) console.log(`  - ${c.name.padEnd(34)} ${c.kind ?? ""}`);
    const perCampusUnits = (ONLY === "chapters" ? 0 : CATS.length) + (ONLY === "clubs" ? 0 : (CHAPTERS ?? 30));
    console.log(`\n  ~${perCampusUnits} discovery units/campus. Rough est (clubs $0.055/cat, chapters $0.022 each): see GROWTH_CONTACT_INTEL_AUDIT.md §6.`);
    console.log("\nRe-run with --apply to execute.");
    return;
  }
  if (!SUPABASE_URL || !SERVICE || !keys.serp || !keys.firecrawl || !keys.ai) {
    console.error("Missing env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SERPAPI / FIRECRAWL / AI_GATEWAY). Aborting.");
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const ck = loadCkpt();

  // One run row for the whole batch.
  if (!ck.runId) {
    const { data: run } = await db
      .from("growth_discovery_runs")
      .insert({ run_kind: ONLY === "both" ? "mixed" : ONLY === "clubs" ? "women_in_business" : "chapter", status: "running", dry_run: false, campus_ids: campuses.map((c) => c.id), campuses_total: campuses.length, created_by: "runner", notes: `§18 test only=${ONLY} chapters=${CHAPTERS}` })
      .select("id")
      .single();
    ck.runId = run?.id ?? null;
    saveCkpt(ck);
  }

  let stopped = false;
  process.on("SIGINT", () => {
    console.log("\nSIGINT — finishing current campus then stopping.");
    stopped = true;
  });

  const counters = ck.counters;
  for (const c of campuses) {
    if (stopped) break;
    if (ck.done.includes(c.id)) {
      console.log(`= skip ${c.name} (checkpointed)`);
      continue;
    }
    if (estCost(counters) >= BUDGET) {
      console.log(`\n! budget $${BUDGET} reached ($${estCost(counters)}). Stopping before ${c.name}.`);
      break;
    }
    const t0 = Date.now();
    const rec: any = { campus: c.name, id: c.id };
    try {
      if (ONLY !== "chapters") {
        const clubs = await runBusinessClubDiscovery(db, { id: c.id, name: c.name, domains: c.domain ? [c.domain] : null, email_domain: c.domain }, keys, { runId: ck.runId, counters, categories: CATS });
        rec.clubs = clubs;
      }
      if (ONLY !== "clubs") {
        const ch = await runChapterDiscovery(db, { id: c.id, name: c.name, domains: c.domain ? [c.domain] : null, email_domain: c.domain }, keys, { runId: ck.runId, limit: CHAPTERS, counters, councils: COUNCILS });
        rec.chapters = ch;
      }
      rec.ms = Date.now() - t0;
      rec.costSoFar = estCost(counters);
      ck.results.push(rec);
      ck.done.push(c.id);
      saveCkpt(ck);
      await db.from("growth_discovery_runs").update({ campuses_done: ck.done.length, serp_calls: counters.serp, firecrawl_calls: counters.firecrawl, ai_calls: counters.ai, est_cost_usd: estCost(counters) }).eq("id", ck.runId);
      console.log(`✓ ${c.name.padEnd(32)} clubs=${JSON.stringify(rec.clubs ?? {})} chapters=${JSON.stringify(rec.chapters ?? {})}  cost=$${rec.costSoFar}  ${rec.ms}ms`);
    } catch (e: any) {
      console.error(`✗ ${c.name}: ${e?.message || e}`);
      rec.error = String(e?.message || e);
      ck.results.push(rec);
      saveCkpt(ck);
    }
  }

  await db.from("growth_discovery_runs").update({ status: stopped ? "aborted" : "complete", finished_at: new Date().toISOString(), campuses_done: ck.done.length, serp_calls: counters.serp, firecrawl_calls: counters.firecrawl, ai_calls: counters.ai, est_cost_usd: estCost(counters) }).eq("id", ck.runId);
  console.log(`\nDone. campuses=${ck.done.length}/${campuses.length}  serp=${counters.serp} firecrawl=${counters.firecrawl} ai=${counters.ai}  est_cost=$${estCost(counters)}`);
  console.log(`Run id: ${ck.runId}. Checkpoint: ${CKPT} (delete to start fresh).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
