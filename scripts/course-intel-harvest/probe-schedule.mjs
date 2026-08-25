#!/usr/bin/env node
/**
 * Weekly-schedule extraction PROBE (read-only, ~8 docs). Re-fetches parsed syllabi
 * that yielded NO exam-chapter ranges and tests whether an improved prompt — one
 * that DERIVES exam coverage from the weekly schedule — would recover ranges.
 * Reports per doc; writes nothing to the DB. Bounded Firecrawl spend.
 */
import { firecrawlMarkdown, firecrawlBalance } from "./providers.mjs";
import { rest } from "./db.mjs";

const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";
const N = +(process.argv[process.argv.indexOf("--n") + 1] || 8) || 8;
const enc = encodeURIComponent;

async function pageAll(table, select, filter = "") {
  const out = []; let off = 0;
  for (;;) { const r = await rest("GET", `${table}?select=${enc(select)}${filter}&order=id.asc&limit=1000&offset=${off}`); out.push(...r); if (r.length < 1000) break; off += 1000; }
  return out;
}

// Enhanced prompt: derive exam coverage from a weekly schedule when not stated outright.
async function extractDerive(key, md) {
  const prompt = `From this college accounting syllabus, return ONLY JSON:
{"has_weekly_schedule":true,"stated_exam_ranges":false,"exams":[{"label":"Exam 1","chapters":[1,2,3],"basis":"stated|derived_from_weekly_schedule"}]}
Rules:
- If the document explicitly states an exam's chapter coverage, use it (basis="stated").
- ELSE if it has a weekly/daily/session schedule that lists which chapters are covered and where each exam falls, DERIVE each exam's coverage = the chapters scheduled AFTER the previous exam and up to/including that exam (basis="derived_from_weekly_schedule").
- has_weekly_schedule=true only if such a schedule is present. Do NOT invent chapters. No prose.
Document:\n\n${String(md).slice(0, 26000)}`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(AI_URL, { method: "POST", signal: ctrl.signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
    if (!r.ok) return null;
    const j = await r.json(); const m = (j?.choices?.[0]?.message?.content || "").match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function main() {
  const keys = { firecrawl: process.env.FIRECRAWL_API_KEY, ai: process.env.AI_GATEWAY_API_KEY };
  // parsed syllabi
  const syll = await pageAll("course_document", "id,campus_id,source_url,source_domain,title", "&document_type=eq.syllabus&processing_status=eq.parsed&course_family=eq.intro_1");
  // which docs already have a range?
  const withRange = new Set((await pageAll("course_evidence", "course_document_id", "&evidence_type=eq.exam_chapter_range&course_family=eq.intro_1")).map((r) => r.course_document_id));
  const clean = process.argv.includes("--clean");
  const NOISE = /handbook|report|listing|schedule of classes|catalog|self.?evaluation|advising|analysis|debate|management|managerial|intermediate|cost accounting|tax/i;
  const looksSyllabus = (d) => /acc|acct|acg|bus/i.test(d.course_code || "") || /syllabus|principles of accounting|financial accounting/i.test(d.title || "");
  let rangeless = syll.filter((d) => !withRange.has(d.id));
  if (clean) rangeless = rangeless.filter((d) => d.course_code && /\.edu$/.test(d.source_domain || "") && !NOISE.test(d.title || "") && looksSyllabus(d));
  console.log(`[probe] ${syll.length} parsed syllabi; ${rangeless.length} range-less${clean ? " CLEAN (intro code + on-domain + syllabus-like)" : ""}. Testing ${Math.min(N, rangeless.length)}.`);
  const skip = +(process.argv[process.argv.indexOf("--skip") + 1] || 0) || 0;
  const seenDom = new Set(); const pick = [];
  for (const d of rangeless.slice(skip)) { if (seenDom.has(d.source_domain)) continue; seenDom.add(d.source_domain); pick.push(d); if (pick.length >= N) break; }

  const fb0 = await firecrawlBalance(keys.firecrawl); console.log(`[balance] Firecrawl ${fb0?.remaining} credits\n`);
  let hasSched = 0, derived = 0, statedMissed = 0;
  for (const d of pick) {
    const md = await firecrawlMarkdown(keys.firecrawl, d.source_url);
    if (!md) { console.log(`  ✗ fetch failed: ${d.source_domain}`); continue; }
    const ai = await extractDerive(keys.ai, md);
    const exams = (ai?.exams || []).filter((e) => (e.chapters || []).length);
    const e1 = exams.find((e) => /\b(exam|test)\s*0*1\b|first/i.test(e.label || "")) || exams[0];
    if (ai?.has_weekly_schedule) hasSched++;
    if (exams.some((e) => e.basis === "derived_from_weekly_schedule")) derived++;
    if (exams.some((e) => e.basis === "stated")) statedMissed++;
    console.log(`  ${d.source_domain.padEnd(26)} sched=${ai?.has_weekly_schedule ? "Y" : "-"} | recovered: ${exams.length ? exams.map((e) => `${e.label}=${(e.chapters || []).join(",")}(${e.basis?.[0] || "?"})`).slice(0, 4).join("  ") : "none"}`);
  }
  const fb1 = await firecrawlBalance(keys.firecrawl);
  console.log(`\n=== PROBE RESULT (n=${pick.length}) ===`);
  console.log(`  have weekly schedule: ${hasSched}/${pick.length}`);
  console.log(`  ranges RECOVERED by improved prompt: ${derived + statedMissed}/${pick.length} (derived-from-schedule: ${derived}, stated-but-previously-missed: ${statedMissed})`);
  console.log(`  Firecrawl used: ${(fb0?.remaining ?? 0) - (fb1?.remaining ?? 0)} credits`);
  console.log(`  → extrapolated to ${syll.length - withRange.size} range-less syllabi: ~${Math.round((derived + statedMissed) / pick.length * 100)}% recoverable`);
}
main().catch((e) => { console.error("[probe:fatal]", e); process.exit(1); });
