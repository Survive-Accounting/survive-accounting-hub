// Continuous, DB-driven Growth Contact Intelligence runner.
//
// Targets EVERY non-archived campus that has an IFC and/or Panhellenic chapter —
// queried live each pass, so campuses/chapters added by ongoing enrichment are
// picked up automatically. Resumable with no checkpoint file: growth_discovery_status
// is the source of truth (a chapter that is complete/no_result is skipped; a campus
// with a women_in_business status row is skipped for WIB). Safe to kill and relaunch.
//
// Stops when: SerpAPI credits run out (401/403 or "out of searches"), the budget cap
// is hit, or --max-hours elapses. Between fully-drained passes it sleeps and re-scans
// for new work. DISCOVERY ONLY — never sends outreach. Low load (sequential) so it
// does not contend with Campus Backfill on the shared keys.
//
//   bun run scripts/growth-intel/run-continuous.ts --apply
//   flags: --budget=200 --queries-per-chapter=2 --scan-interval=900 --max-hours=24 --no-wib
import { createClient } from "@supabase/supabase-js";
import { runBusinessClubDiscovery, runChapterDiscovery, newCounters, estCost, SERP_STATE, councilKey } from "../../src/lib/growth-intel-core";

const flag = (n: string, d?: string) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split("=").slice(1).join("=") : process.argv.includes(`--${n}`) ? "true" : d;
};
const APPLY = process.argv.includes("--apply");
const BUDGET = parseFloat(flag("budget", "300")!);
const QPC = parseInt(flag("queries-per-chapter", "2")!, 10);
const SCAN = parseInt(flag("scan-interval", "900")!, 10) * 1000;
const MAX_MS = parseFloat(flag("max-hours", "96")!) * 3600_000;
// SerpAPI auto-renews (+buffer), so treat "out of searches" as a transient pause:
// back off and retry rather than hard-stop, up to a generous recovery budget.
const SERP_RETRY_MS = parseFloat(flag("serp-retry-min", "20")!) * 60_000;
const SERP_MAX_RECOVERIES = parseInt(flag("serp-max-recoveries", "40")!, 10);
const WIB = !process.argv.includes("--no-wib");
const COUNCILS = ["ifc", "panhellenic"];
const START = Date.now(); // note: script-level, before any awaited work

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const keys = { serp: process.env.SERPAPI_API_KEY!, firecrawl: process.env.FIRECRAWL_API_KEY!, ai: process.env.AI_GATEWAY_API_KEY! };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstDomain = (d: any, e: any) => {
  const a = Array.isArray(d) ? d[0] : typeof d === "string" ? d.replace(/[{}"]/g, "").split(",")[0] : "";
  return (a || e || "").toString().toLowerCase().replace(/^www\./, "") || null;
};

async function loadTargets(db: any) {
  // Distinct non-archived campuses that have >=1 IFC/Panhel chapter (live query).
  const wanted = new Set<string>();
  let from = 0;
  for (;;) {
    const { data } = await db.from("campus_greek_chapters").select("campus_id,council").is("archived_at", null).range(from, from + 999);
    const d = (data ?? []) as any[];
    for (const r of d) if (["ifc", "panhellenic"].includes(councilKey(r.council))) wanted.add(r.campus_id);
    if (d.length < 1000) break;
    from += 1000;
  }
  const ids = [...wanted];
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const { data } = await db.from("campuses").select("id,name,email_domain,domains,short_name,archived_at").in("id", ids.slice(i, i + 400));
    for (const c of (data ?? []) as any[]) if (!c.archived_at) out.push({ id: c.id, name: c.name, domain: firstDomain(c.domains, c.email_domain), short_name: c.short_name });
  }
  return out;
}

async function wibDone(db: any, campusId: string) {
  const { data } = await db.from("growth_discovery_status").select("id").eq("campus_id", campusId).eq("category", "women_in_business").limit(1).maybeSingle();
  return !!data;
}
async function pendingChapters(db: any, campusId: string) {
  const { data: chs } = await db.from("campus_greek_chapters").select("id,council").eq("campus_id", campusId).is("archived_at", null).limit(3000);
  const targetIds = ((chs ?? []) as any[]).filter((r) => COUNCILS.includes(councilKey(r.council))).map((r) => r.id);
  if (!targetIds.length) return 0;
  const { data: done } = await db.from("growth_discovery_status").select("entity_id,status").eq("campus_id", campusId).eq("category", "chapter").in("entity_id", targetIds);
  const doneSet = new Set(((done ?? []) as any[]).filter((s) => s.status === "complete" || s.status === "no_result").map((s) => s.entity_id));
  return targetIds.filter((id) => !doneSet.has(id)).length;
}

async function main() {
  console.log(`Continuous runner — mode: ${APPLY ? "APPLY (live)" : "DRY RUN"}  budget: $${BUDGET}  q/chapter: ${QPC}  wib: ${WIB}  scan: ${SCAN / 1000}s  max: ${MAX_MS / 3600000}h`);
  if (!APPLY) {
    const db0 = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const t = await loadTargets(db0);
    console.log(`targets right now: ${t.length} campuses with IFC/Panhel chapters. Re-run with --apply.`);
    return;
  }
  if (!SUPABASE_URL || !SERVICE || !keys.serp || !keys.firecrawl || !keys.ai) { console.error("Missing env."); process.exit(1); }
  const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const counters = newCounters();
  const { data: run } = await db.from("growth_discovery_runs").insert({ run_kind: "mixed", status: "running", dry_run: false, budget_usd: BUDGET, created_by: "continuous", notes: `WIB+IFC/Panhel q/ch=${QPC}` }).select("id").single();
  const runId = run?.id ?? null;

  let stopReason = "";
  let processedTotal = 0;
  let serpRecoveries = 0;
  const stopFlag = { v: false };
  process.on("SIGINT", () => { console.log("\nSIGINT — stopping after current campus."); stopFlag.v = true; });

  // Returns true only if SERP is unrecoverably dead. Otherwise backs off for the
  // auto-renew window, clears the flag, and returns false so the run continues.
  const serpStop = async (): Promise<boolean> => {
    if (!SERP_STATE.dead) return false;
    if (serpRecoveries >= SERP_MAX_RECOVERIES) { stopReason = `SERP exhausted after ${serpRecoveries} recoveries (${SERP_STATE.lastError})`; return true; }
    serpRecoveries++;
    console.log(`  SERP reported exhausted (${SERP_STATE.lastError}); auto-renew should refill — backing off ${SERP_RETRY_MS / 60000}m then retrying (recovery ${serpRecoveries}/${SERP_MAX_RECOVERIES}).`);
    await sleep(SERP_RETRY_MS);
    SERP_STATE.dead = false;
    SERP_STATE.lastError = "";
    return false;
  };

  outer: for (let pass = 1; ; pass++) {
    if (await serpStop()) break;
    if (estCost(counters) >= BUDGET) { stopReason = `budget $${BUDGET} reached`; break; }
    if (Date.now() - START >= MAX_MS) { stopReason = `max-hours reached`; break; }

    const targets = await loadTargets(db);
    console.log(`\n[pass ${pass}] ${targets.length} target campuses; spent $${estCost(counters)} (serp ${counters.serp}/fc ${counters.firecrawl}/ai ${counters.ai})`);
    let didWork = false;

    for (const campus of targets) {
      if (stopFlag.v) { stopReason = "SIGINT"; break outer; }
      if (await serpStop()) break outer;
      if (estCost(counters) >= BUDGET) { stopReason = `budget $${BUDGET} reached`; break outer; }
      if (Date.now() - START >= MAX_MS) { stopReason = "max-hours reached"; break outer; }

      try {
        let touched = false;
        if (WIB && !(await wibDone(db, campus.id))) {
          const r = await runBusinessClubDiscovery(db, campus, keys, { runId, counters, categories: ["women_in_business"] });
          touched = true;
          console.log(`  WIB   ${campus.name.slice(0, 30).padEnd(30)} +${r.women_in_business}  ($${estCost(counters)})`);
        }
        if (!SERP_STATE.dead && (await pendingChapters(db, campus.id)) > 0) {
          const r = await runChapterDiscovery(db, campus, keys, { runId, counters, councils: COUNCILS, skipCompleted: true, queriesPerChapter: QPC });
          touched = true;
          console.log(`  CHAP  ${campus.name.slice(0, 30).padEnd(30)} ${r.chaptersProcessed} ch / +${r.contactsSaved} contacts  ($${estCost(counters)})`);
        }
        if (touched) { didWork = true; processedTotal++; serpRecoveries = 0; } // progress resets the recovery budget
      } catch (e: any) {
        console.error(`  ! ${campus.name}: ${String(e?.message || e).slice(0, 160)}`);
      }
      await db.from("growth_discovery_runs").update({ campuses_done: processedTotal, serp_calls: counters.serp, firecrawl_calls: counters.firecrawl, ai_calls: counters.ai, est_cost_usd: estCost(counters) }).eq("id", runId);
    }

    if (await serpStop()) break;
    if (!didWork) {
      console.log(`[pass ${pass}] no pending work — all targets discovered. Watching for enrichment-added campuses; sleeping ${SCAN / 1000}s.`);
      await sleep(SCAN);
    }
  }

  await db.from("growth_discovery_runs").update({ status: stopReason.includes("SERP") || stopReason === "SIGINT" ? "aborted" : "complete", finished_at: new Date().toISOString(), serp_calls: counters.serp, firecrawl_calls: counters.firecrawl, ai_calls: counters.ai, est_cost_usd: estCost(counters), error: stopReason || null }).eq("id", runId);
  console.log(`\nSTOPPED: ${stopReason}. campuses touched=${processedTotal}  serp=${counters.serp} fc=${counters.firecrawl} ai=${counters.ai}  est_cost=$${estCost(counters)}  run=${runId}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
