// Growth Admin — read/aggregation server functions for /admin/growth.
//
// These power the Overview KPIs and the Campuses / Chapters / Councils / National
// Orgs tables + detail drawers. All reads use the service-role client (bypasses
// RLS), consistent with the rest of the /outreach admin surface which gates in the
// UI via <AdminGate>. Column truth comes from the LIVE schema (types.ts is stale),
// so every table access is cast through `any`.
//
// LAW: this file ships to the client bundle; only .handler() bodies are stripped.
// The service-role client MUST be imported dynamically inside each handler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { councilSlugOf, intro1Code, orgSlugify } from "@/lib/growth-util";

// ---------------------------------------------------------------------------
// Types returned to the client
// ---------------------------------------------------------------------------
export interface GrowthKpis {
  storageReady: boolean; // false until the growth_* migration is applied
  campuses: number;
  studentReadyCampuses: number;
  greekReadyCampuses: number;
  outreachReadyCampuses: number;
  activeChapters: number;
  claimedChapters: number;
  nationalOrgs: number;
  chapterMembers: number;
  seatedStudents: number;
  paidOrders: number;
  directRevenueCents: number;
  seatRevenueCents: number;
  followUpsDue: number;
  neverContactedCampuses: number;
}

export interface CampusRow {
  id: string;
  name: string;
  slug: string | null;
  state: string | null;
  isSec: boolean;
  colorPrimary: string | null;
  colorSecondary: string | null;
  courseCode: string | null;
  chapters: number;
  councils: number;
  contacts: number;
  members: number;
  directRevenueCents: number;
  seatRevenueCents: number;
  lastOutreachAt: string | null;
  followUpsDue: number;
  // derived readiness (heuristic — the canonical model is owned by the campus session)
  studentReady: boolean;
  greekReady: boolean;
  outreachReady: boolean;
  // data-quality flags
  needsGreekData: boolean;
  needsContact: boolean;
  courseNeedsReview: boolean;
  routeIssue: boolean;
}

export interface CampusListResult {
  rows: CampusRow[];
  total: number;
  page: number;
  pageSize: number;
  kpis: GrowthKpis;
}

export interface ChapterRow {
  id: string; // campus_greek_chapters.id
  chapterName: string;
  campusId: string | null;
  campusName: string;
  orgId: string | null;
  orgName: string | null;
  council: string | null;
  letters: string | null;
  instagram: string | null;
  size: number | null;
  claimStatus: string | null;
  isNationalOrg: boolean;
  slug: string | null;
  members: number;
  contacts: number;
  seatRevenueCents: number;
  lastOutreachAt: string | null;
  followUpsDue: number;
  needsContact: boolean;
}

export interface ChapterListResult {
  rows: ChapterRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CouncilRow {
  campusId: string;
  campusName: string;
  campusSlug: string | null;
  councilSlug: string; // ifc | panhellenic | nphc | mgc | other
  councilName: string;
  chapters: number;
  contacts: number;
  members: number;
  lastOutreachAt: string | null;
}

export interface OrgRow {
  id: string;
  name: string;
  slug: string; // orgSlugify(full name) — matches /partners/national/<slug>
  letters: string | null;
  council: string | null;
  campuses: number;
  chapters: number;
  claimedChapters: number;
  members: number;
  people: number; // greek_org_people
  lastOutreachAt: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers (pure — receive db, no server-only import at module scope)
// ---------------------------------------------------------------------------
type DB = { from: (t: string) => any };

const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** True when a PostgREST error means "table not found" (migration not applied yet). */
function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    (typeof e.message === "string" && /does not exist|could not find the table/i.test(e.message))
  );
}

/** Page through a PostgREST select (1000-row cap) and return every row. */
async function selectAllPaged<T = any>(
  db: DB,
  table: string,
  columns: string,
  tune?: (q: any) => any,
): Promise<{ rows: T[]; missing: boolean }> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (tune) q = tune(q);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return { rows: out, missing: true };
      throw error;
    }
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows: out, missing: false };
}

interface Aggregates {
  storageReady: boolean;
  chaptersByCampus: Map<string, number>;
  councilsByCampus: Map<string, Set<string>>;
  claimedChaptersByCampus: Map<string, number>;
  membersByCampus: Map<string, number>;
  contactsByCampus: Map<string, number>;
  directRevByCampus: Map<string, number>;
  seatRevByCampus: Map<string, number>;
  lastOutreachByCampus: Map<string, string>;
  followUpsByCampus: Map<string, number>;
  // chapter-scoped maps (keyed by campus_greek_chapters.id)
  membersByChapter: Map<string, number>;
  contactsByChapter: Map<string, number>;
  seatRevByChapter: Map<string, number>;
  lastOutreachByChapter: Map<string, string>;
  followUpsByChapter: Map<string, number>;
}

