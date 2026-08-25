/**
 * Course Intel harvest — Supabase PostgREST client (service role).
 * Row reads/writes only (no DDL). Writes go to the SAME live tables the app
 * pipeline uses (course_document, course_evidence, textbooks) plus the two
 * harvest tables (course_intel_campus_status, professor_intro1_evidence).
 */

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(method, pathAndQuery, { body, prefer } = {}) {
  const headers = { ...H };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`REST ${method} ${pathAndQuery.split("?")[0]} → ${r.status} ${txt.slice(0, 300)}`);
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("application/json") ? r.json() : null;
}

const enc = encodeURIComponent;

// ── Reads ────────────────────────────────────────────────────────────────────

/** Page through a select with a cursor on id (PostgREST caps at 1000/page). */
async function pageAll(table, select, filter = "") {
  const out = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const rows = await rest("GET", `${table}?select=${enc(select)}${filter}&order=id.asc&limit=${limit}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

const CAMPUS_COLS =
  "id,name,canonical_name,display_name,short_name,state,country,country_code,domains,email_domain,website_url,accounting_department_url,faculty_page_url,course_family_codes_json,course_family_titles_json,course_codes_json,institution_type,is_research_only,is_sec,active_roster,priority_tier,market_priority,campus_resolution_status,enriched_at";

/** The eligible campus universe (see universe.mjs for the rationale). */
export async function loadCampuses() {
  // is_research_only=false, drop the Test fixture. (institution_type='system'
  // and alias-dupes are filtered in universe.mjs after load.)
  return pageAll("campuses", CAMPUS_COLS, `&is_research_only=is.false&name=not.ilike.${enc("%test%")}`);
}

/** Map campus_id → professor count, for Pass B eligibility polling (one paged scan). */
export async function loadProfessorCounts() {
  const rows = await pageAll("campus_lead_suggestions", "campus_id", "&lead_type=eq.professor");
  const m = new Map();
  for (const r of rows) m.set(r.campus_id, (m.get(r.campus_id) || 0) + 1);
  return m;
}

/** Accounting professor candidates for a campus (Pass B seed). */
export async function loadProfessors(campusId) {
  const sel = "id,first_name,last_name,title,department,lead_type,rmp_target_course_counts_json,rmp_recent_target_match,status";
  const rows = await rest(
    "GET",
    `campus_lead_suggestions?select=${enc(sel)}&campus_id=eq.${campusId}&lead_type=eq.professor&limit=200`,
  );
  return rows;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Upsert a discovered document; returns the row (with id). merge-duplicates
 *  refreshes only the payload columns, preserving first_seen/content_hash/etc. */
export async function upsertDocument(row) {
  const res = await rest(
    "POST",
    "course_document?on_conflict=campus_id,source_url",
    { body: row, prefer: "resolution=merge-duplicates,return=representation" },
  );
  return Array.isArray(res) ? res[0] : res;
}

export async function markDocument(id, patch) {
  await rest("PATCH", `course_document?id=eq.${id}`, { body: patch, prefer: "return=minimal" });
}

// PostgREST bulk insert requires EVERY object to have identical keys, else it
// 400s with PGRST102 ("All object keys must match") and drops the whole batch.
// Our evidence rows are heterogeneous (range vs date vs topic vs textbook), so we
// union all keys and fill the missing ones with null before inserting.
function uniformRows(rows) {
  const keys = new Set();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const all = [...keys];
  return rows.map((r) => { const o = {}; for (const k of all) o[k] = k in r ? r[k] : null; return o; });
}

/** Replace evidence for a document (idempotent re-parse). */
export async function replaceEvidence(documentId, rows) {
  await rest("DELETE", `course_evidence?course_document_id=eq.${documentId}`, { prefer: "return=minimal" });
  if (rows.length) await rest("POST", "course_evidence", { body: uniformRows(rows), prefer: "return=minimal" });
}

export async function upsertTextbook(row) {
  const res = await rest(
    "POST",
    "textbooks?on_conflict=edition_key",
    { body: row, prefer: "resolution=merge-duplicates,return=representation" },
  );
  return Array.isArray(res) ? res[0] : res;
}

export async function upsertCampusStatus(row) {
  await rest(
    "POST",
    "course_intel_campus_status?on_conflict=campus_id",
    { body: { ...row, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" },
  );
}

export async function upsertProfessorEvidence(rows) {
  if (!rows.length) return;
  await rest(
    "POST",
    "professor_intro1_evidence?on_conflict=campus_id,professor_name,evidence_state,source_url",
    { body: uniformRows(rows), prefer: "resolution=merge-duplicates,return=minimal" },
  );
}

// ── Follow-behind helpers (DB-derived, cumulative status) ────────────────────

export async function getCampusStatus(campusId) {
  const rows = await rest("GET", `course_intel_campus_status?select=*&campus_id=eq.${campusId}&limit=1`);
  return rows[0] || null;
}

/** Cumulative document + evidence tallies for a campus, computed from the DB so a
 *  single-pass run never clobbers the other pass's contribution. */
export async function getCampusDocStats(campusId) {
  const docs = await rest("GET", `course_document?select=document_type,value_tier,title,source_url,textbook_id&campus_id=eq.${campusId}&course_family=eq.intro_1&limit=1000`);
  const ev = await rest("GET", `course_evidence?select=evidence_type,confidence&campus_id=eq.${campusId}&course_family=eq.intro_1&limit=1000`);
  const isReview = (d) => /review|practice/i.test(`${d.title} ${d.source_url}`);
  const rank = { Low: 1, Medium: 2, High: 3 };
  let maxConf = null;
  for (const e of ev) if (e.confidence && (!maxConf || rank[e.confidence] > rank[maxConf])) maxConf = e.confidence;
  return {
    documents_found: docs.length,
    high_value_documents: docs.filter((d) => d.value_tier === 1).length,
    syllabi_found: docs.filter((d) => d.document_type === "syllabus").length,
    study_guides_found: docs.filter((d) => d.document_type === "study_guide" && !isReview(d)).length,
    review_docs_found: docs.filter((d) => d.document_type === "study_guide" && isReview(d)).length,
    schedules_found: docs.filter((d) => d.document_type === "schedule").length,
    textbook_docs_found: docs.filter((d) => d.textbook_id).length,
    highest_source_confidence: maxConf,
  };
}

/** Distinct doc-confirmed Intro-1 professors for a campus. */
export async function getCampusConfirmedProfs(campusId) {
  const rows = await rest("GET", `professor_intro1_evidence?select=professor_name&campus_id=eq.${campusId}&evidence_state=eq.CONFIRMED_INTRO1&limit=500`);
  return new Set(rows.map((r) => (r.professor_name || "").toLowerCase().trim())).size;
}

export { rest };
