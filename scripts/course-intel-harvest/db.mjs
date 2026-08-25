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
  "id,name,canonical_name,display_name,short_name,state,country,country_code,domains,email_domain,website_url,accounting_department_url,faculty_page_url,course_family_codes_json,course_family_titles_json,course_codes_json,institution_type,is_research_only";

/** The eligible campus universe (see universe.mjs for the rationale). */
export async function loadCampuses() {
  // is_research_only=false, drop the Test fixture. (institution_type='system'
  // and alias-dupes are filtered in universe.mjs after load.)
  return pageAll("campuses", CAMPUS_COLS, `&is_research_only=is.false&name=not.ilike.${enc("%test%")}`);
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

/** Replace evidence for a document (idempotent re-parse). */
export async function replaceEvidence(documentId, rows) {
  await rest("DELETE", `course_evidence?course_document_id=eq.${documentId}`, { prefer: "return=minimal" });
  if (rows.length) await rest("POST", "course_evidence", { body: rows, prefer: "return=minimal" });
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
    { body: rows, prefer: "resolution=merge-duplicates,return=minimal" },
  );
}

export { rest };