const inc = (m: Map<string, number>, k: string | null | undefined, by = 1) => {
  if (!k) return;
  m.set(k, (m.get(k) ?? 0) + by);
};
const maxDate = (
  m: Map<string, string>,
  k: string | null | undefined,
  d: string | null | undefined,
) => {
  if (!k || !d) return;
  const cur = m.get(k);
  if (!cur || d > cur) m.set(k, d);
};

/**
 * One bulk pass that builds every per-campus and per-chapter aggregate the whole
 * workspace needs. At current scale (946 campuses / 2.3k chapters / tiny product
 * tables) this is a handful of paged selects — cheap and cached by React Query.
 */
async function buildAggregates(db: DB): Promise<Aggregates> {
  const a: Aggregates = {
    storageReady: true,
    chaptersByCampus: new Map(),
    councilsByCampus: new Map(),
    claimedChaptersByCampus: new Map(),
    membersByCampus: new Map(),
    contactsByCampus: new Map(),
    directRevByCampus: new Map(),
    seatRevByCampus: new Map(),
    lastOutreachByCampus: new Map(),
    followUpsByCampus: new Map(),
    membersByChapter: new Map(),
    contactsByChapter: new Map(),
    seatRevByChapter: new Map(),
    lastOutreachByChapter: new Map(),
    followUpsByChapter: new Map(),
  };

  // campus_greek_chapters -> chapter counts, council sets, claimed counts, id->campus map
  const cgc = await selectAllPaged<{
    id: string;
    campus_id: string | null;
    council: string | null;
    claim_status: string | null;
  }>(db, "campus_greek_chapters", "id,campus_id,council,claim_status,archived_at", (q) =>
    q.is("archived_at", null),
  );
  const chapterCampus = new Map<string, string | null>();
  for (const r of cgc.rows) {
    chapterCampus.set(r.id, r.campus_id);
    inc(a.chaptersByCampus, r.campus_id ?? undefined);
    if (r.campus_id) {
      if (!a.councilsByCampus.has(r.campus_id)) a.councilsByCampus.set(r.campus_id, new Set());
      a.councilsByCampus.get(r.campus_id)!.add(councilSlugOf(r.council).slug);
    }
    if ((r.claim_status ?? "").toLowerCase() === "claimed")
      inc(a.claimedChaptersByCampus, r.campus_id ?? undefined);
  }

  // greek_chapters (product shell) -> map its id to a campus_greek_chapters id + campus
  const gc = await selectAllPaged<{
    id: string;
    campus_id: string | null;
    campus_greek_chapter_id: string | null;
  }>(db, "greek_chapters", "id,campus_id,campus_greek_chapter_id");
  const shellToCampus = new Map<string, string | null>();
  const shellToCgc = new Map<string, string | null>();
  for (const r of gc.rows) {
    shellToCampus.set(r.id, r.campus_id);
    shellToCgc.set(r.id, r.campus_greek_chapter_id);
  }

  // greek_chapter_members -> members per campus + per chapter (via shell)
  const mem = await selectAllPaged<{ chapter_id: string | null; seat_assigned_at: string | null }>(
    db,
    "greek_chapter_members",
    "chapter_id,seat_assigned_at",
  );
  for (const r of mem.rows) {
    const campus = r.chapter_id ? shellToCampus.get(r.chapter_id) : null;
    inc(a.membersByCampus, campus ?? undefined);
    const cgcId = r.chapter_id ? shellToCgc.get(r.chapter_id) : null;
    inc(a.membersByChapter, cgcId ?? undefined);
  }

  // greek_chapter_contacts (existing per-chapter contacts) -> contacts per chapter/campus
  const gcc = await selectAllPaged<{ chapter_id: string | null }>(
    db,
    "greek_chapter_contacts",
    "chapter_id",
  );
  for (const r of gcc.rows) {
    inc(a.contactsByChapter, r.chapter_id ?? undefined);
    const campus = r.chapter_id ? chapterCampus.get(r.chapter_id) : null;
    inc(a.contactsByCampus, campus ?? undefined);
  }

  // orders -> direct revenue per campus (paid/delivered, non-waitlist)
  const ord = await selectAllPaged<{
    campus_id: string | null;
    total_cents: number | null;
    status: string | null;
    is_waitlist: boolean | null;
  }>(db, "orders", "campus_id,total_cents,status,is_waitlist");
  for (const r of ord.rows) {
    const paid = ["paid", "delivered"].includes((r.status ?? "").toLowerCase());
    if (paid && !r.is_waitlist)
      inc(a.directRevByCampus, r.campus_id ?? undefined, r.total_cents ?? 0);
  }

  // chapter_seat_pools -> seat revenue per campus/chapter (active/paid, non-test)
  const pools = await selectAllPaged<{
    chapter_id: string | null;
    amount_cents: number | null;
    status: string | null;
    is_test: boolean | null;
  }>(db, "chapter_seat_pools", "chapter_id,amount_cents,status,is_test");
  for (const r of pools.rows) {
    const live = ["active", "paid"].includes((r.status ?? "").toLowerCase());
    if (!live || r.is_test) continue;
    const campus = r.chapter_id ? shellToCampus.get(r.chapter_id) : null;
    inc(a.seatRevByCampus, campus ?? undefined, r.amount_cents ?? 0);
    const cgcId = r.chapter_id ? shellToCgc.get(r.chapter_id) : null;
    inc(a.seatRevByChapter, cgcId ?? undefined, r.amount_cents ?? 0);
  }

  // growth_* contacts/events (may be missing until migration applied)
  const roles = await selectAllPaged<{
    contact_id: string;
    entity_type: string;
    entity_id: string | null;
    campus_id: string | null;
  }>(db, "growth_contact_roles", "contact_id,entity_type,entity_id,campus_id");
  if (roles.missing) a.storageReady = false;
  for (const r of roles.rows) {
    inc(a.contactsByCampus, r.campus_id ?? undefined);
    if (r.entity_type === "chapter") inc(a.contactsByChapter, r.entity_id ?? undefined);
  }

  const now = new Date().toISOString();
  const ev = await selectAllPaged<{
    entity_type: string | null;
    entity_id: string | null;
    campus_id: string | null;
    occurred_at: string | null;
    next_follow_up_at: string | null;
    follow_up_done_at: string | null;
  }>(
    db,
    "growth_outreach_events",
    "entity_type,entity_id,campus_id,occurred_at,next_follow_up_at,follow_up_done_at",
  );
  if (ev.missing) a.storageReady = false;
  for (const r of ev.rows) {
    maxDate(a.lastOutreachByCampus, r.campus_id ?? undefined, r.occurred_at);
    if (r.entity_type === "chapter")
      maxDate(a.lastOutreachByChapter, r.entity_id ?? undefined, r.occurred_at);
    const due = r.next_follow_up_at && !r.follow_up_done_at && r.next_follow_up_at <= now;
    if (due) {
      inc(a.followUpsByCampus, r.campus_id ?? undefined);
      if (r.entity_type === "chapter") inc(a.followUpsByChapter, r.entity_id ?? undefined);
    }
  }

  return a;
}

