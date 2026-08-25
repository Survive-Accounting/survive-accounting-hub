#!/usr/bin/env node
/**
 * Course Intel — PARSE-ONLY pass over already-discovered documents.
 * NO new SERP discovery. Fetches each pending course_document via Firecrawl, runs
 * extended AI extraction (course code/title, term/year, professors, textbook,
 * exam label+chapters+DATE, explicit topics), reclassifies unknown PDFs from
 * content, writes course_evidence + professor_intro1_evidence, and rolls up the
 * best Exam-1 date onto course_intel_campus_status. Content-hash guarded,
 * checkpointed, Firecrawl-credit guarded. Never edits student-facing maps.
 *
 *   node parse-pass.mjs --execute [--reserve-credits 3000] [--max-docs N] [--concurrency 2]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDocument, parseExamChapterRanges, normalizeTextbook, scoreConfidence } from "../course-intel/lib.mjs";
import { firecrawlMarkdown, firecrawlBalance } from "./providers.mjs";
import * as db from "./db.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";
const TODAY = new Date("2026-08-25T00:00:00Z");
const enc = encodeURIComponent;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

const RESTRICTED = /(coursehero|scribd|chegg|quizlet|studocu|stuvia|coursesidekick)\./i;
const VOCATIONAL = /(bookkeeping for dummies|for dummies|certified bookkeeper|medical billing|quickbooks (online|certificate))/i;

// value rank for priority ordering (lower = parse first)
function valueRank(type, tier) {
  if (type === "study_guide") return 1;            // exam study guides / reviews
  if (type === "schedule") return 2;               // calendars (date source)
  if (type === "syllabus") return 3;
  if (type === "unknown_pdf") return 4;            // likely syllabus/schedule/review
  if (type === "homework" || type === "worksheet") return 5;
  if (type === "lecture") return 6;
  return 9;                                         // catalog/faculty/unknown → skip
}

async function pageAll(table, select, filter, order = "id.asc") {
  const out = []; let off = 0;
  for (;;) { const r = await db.rest("GET", `${table}?select=${enc(select)}${filter}&order=${order}&limit=1000&offset=${off}`); out.push(...r); if (r.length < 1000) break; off += 1000; }
  return out;
}

// ── extended AI extraction (dates + topics) ──────────────────────────────────
async function aiExtractFull(key, markdown) {
  const prompt = `Extract CURRICULUM METADATA from this public college accounting course document. Return ONLY compact JSON:
{"course_code":"","course_title":"","term":"Fall|Spring|Summer|null","year":2025,"instructors":["Prof Name"],"textbook":{"title":"","authors":"","edition":"","isbn":""},"exams":[{"label":"Exam 1","chapters":[1,2,3],"date":"YYYY-MM-DD","topics":["adjusting entries","bank reconciliation"]}]}
Rules:
- chapters: integers from stated coverage ("Exam 1 covers Ch 1-3").
- date: ONLY if an explicit calendar date is printed for that exam. Output ISO YYYY-MM-DD; if only month/day is printed use the term's year. If no explicit date, OMIT the date field. NEVER guess or infer from "week 6"/"early October".
- topics: ONLY topics the document explicitly lists as covered by that exam. Do NOT infer from chapter numbers.
- Do NOT copy prose, questions, assignments, or answer keys.
Document:\n\n${String(markdown).slice(0, 26000)}`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(AI_URL, { method: "POST", signal: ctrl.signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
    if (!r.ok) return null;
    const j = await r.json(); const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\{[\s\S]*\}/); if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  } catch { return null; } finally { clearTimeout(t); }
}

// Validate an AI-returned exam date against the source (anti-hallucination) + recency.
function validateDate(dateStr, markdown, year) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d)) return null;
  const y = d.getUTCFullYear();
  if (y < 2018 || y > 2028) return null;
  if (year && Math.abs(y - year) > 1) return null; // date year must match the term year (±1)
  // anti-hallucination: the day number must appear in the doc, and the month (name or number)
  const day = d.getUTCDate(), mon = d.getUTCMonth() + 1;
  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const md = markdown.toLowerCase();
  const hasDay = new RegExp(`\\b${day}\\b`).test(md);
  const hasMonth = md.includes(monthNames[mon - 1].slice(0, 3)) || new RegExp(`\\b${mon}[/\\-]${day}\\b`).test(md);
  if (!hasDay || !hasMonth) return null;
  return dateStr;
}

function isExam1(label) { return /\b(exam|test)\s*0*1\b|\bfirst\s+(exam|test)\b|\bexam\s*i\b/i.test(label || ""); }

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const reserve = +(args[args.indexOf("--reserve-credits") + 1] || 3000) || 3000;
  const maxDocs = +(args[args.indexOf("--max-docs") + 1] || Infinity) || Infinity;
  const concurrency = Math.max(1, +(args[args.indexOf("--concurrency") + 1] || 2) || 2);
  const checkpoint = path.join(HERE, "parse-checkpoint.json");
  const keys = { firecrawl: process.env.FIRECRAWL_API_KEY, ai: process.env.AI_GATEWAY_API_KEY };
  if (execute && (!keys.firecrawl || !keys.ai)) throw new Error("FIRECRAWL_API_KEY / AI_GATEWAY_API_KEY missing");

  const cp = (() => { try { return JSON.parse(fs.readFileSync(checkpoint, "utf8")); } catch { return { done: {} }; } })();
  const saveCp = () => { try { fs.writeFileSync(checkpoint, JSON.stringify(cp, null, 2)); } catch {} };
  const costlog = checkpoint + ".log.jsonl";

  console.log("[load] pending documents…");
  const docs = await pageAll("course_document", "id,campus_id,course_code,document_type,value_tier,title,source_url,source_domain,content_hash,professor_name", "&processing_status=eq.discovered&course_family=eq.intro_1");
  // campus priority for tie-break ordering (page all — avoid a giant id=in.() URL)
  const campuses = await pageAll("campuses", "id,name,priority_tier,market_priority,domains,email_domain,website_url", "&is_research_only=is.false");
  const cprio = new Map(campuses.map((c) => [c.id, Number(c.priority_tier) || Number(c.market_priority) || 9]));
  const cinfo = new Map(campuses.map((c) => [c.id, c]));

  // filter to parse-worthy + order by value then market priority
  const work = docs
    .filter((d) => valueRank(d.document_type, d.value_tier) <= 6 && !RESTRICTED.test(d.source_domain || "") && !cp.done[d.id])
    .map((d) => ({ ...d, vrank: (d.value_tier === 1 ? 0 : 0) + valueRank(d.document_type, d.value_tier), mprio: cprio.get(d.campus_id) ?? 9 }))
    .sort((a, b) => a.vrank - b.vrank || a.mprio - b.mprio)
    .slice(0, maxDocs);
  console.log(`[plan] ${docs.length} discovered; ${work.length} parse-worthy pending (after value/dedupe filter).`);
  if (!execute) { console.log("[dry] pass --execute to run. First 10:", work.slice(0, 10).map((w) => `${w.document_type}/${w.source_domain}`)); return; }

  const fb0 = await firecrawlBalance(keys.firecrawl);
  console.log(`[balance] Firecrawl ${fb0 ? fb0.remaining : "?"} credits; reserve ${reserve}.`);
  if (fb0 && fb0.remaining < reserve) return console.error(`[ABORT] Firecrawl ${fb0.remaining} < reserve ${reserve}.`);

  const summary = { parsed: 0, unchanged: 0, failed: 0, examRanges: 0, exam1Dates: 0, textbooks: 0, profs: 0, reclassified: 0, topics: 0 };
  let stopping = false, fetches = 0;
  process.on("SIGINT", () => { stopping = true; console.log("[SIGINT] finishing in-flight…"); });

  let qp = 0;
  async function worker() {
    while (!stopping) {
      if (qp >= work.length) return;
      const d = work[qp++];
      // periodic Firecrawl balance guard (PDFs bill per page — can't predict)
      if (fetches && fetches % 40 === 0) {
        const fb = await firecrawlBalance(keys.firecrawl);
        if (fb && fb.remaining < reserve) { stopping = true; console.log(`[STOP] Firecrawl ${fb.remaining} < reserve ${reserve}.`); return; }
      }
      const md = await firecrawlMarkdown(keys.firecrawl, d.source_url); fetches++;
      if (!md) { summary.failed++; await db.markDocument(d.id, { processing_status: "error", last_checked: new Date().toISOString() }).catch(() => {}); cp.done[d.id] = "error"; saveCp(); continue; }
      if (VOCATIONAL.test(md.slice(0, 4000))) { // vocational cert content that slipped through discovery
        await db.markDocument(d.id, { processing_status: "skipped", last_checked: new Date().toISOString(), notes: "vocational_non_college" }).catch(() => {});
        cp.done[d.id] = "skipped"; saveCp(); continue;
      }
      const h = hash(md);
      if (d.content_hash === h) { summary.unchanged++; await db.markDocument(d.id, { last_checked: new Date().toISOString() }).catch(() => {}); cp.done[d.id] = "unchanged"; saveCp(); continue; }

      const ai = await aiExtractFull(keys.ai, md);
      const year = ai?.year && Number.isFinite(+ai.year) ? +ai.year : null;
      const ageYears = year ? 2026 - year : null;
      const domain = cinfo.get(d.campus_id)?.domains?.[0] || d.source_domain || "";
      const onDomain = (h2) => domain && (hostOf(d.source_url) === norm(domain).replace(/ /g, "") || (d.source_domain || "").endsWith(domain));
      const quality = /\.edu$/.test(d.source_domain || "") ? (d.source_domain === domain || (d.source_domain || "").endsWith(`.${domain}`) ? "HIGH" : "MEDIUM") : "LOW";

      // reclassify unknown pdf from content
      let newType = d.document_type;
      if (d.document_type === "unknown_pdf" || d.document_type === "unknown") {
        const cls = classifyDocument({ title: d.title || "", url: d.source_url, snippet: md.slice(0, 1500) });
        if (cls.type && cls.type !== "unknown" && cls.type !== "unknown_pdf") { newType = cls.type; summary.reclassified++; }
      }

      // evidence rows
      const rows = [];
      const exams = (ai?.exams?.length ? ai.exams : parseExamChapterRanges(md).map((e) => ({ label: e.label, chapters: e.chapters }))).filter(Boolean);
      let bestExam1Date = null, bestExam1Conf = null;
      for (const e of exams) {
        const label = String(e.label || "").toLowerCase().trim();
        const chapters = Array.isArray(e.chapters) ? e.chapters.filter((n) => Number.isFinite(+n)).map(Number) : [];
        if (chapters.length) {
          rows.push({ course_document_id: d.id, campus_id: d.campus_id, professor_name: d.professor_name, course_family: "intro_1",
            evidence_type: "exam_chapter_range", exam_label: label, exam_chapters: chapters,
            raw_text: `${label}: ch ${chapters.join(", ")}`,
            confidence: scoreConfidence({ explicitExamRange: true, professorSpecific: !!d.professor_name, ageYears }).level,
            effective_term: ai?.term ? `${ai.term} ${year ?? ""}`.trim() : null });
          summary.examRanges++;
        }
        const validDate = validateDate(e.date, md, year);
        if (validDate) {
          const conf = quality === "HIGH" ? "HIGH" : quality === "MEDIUM" ? "MEDIUM" : "LOW";
          rows.push({ course_document_id: d.id, campus_id: d.campus_id, professor_name: d.professor_name, course_family: "intro_1",
            evidence_type: "exam_date", exam_label: label, raw_text: `${label} date: ${validDate}`,
            confidence: conf === "HIGH" ? "High" : conf === "MEDIUM" ? "Medium" : "Low",
            effective_term: ai?.term ? `${ai.term} ${year ?? ""}`.trim() : null });
          if (isExam1(label)) { summary.exam1Dates++; if (!bestExam1Date) { bestExam1Date = validDate; bestExam1Conf = conf; } }
        }
        if (Array.isArray(e.topics)) for (const tp of e.topics.slice(0, 12)) {
          const t = String(tp || "").trim(); if (t.length < 3 || t.length > 80) continue;
          rows.push({ course_document_id: d.id, campus_id: d.campus_id, professor_name: d.professor_name, course_family: "intro_1",
            evidence_type: "topic_signal", exam_label: label, raw_text: t.slice(0, 200), confidence: "Medium",
            effective_term: ai?.term ? `${ai.term} ${year ?? ""}`.trim() : null });
          summary.topics++;
        }
      }
      // textbook
      let textbookId = null;
      if (ai?.textbook?.title && !VOCATIONAL.test(ai.textbook.title)) {
        const nt = normalizeTextbook({ title: ai.textbook.title, authors: ai.textbook.authors, isbn: ai.textbook.isbn, publisher: ai.textbook.edition });
        const tb = await db.upsertTextbook({ title: nt.canonicalTitle, authors: ai.textbook.authors ?? null, edition: ai.textbook.edition ?? null, edition_key: nt.editionKey, edition_confirmed: nt.editionConfirmed }).catch(() => null);
        textbookId = tb?.id ?? null;
        rows.push({ course_document_id: d.id, campus_id: d.campus_id, professor_name: d.professor_name, course_family: "intro_1",
          evidence_type: "textbook_reference", textbook_ref: ai.textbook.title, edition_ref: ai.textbook.edition ?? null,
          raw_text: `${ai.textbook.title} ${ai.textbook.authors ?? ""} ${ai.textbook.edition ?? ""}`.trim().slice(0, 400),
          confidence: nt.editionConfirmed ? "High" : "Medium" });
        summary.textbooks++;
      }
      await db.replaceEvidence(d.id, rows).catch(() => {});

      // professor evidence from a genuine course doc
      const courseDoc = /^(syllabus|study_guide|schedule|homework)$/.test(newType);
      const hasStructure = exams.some((e) => (e.chapters || []).length) || !!ai?.textbook?.title || /\b(financial accounting|principles of accounting|acct?\s?\d{3})\b/i.test(String(ai?.course_title || ""));
      if (courseDoc && hasStructure && Array.isArray(ai?.instructors)) {
        const profRows = [];
        for (const nm0 of ai.instructors) {
          const nm = String(nm0 || "").trim(); if (nm.length < 3 || nm.length > 80) continue;
          const recent = ageYears == null ? false : ageYears <= 1;
          const state = quality === "HIGH" && recent ? "CONFIRMED_INTRO1" : "LIKELY_INTRO1";
          profRows.push({ campus_id: d.campus_id, professor_name: nm, course_code: d.course_code || null, evidence_state: state,
            source_document_id: d.id, source_url: d.source_url, source_domain: d.source_domain, source_quality: quality,
            term: ai?.term || null, year, raw_text: `${nm} — ${d.course_code || "intro accounting"} (${newType})`.slice(0, 400),
            confidence: state === "CONFIRMED_INTRO1" ? "High" : "Medium" });
        }
        if (profRows.length) { await db.upsertProfessorEvidence(profRows).catch(() => {}); summary.profs += profRows.length; }
      }

      await db.markDocument(d.id, { processing_status: "parsed", document_type: newType, content_hash: h, last_checked: new Date().toISOString(), last_changed: new Date().toISOString(), textbook_id: textbookId, term: ai?.term ?? null, year }).catch(() => {});

      // roll up best Exam-1 date onto the campus status
      if (bestExam1Date) {
        const existing = await db.getCampusStatus(d.campus_id).catch(() => null);
        const better = !existing?.exam_1_date || (bestExam1Conf === "HIGH" && existing.exam_1_date_confidence !== "HIGH") || (String(bestExam1Date) > String(existing.exam_1_date));
        if (better) await db.upsertCampusStatus({ campus_id: d.campus_id, campus_name: cinfo.get(d.campus_id)?.name || existing?.campus_name, exam_1_date: bestExam1Date, exam_1_date_confidence: bestExam1Conf, exam_1_date_source_url: d.source_url, exam_1_date_term: ai?.term ? `${ai.term} ${year ?? ""}`.trim() : null }).catch(() => {});
      }

      summary.parsed++;
      cp.done[d.id] = "parsed"; saveCp();
      fs.appendFileSync(costlog, JSON.stringify({ ts: Date.now(), id: d.id, campus: d.campus_id, type: newType, exams: exams.length, date: bestExam1Date || null }) + "\n");
      if (summary.parsed % 25 === 0) console.log(`[progress] parsed ${summary.parsed} | ranges ${summary.examRanges} | exam1 dates ${summary.exam1Dates} | textbooks ${summary.textbooks} | reclassified ${summary.reclassified} | fetches ${fetches}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  saveCp();
  console.log("\n=== PARSE PASS DONE ===");
  console.log(JSON.stringify(summary, null, 2));
  const fb1 = await firecrawlBalance(keys.firecrawl);
  console.log(`Firecrawl remaining: ${fb1 ? fb1.remaining : "?"} | fetches: ${fetches}`);
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
