#!/usr/bin/env node
/**
 * Course Intel — ALL-EXAMS analysis (read-only). Aggregates the exam_chapter_range
 * + exam_date evidence already in course_evidence across ALL exam labels (not just
 * Exam 1): Exam 1/2/3/4, Midterm, Final. Writes ALL_EXAMS.json + ALL_EXAMS_CAMPUS_MAPS.csv.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rest } from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const enc = encodeURIComponent;
async function pageAll(table, select, filter = "") {
  const out = []; let off = 0;
  for (;;) { const r = await rest("GET", `${table}?select=${enc(select)}${filter}&order=id.asc&limit=1000&offset=${off}`); out.push(...r); if (r.length < 1000) break; off += 1000; }
  return out;
}
const csvCell = (v) => { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (headers, rows) => [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n";

// normalize a raw exam label to a canonical bucket
function bucket(l) {
  l = (l || "").toLowerCase();
  if (/final/.test(l)) return "final";
  if (/midterm|mid-term/.test(l)) return "midterm";
  if (/\b(exam|test)\s*0*1\b|\bexam\s*i\b|\bfirst\b/.test(l)) return "exam_1";
  if (/\b(exam|test)\s*0*2\b|\bexam\s*ii\b|\bsecond\b/.test(l)) return "exam_2";
  if (/\b(exam|test)\s*0*3\b|\bexam\s*iii\b|\bthird\b/.test(l)) return "exam_3";
  if (/\b(exam|test)\s*0*4\b|\bexam\s*iv\b|\bfourth\b/.test(l)) return "exam_4";
  return "other";
}
const ORDER = ["exam_1", "exam_2", "exam_3", "exam_4", "midterm", "final", "other"];

async function main() {
  const ev = await pageAll("course_evidence", "campus_id,evidence_type,exam_label,exam_chapters,confidence,effective_term", "&course_family=eq.intro_1&or=(evidence_type.eq.exam_chapter_range,evidence_type.eq.exam_date)");
  const ranges = ev.filter((e) => e.evidence_type === "exam_chapter_range");
  const dates = ev.filter((e) => e.evidence_type === "exam_date");

  // campus names
  const ids = [...new Set(ev.map((e) => e.campus_id))];
  const nameById = {};
  for (let i = 0; i < ids.length; i += 150) {
    const rows = await rest("GET", `campuses?select=id,name,state&id=in.(${ids.slice(i, i + 150).join(",")})`);
    for (const r of rows) nameById[r.id] = r;
  }

  // per-exam aggregation
  const perExam = {};
  for (const e of ranges) {
    const b = bucket(e.exam_label);
    const chs = (e.exam_chapters || []).map(Number).filter(Number.isFinite);
    if (!chs.length) continue;
    const g = (perExam[b] ||= { campuses: new Set(), chapCampuses: {}, rangeCampuses: {} });
    g.campuses.add(e.campus_id);
    for (const c of chs) (g.chapCampuses[c] ||= new Set()).add(e.campus_id);
    const rg = `${Math.min(...chs)}-${Math.max(...chs)}`;
    (g.rangeCampuses[rg] ||= new Set()).add(e.campus_id);
  }
  const exams = {};
  for (const b of ORDER) {
    const g = perExam[b]; if (!g) continue;
    const n = g.campuses.size;
    exams[b] = {
      campuses: n,
      chapter_frequency: Object.entries(g.chapCampuses).map(([c, s]) => ({ chapter: +c, campuses: s.size, pct: +(100 * s.size / n).toFixed(0) })).sort((a, b) => a.chapter - b.chapter),
      top_ranges: Object.entries(g.rangeCampuses).map(([r, s]) => ({ range: r, campuses: s.size })).sort((a, b) => b.campuses - a.campuses).slice(0, 6),
    };
  }

  // per-campus course map: dominant range per exam bucket
  const byCampus = {};
  for (const e of ranges) {
    const b = bucket(e.exam_label);
    const chs = (e.exam_chapters || []).map(Number).filter(Number.isFinite);
    if (!chs.length) continue;
    const rg = `${Math.min(...chs)}-${Math.max(...chs)}`;
    ((byCampus[e.campus_id] ||= {})[b] ||= {})[rg] = (byCampus[e.campus_id][b][rg] || 0) + 1;
  }
  const dateByCampus = {};
  for (const e of dates) { const b = bucket(e.exam_label); if (b === "exam_1") (dateByCampus[e.campus_id] ||= e.raw_text); }
  const mapRows = Object.entries(byCampus).map(([cid, m]) => {
    const pick = (b) => { const r = m[b]; if (!r) return ""; return Object.entries(r).sort((a, b) => b[1] - a[1])[0][0]; };
    return {
      campus: nameById[cid]?.name || "", state: nameById[cid]?.state || "",
      exam_1: pick("exam_1"), exam_2: pick("exam_2"), exam_3: pick("exam_3"), exam_4: pick("exam_4"),
      midterm: pick("midterm"), final: pick("final"),
      exam_count: ["exam_1", "exam_2", "exam_3", "exam_4"].filter((b) => m[b]).length,
    };
  }).sort((a, b) => (b.exam_1 ? 1 : 0) - (a.exam_1 ? 1 : 0) || a.campus.localeCompare(b.campus));

  const out = {
    generated_at: new Date().toISOString(),
    campuses_with_any_exam_range: new Set(ranges.filter((e) => (e.exam_chapters || []).length).map((e) => e.campus_id)).size,
    per_exam: exams,
    exam_date_evidence_rows: dates.length,
    campus_maps_count: mapRows.length,
  };
  fs.writeFileSync(path.join(ROOT, "ALL_EXAMS.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(ROOT, "ALL_EXAMS_CAMPUS_MAPS.csv"), toCsv(["campus", "state", "exam_1", "exam_2", "exam_3", "exam_4", "midterm", "final", "exam_count"], mapRows));
  console.log("[all-exams] wrote ALL_EXAMS.json + ALL_EXAMS_CAMPUS_MAPS.csv");
  console.log(JSON.stringify({ campuses: out.campuses_with_any_exam_range, per_exam: Object.fromEntries(Object.entries(exams).map(([k, v]) => [k, { campuses: v.campuses, top: v.top_ranges.slice(0, 4), coreChapters: v.chapter_frequency.filter((c) => c.pct >= 40).map((c) => c.chapter) }])) }, null, 2));
}
main().catch((e) => { console.error("[all-exams:fatal]", e); process.exit(1); });
