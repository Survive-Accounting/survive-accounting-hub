// Course Intel — syllabus / course-document discovery pipeline.
// Staged + cost-controlled, mirroring the faculty scraper's shape:
//   1) discoverCourseDocuments  — SERP only (cheap): find PUBLIC syllabi/study
//      guides/schedules for a campus's intro course, classify, store rows.
//   2) parseCourseDocument      — Firecrawl fetch + Gemini extract on ONE doc:
//      textbook + edition + exam→chapter ranges → course_evidence. Hash-guarded
//      so an unchanged doc is never re-parsed.
//   3) getCampusDocuments       — read docs + evidence for the cockpit.
//
// PUBLIC sources only. Restricted document services (Course Hero, Scribd,
// Chegg, Quizlet, Studocu, ...) are skipped, never fetched. We store only
// bibliographic/structural signals — never copyrighted prose.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SERP_BASE = "https://serpapi.com/search.json";
const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

// Restricted / login-walled doc mills — noted in results, never fetched.
const RESTRICTED_HOSTS =
  /(coursehero|scribd|chegg|quizlet|studocu|stuvia|coursesidekick|studysoup|docsity|stud9|studentebookhub|slideshare|yumpu|issuu)\./i;

const DOC_RULES: Array<{ type: string; tier: number; re: RegExp }> = [
  { type: "study_guide", tier: 1, re: /study\s*guide|exam\s*review|review\s*sheet|review\s*packet|practice\s*exam|exam\s*\d?\s*topics/i },
  { type: "syllabus", tier: 2, re: /syllabus|syllabi|course\s*outline|greensheet/i },
  { type: "schedule", tier: 2, re: /schedule|calendar|course\s*plan|weekly|tentative/i },
  { type: "homework", tier: 2, re: /homework|assignment|problem\s*set/i },
  { type: "lecture", tier: 3, re: /lecture|slides|powerpoint|chapter\s*\d+\s*(notes|slides)/i },
  { type: "catalog", tier: 4, re: /catalog|bulletin|course\s*description/i },
];
function classify(hay: string): { type: string; tier: number } {
  for (const r of DOC_RULES) if (r.re.test(hay)) return { type: r.type, tier: r.tier };
  if (/\.pdf(\?|$)/i.test(hay)) return { type: "unknown_pdf", tier: 3 };
  return { type: "unknown", tier: 4 };
}
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const fileTypeOf = (u: string) => { const m = u.toLowerCase().match(/\.(pdf|docx?|pptx?|html?)(\?|$)/); return m ? m[1].replace("htm", "html") : "html"; };