// ---------------------------------------------------------------------------
// Overview KPIs
// ---------------------------------------------------------------------------
export const getGrowthOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<GrowthKpis> => {
    const db = await admin();
    const a = await buildAggregates(db);

    const campuses = await selectAllPaged<{
      id: string;
      course_family_codes_json: unknown;
      archived_at: string | null;
      is_active: boolean | null;
    }>(db, "campuses", "id,course_family_codes_json,archived_at,is_active", (q) =>
      q.is("archived_at", null),
    );

    let studentReady = 0;
    let greekReady = 0;
    let outreachReady = 0;
    let neverContacted = 0;
    for (const c of campuses.rows) {
      const sReady = !!intro1Code(c.course_family_codes_json);
      const gReady = (a.chaptersByCampus.get(c.id) ?? 0) > 0;
      const oReady = (a.contactsByCampus.get(c.id) ?? 0) > 0;
      if (sReady) studentReady++;
      if (gReady) greekReady++;
      if (oReady) outreachReady++;
      if (!a.lastOutreachByCampus.get(c.id)) neverContacted++;
    }

    const orgCount = await db
      .from("greek_orgs")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    const activeChapters = [...a.chaptersByCampus.values()].reduce((s, n) => s + n, 0);
    const claimedChapters = [...a.claimedChaptersByCampus.values()].reduce((s, n) => s + n, 0);

    // paid orders + seated students (small tables — count directly)
    const paid = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["paid", "delivered"]);
    const seated = await db
      .from("greek_chapter_members")
      .select("id", { count: "exact", head: true })
      .not("seat_assigned_at", "is", null);

    const sum = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);

    return {
      storageReady: a.storageReady,
      campuses: campuses.rows.length,
      studentReadyCampuses: studentReady,
      greekReadyCampuses: greekReady,
      outreachReadyCampuses: outreachReady,
      activeChapters,
      claimedChapters,
      nationalOrgs: orgCount.count ?? 0,
      chapterMembers: sum(a.membersByCampus),
      seatedStudents: seated.count ?? 0,
      paidOrders: paid.count ?? 0,
      directRevenueCents: sum(a.directRevByCampus),
      seatRevenueCents: sum(a.seatRevByCampus),
      followUpsDue: sum(a.followUpsByCampus),
      neverContactedCampuses: neverContacted,
    };
  },
);

// ---------------------------------------------------------------------------
// Campuses table
// ---------------------------------------------------------------------------
const CAMPUS_FILTERS = [
  "all",
  "student_ready",
  "greek_ready",
  "outreach_ready",
  "needs_greek",
  "needs_contacts",
  "has_users",
  "has_revenue",
] as const;

