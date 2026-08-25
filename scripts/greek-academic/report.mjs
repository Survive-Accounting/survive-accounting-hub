#!/usr/bin/env node
/**
 * Greek Academic Intelligence — output generator (spec §27-29).
 * Reads the greek_academic_* tables and writes:
 *   GREEK_ACADEMIC_REPORTS.csv
 *   GREEK_CHAPTER_ACADEMICS.csv
 *   GREEK_ACADEMIC_REVIEW_QUEUE.csv
 *   GREEK_ACADEMIC_CAMPUS_SUMMARY.csv
 *   GREEK_ACADEMIC_INTELLIGENCE_REPORT.md
 * into greek-academic-output/ at the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllReports, getAllChapterAcademics, getAllCampusStatus, rest } from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "../../greek-academic-output");
fs.mkdirSync(OUT, { recursive: true });

const esc = (v) => {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
const write = (name, content) => { fs.writeFileSync(path.join(OUT, name), content); console.log(`  wrote ${name} (${content.split("\n").length - 1} lines)`); };

async function main() {
  const [reports, acad, status, summary, metrics] = await Promise.all([
    getAllReports(), getAllChapterAcademics(), getAllCampusStatus(),
    rest("GET", "greek_academic_campus_summary_v?select=*&limit=2000").catch(() => []),
    rest("GET", "greek_chapter_academic_metrics?select=*&limit=5000").catch(() => []),
  ]);
  const campusName = new Map(status.map((s) => [s.campus_id, s.campus_name]));

  // ── REPORTS ───────────────────────────────────────────────────────────────
  write("GREEK_ACADEMIC_REPORTS.csv", toCsv(
    reports.map((r) => ({ ...r, campus: campusName.get(r.campus_id) || "" })),
    ["campus", "campus_id", "report_title", "report_type", "council_scope", "term", "year", "semester_key",
     "source_url", "source_type", "file_type", "discovered_by", "parse_status", "confidence",
     "business_students_count", "business_students_percent", "content_hash", "retrieved_at"]));

  // ── CHAPTER ACADEMICS ───────────────────────────────────────────────────────
  const metricsByChapter = new Map(metrics.map((m) => [m.campus_greek_chapter_id, m]));
  write("GREEK_CHAPTER_ACADEMICS.csv", toCsv(
    acad.map((a) => {
      const m = a.campus_greek_chapter_id ? metricsByChapter.get(a.campus_greek_chapter_id) : null;
      return { ...a, campus: campusName.get(a.campus_id) || "",
        academic_need_score: m?.academic_need_score ?? "", council_rank: m?.council_rank ?? "",
        council_size: m?.council_size ?? "", trend_label: m?.trend_label ?? "" };
    }),
    ["campus", "campus_id", "chapter_name_as_reported", "canonical_chapter_name", "match_status", "match_confidence",
     "council", "council_normalized", "term", "year", "semester_key",
     "chapter_gpa", "active_member_gpa", "new_member_gpa", "member_count", "new_member_count",
     "deans_list_count", "academic_probation_count", "council_average_gpa", "all_greek_average_gpa",
     "all_men_gpa", "all_women_gpa", "all_undergraduate_gpa", "chapter_rank_within_council",
     "academic_need_score", "council_rank", "council_size", "trend_label",
     "business_students_count", "gpa_scale", "parse_confidence", "quality_flags", "source_url"]));

  // ── REVIEW QUEUE ────────────────────────────────────────────────────────────
  const review = acad.filter((a) =>
    a.match_status === "NEEDS_REVIEW" ||
    (a.match_status === "UNMATCHED" && a.chapter_gpa != null) ||
    (a.quality_flags && a.quality_flags.length) ||
    (a.chapter_gpa != null && (a.chapter_gpa < 1.5 || a.chapter_gpa > (a.gpa_scale || 4.0))));
  write("GREEK_ACADEMIC_REVIEW_QUEUE.csv", toCsv(
    review.map((a) => ({ ...a, campus: campusName.get(a.campus_id) || "",
      review_reason: reviewReason(a) })),
    ["campus", "chapter_name_as_reported", "canonical_chapter_name", "match_status", "match_confidence",
     "council_normalized", "semester_key", "chapter_gpa", "gpa_scale", "member_count", "quality_flags",
     "review_reason", "source_url"]));

  // ── CAMPUS SUMMARY ──────────────────────────────────────────────────────────
  write("GREEK_ACADEMIC_CAMPUS_SUMMARY.csv", toCsv(
    summary.map((s) => ({ ...s, state: s.state || "" })),
    ["campus_name", "state", "campus_id", "greek_academic_data_status", "reports_found",
     "latest_greek_academic_term", "latest_greek_academic_year", "historical_terms_available",
     "chapters_with_gpa_data", "chapters_matched", "chapters_unmatched",
     "ifc_chapters_with_data", "panhellenic_chapters_with_data", "ifc_average_gpa", "panhellenic_average_gpa",
     "greek_members_reported", "ifc_members_reported", "panhellenic_members_reported",
     "high_need_ifc_chapters", "high_need_panhellenic_chapters",
     "greek_business_students_count", "archive_url", "recommended_next_action", "last_error"]));

  // ── MARKDOWN SUMMARY (spec §29) ─────────────────────────────────────────────
  const attempted = status.length;
  const withReports = status.filter((s) => s.reports_found > 0).length;
  const withHistory = status.filter((s) => s.semesters_found >= 2).length;
  const noData = status.filter((s) => s.status === "no_public_data").length;
  const needsReview = status.filter((s) => s.status === "needs_review").length;
  const failed = status.filter((s) => s.status === "failed").length;
  const complete = status.filter((s) => s.status === "complete").length;
  const matched = acad.filter((a) => a.match_status === "MATCHED").length;
  const reviewN = acad.filter((a) => a.match_status === "NEEDS_REVIEW").length;
  const unmatched = acad.filter((a) => a.match_status === "UNMATCHED").length;
  const memberRecs = acad.filter((a) => a.member_count != null).length;
  const bizRecs = reports.filter((r) => r.business_students_count != null).length + acad.filter((a) => a.business_students_count != null).length;
  const semesterRecords = new Set(reports.map((r) => `${r.campus_id}|${r.semester_key}`)).size;
  const ifcCov = status.filter((s) => s.reports_found > 0).length;
  const totalCost = status.reduce((s, r) => s + (+r.est_cost_usd || 0), 0);
  const totalSerp = status.reduce((s, r) => s + (r.serp_searches || 0), 0);
  const matchRate = (matched + reviewN + unmatched) ? (100 * matched / (matched + reviewN + unmatched)) : 0;

  const md = `# Greek Academic Intelligence — Run Report

_Generated ${new Date().toISOString()} · scoring ${metrics[0]?.score_version || "academic_need_v1"}_

## Coverage
| Metric | Value |
|---|---|
| Campuses attempted | ${attempted} |
| Campuses with public report(s) | ${withReports} |
| Campuses with historical reports (≥2 terms) | ${withHistory} |
| COMPLETE | ${complete} |
| NEEDS_REVIEW | ${needsReview} |
| NO_PUBLIC_DATA | ${noData} |
| FAILED | ${failed} |

## Reports & records
| Metric | Value |
|---|---|
| Unique reports | ${reports.length} |
| Semester records (campus×term) | ${semesterRecords} |
| Chapter academic records | ${acad.length} |
| — MATCHED | ${matched} |
| — NEEDS_REVIEW | ${reviewN} |
| — UNMATCHED | ${unmatched} |
| **Chapter match rate** | **${matchRate.toFixed(1)}%** |
| Membership records extracted | ${memberRecs} |
| Business-school participation records | ${bizRecs} |

## Cost
| Metric | Value |
|---|---|
| SerpAPI searches | ${totalSerp} |
| Est. spend | $${totalCost.toFixed(2)} |
| Useful reports per search | ${totalSerp ? (reports.length / totalSerp).toFixed(3) : "n/a"} |

## Review queue
${review.length} rows flagged (ambiguous matches, unmatched-with-GPA, quality flags, out-of-range GPA). See GREEK_ACADEMIC_REVIEW_QUEUE.csv.

## Top campuses by reports found
${status.filter((s) => s.reports_found > 0).sort((a, b) => b.reports_found - a.reports_found).slice(0, 15)
  .map((s) => `- ${s.campus_name} — ${s.reports_found} report(s), ${s.semesters_found} term(s), ${s.chapters_matched} matched / ${s.chapters_unmatched} unmatched [${s.status}]`).join("\n") || "_none_"}

---
GREEK ACADEMIC INTELLIGENCE READY FOR MARKET/GROWTH INTEGRATION: ${withReports > 0 && matchRate >= 70 ? "YES" : withReports > 0 ? "PARTIAL" : "NO"}

Do not deploy. Do not send outreach. Do not expose chapter GPA rankings publicly.
`;
  write("GREEK_ACADEMIC_INTELLIGENCE_REPORT.md", md);
  console.log(`\nOutputs in ${OUT}`);
}
function reviewReason(a) {
  const r = [];
  if (a.match_status === "NEEDS_REVIEW") r.push("ambiguous_match");
  if (a.match_status === "UNMATCHED" && a.chapter_gpa != null) r.push("unmatched_with_gpa");
  if (a.quality_flags && a.quality_flags.length) r.push(...a.quality_flags);
  if (a.chapter_gpa != null && a.chapter_gpa > (a.gpa_scale || 4.0)) r.push("gpa_above_scale");
  return r.join("; ");
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
