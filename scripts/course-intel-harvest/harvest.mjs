/**
 * Course Intel harvest — per-campus executor (Pass A campus+course, Pass B professor+course).
 * Reuses the tested pure utilities in ../course-intel/lib.mjs and mirrors the app's
 * discoverCourseDocuments / parseCourseDocument flow, writing to the SAME live tables.
 */
import {
  classifyDocument, parseExamChapterRanges, normalizeTextbook, scoreConfidence, freshnessWeight,
} from "../course-intel/lib.mjs";
import { serpSearch, firecrawlMarkdown, aiExtract, UNIT_COST } from "./providers.mjs";
import * as db from "./db.mjs";
import { campusDomain, parentDomain, introCode, introTitle } from "./universe.mjs";

const RESTRICTED_HOSTS =
  /(coursehero|scribd|chegg|quizlet|studocu|stuvia|coursesidekick|studysoup|docsity|stud9|studentebookhub|slideshare|yumpu|issuu|studdit|studypool|brainly|transtutors|numerade)\./i;

// Non-degree / continuing-ed portals of a university — NOT the credit-bearing
// Intro Financial Accounting course. (careertraining.* is usually an ed2go
// white-label selling vocational "Certified Bookkeeper / QuickBooks" certs.)
const NON_COLLEGE_HOST = /(careertraining|continuing|conted|\bce\b|ed2go|proed|workforce|pdp|osher|extension|k12|highschool)\./i;
const NON_COLLEGE_PATH = /\/(continuing-education|continuing_education|workforce|non-credit|noncredit|professional-development|proed|pdp|osher|ed2go|extension|community-education|youth|camps?)\//i;
// Vocational / non-college-accounting markers that must never be treated as the course.
const VOCATIONAL = /(bookkeeping for dummies|for dummies|certified bookkeeper|professional bookkeeping|medical billing|medical coding|medical office|dental|phlebotomy|\bnotary\b|real estate license|\bcpr\b|quickbooks (online|certificate|certification)|voucher|exam cost included)/i;
// Positive signal that a doc concerns a college accounting course.
const COLLEGE_ACCT = /\b(acc|acct|accy|acg|acctg|buac|busa|acnt|acci|bus)\s?-?\s?\d{3,4}\b|\b(financial accounting|principles of accounting|accounting principles|introductory accounting|intro(?:ductory)? (?:financial )?accounting)\b/i;

const CURRENT_YEAR = new Date().getUTCFullYear();
const MAX_PARSE_PER_CAMPUS = 4;   // fetch+AI on up to N tier-1/2 docs
const MAX_PROFS_PASS_B = 3;       // professors probed per campus in Pass B
const MAX_QUERIES_PASS_A = 6;

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const fileTypeOf = (u) => { const m = u.toLowerCase().match(/\.(pdf|docx?|pptx?|html?)(\?|$)/); return m ? m[1].replace("htm", "html") : "html"; };
const canon = (u) => (u || "").split("#")[0];
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** classify with the doc-type/tier from lib.mjs, then split study-guide vs review for tallies. */
function classify(title, url, snippet) {
  const { type, tier } = classifyDocument({ title, url, snippet });
  return { type, tier };
}

/** Is the URL on the campus's own domain (its host, or a subdomain of it)? */
function isOnCampusDomain(url, domain) {
  if (!domain) return false;
  const h = hostOf(url);
  return h === domain || h.endsWith(`.${domain}`);
}

/** Source quality: on the campus's own domain = HIGH, other .edu = MEDIUM, else LOW. */
function sourceQuality(url, domain) {
  if (isOnCampusDomain(url, domain)) return "HIGH";
  if (/\.edu$/.test(hostOf(url))) return "MEDIUM";
  return "LOW";
}

/**
 * Keep-decision for a discovered result. Precision-first to avoid contaminating
 * a campus with (a) another school's docs or (b) non-credit/vocational material.
 * Returns { keep, reason }.
 */
function keepDoc({ title, url, snippet, domain, code, hadCode }) {
  if (RESTRICTED_HOSTS.test(hostOf(url))) return { keep: false, reason: "restricted" };
  // On-campus-domain ONLY — never attribute an off-domain doc to this campus.
  if (!isOnCampusDomain(url, domain)) return { keep: false, reason: "off_domain" };
  // Drop the university's non-degree / continuing-ed portals.
  if (NON_COLLEGE_HOST.test(hostOf(url)) || NON_COLLEGE_PATH.test(url)) return { keep: false, reason: "non_college" };
  const hay = `${title} ${url} ${snippet}`;
  if (VOCATIONAL.test(hay)) return { keep: false, reason: "vocational" };
  // Trust site+code-scoped queries (the page matched the exact code). For broad
  // (code-less) queries, require an explicit college-accounting signal.
  if (!hadCode) {
    const codeRe = code ? new RegExp(`\\b${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s?")}\\b`, "i") : null;
    if (!COLLEGE_ACCT.test(hay) && !(codeRe && codeRe.test(hay))) return { keep: false, reason: "no_accounting_signal" };
  }
  return { keep: true };
}