export const listGrowthCampuses = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().optional(),
        filter: z.enum(CAMPUS_FILTERS).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
        secOnly: z.boolean().default(false),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<CampusListResult> => {
    const db = await admin();
    const a = await buildAggregates(db);

    const campuses = await selectAllPaged<{
      id: string;
      name: string | null;
      institution_name: string | null;
      slug: string | null;
      state: string | null;
      is_sec: boolean | null;
      color_primary: string | null;
      color_secondary: string | null;
      course_family_codes_json: unknown;
      last_outreach_at: string | null;
    }>(
      db,
      "campuses",
      "id,name,institution_name,slug,state,is_sec,color_primary,color_secondary,course_family_codes_json,last_outreach_at,archived_at",
      (q) => q.is("archived_at", null),
    );

    let rows: CampusRow[] = campuses.rows.map((c) => {
      const chapters = a.chaptersByCampus.get(c.id) ?? 0;
      const contacts = a.contactsByCampus.get(c.id) ?? 0;
      const code = intro1Code(c.course_family_codes_json);
      const lastEvent = a.lastOutreachByCampus.get(c.id) ?? null;
      const lastOutreachAt = [lastEvent, c.last_outreach_at].filter(Boolean).sort().pop() ?? null;
      const studentReady = !!code;
      const greekReady = chapters > 0;
      const outreachReady = contacts > 0;
      return {
        id: c.id,
        name: c.institution_name || c.name || "Campus",
        slug: c.slug,
        state: c.state,
        isSec: !!c.is_sec,
        colorPrimary: c.color_primary,
        colorSecondary: c.color_secondary,
        courseCode: code,
        chapters,
        councils: a.councilsByCampus.get(c.id)?.size ?? 0,
        contacts,
        members: a.membersByCampus.get(c.id) ?? 0,
        directRevenueCents: a.directRevByCampus.get(c.id) ?? 0,
        seatRevenueCents: a.seatRevByCampus.get(c.id) ?? 0,
        lastOutreachAt,
        followUpsDue: a.followUpsByCampus.get(c.id) ?? 0,
        studentReady,
        greekReady,
        outreachReady,
        needsGreekData: !greekReady,
        needsContact: contacts === 0,
        courseNeedsReview: !code,
        routeIssue: !c.slug,
      };
    });

    // search
    const q = (data.q ?? "").toLowerCase().trim();
    if (q)
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.state ?? "").toLowerCase().includes(q) ||
          (r.courseCode ?? "").toLowerCase().includes(q),
      );
    if (data.secOnly) rows = rows.filter((r) => r.isSec);

    // filter
    switch (data.filter) {
      case "student_ready":
        rows = rows.filter((r) => r.studentReady);
        break;
      case "greek_ready":
        rows = rows.filter((r) => r.greekReady);
        break;
      case "outreach_ready":
        rows = rows.filter((r) => r.outreachReady);
        break;
      case "needs_greek":
        rows = rows.filter((r) => r.needsGreekData);
        break;
      case "needs_contacts":
        rows = rows.filter((r) => r.needsContact);
        break;
      case "has_users":
        rows = rows.filter((r) => r.members > 0);
        break;
      case "has_revenue":
        rows = rows.filter((r) => r.directRevenueCents + r.seatRevenueCents > 0);
        break;
    }

    // sort: revenue desc, then chapters desc, then name
    rows.sort(
      (x, y) =>
        y.directRevenueCents + y.seatRevenueCents - (x.directRevenueCents + x.seatRevenueCents) ||
        y.chapters - x.chapters ||
        x.name.localeCompare(y.name),
    );

    const total = rows.length;
    const start = (data.page - 1) * data.pageSize;
    const paged = rows.slice(start, start + data.pageSize);

    // KPIs (whole filtered universe is already computed in overview; reuse the same numbers here)
    const kpis = await computeKpisFromAggregates(db, a);

    return { rows: paged, total, page: data.page, pageSize: data.pageSize, kpis };
  });

async function computeKpisFromAggregates(db: DB, a: Aggregates): Promise<GrowthKpis> {
  const campuses = await selectAllPaged<{ id: string; course_family_codes_json: unknown }>(
    db,
    "campuses",
    "id,course_family_codes_json,archived_at",
    (q) => q.is("archived_at", null),
  );
  let studentReady = 0,
    greekReady = 0,
    outreachReady = 0,
    neverContacted = 0;
  for (const c of campuses.rows) {
    if (intro1Code(c.course_family_codes_json)) studentReady++;
    if ((a.chaptersByCampus.get(c.id) ?? 0) > 0) greekReady++;
    if ((a.contactsByCampus.get(c.id) ?? 0) > 0) outreachReady++;
    if (!a.lastOutreachByCampus.get(c.id)) neverContacted++;
  }
  const orgCount = await db
    .from("greek_orgs")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  const paid = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", ["paid", "delivered"]);
  const seated = await db
    .from("greek_chapter_members")
    .select("id", { count: "exact", head: true })
    .not("seat_assigned_at", "is", null);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);
  return {
    storageReady: a.storageReady,
    campuses: campuses.rows.length,
    studentReadyCampuses: studentReady,
    greekReadyCampuses: greekReady,
    outreachReadyCampuses: outreachReady,
    activeChapters: [...a.chaptersByCampus.values()].reduce((s, n) => s + n, 0),
    claimedChapters: [...a.claimedChaptersByCampus.values()].reduce((s, n) => s + n, 0),
    nationalOrgs: orgCount.count ?? 0,
    chapterMembers: sum(a.membersByCampus),
    seatedStudents: seated.count ?? 0,
    paidOrders: paid.count ?? 0,
    directRevenueCents: sum(a.directRevByCampus),
    seatRevenueCents: sum(a.seatRevByCampus),
    followUpsDue: sum(a.followUpsByCampus),
    neverContactedCampuses: neverContacted,
  };
}