async function serpSearch(key: string, q: string, num = 8): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const url = `${SERP_BASE}?engine=google&num=${num}&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return [];
    const j = (await r.json()) as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> };
    return (j.organic_results ?? []).filter((x) => x.link).map((x) => ({ title: x.title ?? "", link: x.link as string, snippet: x.snippet ?? "" }));
  } catch { return []; } finally { clearTimeout(timer); }
}

function introCodes(courseCodesJson: unknown): string[] {
  let j = courseCodesJson;
  if (typeof j === "string") { try { j = JSON.parse(j); } catch { return []; } }
  if (!j || typeof j !== "object") return [];
  const out: string[] = [];
  for (const fam of ["intro-accounting-1", "intro_1"]) {
    const c = (j as Record<string, { local_course_code?: string }>)[fam];
    if (c?.local_course_code) out.push(c.local_course_code);
  }
  return out;
}
function firstDomain(domains: unknown): string {
  if (!domains) return "";
  if (Array.isArray(domains)) return String(domains[0] ?? "").trim().toLowerCase();
  return String(domains).replace(/[{}"]/g, "").split(",")[0].trim().toLowerCase();
}

export const discoverCourseDocuments = createServerFn({ method: "POST" })
  .inputValidator((d: { campusId: string; professorName?: string }) =>
    z.object({ campusId: z.string().uuid(), professorName: z.string().max(120).optional() }).parse(d))
  .handler(async ({ data }) => {
    const serpKey = process.env.SERPAPI_API_KEY;
    if (!serpKey) throw new Error("SERPAPI_API_KEY is not configured on the server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campus } = await (supabaseAdmin.from("campuses") as any)
      .select("id,name,domains,email_domain,website_url,accounting_department_url,faculty_page_url,course_codes_json").eq("id", data.campusId).maybeSingle();
    if (!campus) throw new Error("Campus not found");
    // Derive the .edu host from any available field (many campuses lack `domains`).
    const domain = firstDomain(campus.domains)
      || (campus.email_domain as string)
      || hostOf((campus.website_url as string) || "")
      || hostOf((campus.accounting_department_url as string) || "")
      || hostOf((campus.faculty_page_url as string) || "")
      || "";
    const codes = introCodes(campus.course_codes_json);
    const code = codes[0] || "";
    const name = (campus.name as string) ?? "";
    const prof = data.professorName ? `"${data.professorName}"` : "";

    // Staged queries: site-scoped first (highest signal), then a name fallback.
    const queries: string[] = [];
    if (domain && code) {
      queries.push(`site:${domain} "${code}" ${prof} syllabus`.trim());
      queries.push(`site:${domain} "${code}" ${prof} "study guide"`.trim());
      queries.push(`site:${domain} "${code}" ${prof} "exam 1"`.trim());
      queries.push(`site:${domain} "${code}" schedule filetype:pdf`);
    }
    if (domain && !code) queries.push(`site:${domain} accounting ${prof} syllabus`.trim());
    queries.push(`"${name}" ${code ? `"${code}" ` : ""}financial accounting syllabus filetype:pdf`.trim());

    const seen = new Set<string>();
    const found: Array<{ url: string; title: string; type: string; tier: number; restricted: boolean }> = [];
    let serpCalls = 0;
    for (const q of queries) {
      serpCalls++;
      const results = await serpSearch(serpKey, q, 8);
      for (const r of results) {
        const canon = r.link.split("#")[0];
        if (seen.has(canon)) continue;
        seen.add(canon);
        const restricted = RESTRICTED_HOSTS.test(hostOf(canon));
        const cls = classify(`${r.title} ${canon} ${r.snippet}`);
        if (cls.tier === 4 && !/\.pdf/i.test(canon)) continue; // drop generic catalog/identity noise
        found.push({ url: canon, title: r.title, type: cls.type, tier: cls.tier, restricted });
      }
      // stop early once we have a healthy pile of tier-1/2 public docs
      if (found.filter((f) => !f.restricted && f.tier <= 2).length >= 6) break;
    }

    // Persist the public ones (dedupe on campus_id+source_url).
    const publicDocs = found.filter((f) => !f.restricted);
    let inserted = 0;
    for (const f of publicDocs) {
      const row = {
        campus_id: data.campusId, professor_name: data.professorName ?? null, course_code: code || null,
        course_family: "intro_1", document_type: f.type, value_tier: f.tier, title: f.title.slice(0, 300),
        source_url: f.url, source_domain: hostOf(f.url), file_type: fileTypeOf(f.url),
        is_public_source: true, access: "public", processing_status: "discovered", discovered_by: "serp",
      };
      const { error } = await (supabaseAdmin.from("course_document") as any)
        .upsert(row, { onConflict: "campus_id,source_url", ignoreDuplicates: true });
      if (!error) inserted++;
    }
    return {
      serpCalls, code, domain,
      total: found.length, public: publicDocs.length, restricted: found.length - publicDocs.length, inserted,
      docs: found.slice(0, 40),
    };
  });

// AI extraction over one document's markdown → structured curriculum signals.
async function aiExtract(aiKey: string, markdown: string): Promise<{
  textbook?: { title?: string; authors?: string; edition?: string }; term?: string; year?: number;
  exams?: Array<{ label: string; chapters: number[] }>;
} | null> {
  const prompt = `You are extracting CURRICULUM METADATA from a public college accounting course document. Return ONLY compact JSON, no prose. Extract:
{"textbook":{"title":"","authors":"","edition":""},"term":"Fall/Spring/Summer or null","year":2025,"exams":[{"label":"Exam 1","chapters":[1,2,3]}]}
Rules: chapters are integers from stated exam coverage ("Exam 1 covers Ch 1-3"). If a field is unknown use null/empty. Do NOT copy any prose, questions, or assignments. Document:\n\n${markdown.slice(0, 24000)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(AI_URL, {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const txt = j.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch { return null; } finally { clearTimeout(timer); }
}

async function firecrawlMarkdown(key: string, url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2500 }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { markdown?: string } };
    return j.data?.markdown ?? null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// tiny stable hash (djb2) — dedupe/reuse guard, not crypto.
function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

export const parseCourseDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { documentId: string }) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!fcKey || !aiKey) throw new Error("FIRECRAWL_API_KEY / AI_GATEWAY_API_KEY not configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseExamChapterRanges, normalizeTextbook, scoreConfidence } = await import("./course-intel-shared");

    const { data: doc } = await (supabaseAdmin.from("course_document") as any)
      .select("id,campus_id,professor_name,source_url,content_hash,document_type").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Document not found");

    const md = await firecrawlMarkdown(fcKey, doc.source_url as string);
    if (!md) {
      await (supabaseAdmin.from("course_document") as any).update({ processing_status: "error", last_checked: new Date().toISOString() }).eq("id", doc.id);
      return { ok: false, reason: "fetch_failed" };
    }
    const h = hash(md);
    if (doc.content_hash === h) {
      await (supabaseAdmin.from("course_document") as any).update({ last_checked: new Date().toISOString() }).eq("id", doc.id);
      return { ok: true, unchanged: true };
    }

    const ai = await aiExtract(aiKey, md);
    const deterministicExams = parseExamChapterRanges(md);
    const exams = (ai?.exams?.length ? ai.exams : deterministicExams).filter((e) => e.chapters?.length);

    // Wipe prior evidence for this doc, then re-insert (idempotent re-parse).
    await (supabaseAdmin.from("course_evidence") as any).delete().eq("course_document_id", doc.id);
    const rows: Array<Record<string, unknown>> = [];
    for (const e of exams) {
      rows.push({
        course_document_id: doc.id, campus_id: doc.campus_id, professor_name: doc.professor_name, course_family: "intro_1",
        evidence_type: "exam_chapter_range", exam_label: String(e.label).toLowerCase(), exam_chapters: e.chapters,
        raw_text: `${e.label}: ch ${e.chapters.join(", ")}`,
        confidence: scoreConfidence({ explicitExamRange: true, professorSpecific: !!doc.professor_name, ageYears: ai?.year ? 2026 - ai.year : null }).level,
        effective_term: ai?.term ? `${ai.term} ${ai.year ?? ""}`.trim() : null,
      });
    }
    let textbookId: string | null = null;
    if (ai?.textbook?.title) {
      const norm = normalizeTextbook({ title: ai.textbook.title, authors: ai.textbook.authors, publisher: ai.textbook.edition });
      const { data: tb } = await (supabaseAdmin.from("textbooks") as any)
        .upsert({ title: norm.canonicalTitle, authors: ai.textbook.authors ?? null, edition: ai.textbook.edition ?? null, edition_key: norm.editionKey, edition_confirmed: norm.editionConfirmed }, { onConflict: "edition_key" })
        .select("id").maybeSingle();
      textbookId = tb?.id ?? null;
      rows.push({
        course_document_id: doc.id, campus_id: doc.campus_id, professor_name: doc.professor_name, course_family: "intro_1",
        evidence_type: "textbook_reference", textbook_ref: ai.textbook.title, edition_ref: ai.textbook.edition ?? null,
        raw_text: `${ai.textbook.title} ${ai.textbook.authors ?? ""} ${ai.textbook.edition ?? ""}`.trim(),
        confidence: norm.editionConfirmed ? "High" : "Medium",
      });
    }
    if (rows.length) await (supabaseAdmin.from("course_evidence") as any).insert(rows);
    await (supabaseAdmin.from("course_document") as any).update({
      processing_status: "parsed", content_hash: h, last_checked: new Date().toISOString(), last_changed: new Date().toISOString(),
      textbook_id: textbookId, term: ai?.term ?? null, year: ai?.year ?? null,
    }).eq("id", doc.id);

    return { ok: true, exams: exams.length, textbook: ai?.textbook?.title ?? null, evidenceRows: rows.length };
  });

export const getCampusDocuments = createServerFn({ method: "GET" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: docs } = await (supabaseAdmin.from("course_document") as any)
      .select("id,professor_name,course_code,document_type,value_tier,title,source_url,source_domain,file_type,processing_status,term,year,first_seen")
      .eq("campus_id", data.campusId).order("value_tier", { ascending: true }).limit(200);
    const { data: evidence } = await (supabaseAdmin.from("course_evidence") as any)
      .select("id,course_document_id,evidence_type,exam_label,exam_chapters,textbook_ref,edition_ref,confidence,effective_term")
      .eq("campus_id", data.campusId).limit(500);
    return { docs: docs ?? [], evidence: evidence ?? [] };
  });
