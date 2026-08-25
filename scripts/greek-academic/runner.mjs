#!/usr/bin/env node
/**
 * Greek Academic Intelligence — bounded, resumable, concurrent runner.
 * Reuses the ProfIntel/course-intel guard model: HARD ceilings (budget, SerpAPI
 * searches, runtime, campus count), reservation accounting, resumable checkpoint,
 * conservative concurrency, retry cap, SIGINT graceful stop, per-campus JSONL log.
 *
 * DRY-RUN by default. --execute makes real paid calls. Keys from process.env
 * (load .env.run first). Scarce resource is reliability/upstream load, NOT SERP
 * credits — keep concurrency conservative.
 *
 * Usage:
 *   node runner.mjs --preflight --execute
 *   node runner.mjs --execute --budget-usd 40 --max-serp 3000 --concurrency 3
 *   node runner.mjs --campus "alabama" --execute
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCampuses, loadChapterCampusCouncils, loadCampusChapters, loadFslSeedUrls, insertRun, updateRun } from "./db.mjs";
import { eligibleUniverse, pickPreflight, campusDomain, parentDomain } from "./universe.mjs";
import { harvestCampus } from "./harvest-greek.mjs";
import { serpBalance, firecrawlBalance } from "./providers.mjs";
import * as db from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = { budgetUsd: 60, maxSerp: 5000, maxRuntimeMin: 600, maxCampuses: Infinity, concurrency: 3, retryCap: 1, perCampusSerpCeil: 10, perCampusCostCeil: 0.25 };

function parseArgs(argv) {
  const a = { preflight: false, execute: false, dryRun: true, limit: Infinity, campus: null,
    budgetUsd: DEFAULTS.budgetUsd, maxSerp: DEFAULTS.maxSerp, maxRuntimeMin: DEFAULTS.maxRuntimeMin,
    maxCampuses: DEFAULTS.maxCampuses, concurrency: DEFAULTS.concurrency, retryCap: DEFAULTS.retryCap,
    checkpoint: path.join(HERE, ".greek-academic-checkpoint.json"), resume: true, runKind: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i], next = () => argv[++i];
    switch (t) {
      case "--preflight": a.preflight = true; break;
      case "--execute": a.execute = true; a.dryRun = false; break;
      case "--dry-run": a.dryRun = true; a.execute = false; break;
      case "--limit": a.limit = parseInt(next(), 10); break;
      case "--campus": a.campus = next(); break;
      case "--budget-usd": a.budgetUsd = parseFloat(next()); break;
      case "--max-serp": a.maxSerp = parseInt(next(), 10); break;
      case "--max-runtime-min": a.maxRuntimeMin = parseFloat(next()); break;
      case "--max-campuses": a.maxCampuses = parseInt(next(), 10); break;
      case "--concurrency": a.concurrency = Math.max(1, parseInt(next(), 10)); break;
      case "--retry-cap": a.retryCap = Math.max(0, parseInt(next(), 10)); break;
      case "--checkpoint": a.checkpoint = next(); break;
      case "--no-resume": a.resume = false; break;
      case "--run-kind": a.runKind = next(); break;
      case "--help": case "-h": a.help = true; break;
      default: if (t.startsWith("--")) throw new Error(`Unknown flag: ${t}`);
    }
  }
  a.costLog = a.checkpoint + ".costlog.jsonl";
  return a;
}
const loadCP = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return { done: {}, startedAt: null, totals: { spentUsd: 0, serp: 0, campuses: 0 } }; } };
const saveCP = (f, cp) => fs.writeFileSync(f, JSON.stringify(cp, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appendLog = (f, line) => { try { fs.appendFileSync(f, JSON.stringify(line) + "\n"); } catch {} };

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log("See header for usage."); return; }
  const keys = { serp: process.env.SERPAPI_API_KEY, firecrawl: process.env.FIRECRAWL_API_KEY, ai: process.env.AI_GATEWAY_API_KEY };

  console.log(`[load] fetching campuses + chapter councils…`);
  const [raw, councilMap, seedMap] = await Promise.all([loadCampuses(), loadChapterCampusCouncils(), loadFslSeedUrls().catch(() => new Map())]);
  const universe = eligibleUniverse(raw, councilMap);
  console.log(`[load] ${raw.length} campuses → ${universe.length} Greek-eligible (IFC/Panhel first)`);

  let targets;
  if (opts.preflight) { targets = pickPreflight(universe); console.log(`[preflight] ${targets.length}: ${targets.map((c) => c.name).join(", ")}`); }
  else if (opts.campus) { targets = universe.filter((c) => (c.name || "").toLowerCase().includes(opts.campus.toLowerCase())); }
  else targets = universe;
  targets = targets.slice(0, opts.limit);

  const runKind = opts.runKind || (opts.preflight ? "preflight" : opts.campus ? "single" : "nationwide");
  const items = targets.map((c) => ({ campus: c, key: c.id }));
  const cp = opts.resume ? loadCP(opts.checkpoint) : { done: {}, startedAt: null, totals: { spentUsd: 0, serp: 0, campuses: 0 } };
  if (!cp.startedAt) cp.startedAt = new Date().toISOString();
  const pending = items.filter((it) => !(opts.resume && cp.done[it.key]));
  console.log(`[plan] ${items.length} targets; ${items.length - pending.length} done; ${pending.length} pending; kind=${runKind}`);

  if (opts.dryRun) {
    console.log(`[DRY-RUN] would harvest ${pending.length} campuses. sample:`);
    pending.slice(0, 12).forEach((it) => {
      const cc = councilMap.get(it.campus.id) || {};
      console.log(`   - ${it.campus.name} [${it.campus.state}] dom=${parentDomain(campusDomain(it.campus)) || "-"} ifc=${cc.ifc || 0} panhel=${cc.panhel || 0}`);
    });
    return;
  }
  if (!keys.serp || !keys.firecrawl || !keys.ai) throw new Error("Provider keys not in env (SERPAPI_API_KEY/FIRECRAWL_API_KEY/AI_GATEWAY_API_KEY)");

  const [sb, fb] = await Promise.all([serpBalance(keys.serp), firecrawlBalance(keys.firecrawl)]);
  console.log(`[balance] SerpAPI: ${sb ? `${sb.left} left (${sb.plan})` : "unknown"} | Firecrawl: ${fb ? `${fb.remaining} credits` : "unknown"}`);
  if (sb && sb.left < 200) { console.error(`[ABORT] SerpAPI balance ${sb.left} < 200 — refusing (runaway guard).`); process.exit(3); }

  const run = await insertRun({ run_kind: runKind, status: "running", dry_run: false, campuses_total: pending.length, budget_usd: opts.budgetUsd }).catch(() => null);

  const startWall = Date.now();
  const deadline = startWall + opts.maxRuntimeMin * 60_000;
  const summary = { attempted: 0, completed: 0, failed: 0, noData: 0, needsReview: 0, spentUsd: cp.totals.spentUsd, serp: cp.totals.serp, firecrawl: 0, ai: 0, reports: 0, matched: 0, unmatched: 0, members: 0, stoppedReason: null };
  let reservedUsd = 0, reservedSerp = 0, stopping = false, rateCooldownUntil = 0;
  const stop = (r) => { if (!stopping) { stopping = true; summary.stoppedReason = r; console.log(`[STOP] ${r}`); } };
  const onSig = () => stop("SIGINT — graceful stop; finishing in-flight");
  process.on("SIGINT", onSig);

  function guard() {
    if (summary.spentUsd + reservedUsd + DEFAULTS.perCampusCostCeil > opts.budgetUsd) return `budget guard: $${summary.spentUsd.toFixed(2)}+res > $${opts.budgetUsd}`;
    if (summary.serp + reservedSerp + DEFAULTS.perCampusSerpCeil > opts.maxSerp) return `serp guard: ${summary.serp + reservedSerp} > ${opts.maxSerp}`;
    if (summary.completed + summary.failed >= opts.maxCampuses) return `campus-count guard: ${opts.maxCampuses}`;
    if (Date.now() >= deadline) return `runtime guard: ${opts.maxRuntimeMin}min`;
    return null;
  }

  const queue = [...pending]; let qp = 0;
  const shouldStopCtx = () => stopping || Date.now() >= deadline;

  async function worker() {
    while (!stopping) {
      if (qp >= queue.length) return;
      const it = queue[qp++];
      const breach = guard();
      if (breach) { stop(breach); return; }
      if (Date.now() < rateCooldownUntil) await sleep(rateCooldownUntil - Date.now());

      reservedUsd += DEFAULTS.perCampusCostCeil; reservedSerp += DEFAULTS.perCampusSerpCeil;
      summary.attempted++;
      const t0 = Date.now();
      let result = null, attempts = 0, lastErr = null;
      const chapters = await loadCampusChapters(it.campus.id).catch(() => []);
      const seedUrl = seedMap.get(it.campus.id) || null;
      while (attempts <= opts.retryCap) {
        attempts++;
        try {
          result = await harvestCampus(it.campus, { shouldStop: shouldStopCtx, chapters, seedUrl }, keys);
          if (result?.error) lastErr = result.error;
          break;
        } catch (e) { lastErr = e?.message || String(e); if (attempts <= opts.retryCap) console.log(`[retry] ${it.campus.name}: ${lastErr}`); }
      }
      reservedUsd -= DEFAULTS.perCampusCostCeil; reservedSerp -= DEFAULTS.perCampusSerpCeil;

      if (!result) {
        summary.failed++;
        appendLog(opts.costLog, { ts: Date.now(), campus: it.campus.name, ok: false, attempts, error: lastErr });
        console.log(`[fail] ${it.campus.name}: ${lastErr}`);
        continue;
      }
      // persist status (failure-isolated)
      try { await db.upsertCampusStatus(result.statusRow); } catch (e) { console.log(`[status-fail] ${it.campus.name}: ${e.message || e}`); }

      summary.spentUsd += result.costUsd; summary.serp += result.serp; summary.firecrawl += result.firecrawl; summary.ai += result.ai;
      summary.completed++;
      summary.reports += result.reportsFound; summary.matched += result.chaptersMatched; summary.unmatched += result.chaptersUnmatched; summary.members += result.memberRecords;
      if (result.status === "no_public_data") summary.noData++;
      if (result.status === "needs_review") summary.needsReview++;
      if (result.rateLimited) { rateCooldownUntil = Date.now() + 60_000; console.log(`[rate] SerpAPI 429 — 60s cooldown`); }

      cp.done[it.key] = { at: new Date().toISOString(), status: result.status, reports: result.reportsFound, matched: result.chaptersMatched, costUsd: +result.costUsd.toFixed(4), serp: result.serp };
      cp.totals = { spentUsd: summary.spentUsd, serp: summary.serp, campuses: summary.completed };
      saveCP(opts.checkpoint, cp);
      appendLog(opts.costLog, { ts: Date.now(), campus: it.campus.name, state: it.campus.state, ok: true, ...pick(result), cumUsd: +summary.spentUsd.toFixed(3), cumSerp: summary.serp, ms: Date.now() - t0 });
      console.log(`[${result.status}] ${it.campus.name} — ${result.reportsFound} rpt, ${result.chaptersMatched} matched/${result.chaptersUnmatched} unm, ${result.serp} serp $${result.costUsd.toFixed(3)} (cum $${summary.spentUsd.toFixed(2)}/${opts.budgetUsd})`);
      if (run) await updateRun(run.id, { campuses_done: summary.completed, serp_calls: summary.serp, firecrawl_calls: summary.firecrawl, ai_calls: summary.ai, est_cost_usd: +summary.spentUsd.toFixed(4), reports_found: summary.reports, chapters_written: summary.matched + summary.unmatched }).catch(() => {});
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, () => worker()));
  process.off("SIGINT", onSig);
  if (!summary.stoppedReason) summary.stoppedReason = qp >= queue.length ? "completed: no more pending" : "stopped";
  saveCP(opts.checkpoint, cp);
  if (run) await updateRun(run.id, { status: summary.stoppedReason.startsWith("completed") ? "complete" : "aborted", finished_at: new Date().toISOString(), campuses_done: summary.completed, serp_calls: summary.serp, firecrawl_calls: summary.firecrawl, ai_calls: summary.ai, est_cost_usd: +summary.spentUsd.toFixed(4), reports_found: summary.reports, chapters_written: summary.matched + summary.unmatched, notes: summary.stoppedReason }).catch(() => {});

  console.log("\n=== GREEK ACADEMIC HARVEST SUMMARY ===");
  console.log(JSON.stringify({ ...summary, spentUsd: +summary.spentUsd.toFixed(2) }, null, 2));
  console.log(`Stopped: ${summary.stoppedReason}`);
}
const pick = (r) => ({ status: r.status, reportsFound: r.reportsFound, chaptersMatched: r.chaptersMatched, chaptersUnmatched: r.chaptersUnmatched, memberRecords: r.memberRecords, businessRecords: r.businessRecords, semesters: r.semesters, serp: r.serp, firecrawl: r.firecrawl, ai: r.ai, costUsd: +r.costUsd.toFixed(4), archiveUrl: r.archiveUrl });

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