// ---------------------------------------------------------------------------
// Campus detail (drawer)
// ---------------------------------------------------------------------------
export interface CampusDetail {
  id: string;
  name: string;
  slug: string | null;
  state: string | null;
  isSec: boolean;
  courseCode: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  outreachStatus: string | null;
  outreachNotes: string | null;
  publicPath: string | null;
  councils: { slug: string; name: string; chapters: number }[];
  chapters: ChapterRow[];
  studentReady: boolean;
  greekReady: boolean;
  outreachReady: boolean;
  directRevenueCents: number;
  seatRevenueCents: number;
  members: number;
  flags: string[];
}

export const getGrowthCampusDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CampusDetail | null> => {
    const db = await admin();
    const { data: c } = await db
      .from("campuses")
      .select(
        "id,name,institution_name,slug,state,is_sec,color_primary,color_secondary,course_family_codes_json,outreach_status,outreach_notes",
      )
      .eq("id", data.campusId)
      .maybeSingle();
    if (!c) return null;

    const a = await buildAggregates(db);
    const chapters = await chaptersForCampus(db, data.campusId, a);

    const councilMap = new Map<string, { slug: string; name: string; chapters: number }>();
    for (const ch of chapters) {
      const { slug, name } = councilSlugOf(ch.council);
      if (!councilMap.has(slug)) councilMap.set(slug, { slug, name, chapters: 0 });
      councilMap.get(slug)!.chapters++;
    }

    const code = intro1Code(c.course_family_codes_json);
    const flags: string[] = [];
    if (chapters.length === 0) flags.push("Missing Greek data");
    if (!code) flags.push("Course needs review");
    if (!c.slug) flags.push("Route issue");
    if ((a.contactsByCampus.get(c.id) ?? 0) === 0) flags.push("Missing contact");

    return {
      id: c.id,
      name: c.institution_name || c.name || "Campus",
      slug: c.slug,
      state: c.state,
      isSec: !!c.is_sec,
      courseCode: code,
      colorPrimary: c.color_primary,
      colorSecondary: c.color_secondary,
      outreachStatus: c.outreach_status,
      outreachNotes: c.outreach_notes,
      publicPath: c.slug ? `/go/${c.slug}` : null,
      councils: [...councilMap.values()].sort((x, y) => y.chapters - x.chapters),
      chapters,
      studentReady: !!code,
      greekReady: chapters.length > 0,
      outreachReady: (a.contactsByCampus.get(c.id) ?? 0) > 0,
      directRevenueCents: a.directRevByCampus.get(c.id) ?? 0,
      seatRevenueCents: a.seatRevByCampus.get(c.id) ?? 0,
      members: a.membersByCampus.get(c.id) ?? 0,
      flags,
    };
  });

async function chaptersForCampus(db: DB, campusId: string, a: Aggregates): Promise<ChapterRow[]> {
  const { rows } = await selectAllPaged<any>(
    db,
    "campus_greek_chapters",
    "id,campus_id,greek_org_id,chapter_designation,letters,nickname,council,instagram_url,chapter_size,claim_status,is_national_org,slug,archived_at",
    (q) => q.eq("campus_id", campusId).is("archived_at", null),
  );
  const orgIds = [...new Set(rows.map((r) => r.greek_org_id).filter(Boolean))];
  const orgNames = await orgNameMap(db, orgIds);
  return rows.map((r) => chapterRowFrom(r, "", orgNames, a));
}

async function orgNameMap(db: DB, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const { data } = await db.from("greek_orgs").select("id,name,nickname").in("id", ids);
  for (const o of (data ?? []) as any[]) m.set(o.id, o.nickname || o.name);
  return m;
}

function chapterRowFrom(
  r: any,
  campusName: string,
  orgNames: Map<string, string>,
  a: Aggregates,
): ChapterRow {
  return {
    id: r.id,
    chapterName:
      r.nickname ||
      r.chapter_designation ||
      (r.greek_org_id ? orgNames.get(r.greek_org_id) : null) ||
      "Chapter",
    campusId: r.campus_id ?? null,
    campusName,
    orgId: r.greek_org_id ?? null,
    orgName: r.greek_org_id ? (orgNames.get(r.greek_org_id) ?? null) : null,
    council: r.council ?? null,
    letters: r.letters ?? null,
    instagram: r.instagram_url ?? null,
    size: r.chapter_size ?? null,
    claimStatus: r.claim_status ?? null,
    isNationalOrg: !!r.is_national_org,
    slug: r.slug ?? null,
    members: a.membersByChapter.get(r.id) ?? 0,
    contacts: a.contactsByChapter.get(r.id) ?? 0,
    seatRevenueCents: a.seatRevByChapter.get(r.id) ?? 0,
    lastOutreachAt: a.lastOutreachByChapter.get(r.id) ?? null,
    followUpsDue: a.followUpsByChapter.get(r.id) ?? 0,
    needsContact: (a.contactsByChapter.get(r.id) ?? 0) === 0,
  };
}

