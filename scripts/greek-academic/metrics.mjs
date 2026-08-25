#!/usr/bin/env node
/**
 * Greek Academic Intelligence — derived per-chapter metrics + Academic Need Score.
 * Reads greek_chapter_academics (current reports only), computes council-normalized
 * metrics + a versioned INTERNAL need score, writes greek_chapter_academic_metrics.
 *
 * Council-aware throughout (spec §10, §21): ranks/percentiles/averages are computed
 * WITHIN a council population, never across raw GPAs of different councils.
 *
 *   node metrics.mjs           # compute + write metrics for all campuses
 *   node metrics.mjs --dry-run # compute + print summary, write nothing
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllChapterAcademics, getAllReports, upsertMetrics } from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, "../../src/lib/greek-academic/scoring-config.json"), "utf8"));
const DRY = process.argv.includes("--dry-run");

const TERM_ORD = { winter: 0, spring: 1, summer: 2, fall: 3 };
const semOrd = (r) => (r.year || 0) * 10 + (TERM_ORD[r.term] ?? 1);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lin = (v, at100, at0) => clamp01((v - at0) / (at100 - at0)); // maps at0→0, at100→1

function needScore(parts) {
  const C = CONFIG.components;
  const comp = [];
  if (parts.gpaVsCouncil != null) comp.push([C.gpa_vs_council.weight, lin(parts.gpaVsCouncil, C.gpa_vs_council.diff_to_100_at, C.gpa_vs_council.diff_to_0_at)]);
  if (parts.percentile != null) comp.push([C.council_percentile.weight, clamp01((100 - parts.percentile) / 100)]);
  if (parts.change != null) comp.push([C.trend.weight, lin(parts.change, C.trend.change_to_100_at, C.trend.change_to_0_at)]);
  if (parts.gpaVsBaseline != null) comp.push([C.gpa_vs_campus_baseline.weight, lin(parts.gpaVsBaseline, C.gpa_vs_campus_baseline.diff_to_100_at, C.gpa_vs_campus_baseline.diff_to_0_at)]);
  if (!comp.length) return null;
  const wsum = comp.reduce((s, [w]) => s + w, 0);
  const score = comp.reduce((s, [w, v]) => s + (w / wsum) * v, 0) * 100;
  return Math.round(score);
}

async function main() {
  const [acad, reports] = await Promise.all([getAllChapterAcademics(), getAllReports()]);
  const currentReportIds = new Set(reports.filter((r) => r.is_current).map((r) => r.id));
  const rows = acad.filter((a) => a.campus_greek_chapter_id && currentReportIds.has(a.source_report_id));

  // group by chapter
  const byChapter = new Map();
  for (const a of rows) {
    const arr = byChapter.get(a.campus_greek_chapter_id) || [];
    arr.push(a); byChapter.set(a.campus_greek_chapter_id, arr);
  }
  // council populations per campus for the LATEST term (for rank/percentile)
  const councilPops = new Map(); // `${campus}|${council}|${sem}` → [gpa...]
  for (const a of rows) {
    if (a.chapter_gpa == null || !a.council_normalized) continue;
    const k = `${a.campus_id}|${a.council_normalized}|${semOrd(a)}`;
    const arr = councilPops.get(k) || []; arr.push(a.chapter_gpa); councilPops.set(k, arr);
  }

  const out = [];
  for (const [chapterId, recs] of byChapter) {
    recs.sort((x, y) => semOrd(y) - semOrd(x)); // newest first
    const latest = recs[0];
    const council = latest.council_normalized;
    const scale = latest.gpa_scale || 4.0;

    // council average: prefer the printed one, else compute across council peers this term
    const popKey = `${latest.campus_id}|${council}|${semOrd(latest)}`;
    const pop = councilPops.get(popKey) || [];
    const printedAvg = latest.council_average_gpa;
    const computedAvg = pop.length ? pop.reduce((s, g) => s + g, 0) / pop.length : null;
    const councilAvg = printedAvg ?? (computedAvg != null ? Math.round(computedAvg * 1000) / 1000 : null);

    const diffCouncil = latest.chapter_gpa != null && councilAvg != null ? +(latest.chapter_gpa - councilAvg).toFixed(3) : null;

    // rank + percentile within council population (this term)
    let rank = null, size = null, percentile = null;
    if (latest.chapter_gpa != null && pop.length) {
      const sorted = [...pop].sort((a, b) => b - a); // desc: rank 1 = highest gpa
      size = sorted.length;
      rank = sorted.findIndex((g) => g <= latest.chapter_gpa) + 1; // 1-based
      // percentile: fraction of council at-or-below this gpa (0=bottom,100=top)
      const atOrBelow = pop.filter((g) => g <= latest.chapter_gpa).length;
      percentile = Math.round((atOrBelow / pop.length) * 100);
    }

    // baseline: pick gender-appropriate baseline if org type known, else all-undergrad
    const baseline = latest.all_undergraduate_gpa ?? latest.all_greek_average_gpa ?? null;
    const gpaVsBaseline = latest.chapter_gpa != null && baseline != null ? +(latest.chapter_gpa - baseline).toFixed(3) : null;

    // trend: change over available terms
    const withGpa = recs.filter((r) => r.chapter_gpa != null);
    let change1 = null, change3 = null, trend5 = null, trendLabel = "insufficient_data";
    if (withGpa.length >= 2) {
      change1 = +(withGpa[0].chapter_gpa - withGpa[1].chapter_gpa).toFixed(3);
      const older3 = withGpa[Math.min(3, withGpa.length - 1)];
      change3 = +(withGpa[0].chapter_gpa - older3.chapter_gpa).toFixed(3);
      trend5 = +(withGpa[0].chapter_gpa - withGpa[withGpa.length - 1].chapter_gpa).toFixed(3);
      trendLabel = trend5 > 0.05 ? "improving" : trend5 < -0.05 ? "declining" : "stable";
    }

    // member trend — EXCLUDE implausible (council/community totals flagged in the
    // correction pass) so a mis-parsed total can never inflate chapter sizing.
    const memberOk = (r) => r.member_count != null && r.member_count <= 700 && !(r.quality_flags || []).includes("member_count_implausible");
    const withMem = recs.filter(memberOk);
    const latestMember = withMem[0]?.member_count ?? null;
    const avgMember = withMem.length ? Math.round(withMem.slice(0, 3).reduce((s, r) => s + r.member_count, 0) / Math.min(3, withMem.length)) : null;
    const memberTrend = withMem.length >= 2 ? withMem[0].member_count - withMem[withMem.length - 1].member_count : null;

    const score = needScore({ gpaVsCouncil: diffCouncil, percentile, change: change3, gpaVsBaseline });

    // human-readable drivers
    const drivers = [];
    if (diffCouncil != null) drivers.push(diffCouncil < 0 ? `${Math.abs(diffCouncil).toFixed(2)} below ${council?.toUpperCase()} average` : `${diffCouncil.toFixed(2)} above ${council?.toUpperCase()} average`);
    if (rank != null && size != null) drivers.push(`${ordinal(rank)} of ${size} ${council?.toUpperCase()} chapters`);
    if (trendLabel === "declining" && trend5 != null) drivers.push(`GPA down ${Math.abs(trend5).toFixed(2)} over ${withGpa.length} terms`);
    else if (trendLabel === "improving" && trend5 != null) drivers.push(`GPA up ${trend5.toFixed(2)} over ${withGpa.length} terms`);
    if (gpaVsBaseline != null && gpaVsBaseline < 0) drivers.push(`${Math.abs(gpaVsBaseline).toFixed(2)} below campus baseline`);

    // Constructive, non-shaming context labels (internal — never a public ranking).
    const labels = [];
    if (latest.chapter_gpa == null) labels.push("UNKNOWN");
    if (latestMember != null && latestMember >= 150) labels.push("LARGE MEMBER BASE");
    if ((diffCouncil != null && diffCouncil >= 0.05) || (percentile != null && percentile >= 75)) labels.push("STRONG ACADEMIC CULTURE");
    if (diffCouncil != null && diffCouncil <= -0.10) labels.push("HIGH ACADEMIC OPPORTUNITY");
    if (trendLabel === "declining") labels.push("DECLINING TREND");
    if (trendLabel === "improving") labels.push("IMPROVING TREND");
    if (!labels.length) labels.push("UNKNOWN");

    // data_confidence: match quality, downgraded when only a single term of history.
    const dc = latest.match_confidence === "high" ? (recs.length >= 2 ? "high" : "medium")
      : latest.match_confidence === "medium" ? "medium" : "low";

    out.push({
      academic_context_labels: labels,
      campus_greek_chapter_id: chapterId, campus_id: latest.campus_id, council_normalized: council,
      latest_gpa: latest.chapter_gpa, latest_term: latest.term, latest_year: latest.year, latest_semester_key: latest.semester_key,
      council_average_gpa: councilAvg, difference_from_council: diffCouncil,
      all_greek_difference: latest.chapter_gpa != null && latest.all_greek_average_gpa != null ? +(latest.chapter_gpa - latest.all_greek_average_gpa).toFixed(3) : null,
      gender_population_difference: gpaVsBaseline,
      council_rank: rank, council_size: size, council_percentile: percentile,
      change_1_term: change1, change_3_term: change3, trend_5_term: trend5, trend_label: trendLabel,
      latest_member_count: latestMember, average_member_count_recent: avgMember, member_count_trend: memberTrend,
      academic_need_score: score, score_version: CONFIG.version, need_drivers: drivers.length ? drivers : null,
      calculated_at: new Date().toISOString(), semesters_available: recs.length,
      data_confidence: dc, source_url: latest.source_url,
    });
  }

  const scored = out.filter((r) => r.academic_need_score != null);
  console.log(`[metrics] ${byChapter.size} chapters with academic data; ${scored.length} scored; ${scored.filter((r) => r.academic_need_score >= CONFIG.high_need_threshold).length} high-need (≥${CONFIG.high_need_threshold})`);
  if (DRY) {
    console.log("[dry-run] sample:");
    out.slice(0, 8).forEach((r) => console.log(`  need=${r.academic_need_score} gpa=${r.latest_gpa} Δcouncil=${r.difference_from_council} rank=${r.council_rank}/${r.council_size} ${r.trend_label} — ${(r.need_drivers || []).join("; ")}`));
    return;
  }
  // write in batches
  for (let i = 0; i < out.length; i += 200) await upsertMetrics(out.slice(i, i + 200));
  console.log(`[metrics] wrote ${out.length} rows to greek_chapter_academic_metrics.`);
}
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
