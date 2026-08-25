#!/usr/bin/env node
/**
 * Course Intel — campus TARGETING synthesis (read-only). Combines every signal we
 * have into one transparent, weighted score + tier + recommended action, so you can
 * decide which campuses to work this semester and in what order.
 * Writes CAMPUS_TARGETING.csv (ranked) + CAMPUS_TARGETING.json.
 * No student-facing maps touched.
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
const csvCell = (v) => { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (h, rows) => [h.join(","), ...rows.map((r) => h.map((k) => csvCell(r[k])).join(","))].join("\n") + "\n";
const isExam1 = (l) => /\b(exam|test)\s*0*1\b|\bexam\s*i\b|first/.test((l || "").toLowerCase());

async function main() {
  const status = await pageAll("course_intel_campus_status", "campus_id,campus_name,state,course_code,status,documents_found,high_value_documents,syllabi_found,textbook_docs_found,confirmed_intro1_professors,professor_candidates,highest_source_confidence", "", "campus_id.asc");
  const campuses = await pageAll("campuses", "id,name,state,active_roster,market_priority,priority_tier,is_sec", "&is_research_only=is.false");
  const cById = new Map(campuses.map((c) => [c.id, c]));
  // doc-confirmed professors per campus (RMP-independent)
  const profEv = await pageAll("professor_intro1_evidence", "campus_id,professor_name,evidence_state", "");
  const docConfirmed = {}; const docLikely = {};
  for (const p of profEv) {
    if (p.evidence_state === "CONFIRMED_INTRO1") (docConfirmed[p.campus_id] ||= new Set()).add((p.professor_name || "").toLowerCase());
    if (p.evidence_state === "LIKELY_INTRO1") (docLikely[p.campus_id] ||= new Set()).add((p.professor_name || "").toLowerCase());
  }
  // exam-1 chapter range per campus (do we know what's on their Exam 1?)
  const ev = await pageAll("course_evidence", "campus_id,evidence_type,exam_label,exam_chapters", "&course_family=eq.intro_1&evidence_type=eq.exam_chapter_range");
  const exam1Range = {};
  for (const e of ev) { if (!isExam1(e.exam_label)) continue; const chs = (e.exam_chapters || []).map(Number).filter(Number.isFinite); if (chs.length && !exam1Range[e.campus_id]) exam1Range[e.campus_id] = `${Math.min(...chs)}-${Math.max(...chs)}`; }

  const rows = status.map((s) => {
    const c = cById.get(s.campus_id) || {};
    const docConf = docConfirmed[s.campus_id]?.size || 0;
    const docLik = docLikely[s.campus_id]?.size || 0;
    const live = c.active_roster === "sec";
    const hasCode = !!s.course_code;
    const hasExam1 = !!exam1Range[s.campus_id];
    const hasTextbook = (s.textbook_docs_found || 0) > 0;
    const hasSyllabus = (s.syllabi_found || 0) > 0;
    const mkt = Number(c.priority_tier) || Number(c.market_priority) || null;

    // ── transparent weighted score ─────────────────────────────────────────
    let score = 0;
    if (live) score += 30;                       // already live to students = act now
    if (docConf > 0) score += 25;                // RMP-independent professor truth
    else if (docLik > 0) score += 10;
    if (hasExam1) score += 20;                   // we know what's on their Exam 1
    if (hasCode) score += 10;                    // course identity resolved
    if (hasTextbook) score += 8;                 // textbook known
    if (hasSyllabus) score += 5;
    score += Math.min(5, (s.high_value_documents || 0)) * 1;
    if (mkt && mkt <= 2) score += 12;            // high market priority
    else if (mkt && mkt <= 4) score += 6;
    if (s.status === "COMPLETE") score += 5;

    const tier = score >= 65 ? "A" : score >= 40 ? "B" : score >= 20 ? "C" : "D";
    let action;
    if (live && docConf > 0 && hasExam1) action = "TARGET NOW — live, prof + exam map known";
    else if (docConf > 0 && hasExam1) action = "HIGH — confirmed prof + exam map; ready for outreach";
    else if (docConf > 0) action = "confirmed prof; parse/verify exam map next";
    else if (hasExam1 && hasCode) action = "exam map known; find professor (Pass B)";
    else if (hasCode) action = "course known; needs prof + exam evidence";
    else if (s.documents_found > 0) action = "thin evidence; human review";
    else action = "dark — needs domain/course-code backfill";

    return {
      campus: s.campus_name || c.name, state: s.state || c.state, course_code: s.course_code || "",
      live_picker: live ? "Y" : "", doc_confirmed_profs: docConf, doc_likely_profs: docLik,
      exam1_chapters: exam1Range[s.campus_id] || "", textbook: hasTextbook ? "Y" : "", syllabus: hasSyllabus ? "Y" : "",
      documents: s.documents_found || 0, high_value: s.high_value_documents || 0,
      market_priority: mkt || "", intel_status: s.status, target_score: score, target_tier: tier, recommended_action: action,
    };
  }).sort((a, b) => b.target_score - a.target_score || b.doc_confirmed_profs - a.doc_confirmed_profs);

  const H = ["target_tier", "target_score", "campus", "state", "course_code", "live_picker", "doc_confirmed_profs", "doc_likely_profs", "exam1_chapters", "textbook", "syllabus", "documents", "high_value", "market_priority", "intel_status", "recommended_action"];
  fs.writeFileSync(path.join(ROOT, "CAMPUS_TARGETING.csv"), toCsv(H, rows));
  const tierCount = {}; for (const r of rows) tierCount[r.target_tier] = (tierCount[r.target_tier] || 0) + 1;
  const summary = {
    generated_at: new Date().toISOString(), total: rows.length, by_tier: tierCount,
    live_picker_campuses: rows.filter((r) => r.live_picker).length,
    with_doc_confirmed_prof: rows.filter((r) => r.doc_confirmed_profs > 0).length,
    with_exam1_map: rows.filter((r) => r.exam1_chapters).length,
    with_both_prof_and_exam1: rows.filter((r) => r.doc_confirmed_profs > 0 && r.exam1_chapters).length,
    top_25: rows.slice(0, 25),
  };
  fs.writeFileSync(path.join(ROOT, "CAMPUS_TARGETING.json"), JSON.stringify(summary, null, 2));
  console.log("[targeting] wrote CAMPUS_TARGETING.csv + .json");
  console.log(JSON.stringify({ by_tier: tierCount, live: summary.live_picker_campuses, docConfProf: summary.with_doc_confirmed_prof, exam1: summary.with_exam1_map, both: summary.with_both_prof_and_exam1 }, null, 2));
  console.log("TOP 20:"); rows.slice(0, 20).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [${r.target_tier}${r.target_score}] ${r.campus} (${r.state}) code=${r.course_code || "-"} conf=${r.doc_confirmed_profs} exam1=${r.exam1_chapters || "-"} ${r.live_picker ? "LIVE" : ""}`));
}
main().catch((e) => { console.error("[targeting:fatal]", e); process.exit(1); });