// ---------------------------------------------------------------------------
// Chapters table (highest-use marketing table) — from campus_greek_chapters
// ---------------------------------------------------------------------------
export const listGrowthChapters = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().optional(),
        campusId: z.string().uuid().optional(),
        council: z.enum(["all", "ifc", "panhellenic", "nphc", "mgc", "other"]).default("all"),
        status: z.enum(["all", "claimed", "unclaimed", "needs_contact"]).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<ChapterListResult> => {
    const db = await admin();
    const a = await buildAggregates(db);

    const campusNames = await campusNameMap(db);
    const chapters = await selectAllPaged<any>(
      db,
      "campus_greek_chapters",
      "id,campus_id,greek_org_id,chapter_designation,letters,nickname,council,instagram_url,chapter_size,claim_status,is_national_org,slug,archived_at",
      (qb) => {
        let q = qb.is("archived_at", null);
        if (data.campusId) q = q.eq("campus_id", data.campusId);
        return q;
      },
    );

    const orgIds = [...new Set(chapters.rows.map((r) => r.greek_org_id).filter(Boolean))];
    const orgNames = await orgNameMap(db, orgIds);

    let rows: ChapterRow[] = chapters.rows.map((r) =>
      chapterRowFrom(r, r.campus_id ? (campusNames.get(r.campus_id) ?? "") : "", orgNames, a),
    );

    const q = (data.q ?? "").toLowerCase().trim();
    if (q)
      rows = rows.filter(
        (r) =>
          r.chapterName.toLowerCase().includes(q) ||
          (r.orgName ?? "").toLowerCase().includes(q) ||
          (r.letters ?? "").toLowerCase().includes(q) ||
          r.campusName.toLowerCase().includes(q),
      );
    if (data.council !== "all")
      rows = rows.filter((r) => councilSlugOf(r.council).slug === data.council);
    if (data.status === "claimed")
      rows = rows.filter((r) => (r.claimStatus ?? "").toLowerCase() === "claimed");
    if (data.status === "unclaimed")
      rows = rows.filter((r) => (r.claimStatus ?? "").toLowerCase() !== "claimed");
    if (data.status === "needs_contact") rows = rows.filter((r) => r.needsContact);

    rows.sort(
      (x, y) =>
        y.members - x.members ||
        y.seatRevenueCents - x.seatRevenueCents ||
        x.chapterName.localeCompare(y.chapterName),
    );

    const total = rows.length;
    const start = (data.page - 1) * data.pageSize;
    return {
      rows: rows.slice(start, start + data.pageSize),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

async function campusNameMap(db: DB): Promise<Map<string, string>> {
  const { rows } = await selectAllPaged<{
    id: string;
    name: string | null;
    institution_name: string | null;
  }>(db, "campuses", "id,name,institution_name");
  const m = new Map<string, string>();
  for (const c of rows) m.set(c.id, c.institution_name || c.name || "Campus");
  return m;
}

export interface ChapterDetail extends ChapterRow {
  campusSlug: string | null;
  publicPath: string | null;
  claimContact: {
    name: string | null;
    position: string | null;
    email: string | null;
    phone: string | null;
    status: string | null;
  } | null;
  execs: {
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    isCurrent: boolean;
    term: string | null;
    source: string | null;
  }[];
}

export const getGrowthChapterDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ chapterId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ChapterDetail | null> => {
    const db = await admin();
    const { data: r } = await db
      .from("campus_greek_chapters")
      .select(
        "id,campus_id,greek_org_id,chapter_designation,letters,nickname,council,instagram_url,chapter_size,claim_status,is_national_org,slug",
      )
      .eq("id", data.chapterId)
      .maybeSingle();
    if (!r) return null;

    const a = await buildAggregates(db);
    const campusNames = await campusNameMap(db);
    const orgNames = await orgNameMap(db, r.greek_org_id ? [r.greek_org_id] : []);
    const base = chapterRowFrom(
      r,
      r.campus_id ? (campusNames.get(r.campus_id) ?? "") : "",
      orgNames,
      a,
    );

    let campusSlug: string | null = null;
    if (r.campus_id) {
      const { data: c } = await db
        .from("campuses")
        .select("slug")
        .eq("id", r.campus_id)
        .maybeSingle();
      campusSlug = c?.slug ?? null;
    }

    // latest claim (from greek_chapter_claims — keyed to campus_greek_chapters.id)
    const { data: claims } = await db
      .from("greek_chapter_claims")
      .select("name,position,email,phone,status,created_at")
      .eq("campus_greek_chapter_id", data.chapterId)
      .order("created_at", { ascending: false })
      .limit(1);
    const claim = (claims ?? [])[0] ?? null;

    // execs: greek_chapter_contacts (snapshot) + greek_org_people (tenure) + growth roles
    const execs: ChapterDetail["execs"] = [];
    const { data: gcc } = await db
      .from("greek_chapter_contacts")
      .select("name,role,email,phone,source")
      .eq("chapter_id", data.chapterId);
    for (const p of (gcc ?? []) as any[])
      execs.push({
        name: p.name,
        role: p.role,
        email: p.email,
        phone: p.phone,
        isCurrent: true,
        term: null,
        source: p.source ?? "chapter_contacts",
      });
    const { data: people } = await db
      .from("greek_org_people")
      .select("person_name,titles,email,phone,is_current,first_year,last_year,source")
      .eq("chapter_id", data.chapterId);
    for (const p of (people ?? []) as any[])
      execs.push({
        name: p.person_name,
        role: Array.isArray(p.titles) ? p.titles.join(", ") : null,
        email: p.email,
        phone: p.phone,
        isCurrent: !!p.is_current,
        term: p.first_year
          ? `${p.first_year}${p.last_year && p.last_year !== p.first_year ? `–${p.last_year}` : ""}`
          : null,
        source: p.source ?? "org_people",
      });

    return {
      ...base,
      campusSlug,
      publicPath: campusSlug && r.slug ? `/go/${campusSlug}/${r.slug}` : null,
      claimContact: claim
        ? {
            name: claim.name,
            position: claim.position,
            email: claim.email,
            phone: claim.phone,
            status: claim.status,
          }
        : null,
      execs,
    };
  });

// ---------------------------------------------------------------------------
// Councils table (derived from campus_greek_chapters grouped by campus+council)
// ---------------------------------------------------------------------------
export const listGrowthCouncils = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      data,
    }): Promise<{ rows: CouncilRow[]; total: number; page: number; pageSize: number }> => {
      const db = await admin();
      const a = await buildAggregates(db);
      const campusNames = await campusNameMap(db);
      const campusSlugs = await campusSlugMap(db);

      const chapters = await selectAllPaged<any>(
        db,
        "campus_greek_chapters",
        "id,campus_id,council,archived_at",
        (q) => q.is("archived_at", null),
      );

      type Acc = CouncilRow & { chapterIds: string[] };
      const map = new Map<string, Acc>();
      for (const r of chapters.rows) {
        if (!r.campus_id) continue;
        const { slug, name } = councilSlugOf(r.council);
        const key = `${r.campus_id}/${slug}`;
        if (!map.has(key)) {
          map.set(key, {
            campusId: r.campus_id,
            campusName: campusNames.get(r.campus_id) ?? "Campus",
            campusSlug: campusSlugs.get(r.campus_id) ?? null,
            councilSlug: slug,
            councilName: name,
            chapters: 0,
            contacts: 0,
            members: 0,
            lastOutreachAt: null,
            chapterIds: [],
          });
        }
        const acc = map.get(key)!;
        acc.chapters++;
        acc.chapterIds.push(r.id);
      }

      let rows: CouncilRow[] = [...map.values()].map((acc) => {
        let contacts = 0,
          members = 0;
        let last: string | null = null;
        for (const id of acc.chapterIds) {
          contacts += a.contactsByChapter.get(id) ?? 0;
          members += a.membersByChapter.get(id) ?? 0;
          const lo = a.lastOutreachByChapter.get(id);
          if (lo && (!last || lo > last)) last = lo;
        }
        const { chapterIds: _drop, ...rest } = acc;
        return { ...rest, contacts, members, lastOutreachAt: last };
      });

      const q = (data.q ?? "").toLowerCase().trim();
      if (q)
        rows = rows.filter(
          (r) => r.campusName.toLowerCase().includes(q) || r.councilName.toLowerCase().includes(q),
        );
      rows.sort((x, y) => y.chapters - x.chapters || x.campusName.localeCompare(y.campusName));

      const total = rows.length;
      const start = (data.page - 1) * data.pageSize;
      return {
        rows: rows.slice(start, start + data.pageSize),
        total,
        page: data.page,
        pageSize: data.pageSize,
      };
    },
  );

