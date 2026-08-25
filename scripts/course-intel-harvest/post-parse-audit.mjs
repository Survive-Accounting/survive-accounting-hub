#!/usr/bin/env node
/**
 * Course Intel — POST-PARSE read-only audit. No writes.
 * Recomputes Exam-1 / professor / textbook coverage after the parse pass, plus the
 * new signals: exam dates (+ days_until_exam_1), explicit topics, reclassification.
 * Writes COURSE_INTEL_POST_PARSE.json + COURSE_INTEL_TEXTBOOK_TOC_WORKLIST.json/csv.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rest } from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const enc = encodeURIComponent;
const TODAY = new Date("2026-08-25T00:00:00Z");
const inc = (o, k) => (o[k] = (o[k] || 0) + 1);
async function pageAll(table, select, filter = "", order = "id.asc") {
  const out = []; let off = 0;
  for (;;) { const r = await rest("GET", `${table}?select=${enc(select)}${filter}&order=${order}&limit=1000&offset=${off}`); out.push(...r); if (r.length < 1000) break; off += 1000; }
  return out;
}
const csv = (rows, headers) => [headers.join(","), ...rows.map((r) => headers.map((h) => { const v = r[h] == null ? "" : String(r[h]); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(","))].join("\n") + "\n";

async function main() {
  const status = await pageAll("course_intel_campus_status", "campus_id,campus_name,state,status,course_code,documents_found,syllabi_found,study_guides_found,exam_1_date,exam_1_date_confidence,exam_1_date_term,exam_1_date_source_url", "", "campus_id.asc");
  const docs = await pageAll("course_document", "id,campus_id,document_type,value_tier,processing_status,textbook_id", "&course_family=eq.intro_1", "id.asc");
  const evid = await pageAll("course_evidence", "id,campus_id,evidence_type,exam_label,exam_chapters,textbook_ref,edition_ref,confidence,raw_text,effective_term", "&course_family=eq.intro_1", "id.asc");
  const prof = await pageAll("professor_intro1_evidence", "id,campus_id,professor_name,evidence_state,source_quality", "", "id.asc");
  const textbooks = await pageAll("textbooks", "id,title,authors,edition,edition_key,edition_confirmed", "", "id.asc");

  // reclassification / processing
  const byType = {}, byProc = {}; for (const d of docs) { inc(byType, d.document_type); inc(byProc, d.processing_status); }

  // exam-1 chapter analysis (now richer)
  const isExam1 = (l) => /\b(exam|test)\s*0*1\b|\bfirst\s+(exam|test)\b|\bexam\s*i\b/i.test(l || "");
  const exam1 = evid.filter((e) => e.evidence_type === "exam_chapter_range" && isExam1(e.exam_label));
  const exam1Campuses = new Set(exam1.map((e) => e.campus_id));
  const chapFreq = {}, rangeFreq = {};
  for (const e of exam1) { const chs = (e.exam_chapters || []).map(Number).filter(Number.isFinite); for (const c of chs) inc(chapFreq, c); if (chs.length) inc(rangeFreq, `${Math.min(...chs)}-${Math.max(...chs)}`); }
  const nE1 = exam1Campuses.size;
  const chapterPattern = Object.entries(chapFreq).map(([c, n]) => ({ chapter: +c, campuses: n, pct: nE1 ? +(100 * n / nE1).toFixed(0) : 0 })).sort((a, b) => a.chapter - b.chapter);
  const rangePattern = Object.entries(rangeFreq).map(([r, n]) => ({ range: r, campuses: n })).sort((a, b) => b.campuses - a.campuses);

  // exam dates
  const withDate = status.filter((s) => s.exam_1_date);
  const dated = withDate.map((s) => { const d = new Date(s.exam_1_date + "T00:00:00Z"); const days = Math.round((d - TODAY) / 86400000); return { campus: s.campus_name, state: s.state, date: s.exam_1_date, term: s.exam_1_date_term, conf: s.exam_1_date_confidence, days_until: days, future: days >= 0 }; });
  const futureDates = dated.filter((x) => x.future);
  const dateConf = {}; for (const s of withDate) inc(dateConf, s.exam_1_date_confidence || "?");

  // topic signals (explicit)
  const topicRows = evid.filter((e) => e.evidence_type === "topic_signal");
  const topicFreq = {}; for (const e of topicRows) inc(topicFreq, (e.raw_text || "").toLowerCase().trim());
  const topTopics = Object.entries(topicFreq).map(([t, n]) => ({ topic: t, mentions: n })).sort((a, b) => b.mentions - a.mentions).slice(0, 30);

  // professor + textbook coverage
  const profState = {}; for (const p of prof) inc(profState, p.evidence_state);
  const distinctProfs = new Set(prof.map((p) => `${p.campus_id}|${(p.professor_name || "").toLowerCase()}`)).size;
  const tbRefs = evid.filter((e) => e.evidence_type === "textbook_reference");
  const tbByTitle = {}; const tbCampuses = {};
  for (const e of tbRefs) { const t = (e.textbook_ref || "").trim(); if (!t) continue; inc(tbByTitle, t); (tbCampuses[t] ||= new Set()).add(e.campus_id); }
  const VOCAB_NOISE = /(for dummies|income taxation|small business|intermediate)/i;
  const tocWorklist = Object.entries(tbByTitle).map(([title, mentions]) => ({ title, mentions, campuses: tbCampuses[title].size, likely_noise: VOCAB_NOISE.test(title) }))
    .sort((a, b) => b.campuses - a.campuses || b.mentions - a.mentions).slice(0, 30);

  const out = {
    generated_at: new Date().toISOString(),
    processing: { by_processing_status: byProc, by_document_type: byType, total_docs: docs.length,
      parsed: byProc.parsed || 0, still_discovered: byProc.discovered || 0, errors: byProc.error || 0, skipped: byProc.skipped || 0 },
    exam1: { campuses_with_ranges: nE1, chapter_frequency: chapterPattern, range_frequency: rangePattern },
    exam_dates: { campuses_with_exam1_date: withDate.length, future_dates: futureDates.length, past_dates: dated.length - futureDates.length,
      by_confidence: dateConf, future_list: futureDates.sort((a, b) => a.days_until - b.days_until).slice(0, 40), sample_all: dated.slice(0, 40) },
    topics: { explicit_topic_evidence_rows: topicRows.length, top_topics: topTopics },
    professors: { by_state: profState, distinct: distinctProfs, campuses_with_professor_evidence: new Set(prof.map((p) => p.campus_id)).size },
    textbooks: { distinct_rows: textbooks.length, editions_confirmed: textbooks.filter((t) => t.edition_confirmed).length,
      reference_rows: tbRefs.length, campuses_with_textbook: new Set(tbRefs.map((e) => e.campus_id)).size },
    coverage: { campuses_with_useful_doc: status.filter((s) => (s.syllabi_found + s.study_guides_found) > 0).length,
      campuses_with_exam1_evidence: nE1, campuses_with_any_evidence: new Set(evid.map((e) => e.campus_id)).size },
    toc_worklist: tocWorklist,
  };
  fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_POST_PARSE.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_TEXTBOOK_TOC_WORKLIST.json"), JSON.stringify(tocWorklist, null, 2));
  fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_TEXTBOOK_TOC_WORKLIST.csv"), csv(tocWorklist, ["title", "campuses", "mentions", "likely_noise"]));
  console.log("[post-parse] wrote COURSE_INTEL_POST_PARSE.json + TOC worklist");
  console.log(JSON.stringify({ proc: out.processing.by_processing_status, exam1_campuses: nE1, chapters: chapterPattern, ranges: rangePattern.slice(0, 6), dates: out.exam_dates, topics: topTopics.slice(0, 12), profs: profState, toc: tocWorklist.slice(0, 10) }, null, 2));
}
main().catch((e) => { console.error("[post-parse:fatal]", e); process.exit(1); });
