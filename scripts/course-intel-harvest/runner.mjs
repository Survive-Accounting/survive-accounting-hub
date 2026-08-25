#!/usr/bin/env node
/**
 * Course Intel harvest — bounded, resumable, concurrent runner.
 * Reuses the ProfIntel batch-runner guard model: HARD ceilings (budget, SerpAPI
 * searches, runtime, campus count), reservation accounting, resumable checkpoint,
 * concurrency, retry cap, SIGINT graceful stop, per-campus JSONL cost log.
 *
 * DRY-RUN by default. --execute makes real paid calls. Keys are read from the
 * process env (load .env + .env.vercel before running).
 *
 * Usage:
 *   node runner.mjs --preflight --execute
 *   node runner.mjs --pass A --execute --budget-usd 120 --max-serp 9000 --concurrency 3
 *   node runner.mjs --pass B --execute --budget-usd 60  --max-serp 4000
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCampuses, loadProfessors } from "./db.mjs";
import { eligibleUniverse, pickPreflight, campusDomain, introCode } from "./universe.mjs";
import { harvestCampus } from "./harvest.mjs";
import { serpBalance, firecrawlBalance, UNIT_COST } from "./providers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = {
  budgetUsd: 120, maxSerp: 9000, maxRuntimeMin: 600, maxCampuses: Infinity,
  concurrency: 3, retryCap: 1, perCampusSerpCeil: 14, perCampusCostCeil: 0.25,
};

function parseArgs(argv) {
  const a = {
    pass: "both", preflight: false, execute: false, dryRun: true, limit: Infinity, campus: null,
    budgetUsd: DEFAULTS.budgetUsd, maxSerp: DEFAULTS.maxSerp, maxRuntimeMin: DEFAULTS.maxRuntimeMin,
    maxCampuses: DEFAULTS.maxCampuses, concurrency: DEFAULTS.concurrency, retryCap: DEFAULTS.retryCap,
    checkpoint: path.join(HERE, ".harvest-checkpoint.json"), resume: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i], next = () => argv[++i];
    switch (t) {
      case "--pass": a.pass = next(); break;
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
      case "--help": case "-h": a.help = true; break;
      default: if (t.startsWith("--")) throw new Error(`Unknown flag: ${t}`);
    }
  }
  a.costLog = a.checkpoint + ".costlog.jsonl";
  return a;
}

const loadCP = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return { done: {}, startedAt: null, totals: { spentUsd: 0, serp: 0, campuses: 0 } }; } };
const saveCP = (f, cp) => fs.writeFileSync(f, JSON.stringify(cp, null, 2));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log("See header for usage."); return; }
  const keys = { serp: process.env.SERPAPI_API_KEY, firecrawl: process.env.FIRECRAWL_API_KEY, ai: process.env.AI_GATEWAY_API_KEY };

  console.log(`[load] fetching campus universe…`);
  const raw = await loadCampuses();
  let universe = eligibleUniverse(raw);
  console.log(`[load] ${raw.length} non-research/non-test rows → ${universe.length} eligible after dedupe`);

  let targets;
  if (opts.preflight) { targets = pickPreflight(universe); console.log(`[preflight] ${targets.length} diverse campuses: ${targets.map(c => c.name).join(", ")}`); }
  else if (opts.campus) { targets = universe.filter(c => (c.name || "").toLowerCase().includes(opts.campus.toLowerCase())); }
  else targets = universe;
  targets = targets.slice(0, opts.limit);

  // key of a work item = campusId + pass
  const passKey = opts.pass;
  const items = targets.map((c) => ({ campus: c, key: `${c.id}:${passKey}` }));

  const cp = opts.resume ? loadCP(opts.checkpoint) : { done: {}, startedAt: null, totals: { spentUsd: 0, serp: 0, campuses: 0 } };
  if (!cp.startedAt) cp.startedAt = new Date().toISOString();
  const pending = items.filter((it) => !(opts.resume && cp.done[it.key]));
  console.log(`[plan] ${items.length} items; ${items.length - pending.length} already done; ${pending.length} pending; pass=${opts.pass}`);

  if (opts.dryRun) {
    console.log(`[DRY-RUN] no network calls. Would harvest ${pending.length} campuses.`);
    console.log(`  sample codes/domains:`); pending.slice(0, 8).forEach(it => console.log(`   - ${it.campus.name} [${it.campus.state}] code=${introCode(it.campus) || "-"} domain=${campusDomain(it.campus) || "-"}`));
    return;
  }
  if (!keys.serp || !keys.firecrawl || !keys.ai) throw new Error("Provider keys not in env (SERPAPI_API_KEY/FIRECRAWL_API_KEY/AI_GATEWAY_API_KEY)");

  // Runaway-cost preflight: confirm the upgraded plans have headroom.
  const [sb, fb] = await Promise.all([serpBalance(keys.serp), firecrawlBalance(keys.firecrawl)]);
  console.log(`[balance] SerpAPI: ${sb ? `${sb.left} left (${sb.plan}, ${sb.ratePerHour}/hr)` : "unknown"} | Firecrawl: ${fb ? `${fb.remaining} credits` : "unknown"}`);
  if (sb && sb.left < 500) { console.error(`[ABORT] SerpAPI balance ${sb.left} < 500 — refusing to start (runaway-cost guard).`); process.exit(3); }

  const startWall = Date.now();
  const deadline = startWall + opts.maxRuntimeMin * 60_000;
  const summary = { attempted: 0, completed: 0, failed: 0, spentUsd: cp.totals.spentUsd, serp: cp.totals.serp, docs: 0, confirmed: 0, stoppedReason: null };
  let reservedUsd = 0, reservedSerp = 0, stopping = false, rateCooldownUntil = 0;
  const stop = (r) => { if (!stopping) { stopping = true; summary.stoppedReason = r; console.log(`[STOP] ${r}`); } };
  const onSig = () => stop("SIGINT — graceful stop; finishing in-flight");
  process.on("SIGINT", onSig);

  function guard() {
    if (summary.spentUsd + reservedUsd + DEFAULTS.perCampusCostCeil > opts.budgetUsd) return `budget guard: $${summary.spentUsd.toFixed(2)}+res would exceed $${opts.budgetUsd}`;
    if (summary.serp + reservedSerp + DEFAULTS.perCampusSerpCeil > opts.maxSerp) return `serp guard: ${summary.serp + reservedSerp} would exceed --max-serp ${opts.maxSerp}`;
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
      // gentle rate-limit cooldown shared across workers
      if (Date.now() < rateCooldownUntil) await sleep(rateCooldownUntil - Date.now());

      reservedUsd += DEFAULTS.perCampusCostCeil; reservedSerp += DEFAULTS.perCampusSerpCeil;
      summary.attempted++;
      const t0 = Date.now();
      let result = null, attempts = 0, lastErr = null;
      while (attempts <= opts.retryCap) {
        attempts++;
        try {
          const professors = (opts.pass === "B" || opts.pass === "both") ? await loadProfessors(it.campus.id).catch(() => []) : [];
          result = await harvestCampus(it.campus, { shouldStop: shouldStopCtx, professors, pass: opts.pass }, keys);
          if (result?.error) { lastErr = result.error; }
          break;
        } catch (e) { lastErr = e?.message || String(e); if (attempts <= opts.retryCap) console.log(`[retry] ${it.campus.name}: ${lastErr}`); }
      }
      reservedUsd -= DEFAULTS.perCampusCostCeil; reservedSerp -= DEFAULTS.perCampusSerpCeil;

      if (!result) {
        summary.failed++;
        appendLog(opts.costLog, { ts: Date.now(), campus: it.campus.name, key: it.key, ok: false, attempts, error: lastErr });
        console.log(`[fail] ${it.campus.name}: ${lastErr}`);
        continue;
      }
      summary.spentUsd += result.costUsd; summary.serp += result.serp; summary.completed++;
      summary.docs += result.docsFound || 0; summary.confirmed += result.confirmedIntro1 || 0;
      if (result.rateLimited) { rateCooldownUntil = Date.now() + 60_000; console.log(`[rate] SerpAPI 429 — 60s cooldown`); }
      cp.done[it.key] = { at: new Date().toISOString(), costUsd: +result.costUsd.toFixed(4), serp: result.serp, docs: result.docsFound, status: result.status };
      cp.totals = { spentUsd: summary.spentUsd, serp: summary.serp, campuses: summary.completed };
      saveCP(opts.checkpoint, cp);
      appendLog(opts.costLog, { ts: Date.now(), campus: it.campus.name, state: it.campus.state, key: it.key, ok: true, ...result, cumUsd: +summary.spentUsd.toFixed(3), cumSerp: summary.serp, ms: Date.now() - t0 });
      console.log(`[ok] ${it.campus.name} — ${result.docsFound} docs, ${result.serp} serp, $${result.costUsd.toFixed(3)} (cum $${summary.spentUsd.toFixed(2)}/${opts.budgetUsd}, ${summary.serp}/${opts.maxSerp} serp) ${result.status}`);
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, () => worker()));
  process.off("SIGINT", onSig);
  if (!summary.stoppedReason) summary.stoppedReason = qp >= queue.length ? "completed: no more pending" : "stopped";
  saveCP(opts.checkpoint, cp);

  console.log("\n=== HARVEST SUMMARY ===");
  console.log(JSON.stringify({ ...summary, spentUsd: +summary.spentUsd.toFixed(2) }, null, 2));
  console.log(`Stopped: ${summary.stoppedReason}`);
  console.log(`Campuses: ${summary.completed} ok, ${summary.failed} failed | Docs: ${summary.docs} | SerpAPI used: ${summary.serp} | Spent≈$${summary.spentUsd.toFixed(2)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appendLog = (f, line) => { try { fs.appendFileSync(f, JSON.stringify(line) + "\n"); } catch {} };

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