async function campusSlugMap(db: DB): Promise<Map<string, string | null>> {
  const { rows } = await selectAllPaged<{ id: string; slug: string | null }>(
    db,
    "campuses",
    "id,slug",
  );
  const m = new Map<string, string | null>();
  for (const c of rows) m.set(c.id, c.slug);
  return m;
}

// ---------------------------------------------------------------------------
// National Orgs table
// ---------------------------------------------------------------------------
export const listGrowthOrgs = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(
    async ({
      data,
    }): Promise<{ rows: OrgRow[]; total: number; page: number; pageSize: number }> => {
      const db = await admin();
      const a = await buildAggregates(db);

      const orgs = await selectAllPaged<any>(
        db,
        "greek_orgs",
        "id,name,nickname,letters,council,is_active",
      );
      // chapters per org (+ campuses set, claimed, members via shell)
      const cgc = await selectAllPaged<any>(
        db,
        "campus_greek_chapters",
        "id,greek_org_id,campus_id,claim_status,archived_at",
        (q) => q.is("archived_at", null),
      );
      const chaptersByOrg = new Map<string, number>();
      const campusesByOrg = new Map<string, Set<string>>();
      const claimedByOrg = new Map<string, number>();
      const membersByOrg = new Map<string, number>();
      const cgcToOrg = new Map<string, string | null>();
      for (const r of cgc.rows) {
        cgcToOrg.set(r.id, r.greek_org_id);
        inc(chaptersByOrg, r.greek_org_id ?? undefined);
        if (r.greek_org_id) {
          if (!campusesByOrg.has(r.greek_org_id)) campusesByOrg.set(r.greek_org_id, new Set());
          if (r.campus_id) campusesByOrg.get(r.greek_org_id)!.add(r.campus_id);
        }
        if ((r.claim_status ?? "").toLowerCase() === "claimed")
          inc(claimedByOrg, r.greek_org_id ?? undefined);
        membersByOrg.set(
          r.greek_org_id ?? "",
          (membersByOrg.get(r.greek_org_id ?? "") ?? 0) + (a.membersByChapter.get(r.id) ?? 0),
        );
      }
      // people per org
      const ppl = await selectAllPaged<{ org_id: string | null }>(db, "greek_org_people", "org_id");
      const peopleByOrg = new Map<string, number>();
      for (const p of ppl.rows) inc(peopleByOrg, p.org_id ?? undefined);

      let rows: OrgRow[] = orgs.rows.map((o) => ({
        id: o.id,
        name: o.nickname || o.name,
        slug: orgSlugify(o.name),
        letters: o.letters ?? null,
        council: o.council ?? null,
        campuses: campusesByOrg.get(o.id)?.size ?? 0,
        chapters: chaptersByOrg.get(o.id) ?? 0,
        claimedChapters: claimedByOrg.get(o.id) ?? 0,
        members: membersByOrg.get(o.id) ?? 0,
        people: peopleByOrg.get(o.id) ?? 0,
        lastOutreachAt: null,
      }));

      const q = (data.q ?? "").toLowerCase().trim();
      if (q)
        rows = rows.filter(
          (r) => r.name.toLowerCase().includes(q) || (r.letters ?? "").toLowerCase().includes(q),
        );
      rows.sort((x, y) => y.chapters - x.chapters || x.name.localeCompare(y.name));

      const total = rows.length;
      const start = (data.page - 1) * data.pageSize;
      return {
        rows: rows.slice(start, start + data.pageSize),
        total,
        page: data.page,
        pageSize: data.pageSize,
      };
    },
  );

