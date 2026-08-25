// GROWTH PRIORITY — data assembly + persistence (server-only).
//
// Gathers PriorityInput rows from the live intelligence tables, runs the pure
// growth_priority_v1 model (growth-priority-core.ts), and stores the result in
// growth_campus_priority. Called by the admin server function and by
// scripts/growth-priority/refresh.ts. Import DYNAMICALLY from .functions.ts.
import {
  computePriority,
  type PriorityInput,
  type PriorityRow,
} from "@/lib/growth-priority-core";

type DB = { from: (t: string) => any };

/** PostgREST pages at 1000 rows — page until short page. */
async function selectAll<T = any>(db: DB, table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = db.from(table).select(columns).range(from, from + page - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export async function gatherPriorityInputs(db: DB): Promise<PriorityInput[]> {
  const [
    market, campuses, elig, chapters, quarantine, competitive, courseIntel,
    profEvidence, examEvidence, campusExams, entitlements, waitlist, orders, claims, attempts,
  ] = await Promise.all([
    selectAll(db, "campus_market_intelligence",
      "campus_id,segment,business_bachelors,growth_momentum_score,dup:raw_json->>duplicate_primary"),
    selectAll(db, "campuses", "id,name,display_name,slug"),
    selectAll(db, "growth_outreach_eligibility",
      "campus_id,chapter_id,council_type,contact_type,email,instagram,outreach_eligible,confidence"),
    selectAll(db, "campus_greek_chapters", "campus_id,greek_org_id", (q) => q.is("archived_at", null)),
    selectAll(db, "growth_scoring_exclusions", "campus_id,metric"),
    selectAll(db, "campus_competitive_intel",
      "campus_id,validated_paid_market,intro_accounting_paid_market_status,course_specific_competitors,ads_observed,market_status"),
    selectAll(db, "course_intel_campus_status", "campus_id,course_code,syllabi_found,textbook_docs_found"),
    selectAll(db, "professor_intro1_evidence", "campus_id,evidence_state"),
    selectAll(db, "course_evidence", "campus_id,evidence_type,exam_label", (q) =>
      q.in("evidence_type", ["exam_chapter_range", "textbook_reference"])),
    selectAll(db, "campus_exams", "campus_id,professor_id,status", (q) => q.eq("status", "active")),
    selectAll(db, "student_entitlements", "campus_id,user_id,source", (q) => q.is("revoked_at", null).not("is_test", "is", true)),
    selectAll(db, "campus_waitlist", "campus_id", (q) => q.not("is_test", "is", true)),
    selectAll(db, "orders", "campus_id"),
    selectAll(db, "greek_chapter_claims", "campus_greek_chapter_id,status"),
    selectAll(db, "practice_attempts", "campus,user_id", (q) => q.not("is_test", "is", true)),
  ]);

  const bySlug = new Map<string, string>();
  const nameOf = new Map<string, string>();
  for (const c of campuses as any[]) {
    if (c.slug) bySlug.set(String(c.slug), c.id);
    nameOf.set(c.id, c.display_name || c.name);
  }

  // chapter -> campus (for claims)
  const chapterCampus = new Map<string, string>();

  const agg = new Map<string, PriorityInput>();
  const get = (campusId: string): PriorityInput => {
    let row = agg.get(campusId);
    if (!row) {
      row = {
        campusId, name: nameOf.get(campusId) ?? campusId, duplicateSuppressed: false, segment: null,
        businessBachelors: null, growthMomentum: null,
        eligibleCouncilEmails: 0, eligibleChapterEmails: 0, instagramContacts: 0,
        socialChapters: 0, greekQuarantined: false,
        hasCompetitiveRow: false, validatedPaidMarket: false, introPaidStatus: null,
        courseSpecificCompetitors: 0, adsObserved: false, marketStatus: null,
        hasCourseCode: false, confirmedIntro1Professors: 0, likelyIntro1Professors: 0,
        exam1RangeEvidence: false, textbookEvidence: false, syllabiFound: 0, approvedCampusMap: false,
        identifiedUsers: 0, paidUsers: 0, practiceAttempts: 0, waitlistSignups: 0, orders: 0, chapterClaims: 0,
      };
      agg.set(campusId, row);
    }
    return row;
  };

  for (const m of market as any[]) {
    const r = get(m.campus_id);
    r.segment = m.segment ?? null;
    r.businessBachelors = m.business_bachelors ?? null;
    r.growthMomentum = m.growth_momentum_score == null ? null : Number(m.growth_momentum_score);
    r.duplicateSuppressed = m.dup === "false";
  }
  for (const e of elig as any[]) {
    if (!e.campus_id) continue;
    const r = get(e.campus_id);
    if (e.instagram) r.instagramContacts++;
    if (e.outreach_eligible && e.email) {
      if (e.chapter_id) r.eligibleChapterEmails++;
      else if (e.council_type) r.eligibleCouncilEmails++;
    }
  }
  const orgTypes = new Map<string, string>();
  for (const o of await selectAll(db, "greek_orgs", "id,org_type")) {
    orgTypes.set((o as any).id, (o as any).org_type ?? "unknown");
  }
  for (const c of chapters as any[]) {
    if (!c.campus_id) continue;
    const orgType = orgTypes.get(c.greek_org_id) ?? "unknown";
    if (!["professional", "honor", "service"].includes(orgType)) get(c.campus_id).socialChapters++;
  }
  for (const q of quarantine as any[]) {
    if (q.metric === "greek_chapter_count") get(q.campus_id).greekQuarantined = true;
  }
  for (const c of competitive as any[]) {
    const r = get(c.campus_id);
    r.hasCompetitiveRow = true;
    r.validatedPaidMarket = !!c.validated_paid_market;
    r.introPaidStatus = c.intro_accounting_paid_market_status ?? null;
    r.courseSpecificCompetitors = c.course_specific_competitors ?? 0;
    r.adsObserved = !!c.ads_observed;
    r.marketStatus = c.market_status ?? null;
  }
  for (const s of courseIntel as any[]) {
    const r = get(s.campus_id);
    r.hasCourseCode = s.course_code != null && String(s.course_code).trim() !== "";
    r.syllabiFound = s.syllabi_found ?? 0;
    if ((s.textbook_docs_found ?? 0) > 0) r.textbookEvidence = true;
  }
  for (const p of profEvidence as any[]) {
    const r = get(p.campus_id);
    if (p.evidence_state === "CONFIRMED_INTRO1") r.confirmedIntro1Professors++;
    else if (p.evidence_state === "LIKELY_INTRO1") r.likelyIntro1Professors++;
  }
  for (const ev of examEvidence as any[]) {
    if (!ev.campus_id) continue;
    const r = get(ev.campus_id);
    if (ev.evidence_type === "textbook_reference") r.textbookEvidence = true;
    else if (ev.evidence_type === "exam_chapter_range" && norm(ev.exam_label).includes("exam1")) r.exam1RangeEvidence = true;
  }
  for (const ex of campusExams as any[]) {
    if (ex.campus_id && !ex.professor_id) get(ex.campus_id).approvedCampusMap = true;
  }
  const paidByCampus = new Map<string, Set<string>>();
  const usersByCampus = new Map<string, Set<string>>();
  for (const e of entitlements as any[]) {
    if (!e.campus_id || !e.user_id) continue;
    if (!usersByCampus.has(e.campus_id)) usersByCampus.set(e.campus_id, new Set());
    usersByCampus.get(e.campus_id)!.add(e.user_id);
    if (e.source === "stripe") {
      if (!paidByCampus.has(e.campus_id)) paidByCampus.set(e.campus_id, new Set());
      paidByCampus.get(e.campus_id)!.add(e.user_id);
    }
  }
  const attemptUsers = new Map<string, Set<string>>();
  for (const a of attempts as any[]) {
    const campusId = a.campus ? bySlug.get(String(a.campus)) : undefined;
    if (!campusId) continue;
    get(campusId).practiceAttempts++;
    if (a.user_id) {
      if (!attemptUsers.has(campusId)) attemptUsers.set(campusId, new Set());
      attemptUsers.get(campusId)!.add(a.user_id);
    }
  }
  for (const [campusId, users] of usersByCampus) get(campusId).identifiedUsers += users.size;
  for (const [campusId, users] of attemptUsers) {
    const known = usersByCampus.get(campusId) ?? new Set();
    for (const u of users) if (!known.has(u)) get(campusId).identifiedUsers++;
  }
  for (const [campusId, users] of paidByCampus) get(campusId).paidUsers = users.size;
  for (const w of waitlist as any[]) if (w.campus_id) get(w.campus_id).waitlistSignups++;
  for (const o of orders as any[]) if (o.campus_id) get(o.campus_id).orders++;
  // claims join through the chapter roster (fetch mapping only for claimed chapters)
  const claimed = (claims as any[]).filter((c) => c.campus_greek_chapter_id);
  if (claimed.length) {
    const ids = [...new Set(claimed.map((c) => c.campus_greek_chapter_id))];
    const { data } = await db.from("campus_greek_chapters").select("id,campus_id").in("id", ids);
    for (const row of data ?? []) chapterCampus.set(row.id, row.campus_id);
    for (const c of claimed) {
      const campusId = chapterCampus.get(c.campus_greek_chapter_id);
      if (campusId) get(campusId).chapterClaims++;
    }
  }

  // Only campuses with a market row enter the ranking universe (675 primary institutions).
  return [...agg.values()].filter((r) => r.segment != null);
}

export async function refreshGrowthPriority(db: DB): Promise<{ ranked: number; top: PriorityRow[] }> {
  const inputs = await gatherPriorityInputs(db);
  const rows = computePriority(inputs);
  // Full replace: ranking is a snapshot, not an event log.
  const del = await db.from("growth_campus_priority").delete().neq("rank", -1);
  if (del.error) throw new Error(`clear priority: ${del.error.message}`);
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({
      campus_id: r.campusId, rank: r.rank, score: r.score, version: r.version,
      why: r.why, components: { ...r.components, baskets: r.baskets },
      computed_at: new Date().toISOString(),
    }));
    const { error } = await db.from("growth_campus_priority").upsert(batch, { onConflict: "campus_id" });
    if (error) throw new Error(`write priority: ${error.message}`);
  }
  return { ranked: rows.length, top: rows.slice(0, 25) };
}