function buildPassAQueries(domain, code, title, name) {
  if (!domain) return []; // no domain → cannot safely attribute; NO_RESULT + resolve_domain
  const q = [];
  const t = title || "financial accounting";
  if (code) {
    q.push({ q: `site:${domain} "${code}" syllabus`, hadCode: true });
    q.push({ q: `site:${domain} "${code}" "study guide"`, hadCode: true });
    q.push({ q: `site:${domain} "${code}" "exam 1"`, hadCode: true });
    q.push({ q: `site:${domain} "${code}" schedule filetype:pdf`, hadCode: true });
  } else {
    q.push({ q: `site:${domain} "${t}" syllabus`, hadCode: false });
    q.push({ q: `site:${domain} (ACC OR ACCT OR ACCY OR ACG) financial accounting syllabus`, hadCode: false });
    q.push({ q: `site:${domain} accounting "exam 1" study guide`, hadCode: false });
  }
  return q.slice(0, MAX_QUERIES_PASS_A);
}

function buildPassBQueries(domain, code, prof) {
  if (!domain) return [];
  const q = [];
  if (code) {
    q.push({ q: `site:${domain} "${prof}" "${code}" syllabus`, hadCode: true });
    q.push({ q: `site:${domain} "${prof}" "${code}" exam`, hadCode: true });
  } else {
    q.push({ q: `site:${domain} "${prof}" accounting syllabus`, hadCode: false });
  }
  return q;
}

/** Discover → classify → dedupe → persist docs for a set of queries. Mutates `found`, `seen`. */
async function runQueries(queries, keys, ctx, opts, found, seen, counters) {
  for (const item of queries) {
    if (ctx.shouldStop()) break;
    const q = typeof item === "string" ? item : item.q;
    const hadCode = typeof item === "string" ? false : !!item.hadCode;
    const { ok, results, status, error } = await serpSearch(keys.serp, q, 8);
    counters.serp++;
    if (!ok) { counters.serpErrors++; if (status === 429) counters.rateLimited = true; if (error) counters.lastError = error; continue; }
    for (const r of results) {
      const u = canon(r.link);
      if (!u || seen.has(u)) continue;
      seen.add(u);
      if (RESTRICTED_HOSTS.test(hostOf(u))) { counters.restricted++; seen.add(u); continue; }
      const cls = classify(r.title, u, r.snippet);
      const decision = keepDoc({ title: r.title, url: u, snippet: r.snippet, domain: opts.domain, code: opts.code, hadCode });
      if (!decision.keep) { if (decision.reason === "non_college" || decision.reason === "vocational") counters.filtered++; continue; }
      if (cls.tier === 4 && !/\.pdf/i.test(u)) continue; // drop generic catalog/identity noise
      found.push({ url: u, title: r.title, snippet: r.snippet, type: cls.type, tier: cls.tier, professor: opts.professor || null });
    }
    // progressive stop once we have a healthy pile of tier-1/2 docs
    if (found.filter((f) => f.tier <= 2).length >= (opts.stopAt ?? 6)) break;
  }
}

/**
 * Harvest one campus.
 * @param campus   campus row
 * @param ctx      { shouldStop(): bool, professors: [], pass: 'A'|'B'|'both' }
 * @param keys     { serp, firecrawl, ai }
 */
