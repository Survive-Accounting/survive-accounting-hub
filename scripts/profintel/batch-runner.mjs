#!/usr/bin/env node
/**
 * ProfIntel bounded batch runner
 * =================================================================
 * A SAFE orchestration + guard layer around the existing ProfIntel scrape
 * pipeline (autoDiscoverCampusUrls -> scrapeCampusFaculty -> scrapeCampusRmp).
 *
 * WHAT THIS IS:
 *   - A campus scheduler with HARD stop guards (budget, request count, runtime,
 *     campus count), a resumable/idempotent checkpoint, a concurrency limiter,
 *     a retry cap, graceful stop (SIGINT), and a detailed per-campus cost log.
 *
 * WHAT THIS IS NOT:
 *   - It does NOT re-implement the scraper. The actual per-campus work is done
 *     by an injectable "executor". The DEFAULT executor is a dry-run SIMULATOR
 *     that makes ZERO network calls and estimates cost from the measured model.
 *   - Live execution requires BOTH `--execute` AND a wired executor module (see
 *     executors.mjs). Without a wired executor, `--execute` refuses to run.
 *     This makes accidental paid calls impossible from a default invocation.
 *
 * WHY A GUARD LAYER (not a --budget flag inside the app):
 *   The app's cost is ESTIMATED (src/lib/scrape-cost.ts) and OMITS SerpAPI
 *   discovery entirely, so a pure "$ spent" number is not trustworthy as the
 *   only guard. This runner enforces BOTH a conservative dollar ceiling AND a
 *   provider-request ceiling, and always stops BEFORE a campus that could push
 *   either past its limit. It never "keeps going until done".
 *
 * USAGE (dry-run is the default; you must opt in to spend):
 *   node scripts/profintel/batch-runner.mjs --input PROFINTEL_PRIORITY.csv \
 *       --priority-min P3 --max-campuses 61 --budget-usd 25 --max-requests 2000 \
 *       --max-runtime-min 240 --concurrency 3 --retry-cap 1 \
 *       --checkpoint .profintel-checkpoint.json
 *
 *   Add --execute (and a wired executor) to actually spend. Omit it to simulate.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Cost/planning constants — derived from 334 real scrape_debug_bundles.
// credits_estimate_usd is the app's OWN estimate (Firecrawl+AI only). It does
// NOT include SerpAPI discovery (~1-4 searches/campus) nor real Gemini token
// price. So we plan against a CONSERVATIVE all-in ceiling, not the app number.
// Measured (334 runs): model est/run mean $0.023, p50 $0.018, p90 $0.042.
// ---------------------------------------------------------------------------
export const DEFAULTS = {
  costCeilingPerCampusUsd: 0.12, // conservative all-in planning ceiling / campus
  requestsPerCampusEstimate: 12, // ~3 dir + ~1-4 serp + profiles(sampled) + rmp
  concurrency: 3, // matches the app's BatchScrapePanel CONCURRENCY
  retryCap: 1, // at most 1 retry per campus on transient failure
  budgetUsd: 25, // HARD dollar ceiling
  maxRequests: 5000, // HARD provider-request ceiling
  maxRuntimeMin: 240, // HARD wall-clock ceiling
  maxCampuses: Infinity,
  priorityMin: "P4",
};

const PRIORITY_RANK = { P1: 1, P2: 2, P3: 3, P4: 4 };

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
export function parseArgs(argv) {
  const a = {
    input: null,
    execute: false,
    dryRun: true,
    concurrency: DEFAULTS.concurrency,
    retryCap: DEFAULTS.retryCap,
    budgetUsd: DEFAULTS.budgetUsd,
    maxRequests: DEFAULTS.maxRequests,
    maxRuntimeMin: DEFAULTS.maxRuntimeMin,
    maxCampuses: DEFAULTS.maxCampuses,
    costCeilingPerCampusUsd: DEFAULTS.costCeilingPerCampusUsd,
    requestsPerCampusEstimate: DEFAULTS.requestsPerCampusEstimate,
    priorityMin: DEFAULTS.priorityMin,
    checkpoint: ".profintel-checkpoint.json",
    costLog: null, // defaults to <checkpoint>.costlog.jsonl
    executor: null, // path to a module exporting scrapeOne(campus) for --execute
    resume: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    switch (t) {
      case "--input": a.input = next(); break;
      case "--execute": a.execute = true; a.dryRun = false; break;
      case "--dry-run": a.dryRun = true; a.execute = false; break;
      case "--concurrency": a.concurrency = Math.max(1, parseInt(next(), 10)); break;
      case "--retry-cap": a.retryCap = Math.max(0, parseInt(next(), 10)); break;
      case "--budget-usd": a.budgetUsd = parseFloat(next()); break;
      case "--max-requests": a.maxRequests = parseInt(next(), 10); break;
      case "--max-runtime-min": a.maxRuntimeMin = parseFloat(next()); break;
      case "--max-campuses": a.maxCampuses = parseInt(next(), 10); break;
      case "--cost-ceiling-per-campus": a.costCeilingPerCampusUsd = parseFloat(next()); break;
      case "--requests-per-campus": a.requestsPerCampusEstimate = parseInt(next(), 10); break;
      case "--priority-min": a.priorityMin = next().toUpperCase(); break;
      case "--checkpoint": a.checkpoint = next(); break;
      case "--cost-log": a.costLog = next(); break;
      case "--executor": a.executor = next(); break;
      case "--no-resume": a.resume = false; break;
      case "--help": case "-h": a.help = true; break;
      default:
        if (t.startsWith("--")) throw new Error(`Unknown flag: ${t}`);
    }
  }
  if (!a.costLog) a.costLog = a.checkpoint + ".costlog.jsonl";
  return a;
}

// ---------------------------------------------------------------------------
// CSV loader (PROFINTEL_PRIORITY.csv). Minimal RFC-4180 parser.
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function loadCampuses(inputPath) {
  const rows = parseCSV(fs.readFileSync(inputPath, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (r, name) => (idx[name] != null ? r[idx[name]] : "");
  return rows.slice(1).filter((r) => r.some((x) => x !== "")).map((r, i) => {
    const estStr = String(get(r, "Estimated API Cost") || "").replace(/[^0-9.]/g, "");
    const est = parseFloat(estStr);
    return {
      rank: i + 1,
      campus: get(r, "Campus"),
      state: get(r, "State"),
      courseCode: get(r, "Course Code"),
      currentProfessors: parseInt(get(r, "Current Professors") || "0", 10) || 0,
      priority: (get(r, "Priority") || "P4").toUpperCase(),
      reason: get(r, "Reason"),
      estCostUsd: isFinite(est) && est > 0 ? est : null,
      yield: get(r, "Estimated Professor Yield"),
      key: `${get(r, "Campus")}|${get(r, "State")}`, // stable idempotency key
    };
  });
}

// ---------------------------------------------------------------------------
// Checkpoint (resume + idempotency)
// ---------------------------------------------------------------------------
export function loadCheckpoint(file) {
  if (!fs.existsSync(file)) return { done: {}, startedAt: null, totals: { spentUsd: 0, requests: 0, campuses: 0 } };
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return { done: {}, startedAt: null, totals: { spentUsd: 0, requests: 0, campuses: 0 } }; }
}
export function saveCheckpoint(file, cp) {
  fs.writeFileSync(file, JSON.stringify(cp, null, 2));
}

// ---------------------------------------------------------------------------
// The guarded run. `clock`, `executor`, `logger` are injectable for testing.
// executor(campus) -> { costUsd, requests, contactsInserted, contactsWithEmail, error? }
// ---------------------------------------------------------------------------
export async function runBatch(opts, deps = {}) {
  const clock = deps.clock || (() => Date.now());
  const log = deps.logger || ((...m) => console.log(...m));
  const appendCostLog = deps.appendCostLog ||
    ((line) => fs.appendFileSync(opts.costLog, JSON.stringify(line) + "\n"));
  const persist = deps.saveCheckpoint || ((cpObj) => saveCheckpoint(opts.checkpoint, cpObj));

  const executor = deps.executor || makeDefaultExecutor(opts);

  let campuses = deps.campuses || loadCampuses(opts.input);
  // Filter by priority threshold, then order by rank (already priority-sorted).
  const maxRank = PRIORITY_RANK[opts.priorityMin] ?? 4;
  campuses = campuses.filter((c) => (PRIORITY_RANK[c.priority] ?? 4) <= maxRank);

  const cp = deps.checkpoint || loadCheckpoint(opts.checkpoint);
  if (!cp.startedAt) cp.startedAt = clock();
  cp.totals ||= { spentUsd: 0, requests: 0, campuses: 0 };

  // Skip already-done campuses (idempotent resume).
  const pending = campuses.filter((c) => !(opts.resume && cp.done[c.key]));
  log(`[plan] ${campuses.length} campuses match priority>=${opts.priorityMin}; ` +
      `${campuses.length - pending.length} already done; ${pending.length} pending.`);

  const startWall = clock();
  const deadline = startWall + opts.maxRuntimeMin * 60_000;
  const perCampusCeil = opts.costCeilingPerCampusUsd;
  const perCampusReq = opts.requestsPerCampusEstimate;

  const summary = {
    attempted: 0, completed: 0, failed: 0, skipped: 0,
    spentUsd: cp.totals.spentUsd, requests: cp.totals.requests,
    stoppedReason: null, contacts: 0, emails: 0,
  };

  let stopping = false;
  const stop = (reason) => { if (!stopping) { stopping = true; summary.stoppedReason = reason; log(`[STOP] ${reason}`); } };
  const onSigint = () => stop("SIGINT — graceful stop requested; finishing in-flight campuses");
  if (deps.installSignal !== false) process.on?.("SIGINT", onSigint);

  // Reservation accounting prevents concurrent overshoot: we reserve the
  // conservative estimate BEFORE starting, then reconcile with the actual.
  let reservedUsd = 0, reservedReq = 0;

  // Pre-flight guard: would starting this campus breach ANY hard limit?
  function guardBeforeStart(c) {
    const estCost = Math.max(c.estCostUsd || 0, perCampusCeil);
    if (summary.spentUsd + reservedUsd + estCost > opts.budgetUsd)
      return `budget guard: spent $${summary.spentUsd.toFixed(2)} + reserved $${reservedUsd.toFixed(2)} + est $${estCost.toFixed(2)} would exceed --budget-usd $${opts.budgetUsd}`;
    if (summary.requests + reservedReq + perCampusReq > opts.maxRequests)
      return `request guard: ${summary.requests + reservedReq} + est ${perCampusReq} would exceed --max-requests ${opts.maxRequests}`;
    if (summary.completed + summary.failed >= opts.maxCampuses)
      return `campus-count guard: reached --max-campuses ${opts.maxCampuses}`;
    if (clock() >= deadline)
      return `runtime guard: reached --max-runtime-min ${opts.maxRuntimeMin}`;
    return null;
  }

  const queue = [...pending];
  let queuePos = 0;

  async function worker(id) {
    while (!stopping) {
      if (queuePos >= queue.length) return;
      const c = queue[queuePos++];
      const breach = guardBeforeStart(c);
      if (breach) { stop(breach); return; }
      if (summary.completed + summary.failed >= opts.maxCampuses) { stop(`campus-count guard: reached --max-campuses ${opts.maxCampuses}`); return; }

      const estCost = Math.max(c.estCostUsd || 0, perCampusCeil);
      reservedUsd += estCost; reservedReq += perCampusReq;
      summary.attempted++;
      const t0 = clock();

      let result = null, attempts = 0, lastErr = null;
      while (attempts <= opts.retryCap) {
        attempts++;
        try {
          result = await executor(c, { attempt: attempts, dryRun: opts.dryRun });
          if (result && result.error) { lastErr = result.error; result = null; }
          else break;
        } catch (e) { lastErr = e?.message || String(e); }
        if (attempts <= opts.retryCap) log(`[retry] ${c.campus} attempt ${attempts} failed: ${lastErr}`);
      }

      // reconcile reservation with actuals
      reservedUsd -= estCost; reservedReq -= perCampusReq;

      if (!result) {
        summary.failed++;
        appendCostLog({ ts: clock(), campus: c.campus, key: c.key, ok: false, attempts, error: lastErr, durationMs: clock() - t0 });
        log(`[fail] ${c.campus} after ${attempts} attempt(s): ${lastErr}`);
        continue;
      }

      const actualCost = result.costUsd ?? estCost;
      const actualReq = result.requests ?? perCampusReq;
      summary.spentUsd += actualCost;
      summary.requests += actualReq;
      summary.completed++;
      summary.contacts += result.contactsInserted || 0;
      summary.emails += result.contactsWithEmail || 0;

      cp.done[c.key] = { at: clock(), costUsd: actualCost, requests: actualReq,
        contactsInserted: result.contactsInserted || 0, contactsWithEmail: result.contactsWithEmail || 0,
        dryRun: opts.dryRun };
      cp.totals.spentUsd = summary.spentUsd; cp.totals.requests = summary.requests; cp.totals.campuses = summary.completed;
      persist(cp);
      appendCostLog({ ts: clock(), campus: c.campus, key: c.key, ok: true, attempts,
        costUsd: actualCost, requests: actualReq, contactsInserted: result.contactsInserted || 0,
        contactsWithEmail: result.contactsWithEmail || 0, dryRun: opts.dryRun,
        cumSpentUsd: +summary.spentUsd.toFixed(4), cumRequests: summary.requests, durationMs: clock() - t0 });
      log(`[ok] ${c.campus} $${actualCost.toFixed(4)} ${actualReq}req ` +
          `(cum $${summary.spentUsd.toFixed(2)}/${opts.budgetUsd}, ${summary.requests}/${opts.maxRequests}req)` +
          (opts.dryRun ? " [DRY]" : ""));
    }
  }

  const workers = Array.from({ length: opts.concurrency }, (_, i) => worker(i));
  await Promise.all(workers);
  if (deps.installSignal !== false) process.off?.("SIGINT", onSigint);

  if (!summary.stoppedReason) {
    summary.stoppedReason = queuePos >= queue.length ? "completed: no more pending campuses" : "stopped";
  }
  persist(cp);
  return summary;
}

// ---------------------------------------------------------------------------
// Default executor: DRY-RUN SIMULATOR (zero network). Estimates cost from the
// CSV per-campus figure and the measured yield band. Deterministic (no RNG) so
// tests are stable.
// ---------------------------------------------------------------------------
export function makeDefaultExecutor(opts) {
  return async function dryRunExecutor(c) {
    const cost = c.estCostUsd || opts.costCeilingPerCampusUsd;
    // parse a midpoint from a "8-25" yield band
    const m = String(c.yield || "").match(/(\d+)\s*-\s*(\d+)/);
    const mid = m ? Math.round((+m[1] + +m[2]) / 2) : 10;
    return { costUsd: cost, requests: opts.requestsPerCampusEstimate,
      contactsInserted: mid, contactsWithEmail: Math.round(mid * 1.1), simulated: true };
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------
const isMain = (() => {
  try { return path.resolve(process.argv[1] || "") === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")); }
  catch { return false; }
})();

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.input) {
    console.log(`ProfIntel bounded batch runner

Required:
  --input <csv>                PROFINTEL_PRIORITY.csv (Campus,State,...,Estimated API Cost,...)

Safety (all have conservative defaults; DRY-RUN unless --execute):
  --dry-run                    simulate only, zero network (DEFAULT)
  --execute                    make REAL calls (requires --executor module)
  --executor <module.mjs>      module exporting scrapeOne(campus) for live runs
  --budget-usd <n>             HARD dollar ceiling (default ${DEFAULTS.budgetUsd})
  --max-requests <n>           HARD provider-request ceiling (default ${DEFAULTS.maxRequests})
  --max-runtime-min <n>        HARD wall-clock ceiling (default ${DEFAULTS.maxRuntimeMin})
  --max-campuses <n>           HARD campus-count ceiling
  --cost-ceiling-per-campus <n> conservative per-campus reservation (default $${DEFAULTS.costCeilingPerCampusUsd})
  --requests-per-campus <n>    per-campus request reservation (default ${DEFAULTS.requestsPerCampusEstimate})
  --concurrency <n>            parallel campuses (default ${DEFAULTS.concurrency})
  --retry-cap <n>              retries per campus (default ${DEFAULTS.retryCap})
  --priority-min <P1|P2|P3|P4> only campuses at/above this priority (default P4=all)
  --checkpoint <file>          resumable progress file
  --cost-log <file>            per-campus JSONL cost log
  --no-resume                  ignore checkpoint, re-run everything

The runner ALWAYS stops before a campus that would breach any hard limit. It
never "keeps going until done". Ctrl-C = graceful stop (finishes in-flight).`);
    process.exit(opts.input ? 0 : 1);
  }

  if (opts.execute && !opts.executor) {
    console.error("[refuse] --execute requires --executor <module.mjs> that wires the real ProfIntel pipeline.\n" +
      "         Without it, no paid calls can be made. Run without --execute for a dry-run simulation.");
    process.exit(2);
  }

  let deps = {};
  if (opts.execute && opts.executor) {
    const mod = await import(path.resolve(opts.executor));
    if (typeof mod.scrapeOne !== "function")
      throw new Error(`--executor ${opts.executor} must export scrapeOne(campus)`);
    deps.executor = (c, ctx) => mod.scrapeOne(c, ctx);
    console.log(`[live] executor wired from ${opts.executor}`);
  } else {
    console.log("[dry-run] using built-in simulator — ZERO network calls will be made.");
  }

  runBatch(opts, deps).then((s) => {
    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify(s, null, 2));
    console.log(`\nStopped: ${s.stoppedReason}`);
    console.log(`Spent: $${s.spentUsd.toFixed(2)} / $${opts.budgetUsd}  |  Requests: ${s.requests} / ${opts.maxRequests}`);
    console.log(`Campuses: ${s.completed} ok, ${s.failed} failed  |  Contacts: ${s.contacts} (${s.emails} emailed)` +
      (opts.dryRun ? "  [SIMULATED]" : ""));
  });
}