export interface OrgDetail extends OrgRow {
  campusList: {
    campusId: string;
    campusName: string;
    campusSlug: string | null;
    chapters: number;
    claimed: number;
  }[];
}

export const getGrowthOrgDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OrgDetail | null> => {
    const db = await admin();
    const { data: o } = await db
      .from("greek_orgs")
      .select("id,name,nickname,letters,council")
      .eq("id", data.orgId)
      .maybeSingle();
    if (!o) return null;
    const a = await buildAggregates(db);
    const campusNames = await campusNameMap(db);
    const campusSlugs = await campusSlugMap(db);
    const { rows } = await selectAllPaged<any>(
      db,
      "campus_greek_chapters",
      "id,campus_id,claim_status,archived_at",
      (q) => q.eq("greek_org_id", data.orgId).is("archived_at", null),
    );
    const byCampus = new Map<string, { chapters: number; claimed: number }>();
    let members = 0;
    for (const r of rows) {
      if (!r.campus_id) continue;
      if (!byCampus.has(r.campus_id)) byCampus.set(r.campus_id, { chapters: 0, claimed: 0 });
      const acc = byCampus.get(r.campus_id)!;
      acc.chapters++;
      if ((r.claim_status ?? "").toLowerCase() === "claimed") acc.claimed++;
      members += a.membersByChapter.get(r.id) ?? 0;
    }
    const campusList = [...byCampus.entries()]
      .map(([campusId, v]) => ({
        campusId,
        campusName: campusNames.get(campusId) ?? "Campus",
        campusSlug: campusSlugs.get(campusId) ?? null,
        chapters: v.chapters,
        claimed: v.claimed,
      }))
      .sort((x, y) => y.chapters - x.chapters);

    return {
      id: o.id,
      name: o.nickname || o.name,
      slug: orgSlugify(o.name),
      letters: o.letters ?? null,
      council: o.council ?? null,
      campuses: campusList.length,
      chapters: rows.length,
      claimedChapters: campusList.reduce((s, c) => s + c.claimed, 0),
      members,
      people: 0,
      lastOutreachAt: null,
      campusList,
    };
  });