export async function harvestCampus(campus, ctx, keys) {
  // Search + attribution use the registrable parent domain so a business-school
  // subdomain campus still reaches the university's main syllabus/registrar host;
  // the unique course code in site+code queries keeps attribution tight.
  const domain = parentDomain(campusDomain(campus));
  const code = introCode(campus);
  const title = introTitle(campus);
  const name = campus.name || campus.canonical_name || "";
  const pass = ctx.pass || "both";
  const startedAt = new Date().toISOString();

  const counters = {
    serp: 0, serpErrors: 0, firecrawl: 0, ai: 0, restricted: 0, filtered: 0, rateLimited: false, lastError: null,
    docsFound: 0, highValue: 0, syllabi: 0, studyGuides: 0, reviewDocs: 0, schedules: 0, textbookDocs: 0,
  };
  const found = [];
  const seen = new Set();
  const profEvidence = [];
  let highestConf = null;
  const bumpConf = (lvl) => { const rank = { Low: 1, Medium: 2, High: 3 }; if (!highestConf || rank[lvl] > rank[highestConf]) highestConf = lvl; };

  // ── PASS A: campus + course ────────────────────────────────────────────────
  if (pass === "A" || pass === "both") {
    await runQueries(buildPassAQueries(domain, code, title, name), keys, ctx, { stopAt: 6, domain, code }, found, seen, counters);
  }

  // ── PASS B: professor + course (bounded) ───────────────────────────────────
  if ((pass === "B" || pass === "both") && domain) {
    const profs = rankProfessors(ctx.professors || []);
    for (const p of profs.slice(0, MAX_PROFS_PASS_B)) {
      if (ctx.shouldStop()) break;
      const before = found.length;
      await runQueries(buildPassBQueries(domain, code, p.name), keys, ctx, { professor: p.name, stopAt: found.filter(f => f.tier <= 2).length + 1, domain, code }, found, seen, counters);
      // SERP-level co-occurrence → POSSIBLE_INTRO1 (name near code in title/snippet)
      for (const f of found.slice(before)) {
        const hay = norm(`${f.title} ${f.snippet}`);
        if (code && f.professor && hay.includes(norm(p.name)) && (hay.includes(norm(code)) || f.tier <= 2)) {
          profEvidence.push(mkProfEvidence(campus, p, code, f, "POSSIBLE_INTRO1", null));
        }
      }
    }
  }

  // ── Persist discovered docs ────────────────────────────────────────────────
  for (const f of found) {
    const row = {
      campus_id: campus.id, professor_name: f.professor, course_code: code || null, course_family: "intro_1",
      document_type: f.type, value_tier: f.tier, title: (f.title || "").slice(0, 300),
      source_url: f.url, source_domain: hostOf(f.url), file_type: fileTypeOf(f.url),
      is_public_source: true, access: "public", processing_status: "discovered", discovered_by: "serp",
    };
    try { const doc = await db.upsertDocument(row); f.docId = doc?.id ?? null; counters.docsFound++; } catch (e) { counters.lastError = String(e.message || e); }
    if (f.tier === 1) counters.highValue++;
    tallyDoc(counters, f);
  }

  // ── Fetch + parse tier-1/2 docs (bounded), reusing parseCourseDocument flow ─
  const parseTargets = found.filter((f) => f.docId && f.tier <= 2).sort((a, b) => a.tier - b.tier).slice(0, MAX_PARSE_PER_CAMPUS);
  for (const f of parseTargets) {
    if (ctx.shouldStop()) break;
    const md = await firecrawlMarkdown(keys.firecrawl, f.url);
    counters.firecrawl++;
    if (!md) { try { await db.markDocument(f.docId, { processing_status: "error", last_checked: new Date().toISOString() }); } catch {} continue; }
    const h = hash(md);
    const ai = await aiExtract(keys.ai, md);
    counters.ai++;
    const exams = (ai?.exams?.length ? ai.exams : parseExamChapterRanges(md)).filter((e) => e?.chapters?.length);
    const year = ai?.year && Number.isFinite(+ai.year) ? +ai.year : null;
    const ageYears = year ? CURRENT_YEAR - year : null;
    const quality = sourceQuality(f.url, domain);

    const rows = [];
    for (const e of exams) {
      const conf = scoreConfidence({ explicitExamRange: true, professorSpecific: !!f.professor, ageYears }).level;
      bumpConf(conf);
      rows.push({
        course_document_id: f.docId, campus_id: campus.id, professor_name: f.professor, course_family: "intro_1",
        evidence_type: "exam_chapter_range", exam_label: String(e.label).toLowerCase(), exam_chapters: e.chapters,
        raw_text: `${e.label}: ch ${e.chapters.join(", ")}`, confidence: conf,
        effective_term: ai?.term ? `${ai.term} ${year ?? ""}`.trim() : null,
      });
    }
    let textbookId = null;
    if (ai?.textbook?.title) {
      const nt = normalizeTextbook({ title: ai.textbook.title, authors: ai.textbook.authors, publisher: ai.textbook.edition });
      try {
        const tb = await db.upsertTextbook({
          title: nt.canonicalTitle, authors: ai.textbook.authors ?? null, edition: ai.textbook.edition ?? null,
          edition_key: nt.editionKey, edition_confirmed: nt.editionConfirmed,
        });
        textbookId = tb?.id ?? null;
      } catch {}
      const tconf = nt.editionConfirmed ? "High" : "Medium";
      bumpConf(tconf);
      counters.textbookDocs++;
      rows.push({
        course_document_id: f.docId, campus_id: campus.id, professor_name: f.professor, course_family: "intro_1",
        evidence_type: "textbook_reference", textbook_ref: ai.textbook.title, edition_ref: ai.textbook.edition ?? null,
        raw_text: `${ai.textbook.title} ${ai.textbook.authors ?? ""} ${ai.textbook.edition ?? ""}`.trim().slice(0, 400),
        confidence: tconf,
      });
    }
    try {
      await db.replaceEvidence(f.docId, rows);
      await db.markDocument(f.docId, {
        processing_status: "parsed", content_hash: h, last_checked: new Date().toISOString(),
        last_changed: new Date().toISOString(), textbook_id: textbookId, term: ai?.term ?? null, year,
      });
    } catch (e) { counters.lastError = String(e.message || e); }

    // Instructor names → professor evidence, but ONLY from a doc that genuinely
    // looks like an accounting course document (has exam structure, a textbook, or
    // an accounting course title). This blocks names harvested from assessment /
    // e-learning / eval PDFs that merely list many staff.
    const courseDoc = /^(syllabus|study_guide|schedule|homework)$/.test(f.type);
    const docHasCourseStructure = exams.length > 0 || !!ai?.textbook?.title || COLLEGE_ACCT.test(String(ai?.course_title || ""));
    const instructors = (courseDoc && docHasCourseStructure && Array.isArray(ai?.instructors)) ? ai.instructors : [];
    for (const rawName of instructors) {
      const nm = String(rawName || "").trim();
      if (nm.length < 3 || nm.length > 80) continue;
      const recent = ageYears == null ? false : ageYears <= 1;
      // CONFIRMED needs an official (HIGH) recent source; else LIKELY. Low source never CONFIRMED.
      const state = quality === "HIGH" && recent ? "CONFIRMED_INTRO1" : "LIKELY_INTRO1";
      const match = matchProfessor(ctx.professors || [], nm);
      profEvidence.push(mkProfEvidence(campus, match ? { ...match, name: nm } : { name: nm, id: null }, code, f, state, { quality, term: ai?.term, year }));
    }
  }

  // ── Professor tallies + status write ───────────────────────────────────────
  const professorCandidates = (ctx.professors || []).length;
  const rmpConfirmed = (ctx.professors || []).filter((p) => introOneCountOf(p) >= 1).length;
  const docConfirmed = new Set(profEvidence.filter((e) => e.evidence_state === "CONFIRMED_INTRO1").map((e) => norm(e.professor_name))).size;
  const confirmedIntro1 = Math.max(rmpConfirmed, docConfirmed);

  // dedupe professor evidence rows on (name, state, url)
  const dedupEvidence = dedupeEvidence(profEvidence);
  try { await db.upsertProfessorEvidence(dedupEvidence); } catch (e) { counters.lastError = String(e.message || e); }

  const anyDocs = counters.docsFound > 0;
  const passAStatus = pass === "B" ? "NOT_RUN" : anyDocs ? "COMPLETE" : "NO_RESULT";
  const passBStatus = (pass === "A" || !domain) ? "NOT_RUN" : (ctx.professors || []).length ? (profEvidence.length ? "COMPLETE" : "NO_RESULT") : "NO_RESULT";
  const overall = counters.lastError && !anyDocs ? "FAILED" : anyDocs ? (highestConf === "High" ? "COMPLETE" : "NEEDS_REVIEW") : "NO_RESULT";

  const costUsd = counters.serp * UNIT_COST.serp + counters.firecrawl * UNIT_COST.firecrawl + counters.ai * UNIT_COST.ai;
  const requests = counters.serp + counters.firecrawl + counters.ai;

  const statusRow = {
    campus_id: campus.id, campus_name: name, state: campus.state || null, course_code: code || null,
    status: overall, pass_a_status: passAStatus, pass_b_status: passBStatus,
    started_at: startedAt, finished_at: new Date().toISOString(),
    serp_searches: counters.serp, firecrawl_fetches: counters.firecrawl, ai_parses: counters.ai,
    est_cost_usd: +costUsd.toFixed(4),
    documents_found: counters.docsFound, high_value_documents: counters.highValue,
    syllabi_found: counters.syllabi, study_guides_found: counters.studyGuides, review_docs_found: counters.reviewDocs,
    schedules_found: counters.schedules, textbook_docs_found: counters.textbookDocs,
    professor_candidates: professorCandidates, confirmed_intro1_professors: confirmedIntro1,
    highest_source_confidence: highestConf, restricted_docs_seen: counters.restricted,
    last_error: counters.lastError ? String(counters.lastError).slice(0, 400) : null,
    recommended_next_action: recommendNextAction({ anyDocs, code, domain, highestConf, professorCandidates, rateLimited: counters.rateLimited }),
  };
  // The follow-behind worker owns a MERGED, pass-preserving status write, so it
  // passes ctx.deferStatus to suppress this one-pass (clobbering) write.
  if (!ctx.deferStatus) {
    try { await db.upsertCampusStatus(statusRow); } catch (e) { counters.lastError = String(e.message || e); }
  }

  return {
    costUsd, requests, error: (!anyDocs && counters.lastError) ? counters.lastError : undefined,
    docsFound: counters.docsFound, highValue: counters.highValue, confirmedIntro1,
    serp: counters.serp, firecrawl: counters.firecrawl, ai: counters.ai, rateLimited: counters.rateLimited,
    status: overall, passAStatus, passBStatus, highestConf, professorCandidates,
    profEvidence: dedupEvidence, statusRow, domain, code, hasProfs: (ctx.professors || []).length > 0,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function tallyDoc(c, f) {
  const hay = `${f.title} ${f.url} ${f.snippet}`.toLowerCase();
  if (f.type === "syllabus") c.syllabi++;
  if (f.type === "study_guide") { if (/review|practice/.test(hay)) c.reviewDocs++; else c.studyGuides++; }
  if (f.type === "schedule") c.schedules++;
}
function introOneCountOf(p) {
  let j = p.rmp_target_course_counts_json;
  if (typeof j === "string") { try { j = JSON.parse(j); } catch { return 0; } }
  if (!j || typeof j !== "object") return 0;
  const n = Number(j.intro_1);
  return Number.isFinite(n) ? n : 0;
}
function rankProfessors(profs) {
  return profs
    .map((p) => ({ ...p, name: `${p.first_name || ""} ${p.last_name || ""}`.trim(), intro1: introOneCountOf(p) }))
    .filter((p) => p.name.length >= 3)
    .sort((a, b) => b.intro1 - a.intro1);
}
function matchProfessor(profs, name) {
  const n = norm(name);
  const parts = n.split(" ");
  const last = parts[parts.length - 1];
  return profs
    .map((p) => ({ p, full: norm(`${p.first_name || ""} ${p.last_name || ""}`), lastn: norm(p.last_name || "") }))
    .filter((x) => x.lastn && last && x.lastn === last && (x.full === n || n.includes(x.full) || x.full.includes(n) || parts[0] === norm(x.p.first_name || "")))
    .map((x) => ({ id: x.p.id, first_name: x.p.first_name, last_name: x.p.last_name }))[0] || null;
}
function mkProfEvidence(campus, prof, code, f, state, extra) {
  const quality = extra?.quality || sourceQuality(f.url, campusDomain(campus));
  const conf = state === "CONFIRMED_INTRO1" ? "High" : state === "LIKELY_INTRO1" ? "Medium" : "Low";
  return {
    campus_id: campus.id, professor_name: prof.name, lead_suggestion_id: prof.id || null, course_code: code || null,
    evidence_state: state, source_document_id: f.docId || null, source_url: f.url, source_domain: hostOf(f.url),
    source_quality: quality, term: extra?.term || null, year: extra?.year || null,
    raw_text: `${prof.name} — ${code || "intro accounting"} (${f.type})`.slice(0, 400), confidence: conf,
  };
}
function dedupeEvidence(rows) {
  const seen = new Set(); const out = [];
  for (const r of rows) { const k = `${norm(r.professor_name)}|${r.evidence_state}|${r.source_url}`; if (seen.has(k)) continue; seen.add(k); out.push(r); }
  return out;
}
function recommendNextAction({ anyDocs, code, domain, highestConf, professorCandidates, rateLimited }) {
  if (rateLimited) return "retry_later_rate_limited";
  if (!domain) return "resolve_campus_domain";
  if (!code) return "discover_course_code";
  if (!anyDocs) return "manual_review_no_public_docs";
  if (highestConf === "High") return "ready_for_mapping_review";
  if (!professorCandidates) return "run_professor_backfill_then_pass_b";
  return "human_review_medium_confidence";
}
