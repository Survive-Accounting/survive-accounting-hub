#!/usr/bin/env node
/**
 * Course Intel — SEC-preflight → live catch-up follow-behind worker.
 *
 * Runs BEHIND the structural Campus Backfill (a separate process — never touched
 * here). A campus becomes eligible as its structural prerequisites land:
 *   Pass A  — needs resolved identity + an Intro-1 course code (+ a domain to search)
 *   Pass B  — needs professor discovery (≥1 professor on the campus)
 * RMP is NOT required for either.
 *
 * Flow: resolve the 16 SEC campuses → run their eligible passes → automated
 * precision/integrity assessment → if clean, expand to the approved universe and
 * keep polling (~every 3 min), enqueueing campuses as the backfill readies them.
 *
 * Reuses harvestCampus (single-pass, deferStatus) + the same course_document /
 * course_evidence / professor_intro1_evidence / course_intel_campus_status tables.
 * Idempotent (per-pass skip via status), checkpointed, failure-isolated, guarded.
 *
 *   node follow-behind.mjs --execute [--budget-usd 100] [--max-serp 6000]
 *                          [--concurrency 2] [--max-runtime-min 600] [--poll-sec 180]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./db.mjs";
import { eligibleUniverse, campusDomain, parentDomain, introCode } from "./universe.mjs";
import { harvestCampus } from "./harvest.mjs";
import { serpBalance, firecrawlBalance, UNIT_COST } from "./providers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The 16 current SEC institutions, with disambiguating matchers against the messy
// campus names ("Univ of ...", "... Univ"). Each entry: {label, must:[tokens all present], not:[tokens absent]}.
const SEC = [
  { label: "University of Alabama", must: ["alabama"], not: ["south", "birmingham", "huntsville", "auburn", "state"] },
  { label: "University of Arkansas", must: ["arkansas"], not: ["little rock", "state", "pine bluff", "fort smith", "monticello", "medical"] },
  { label: "Auburn University", must: ["auburn"], not: ["montgomery"] },
  { label: "University of Florida", must: ["florida"], not: ["state", "central", "south", "north", "west", "international", "atlantic", "gulf"] },
  { label: "University of Georgia", must: ["georgia"], not: ["state", "southern", "tech", "college", "west", "east", "north", "augusta", "valdosta"] },
  { label: "University of Kentucky", must: ["kentucky"], not: ["western", "eastern", "state", "northern"] },
  { label: "Louisiana State University", must: ["louisiana", "state"], not: ["shreveport", "tech", "alexandria", "eunice"] },
  { label: "Mississippi State University", must: ["mississippi", "state"], not: [] },
  { label: "University of Missouri", must: ["missouri"], not: ["state", "kansas city", "st louis", "science", "western", "southern", "columbia college"] },
  { label: "University of Oklahoma", must: ["oklahoma"], not: ["state", "city", "central", "northeastern", "northwestern", "southeastern"] },
  { label: "University of Mississippi", must: ["mississippi"], not: ["state", "women", "southern", "valley", "college"] },
  { label: "University of South Carolina", must: ["south carolina"], not: ["upstate", "aiken", "beaufort", "state", "medical", "coastal"] },
  { label: "University of Tennessee Knoxville", must: ["tennessee"], not: ["state", "chattanooga", "martin", "middle", "east", "memphis", "technological", "austin peay"] },
  { label: "University of Texas at Austin", must: ["texas", "austin"], not: ["state", "am", "a m", "arlington", "dallas", "el paso", "san antonio", "tyler", "permian"] },
  { label: "Texas A&M University", must: ["texas"], not: ["austin", "state", "arlington", "el paso", "commerce", "corpus", "kingsville", "international"], amp: true },
  { label: "Vanderbilt University", must: ["vanderbilt"], not: [] },
];

function resolveSEC(universe) {
  const out = [];
  for (const s of SEC) {
    const cands = universe.filter((c) => {
      const n = norm(c.name) + " " + norm(c.canonical_name || "") + " " + norm(c.display_name || "");
      if (s.amp && !/\b(a m|am|a&m)\b/.test((c.name || "").toLowerCase().replace(/&/g, " and ").replace(/\band\b/g, "am"))) {
        if (!/a&m|a and m|a m/i.test(c.name || "")) return false;
      }
      if (!s.must.every((t) => n.includes(t))) return false;
      if (s.not.some((t) => n.includes(t))) return false;
      return true;
    });
    // prefer is_sec, then the shortest name (most canonical), then one with a code
    cands.sort((a, b) => (Number(!!b.is_sec) - Number(!!a.is_sec)) || (introCode(b) ? 1 : 0) - (introCode(a) ? 1 : 0) || String(a.name).length - String(b.name).length);
    if (cands[0]) out.push({ ...cands[0], _sec: s.label });
    else console.log(`[sec] UNRESOLVED: ${s.label}`);
  }
  // dedupe by id
  const seen = new Set(); return out.filter((c) => !seen.has(c.id) && seen.add(c.id));
}

// ── args ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { execute: false, budgetUsd: 100, maxSerp: 6000, concurrency: 2, maxRuntimeMin: 600, pollSec: 180,
    checkpoint: path.join(HERE, "catchup-checkpoint.json"), secOnly: false, skipSec: false, limit: Infinity, idleExitPolls: 6 };
  for (let i = 0; i < argv.length; i++) { const t = argv[i], n = () => argv[++i];
    if (t === "--execute") a.execute = true;
    else if (t === "--limit") a.limit = parseInt(n(), 10);
    else if (t === "--idle-exit-polls") a.idleExitPolls = parseInt(n(), 10);
    else if (t === "--budget-usd") a.budgetUsd = parseFloat(n());
    else if (t === "--max-serp") a.maxSerp = parseInt(n(), 10);
    else if (t === "--concurrency") a.concurrency = Math.max(1, parseInt(n(), 10));
    else if (t === "--max-runtime-min") a.maxRuntimeMin = parseFloat(n());
    else if (t === "--poll-sec") a.pollSec = parseInt(n(), 10);
    else if (t === "--checkpoint") a.checkpoint = n();
    else if (t === "--sec-only") a.secOnly = true;
    else if (t === "--skip-sec") a.skipSec = true;
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadCP = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return { done: {}, totals: { serp: 0, firecrawl: 0, ai: 0, costUsd: 0 } }; } };
const saveCP = (f, cp) => { try { fs.writeFileSync(f, JSON.stringify(cp, null, 2)); } catch {} };
const logLine = (f, o) => { try { fs.appendFileSync(f, JSON.stringify(o) + "\n"); } catch {} };

// ── eligibility ─────────────────────────────────────────────────────────────
// Returns { a: 'run'|'done'|'waiting_course'|'no_domain', b: 'run'|'done'|'waiting_profs'|'no_domain' }
function eligibility(campus, status, hasProfs) {
  const domain = parentDomain(campusDomain(campus));
  const code = introCode(campus);
  // Pass A
  let a;
  const pa = status?.pass_a_status;
  if (pa === "COMPLETE" || (pa === "NO_RESULT" && status?.course_code)) a = "done"; // ran with a code
  else if (!code) a = "waiting_course";
  else if (!domain) a = "no_domain";
  else a = "run"; // NOT_RUN / WAITING_FOR_COURSE / FAILED / NO_RESULT-without-code-but-now-has-code
  // Pass B
  let b;
  const pb = status?.pass_b_status;
  if (pb === "COMPLETE" || (pb === "NO_RESULT" && (status?.professor_candidates || 0) > 0)) b = "done";
  else if (!hasProfs) b = "waiting_profs";
  else if (!domain) b = "no_domain";
  else b = "run";
  return { a, b, domain, code };
}

// ── merged, DB-derived status write (never clobbers the other pass) ───────────
async function writeMergedStatus(campus, pass, passResult, elig, hasProfs) {
  const existing = await db.getCampusStatus(campus.id).catch(() => null);
  const stats = await db.getCampusDocStats(campus.id).catch(() => ({}));
  const confirmed = await db.getCampusConfirmedProfs(campus.id).catch(() => 0);
  const code = elig.code, domain = elig.domain;
  const hasDocs = (stats.documents_found || 0) > 0;

  let passA = existing?.pass_a_status || "NOT_RUN";
  let passB = existing?.pass_b_status || "NOT_RUN";
  if (pass === "A") passA = passResult ? (passResult.docsFound > 0 ? "COMPLETE" : "NO_RESULT") : "FAILED";
  if (pass === "B") passB = passResult ? ((passResult.profEvidence || []).length > 0 ? "COMPLETE" : "NO_RESULT") : "FAILED";
  // reflect waiting reasons for the not-run pass
  if (pass !== "A" && passA === "NOT_RUN") passA = !code ? "WAITING_FOR_COURSE" : (!domain ? "NO_RESULT" : "NOT_RUN");
  if (pass !== "B" && passB === "NOT_RUN") passB = !hasProfs ? "WAITING_FOR_PROFESSORS" : (!domain ? "NO_RESULT" : "NOT_RUN");

  const highestConf = stats.highest_source_confidence || null;
  let overall;
  if (passResult?.error && !hasDocs) overall = "FAILED";
  else if (hasDocs && highestConf === "High") overall = "COMPLETE";
  else if (hasDocs) overall = "NEEDS_REVIEW";
  else if (!code) overall = "WAITING_FOR_COURSE";
  else if (!hasProfs && passB !== "COMPLETE" && passB !== "NO_RESULT") overall = "WAITING_FOR_PROFESSORS";
  else overall = "NO_RESULT";

  const prev = { serp: existing?.serp_searches || 0, fc: existing?.firecrawl_fetches || 0, ai: existing?.ai_parses || 0, cost: Number(existing?.est_cost_usd || 0) };
  const row = {
    campus_id: campus.id, campus_name: campus.name || campus.canonical_name || null, state: campus.state || null, course_code: code || null,
    status: overall, pass_a_status: passA, pass_b_status: passB,
    started_at: existing?.started_at || new Date().toISOString(), finished_at: new Date().toISOString(),
    serp_searches: prev.serp + (passResult?.serp || 0), firecrawl_fetches: prev.fc + (passResult?.firecrawl || 0),
    ai_parses: prev.ai + (passResult?.ai || 0), est_cost_usd: +(prev.cost + (passResult?.costUsd || 0)).toFixed(4),
    documents_found: stats.documents_found || 0, high_value_documents: stats.high_value_documents || 0,
    syllabi_found: stats.syllabi_found || 0, study_guides_found: stats.study_guides_found || 0,
    review_docs_found: stats.review_docs_found || 0, schedules_found: stats.schedules_found || 0,
    textbook_docs_found: stats.textbook_docs_found || 0,
    professor_candidates: passResult?.professorCandidates ?? existing?.professor_candidates ?? 0,
    confirmed_intro1_professors: confirmed,
    highest_source_confidence: highestConf, last_error: passResult?.error ? String(passResult.error).slice(0, 400) : (existing?.last_error || null),
    recommended_next_action: overall === "WAITING_FOR_COURSE" ? "await_course_code_backfill" : overall === "WAITING_FOR_PROFESSORS" ? "await_professor_backfill" : overall === "COMPLETE" ? "ready_for_mapping_review" : overall === "NEEDS_REVIEW" ? "human_review" : "manual_review_no_public_docs",
  };
  await db.upsertCampusStatus(row).catch(() => {});
  return { overall, passA, passB };
}

// lightweight waiting-row writer (so the CSV/queue shows the backlog)
async function writeWaitingStatus(campus, elig, hasProfs) {
  const overall = !elig.code ? "WAITING_FOR_COURSE" : (elig.b === "waiting_profs" ? "WAITING_FOR_PROFESSORS" : (!elig.domain ? "NO_RESULT" : "NOT_RUN"));
  await db.upsertCampusStatus({
    campus_id: campus.id, campus_name: campus.name || null, state: campus.state || null, course_code: elig.code || null,
    status: overall, pass_a_status: !elig.code ? "WAITING_FOR_COURSE" : (!elig.domain ? "NO_RESULT" : "NOT_RUN"),
    pass_b_status: !hasProfs ? "WAITING_FOR_PROFESSORS" : (!elig.domain ? "NO_RESULT" : "NOT_RUN"),
    professor_candidates: 0,
    recommended_next_action: overall === "WAITING_FOR_COURSE" ? "await_course_code_backfill" : overall === "WAITING_FOR_PROFESSORS" ? "await_professor_backfill" : "resolve_campus_domain",
  }).catch(() => {});
}

// priority: SEC → picker → priority_tier/market → earliest ready
function priorityKey(c) {
  const sec = c._sec || c.is_sec ? 0 : 5;
  const picker = c.active_roster === "sec" ? 0 : 1;
  const tier = Number(c.priority_tier) || Number(c.market_priority) || 9;
  const ready = c.enriched_at ? Date.parse(c.enriched_at) || 9e15 : 9e15;
  return [sec, picker, tier, ready];
}
const byPriority = (a, b) => { const ka = priorityKey(a), kb = priorityKey(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; };

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keys = { serp: process.env.SERPAPI_API_KEY, firecrawl: process.env.FIRECRAWL_API_KEY, ai: process.env.AI_GATEWAY_API_KEY };
  const statusLog = path.join(HERE, "catchup.status.log");
  const costLog = opts.checkpoint + ".costlog.jsonl";
  if (!opts.execute) { console.log("[dry] pass --execute to run. This worker makes paid calls."); }
  if (opts.execute && (!keys.serp || !keys.firecrawl || !keys.ai)) throw new Error("provider keys missing from env");

  const cp = loadCP(opts.checkpoint);
  const totals = cp.totals ||= { serp: 0, firecrawl: 0, ai: 0, costUsd: 0 };
  const runSummary = { started: new Date().toISOString(), passA: 0, passB: 0, failures: 0, review: 0 };
  let stopping = false, stopReason = null;
  const stop = (r) => { if (!stopping) { stopping = true; stopReason = r; console.log(`[STOP] ${r}`); } };
  process.on("SIGINT", () => stop("SIGINT"));
  const startWall = Date.now();
  const deadline = startWall + opts.maxRuntimeMin * 60_000;

  // balance guard
  if (opts.execute) {
    const [sb, fb] = await Promise.all([serpBalance(keys.serp), firecrawlBalance(keys.firecrawl)]);
    console.log(`[balance] SerpAPI ${sb ? sb.left + " left" : "?"} | Firecrawl ${fb ? fb.remaining + " credits" : "?"}`);
    if (sb && sb.left < 500) return console.error("[ABORT] SerpAPI < 500 searches (runaway-cost guard).");
  }

  function guard() {
    if (totals.costUsd >= opts.budgetUsd) return `budget ${opts.budgetUsd}`;
    if (totals.serp >= opts.maxSerp) return `max-serp ${opts.maxSerp}`;
    if (Date.now() >= deadline) return `runtime ${opts.maxRuntimeMin}min`;
    return null;
  }

  // Run one campus/pass with per-pass skip already decided by caller.
  async function runPass(campus, pass, hasProfs, elig) {
    const professors = (pass === "B") ? await db.loadProfessors(campus.id).catch(() => []) : [];
    let result = null, err = null;
    try { result = await harvestCampus(campus, { pass, professors, deferStatus: true, shouldStop: () => stopping || Date.now() >= deadline }, keys); }
    catch (e) { err = e?.message || String(e); }
    if (result) { totals.serp += result.serp; totals.firecrawl += result.firecrawl; totals.ai += result.ai; totals.costUsd += result.costUsd; }
    const st = await writeMergedStatus(campus, pass, result || { error: err, serp: 0, firecrawl: 0, ai: 0, costUsd: 0 }, elig, hasProfs);
    cp.done[`${campus.id}:${pass}`] = { at: new Date().toISOString(), status: st.overall, docs: result?.docsFound || 0, serp: result?.serp || 0 };
    saveCP(opts.checkpoint, cp);
    logLine(costLog, { ts: Date.now(), campus: campus.name, pass, ok: !!result, err, serp: result?.serp || 0, docs: result?.docsFound || 0, status: st.overall });
    if (pass === "A") runSummary.passA++; else runSummary.passB++;
    if (!result) runSummary.failures++;
    if (st.overall === "NEEDS_REVIEW") runSummary.review++;
    console.log(`[${pass}] ${campus.name} → ${st.overall} (${result?.docsFound ?? "-"} docs, ${result?.serp ?? 0} serp) [cum ${totals.serp} serp $${totals.costUsd.toFixed(2)}]`);
    return st;
  }

  // Process a set of campuses (both passes where eligible) with bounded concurrency.
  async function processQueue(queue, statusByCampus, profCounts) {
    let qp = 0;
    async function worker() {
      while (!stopping) {
        const g = guard(); if (g) { stop(g); return; }
        if (qp >= queue.length) return;
        const c = queue[qp++];
        const hasProfs = (profCounts.get(c.id) || 0) > 0;
        const elig = eligibility(c, statusByCampus.get(c.id), hasProfs);
        if (elig.a === "run" && !cp.done[`${c.id}:A`]) await runPass(c, "A", hasProfs, elig);
        if (stopping) return;
        const g2 = guard(); if (g2) { stop(g2); return; }
        if (elig.b === "run" && !cp.done[`${c.id}:B`]) await runPass(c, "B", hasProfs, elig);
      }
    }
    await Promise.all(Array.from({ length: opts.concurrency }, () => worker()));
  }

  // Snapshot: universe + status + professor counts.
  async function snapshot() {
    const universe = eligibleUniverse(await db.loadCampuses());
    const profCounts = await db.loadProfessorCounts();
    const statusRows = await pageStatus();
    const statusByCampus = new Map(statusRows.map((s) => [s.campus_id, s]));
    return { universe, profCounts, statusByCampus };
  }
  async function pageStatus() {
    const out = []; let off = 0; for (;;) { const r = await db.rest("GET", `course_intel_campus_status?select=campus_id,pass_a_status,pass_b_status,course_code,professor_candidates,status&order=campus_id.asc&limit=1000&offset=${off}`); out.push(...r); if (r.length < 1000) break; off += 1000; } return out;
  }

  function liveStatus(scope, universe, profCounts, statusByCampus) {
    const elig = universe.map((c) => ({ c, e: eligibility(c, statusByCampus.get(c.id), (profCounts.get(c.id) || 0) > 0) }));
    const waitCourse = elig.filter((x) => x.e.a === "waiting_course").length;
    const waitProfs = elig.filter((x) => x.e.b === "waiting_profs" && x.e.a !== "waiting_course").length;
    console.log(`\n=== COURSE INTEL — ${scope} ===`);
    console.log(`Pass A ran: ${runSummary.passA} | Pass B ran: ${runSummary.passB}`);
    console.log(`SERP: ${totals.serp} | Firecrawl: ${totals.firecrawl} | AI: ${totals.ai} | spend ≈ $${totals.costUsd.toFixed(2)} / ${opts.budgetUsd}`);
    console.log(`Waiting on course-code: ${waitCourse} | Waiting on professors: ${waitProfs}`);
    console.log(`Failures: ${runSummary.failures} | needs-review: ${runSummary.review}`);
  }

  // ── SEC PREFLIGHT ───────────────────────────────────────────────────────────
  if (!opts.skipSec) {
    const snap0 = await snapshot();
    const sec = resolveSEC(snap0.universe);
    console.log(`[sec] resolved ${sec.length}/16: ${sec.map((c) => c.name).join(", ")}`);
    if (opts.execute) await processQueue(sec.slice().sort(byPriority), snap0.statusByCampus, snap0.profCounts);
    const assess = await secAssessment(sec.map((c) => c.id));
    fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_SEC_PREFLIGHT.md"), assess.md);
    console.log(assess.md);
    liveStatus("SEC preflight", snap0.universe, snap0.profCounts, snap0.statusByCampus);
    if (!assess.pass) { stop(`SEC preflight FAILED gate: ${assess.reasons.join("; ")}`); }
    if (opts.secOnly) { console.log("[sec-only] stopping after SEC."); return finalReport(stopReason || "sec-only complete"); }
    if (stopping) return finalReport(stopReason);
  }

  // ── NATIONWIDE CATCH-UP + FOLLOW-BEHIND ──────────────────────────────────────
  let idlePolls = 0;
  while (!stopping) {
    const g = guard(); if (g) { stop(g); break; }
    const { universe, profCounts, statusByCampus } = await snapshot();
    // eligible now: any campus with a runnable pass not already done
    const runnable = universe.filter((c) => {
      if (cp.done[`${c.id}:A`] && cp.done[`${c.id}:B`]) return false;
      const e = eligibility(c, statusByCampus.get(c.id), (profCounts.get(c.id) || 0) > 0);
      return (e.a === "run" && !cp.done[`${c.id}:A`]) || (e.b === "run" && !cp.done[`${c.id}:B`]);
    }).sort(byPriority);

    // record the waiting backlog (cheap, only for rows not yet COMPLETE)
    for (const c of universe) {
      const s = statusByCampus.get(c.id);
      if (s && (s.status === "COMPLETE" || s.status === "NEEDS_REVIEW")) continue;
      const hasProfs = (profCounts.get(c.id) || 0) > 0;
      const e = eligibility(c, s, hasProfs);
      if ((e.a === "waiting_course" || e.b === "waiting_profs") && !runnable.includes(c)) {
        if (!s || s.status === "NOT_RUN") await writeWaitingStatus(c, e, hasProfs); // write-once-ish
      }
    }

    if (runnable.length) {
      idlePolls = 0;
      const batch = Number.isFinite(opts.limit) ? runnable.slice(0, opts.limit) : runnable;
      console.log(`[catchup] ${runnable.length} campuses have runnable passes; processing ${batch.length} (concurrency ${opts.concurrency})…`);
      if (opts.execute) await processQueue(batch, statusByCampus, profCounts);
      else { console.log("[dry] would process:", runnable.slice(0, 10).map((c) => c.name)); break; }
      liveStatus("nationwide catch-up", universe, profCounts, statusByCampus);
      if (Number.isFinite(opts.limit)) { stop(`--limit ${opts.limit} reached`); break; }
    } else {
      idlePolls++;
      liveStatus(`follow-behind (idle ${idlePolls})`, universe, profCounts, statusByCampus);
      // exit when nothing has been runnable for a long stretch (backfill done/idle)
      if (idlePolls >= opts.idleExitPolls) { stop(`caught up: no runnable passes for ${opts.idleExitPolls} polls (upstream idle)`); break; }
      if (!opts.execute) break;
      await sleep(opts.pollSec * 1000);
    }
  }
  return finalReport(stopReason || "loop exited");

  async function finalReport(reason) {
    saveCP(opts.checkpoint, cp);
    console.log(`\n=== FOLLOW-BEHIND DONE: ${reason} ===`);
    console.log(`Pass A: ${runSummary.passA} | Pass B: ${runSummary.passB} | failures: ${runSummary.failures}`);
    console.log(`SERP: ${totals.serp} | Firecrawl: ${totals.firecrawl} | AI: ${totals.ai} | spend ≈ $${totals.costUsd.toFixed(2)}`);
    // generate deliverables
    try {
      const { spawnSync } = await import("node:child_process");
      spawnSync(process.execPath, [path.join(HERE, "report.mjs"), "--costlog", costLog], { stdio: "inherit" });
    } catch (e) { console.error("[report] failed:", e?.message); }
  }
}

// ── SEC automated assessment (§10) ────────────────────────────────────────────
async function secAssessment(campusIds) {
  const idIn = `(${campusIds.join(",")})`;
  const docs = await db.rest("GET", `course_document?select=campus_id,source_domain,source_url,content_hash,document_type,value_tier&campus_id=in.${idIn}&limit=2000`).catch(() => []);
  const status = await db.rest("GET", `course_intel_campus_status?select=campus_id,status,documents_found,syllabi_found,study_guides_found,review_docs_found,schedules_found,serp_searches,last_error&campus_id=in.${idIn}&limit=100`).catch(() => []);
  const campuses = await db.rest("GET", `campuses?select=id,name,domains,email_domain,website_url&id=in.${idIn}&limit=100`).catch(() => []);
  const domById = new Map(campuses.map((c) => [c.id, parentDomain((Array.isArray(c.domains) ? c.domains[0] : c.domains) || c.email_domain || (c.website_url || "").replace(/^https?:\/\//, "").split("/")[0] || "")]));
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

  // wrong-campus attachment: a doc whose host is not on the campus's parent domain
  const offDomain = docs.filter((d) => { const pd = domById.get(d.campus_id); return pd && !(hostOf(d.source_url) === pd || hostOf(d.source_url).endsWith(`.${pd}`)); });
  // duplicate content across DIFFERENT campuses (same content_hash, different campus)
  const byHash = new Map(); for (const d of docs) if (d.content_hash) (byHash.get(d.content_hash) || byHash.set(d.content_hash, []).get(d.content_hash)).push(d.campus_id);
  const crossDupes = [...byHash.values()].filter((ids) => new Set(ids).size > 1).length;
  const missingProv = docs.filter((d) => !d.source_url || !d.source_domain).length;
  const totalDocs = docs.length;
  const withDocs = status.filter((s) => s.documents_found > 0).length;
  const syllabi = status.reduce((a, s) => a + (s.syllabi_found || 0), 0);
  const examReview = status.reduce((a, s) => a + (s.study_guides_found || 0) + (s.review_docs_found || 0), 0);
  const failures = status.filter((s) => s.status === "FAILED").length;
  const serp = status.reduce((a, s) => a + (s.serp_searches || 0), 0);
  const wrongCampusRate = totalDocs ? offDomain.length / totalDocs : 0;

  const reasons = [];
  if (wrongCampusRate > 0.02) reasons.push(`cross-campus attachment ${(wrongCampusRate * 100).toFixed(1)}% > 2%`);
  if (crossDupes > 3) reasons.push(`${crossDupes} content hashes shared across campuses`);
  if (missingProv > 0) reasons.push(`${missingProv} docs missing provenance`);
  if (failures > campusIds.length / 2) reasons.push(`${failures}/${campusIds.length} SEC campuses FAILED`);
  const pass = reasons.length === 0;

  const md = `# Course Intel — SEC Preflight Assessment

_${new Date().toISOString()} · ${campusIds.length} SEC campuses_

| metric | value |
|---|---|
| SEC campuses with ≥1 doc | ${withDocs}/${status.length} |
| total documents | ${totalDocs} |
| syllabi | ${syllabi} |
| exam/review docs | ${examReview} |
| **wrong-campus attachment** | ${offDomain.length} (${(wrongCampusRate * 100).toFixed(1)}%) |
| cross-campus duplicate hashes | ${crossDupes} |
| docs missing provenance | ${missingProv} |
| FAILED campuses | ${failures} |
| SERP used (SEC) | ${serp} |

**GATE: ${pass ? "PASS ✅ — expansion authorized" : "STOP ❌"}**${reasons.length ? "\n\nReasons: " + reasons.join("; ") : ""}

NO_RESULT is acceptable and not counted against precision. Expansion ${pass ? "proceeds automatically." : "halted; systemic issue must be resolved."}
`;
  return { pass, reasons, md };
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
