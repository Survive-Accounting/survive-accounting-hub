#!/usr/bin/env node
/**
 * Course Intel harvest — morning deliverables generator.
 * Reads the live tables (status, documents, evidence) + the run checkpoint/costlog
 * and writes the CSVs + summary markdown into the worktree root.
 *
 *   node scripts/course-intel-harvest/report.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rest } from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const enc = encodeURIComponent;

const csvCell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (headers, rows) => [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n";

async function pageAll(table, select, filter = "") {
  const out = []; let offset = 0; const limit = 1000;
  for (;;) {
    const rows = await rest("GET", `${table}?select=${enc(select)}${filter}&order=campus_id.asc&limit=${limit}&offset=${offset}`);
    out.push(...rows); if (rows.length < limit) break; offset += limit;
  }
  return out;
}

function readCostlog() {
  const f = path.join(HERE, ".harvest-checkpoint.json.costlog.jsonl");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

async function main() {
  console.log("[report] reading live tables…");
  const status = await pageAll("course_intel_campus_status", "*");
  const docs = await pageAll("course_document", "id,campus_id,course_code,professor_name,document_type,value_tier,title,source_url,source_domain,file_type,term,year,processing_status,content_hash,first_seen", "&course_family=eq.intro_1");
  const evid = await pageAll("professor_intro1_evidence", "*");
  const examEvid = await pageAll("course_evidence", "campus_id,evidence_type,exam_label,exam_chapters,textbook_ref,edition_ref,confidence", "&course_family=eq.intro_1");

  // campus name lookup
  const campusIds = [...new Set([...status, ...docs, ...evid].map((r) => r.campus_id))];
  const nameById = {};
  for (let i = 0; i < campusIds.length; i += 200) {
    const chunk = campusIds.slice(i, i + 200);
    const rows = await rest("GET", `campuses?select=id,name,state&id=in.(${chunk.join(",")})`);
    for (const r of rows) nameById[r.id] = { name: r.name, state: r.state };
  }
  const cname = (id) => nameById[id]?.name || "";
  const cstate = (id) => nameById[id]?.state || "";

  // ── COURSE_INTEL_CAMPUS_STATUS.csv ─────────────────────────────────────────
  const statusHeaders = ["campus_id", "campus", "state", "course_code", "professor_candidates", "confirmed_intro1_professors", "documents_found", "syllabi_found", "study_guides_found", "review_docs_found", "schedules_found", "textbook_docs_found", "highest_source_confidence", "status", "last_error", "recommended_next_action"];
  const statusRows = status.map((s) => ({ ...s, campus: s.campus_name || cname(s.campus_id), state: s.state || cstate(s.campus_id) }));
  fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_CAMPUS_STATUS.csv"), toCsv(statusHeaders, statusRows));

  // ── COURSE_INTEL_DOCUMENTS.csv ─────────────────────────────────────────────
  const docHeaders = ["document_id", "campus_id", "campus", "state", "course_code", "professor_name", "document_type", "value_tier", "title", "source_url", "source_domain", "file_type", "term", "year", "processing_status", "content_hash", "first_seen"];
  const docRows = docs.map((d) => ({ document_id: d.id, campus: cname(d.campus_id), state: cstate(d.campus_id), ...d }));
  fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_DOCUMENTS.csv"), toCsv(docHeaders, docRows));

  // ── INTRO1_PROFESSOR_EVIDENCE.csv ──────────────────────────────────────────
  const evHeaders = ["campus_id", "campus", "state", "professor_name", "evidence_state", "course_code", "source_quality", "confidence", "source_url", "source_domain", "term", "year"];
  const evRows = evid.map((e) => ({ ...e, campus: cname(e.campus_id), state: cstate(e.campus_id) }));
  fs.writeFileSync(path.join(ROOT, "INTRO1_PROFESSOR_EVIDENCE.csv"), toCsv(evHeaders, evRows));

  // ── COURSE_INTEL_REVIEW_QUEUE.csv ──────────────────────────────────────────
  const examByCampus = {}; const tbByCampus = {};
  for (const e of examEvid) {
    if (e.evidence_type === "exam_chapter_range") (examByCampus[e.campus_id] ||= []).push(e);
    if (e.evidence_type === "textbook_reference") (tbByCampus[e.campus_id] ||= new Set()).add(`${e.textbook_ref}|${e.edition_ref || ""}`);
  }
  const evStateByCampus = {};
  for (const e of evid) ((evStateByCampus[e.campus_id] ||= {})[e.evidence_state] = (evStateByCampus[e.campus_id]?.[e.evidence_state] || 0) + 1);

  const queue = [];
  for (const s of status) {
    const id = s.campus_id, campus = s.campus_name || cname(id), state = s.state || cstate(id);
    const editions = tbByCampus[id] ? [...tbByCampus[id]] : [];
    if (editions.length > 1) queue.push({ campus_id: id, campus, state, priority: 1, reason: "multiple_textbook_editions", detail: editions.join(" ; "), status: s.status });
    if ((examByCampus[id] || []).length) queue.push({ campus_id: id, campus, state, priority: 2, reason: "exam_mapping_needs_approval", detail: (examByCampus[id]).map((x) => `${x.exam_label}:[${(x.exam_chapters || []).join(",")}]`).join(" "), status: s.status });
    if (!s.course_code) queue.push({ campus_id: id, campus, state, priority: 3, reason: "ambiguous_course_identity_no_code", detail: s.recommended_next_action || "", status: s.status });
    if (s.status === "NO_RESULT" && (s.professor_candidates > 0 || s.state)) queue.push({ campus_id: id, campus, state, priority: 4, reason: "high_value_no_result", detail: `profs=${s.professor_candidates}`, status: s.status });
    const conflicting = evStateByCampus[id] && evStateByCampus[id]["CONFIRMED_INTRO1"] && Object.keys(evStateByCampus[id]).length > 1;
    if (conflicting) queue.push({ campus_id: id, campus, state, priority: 1, reason: "conflicting_professor_evidence", detail: JSON.stringify(evStateByCampus[id]), status: s.status });
  }
  queue.sort((a, b) => a.priority - b.priority);
  const qHeaders = ["priority", "campus_id", "campus", "state", "reason", "detail", "status"];
  fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_REVIEW_QUEUE.csv"), toCsv(qHeaders, queue));

  // ── COURSE_INTEL_OVERNIGHT_SUMMARY.md ──────────────────────────────────────
  const costlog = readCostlog();
  const okRuns = costlog.filter((r) => r.ok);
  const totalSerp = okRuns.reduce((a, r) => a + (r.serp || 0), 0);
  const totalFc = okRuns.reduce((a, r) => a + (r.firecrawl || 0), 0);
  const totalAi = okRuns.reduce((a, r) => a + (r.ai || 0), 0);
  const totalCost = okRuns.reduce((a, r) => a + (r.costUsd || 0), 0);
  const attempted = status.length;
  const withDocs = status.filter((s) => s.documents_found > 0).length;
  const withSyllabi = status.filter((s) => s.syllabi_found > 0).length;
  const withStudyGuide = status.filter((s) => (s.study_guides_found + s.review_docs_found) > 0).length;
  const noResult = status.filter((s) => s.status === "NO_RESULT").length;
  const failed = status.filter((s) => s.status === "FAILED").length;
  const uniqueDocs = docs.length;
  const uniqueTextbooks = new Set(Object.values(tbByCampus).flatMap((s) => [...s])).size;
  const confirmedProfs = new Set(evid.filter((e) => e.evidence_state === "CONFIRMED_INTRO1").map((e) => `${e.campus_id}|${e.professor_name}`)).size;
  const stateCount = (st) => status.filter((s) => s.status === st).length;

  const md = `# Course Intel — Overnight Harvest Summary

_Generated ${new Date().toISOString()} · branch \`overnight/course-intel-harvest\` · no deploy, no student-map edits._

## Final report
- **Campuses attempted:** ${attempted}
- **Campuses with any docs:** ${withDocs}
- **Campuses with syllabi:** ${withSyllabi}
- **Campuses with exam/study-guide evidence:** ${withStudyGuide}
- **Total unique documents:** ${uniqueDocs}
- **Unique professors CONFIRMED Intro-1 (from docs):** ${confirmedProfs}
- **Textbooks identified (distinct title|edition):** ${uniqueTextbooks}
- **SERP searches:** ${totalSerp}
- **Firecrawl fetches:** ${totalFc}
- **AI parses:** ${totalAi}  ·  est. spend ≈ **$${totalCost.toFixed(2)}**
- **Failures:** ${failed}
- **NO_RESULT campuses:** ${noResult}
- **Review queue size:** ${queue.length}

## Status breakdown
| status | campuses |
|---|---|
| COMPLETE | ${stateCount("COMPLETE")} |
| NEEDS_REVIEW | ${stateCount("NEEDS_REVIEW")} |
| NO_RESULT | ${stateCount("NO_RESULT")} |
| FAILED | ${stateCount("FAILED")} |
| RUNNING/NOT_RUN | ${stateCount("RUNNING") + stateCount("NOT_RUN")} |

## Dashboard aggregate (per campus)
Powered by \`course_intel_campus_status\` — one row per campus with: \`course_intel_status\`,
\`documents_found\`, \`recent_syllabus_found\`, \`study_guide_found\`, \`textbook_identified\`,
\`confirmed_intro1_prof_count\`, \`course_intel_last_updated\`. **COURSE_READINESS = COMING_SOON**
(not scored yet — deliberately).

## Deliverables
- \`COURSE_INTEL_CAMPUS_STATUS.csv\` (${statusRows.length} rows)
- \`COURSE_INTEL_DOCUMENTS.csv\` (${docRows.length} rows)
- \`INTRO1_PROFESSOR_EVIDENCE.csv\` (${evRows.length} rows)
- \`COURSE_INTEL_REVIEW_QUEUE.csv\` (${queue.length} rows)

## Review queue priorities
1. conflicting professor evidence · multiple textbook editions
2. exam mappings needing human approval (PROPOSED / NEEDS_REVIEW only — never auto-applied)
3. ambiguous course identity (no code)
4. high-value campuses returning NO_RESULT

**COURSE INTEL READY FOR DASHBOARD INTEGRATION:** ${withDocs > 0 ? "YES" : "PARTIAL"}
`;
  fs.writeFileSync(path.join(ROOT, "COURSE_INTEL_OVERNIGHT_SUMMARY.md"), md);

  console.log(`[report] wrote 4 CSVs + summary. attempted=${attempted} docs=${uniqueDocs} confirmedProfs=${confirmedProfs} textbooks=${uniqueTextbooks} serp=${totalSerp} cost≈$${totalCost.toFixed(2)}`);
}
main().catch((e) => { console.error("[report:fatal]", e); process.exit(1); });
