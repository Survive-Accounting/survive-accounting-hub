/**
 * Greek Academic Intelligence — Supabase PostgREST client (service role).
 * Row reads/writes only (no DDL). Reads the canonical identity tables
 * (campuses, campus_greek_chapters, greek_orgs); writes to the greek_academic_*
 * tables created by migration 20260825_0100.
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

/** Page through a select with offset (PostgREST caps at 1000/page). */
async function pageAll(table, select, filter = "") {
  const out = []; let offset = 0; const limit = 1000;
  for (;;) {
    const rows = await rest("GET", `${table}?select=${enc(select)}${filter}&order=id.asc&limit=${limit}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

// ── Reads ────────────────────────────────────────────────────────────────────
const CAMPUS_COLS =
  "id,name,canonical_name,display_name,short_name,state,country,country_code,domains,email_domain,website_url,fsl_url,institution_type,is_research_only,greek_eligibility,is_sec";

/** All non-test campuses (universe.mjs filters to Greek-eligible). Research-only
 *  campuses are INCLUDED here — a research university can still have social Greek
 *  life and publish an FSL academic report. */
export async function loadCampuses() {
  return pageAll("campuses", CAMPUS_COLS, `&name=not.ilike.${enc("%test%")}`);
}

/** campus_context.fsl_grade_report_url per campus (a seed URL if present). */
export async function loadFslSeedUrls() {
  const rows = await rest("GET", `campus_context?select=campus_id,fsl_grade_report_url&fsl_grade_report_url=not.is.null&limit=2000`).catch(() => []);
  const m = new Map();
  for (const r of rows || []) if (r.fsl_grade_report_url) m.set(r.campus_id, r.fsl_grade_report_url);
  return m;
}

/** National org catalog cached once (≈105 rows). PostgREST FK-embedding between
 *  campus_greek_chapters and greek_orgs is not resolvable (PGRST200), so we join
 *  in JS instead — more robust than depending on the schema-cache relationship. */
let _orgMap = null;
export async function loadGreekOrgs() {
  if (_orgMap) return _orgMap;
  const rows = await pageAll("greek_orgs", "id,name,nickname,letters,org_type,council");
  _orgMap = new Map(rows.map((o) => [o.id, o]));
  return _orgMap;
}

/** Roster chapters for a campus, enriched with the national org row for matching. */
export async function loadCampusChapters(campusId) {
  const orgMap = await loadGreekOrgs();
  const sel = "id,greek_org_id,chapter_designation,council,council_raw,letters,nickname,slug,status";
  const rows = await rest("GET", `campus_greek_chapters?select=${enc(sel)}&campus_id=eq.${campusId}&limit=500`).catch(() => []);
  for (const r of rows) r.greek_orgs = r.greek_org_id ? (orgMap.get(r.greek_org_id) || null) : null;
  return rows;
}

/** Which campuses already have IFC/Panhellenic chapters (the primary eligibility signal). */
export async function loadChapterCampusCouncils() {
  const rows = await pageAll("campus_greek_chapters", "id,campus_id,council,greek_org_id");
  const m = new Map(); // campusId → { total, ifc, panhel, nphc, mgc }
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  for (const c of rows) {
    const n = norm(c.council);
    const bucket = /ifc|interfrat/.test(n) ? "ifc" : /panhel/.test(n) ? "panhel" : /nphc/.test(n) ? "nphc" : /mgc|multicult/.test(n) ? "mgc" : "other";
    const cur = m.get(c.campus_id) || { total: 0, ifc: 0, panhel: 0, nphc: 0, mgc: 0, other: 0 };
    cur.total++; cur[bucket]++;
    m.set(c.campus_id, cur);
  }
  return m;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Upsert a discovered/parsed report; returns the row (with id). */
export async function upsertReport(row) {
  const res = await rest("POST", "greek_academic_reports?on_conflict=campus_id,canonical_url",
    { body: { ...row, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=representation" });
  return Array.isArray(res) ? res[0] : res;
}
export async function markReport(id, patch) {
  await rest("PATCH", `greek_academic_reports?id=eq.${id}`, { body: { ...patch, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
}

/** Replace all chapter-academic rows for a report (idempotent re-parse). */
export async function replaceChapterAcademics(reportId, rows) {
  await rest("DELETE", `greek_chapter_academics?source_report_id=eq.${reportId}`, { prefer: "return=minimal" });
  if (rows.length) await rest("POST", "greek_chapter_academics", { body: rows, prefer: "return=minimal" });
}

export async function upsertCampusStatus(row) {
  await rest("POST", "greek_academic_campus_status?on_conflict=campus_id",
    { body: { ...row, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" });
}

export async function upsertMetrics(rows) {
  if (!rows.length) return;
  await rest("POST", "greek_chapter_academic_metrics?on_conflict=campus_greek_chapter_id",
    { body: rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), prefer: "resolution=merge-duplicates,return=minimal" });
}

export async function insertRun(row) {
  const res = await rest("POST", "greek_academic_runs", { body: row, prefer: "return=representation" });
  return Array.isArray(res) ? res[0] : res;
}
export async function updateRun(id, patch) {
  await rest("PATCH", `greek_academic_runs?id=eq.${id}`, { body: patch, prefer: "return=minimal" });
}

// ── Read-back helpers (reports/CSV export) ────────────────────────────────────
export async function getAllReports() {
  return pageAll("greek_academic_reports", "*");
}
export async function getAllChapterAcademics() {
  return pageAll("greek_chapter_academics", "*");
}
export async function getAllCampusStatus() {
  const rows = await rest("GET", "greek_academic_campus_status?select=*&limit=2000");
  return rows || [];
}
export async function getChapterAcademicsForCampus(campusId) {
  return rest("GET", `greek_chapter_academics?select=*&campus_id=eq.${campusId}&limit=2000`).catch(() => []);
}

export { rest };
