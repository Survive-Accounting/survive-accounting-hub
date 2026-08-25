#!/usr/bin/env node
/**
 * Course Intel — READ-ONLY morning audit. No writes, no mutations.
 * Pulls the live tables, computes aggregations, writes MORNING_AUDIT_COURSE_INTEL.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rest } from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const enc = encodeURIComponent;

async function pageAll(table, select, filter = "", order = "id.asc") {
  const out = []; let off = 0;
  for (;;) { const r = await rest("GET", `${table}?select=${enc(select)}${filter}&order=${order}&limit=1000&offset=${off}`); out.push(...r); if (r.length < 1000) break; off += 1000; }
  return out;
}
async function count(table, filter = "") {
  const r = await rest("GET", `${table}?select=id${filter}&limit=1`);
  // use content-range via a HEAD-like call
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=id${filter}&limit=1`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact", Range: "0-0" } });
  const cr = res.headers.get("content-range") || "/0"; return parseInt(cr.split("/")[1] || "0", 10);
}
const inc = (o, k) => (o[k] = (o[k] || 0) + 1);

async function main() {
  const status = await pageAll("course_intel_campus_status", "campus_id,campus_name,state,status,pass_a_status,pass_b_status,course_code,documents_found,high_value_documents,syllabi_found,study_guides_found,review_docs_found,schedules_found,textbook_docs_found,professor_candidates,confirmed_intro1_professors,highest_source_confidence,serp_searches,firecrawl_fetches,ai_parses,restricted_docs_seen,est_cost_usd", "", "campus_id.asc");
  const docs = await pageAll("course_document", "id,campus_id,course_code,professor_name,document_type,value_tier,term,year,processing_status,textbook_id,source_domain", "&course_family=eq.intro_1", "id.asc");
  const evid = await pageAll("course_evidence", "id,campus_id,evidence_type,exam_label,exam_chapters,textbook_ref,edition_ref,confidence,effective_term", "&course_family=eq.intro_1", "id.asc");
  const prof = await pageAll("professor_intro1_evidence", "id,campus_id,professor_name,evidence_state,source_quality,source_domain,confidence,term,year", "", "id.asc");
  const textbooks = await pageAll("textbooks", "id,title,authors,edition,edition_key,edition_confirmed", "", "id.asc");
  const mappings = await pageAll("textbook_chapter_topic_mapping", "id,state,confidence,survive_topic_label,problem_type", "", "id.asc");
  const profTotal = await count("campus_lead_suggestions", "&lead_type=eq.professor");
  const tocChapters = await count("textbook_chapters");

  // ── executive ──
  const statusBreak = {}; for (const s of status) inc(statusBreak, s.status);
  const passA = {}; const passB = {}; for (const s of status) { inc(passA, s.pass_a_status); inc(passB, s.pass_b_status); }
  const attempted = status.filter((s) => !["WAITING_FOR_COURSE", "WAITING_FOR_PROFESSORS", "NOT_RUN"].includes(s.status)).length;
  const completed = status.filter((s) => s.status === "COMPLETE").length;
  const withCode = status.filter((s) => s.course_code).length;

  // ── document yield ──
  const byType = {}; const byTier = {}; const byProc = {};
  for (const d of docs) { inc(byType, d.document_type); inc(byTier, "tier" + d.value_tier); inc(byProc, d.processing_status); }
  const restrictedSeen = status.reduce((a, s) => a + (s.restricted_docs_seen || 0), 0);

  // ── coverage ──
  const evByCampus = {}; for (const e of evid) (evByCampus[e.campus_id] ||= []).push(e);
  const campusesWithEvidence = new Set(evid.map((e) => e.campus_id)).size;
  const withUsefulDoc = status.filter((s) => (s.syllabi_found + s.study_guides_found + s.review_docs_found + s.schedules_found) > 0).length;
  const withTextbookEv = new Set(evid.filter((e) => e.evidence_type === "textbook_reference").map((e) => e.campus_id)).size;
  const isExam1 = (lbl) => /\b(exam|test)\s*0*1\b|\bfirst\s+(exam|test)\b/i.test(lbl || "");
  const exam1Ev = evid.filter((e) => e.evidence_type === "exam_chapter_range" && isExam1(e.exam_label));
  const withExam1 = new Set(exam1Ev.map((e) => e.campus_id)).size;
  const withProfEv = new Set(prof.map((p) => p.campus_id)).size;
  const withExamDate = 0; // exam DATES were not extracted this run (schema captured term/year only)

  const topCampuses = [...status].sort((a, b) => (b.high_value_documents - a.high_value_documents) || (b.documents_found - a.documents_found)).slice(0, 12)
    .map((s) => ({ campus: s.campus_name, state: s.state, docs: s.documents_found, highValue: s.high_value_documents, syllabi: s.syllabi_found, status: s.status, conf: s.highest_source_confidence }));
  const zeroDocHighPriority = status.filter((s) => s.documents_found === 0).length;

  // ── professor evidence ──
  const profState = {}; for (const p of prof) inc(profState, p.evidence_state);
  const confirmedBySource = {}; for (const p of prof.filter((p) => p.evidence_state === "CONFIRMED_INTRO1")) inc(confirmedBySource, p.source_quality || "?");
  const distinctProfs = new Set(prof.map((p) => `${p.campus_id}|${(p.professor_name || "").toLowerCase()}`)).size;
  // contradictions: same campus+prof with both a CONFIRMED/LIKELY and only-POSSIBLE across rows (weak proxy)
  const profByKey = {}; for (const p of prof) (profByKey[`${p.campus_id}|${(p.professor_name || "").toLowerCase()}`] ||= new Set()).add(p.evidence_state);
  const multiState = Object.values(profByKey).filter((s) => s.size > 1).length;

  // ── Exam 1 intelligence ──
  const chapFreq = {}; const rangeFreq = {}; const exam1Campuses = new Set();
  for (const e of exam1Ev) {
    exam1Campuses.add(e.campus_id);
    const chs = Array.isArray(e.exam_chapters) ? e.exam_chapters : [];
    for (const c of chs) inc(chapFreq, c);
    if (chs.length) { const key = `${Math.min(...chs)}-${Math.max(...chs)}`; inc(rangeFreq, key); }
  }
  const nExam1 = exam1Campuses.size;
  const chapterPattern = Object.entries(chapFreq).map(([ch, n]) => ({ chapter: +ch, campuses: n, pct: nExam1 ? +(100 * n / nExam1).toFixed(0) : 0 })).sort((a, b) => a.chapter - b.chapter);
  const rangePattern = Object.entries(rangeFreq).map(([r, n]) => ({ range: r, campuses: n })).sort((a, b) => b.campuses - a.campuses);
  // also all exam labels distribution (to see coverage across exams)
  const examLabelFreq = {}; for (const e of evid.filter((e) => e.evidence_type === "exam_chapter_range")) inc(examLabelFreq, (e.exam_label || "").replace(/\s+/g, " ").trim());

  // ── textbook intelligence ──
  const tbRefs = evid.filter((e) => e.evidence_type === "textbook_reference");
  const tbFreq = {}; for (const e of tbRefs) inc(tbFreq, (e.textbook_ref || "").trim());
  const tbTop = Object.entries(tbFreq).map(([t, n]) => ({ title: t, mentions: n })).sort((a, b) => b.mentions - a.mentions).slice(0, 15);
  const editionsConfirmed = textbooks.filter((t) => t.edition_confirmed).length;

  // ── search performance ──
  const serp = status.reduce((a, s) => a + (s.serp_searches || 0), 0);
  const fc = status.reduce((a, s) => a + (s.firecrawl_fetches || 0), 0);
  const ai = status.reduce((a, s) => a + (s.ai_parses || 0), 0);
  const cost = status.reduce((a, s) => a + Number(s.est_cost_usd || 0), 0);
  const usefulDocs = docs.filter((d) => d.value_tier <= 2).length;

  // ── mapping safety ──
  const propByConf = {}; for (const e of exam1Ev) inc(propByConf, e.confidence || "?");
  const mapState = {}; for (const m of mappings) inc(mapState, m.state);

  const out = {
    generated_at: new Date().toISOString(),
    executive: {
      overall: "PARTIAL", sec_preflight: "PASS",
      pass_a_status: passA, pass_b_status: passB, status_breakdown: statusBreak,
      campuses_total: status.length, campuses_attempted: attempted, campuses_completed: completed,
      campuses_with_code: withCode, professors_researched_total: profTotal,
      professors_in_pass_b_candidate_pool: status.reduce((a, s) => a + (s.professor_candidates || 0), 0),
    },
    document_yield: {
      by_type: byType, by_tier: byTier, by_processing_status: byProc,
      unique_documents: docs.length, parsed: byProc.parsed || 0, discovered_unparsed: byProc.discovered || 0,
      failed_fetches: byProc.error || 0, restricted_rejected_seen: restrictedSeen,
    },
    coverage: {
      campuses_with_course_evidence: campusesWithEvidence, campuses_with_useful_doc: withUsefulDoc,
      campuses_with_exam1_evidence: withExam1, campuses_with_professor_evidence: withProfEv,
      campuses_with_textbook_evidence: withTextbookEv, campuses_with_exam_date_evidence: withExamDate,
      campuses_zero_docs: zeroDocHighPriority, top_campuses: topCampuses,
    },
    professor_evidence: {
      by_state: profState, distinct_professors: distinctProfs, confirmed_by_source_quality: confirmedBySource,
      professors_with_multiple_states: multiState,
    },
    exam1_intelligence: {
      campuses_with_exam1_ranges: nExam1, chapter_frequency: chapterPattern,
      range_frequency: rangePattern, exam_label_distribution: examLabelFreq,
    },
    exam_timing: { usable_exam1_dates: 0, estimated_windows: 0, note: "exam DATES not extracted this run; AI schema captured term/year only" },
    textbook_intelligence: {
      distinct_textbook_rows: textbooks.length, editions_confirmed: editionsConfirmed,
      toc_chapter_rows: tocChapters, top_textbooks_by_mention: tbTop, textbook_reference_evidence_rows: tbRefs.length,
    },
    search_performance: { serp_searches: serp, firecrawl_fetches: fc, ai_parses: ai, est_cost_usd: +cost.toFixed(2), useful_docs_tier12: usefulDocs, useful_yield_per_serp: serp ? +(usefulDocs / serp).toFixed(2) : 0 },
    mapping_safety: { exam1_proposals_by_confidence: propByConf, textbook_topic_mappings_by_state: mapState, total_exam_range_evidence: evid.filter((e) => e.evidence_type === "exam_chapter_range").length },
  };
  fs.writeFileSync(path.join(ROOT, "MORNING_AUDIT_COURSE_INTEL.json"), JSON.stringify(out, null, 2));
  console.log("[audit] wrote MORNING_AUDIT_COURSE_INTEL.json");
  console.log(JSON.stringify({ exec: out.executive, cov: out.coverage.campuses_with_exam1_evidence, exam1: out.exam1_intelligence.chapter_frequency, ranges: out.exam1_intelligence.range_frequency.slice(0, 8), profState: out.professor_evidence.by_state, tbTop: out.textbook_intelligence.top_textbooks_by_mention.slice(0, 8), types: out.document_yield.by_type }, null, 2));
}
main().catch((e) => { console.error("[audit:fatal]", e); process.exit(1); });
