// GROWTH DASHBOARD — the campus list + campus/professor/chapter drawers.
//
// One lightweight row per campus on the main list; detail loads on demand
// (campus drawer → professor drawer → chapter drawer), all via indexed uuid
// joins. Priority order comes from growth_campus_priority (deterministic,
// versioned — growth-priority-core.ts); pins/manual overrides layer on top
// without touching the computed rank.
//
// LAW: ships to the client bundle — service-role client + admin gate imported
// dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

async function selectAll<T = any>(
  db: DB,
  table: string,
  columns: string,
  filter?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = db
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------
// CAMPUS LIST
// ---------------------------------------------------------------------------------

export interface GrowthCampusRow {
  campusId: string;
  rank: number;
  score: number;
  why: string[];
  baskets: string[];
  name: string;
  slug: string | null;
  state: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  courseCode: string | null;
  readiness: number; // 0-100 research-readiness from the priority components
  users: number; // identified users (0 shown as em-dash by the UI when unknown-vs-zero matters)
  attempts: number;
  paid: number;
  outreachSent: number;
  outreachEligible: number;
  /** contacts reachable only by Instagram — the gap-filling workload on this campus */
  contactGaps: number;
  pinned: boolean;
  manualPriority: number | null;
}

export const growthCampusList = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    rows: GrowthCampusRow[];
    generatedAt: string | null;
    version: string | null;
  }> => {
    const db = await adminDb();
    const [priority, pins, elig, events] = await Promise.all([
      selectAll(
        db,
        "growth_campus_priority",
        "campus_id,rank,score,version,why,components,computed_at",
      ),
      selectAll(db, "growth_campus_pins", "campus_id,pinned,manual_priority"),
      selectAll(db, "growth_outreach_eligibility", "campus_id,email,instagram,outreach_eligible"),
      selectAll(db, "growth_outreach_events", "campus_id,channel,direction,status"),
    ]);
    const campusIds = priority.map((p: any) => p.campus_id);
    const campuses = new Map<string, any>();
    for (let i = 0; i < campusIds.length; i += 200) {
      const { data } = await db
        .from("campuses")
        .select(
          "id,name,display_name,slug,state,color_primary,color_secondary,course_family_codes_json",
        )
        .in("id", campusIds.slice(i, i + 200));
      for (const c of data ?? []) campuses.set(c.id, c);
    }
    const { data: codes } = await db
      .from("course_intel_campus_status")
      .select("campus_id,course_code")
      .not("course_code", "is", null)
      .limit(2000);
    const codeOf = new Map<string, string>(
      ((codes ?? []) as any[]).map((c) => [c.campus_id, c.course_code]),
    );

    const eligOf = new Map<string, number>();
    const gapOf = new Map<string, number>();
    for (const e of elig as any[]) {
      if (!e.campus_id) continue;
      if (e.outreach_eligible && e.email)
        eligOf.set(e.campus_id, (eligOf.get(e.campus_id) ?? 0) + 1);
      // Instagram-only = a contact King can only DM. Filling its email is the gap work.
      if (!e.email && e.instagram) gapOf.set(e.campus_id, (gapOf.get(e.campus_id) ?? 0) + 1);
    }
    const sentOf = new Map<string, number>();
    for (const e of events as any[]) {
      if (
        e.campus_id &&
        e.direction === "outbound" &&
        ["sent", "delivered", "opened", "clicked", "replied", "logged"].includes(e.status)
      ) {
        sentOf.set(e.campus_id, (sentOf.get(e.campus_id) ?? 0) + 1);
      }
    }
    const pinOf = new Map<string, any>((pins as any[]).map((p) => [p.campus_id, p]));

    const rows: GrowthCampusRow[] = (priority as any[]).map((p) => {
      const c = campuses.get(p.campus_id) ?? {};
      const comp = (p.components ?? {}) as any;
      const jsonCode =
        c.course_family_codes_json && typeof c.course_family_codes_json === "object"
          ? ((c.course_family_codes_json as any).intro_1 ?? null)
          : null;
      const pin = pinOf.get(p.campus_id);
      return {
        campusId: p.campus_id,
        rank: p.rank,
        score: Number(p.score),
        why: p.why ?? [],
        baskets: (comp.baskets ?? []) as string[],
        name: c.display_name || c.name || p.campus_id,
        slug: c.slug ?? null,
        state: c.state ?? null,
        colorPrimary: c.color_primary ?? null,
        colorSecondary: c.color_secondary ?? null,
        courseCode: codeOf.get(p.campus_id) ?? jsonCode,
        readiness: Number(comp.readiness ?? 0),
        users: 0,
        attempts: 0,
        paid: 0, // filled below
        outreachSent: sentOf.get(p.campus_id) ?? 0,
        outreachEligible: eligOf.get(p.campus_id) ?? 0,
        contactGaps: gapOf.get(p.campus_id) ?? 0,
        pinned: !!pin?.pinned,
        manualPriority: pin?.manual_priority ?? null,
      };
    });

    // First-party columns (tiny tables today; grouped in one pass)
    const bySlugId = new Map<string, string>();
    for (const [id, c] of campuses) if (c.slug) bySlugId.set(c.slug, id);
    const rowOf = new Map(rows.map((r) => [r.campusId, r]));
    const [attempts, ents] = await Promise.all([
      selectAll(db, "practice_attempts", "campus,user_id", (q) => q.not("is_test", "is", true)),
      selectAll(db, "student_entitlements", "campus_id,user_id,source", (q) =>
        q.is("revoked_at", null).not("is_test", "is", true),
      ),
    ]);
    const usersOf = new Map<string, Set<string>>();
    for (const a of attempts as any[]) {
      const id = a.campus ? bySlugId.get(a.campus) : undefined;
      if (!id) continue;
      const r = rowOf.get(id);
      if (!r) continue;
      r.attempts++;
      if (a.user_id) {
        if (!usersOf.has(id)) usersOf.set(id, new Set());
        usersOf.get(id)!.add(a.user_id);
      }
    }
    for (const e of ents as any[]) {
      if (!e.campus_id || !e.user_id) continue;
      const r = rowOf.get(e.campus_id);
      if (!r) continue;
      if (!usersOf.has(e.campus_id)) usersOf.set(e.campus_id, new Set());
      usersOf.get(e.campus_id)!.add(e.user_id);
      if (e.source === "stripe") r.paid++;
    }
    for (const [id, users] of usersOf) {
      const r = rowOf.get(id);
      if (r) r.users = users.size;
    }

    // Order: pinned first (manual_priority asc, then rank), then computed rank.
    rows.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned) {
        const am = a.manualPriority ?? 1e9,
          bm = b.manualPriority ?? 1e9;
        if (am !== bm) return am - bm;
      }
      return a.rank - b.rank;
    });
    const first = (priority as any[])[0];
    return { rows, generatedAt: first?.computed_at ?? null, version: first?.version ?? null };
  },
);

export const growthSetPin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        pinned: z.boolean(),
        manualPriority: z.number().int().min(1).max(999).nullable().optional(),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const who = (await adminSessionOk())?.email ?? "admin";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as DB;
    const { error } = await db.from("growth_campus_pins").upsert(
      {
        campus_id: data.campusId,
        pinned: data.pinned,
        manual_priority: data.manualPriority ?? null,
        note: data.note ?? null,
        updated_by: who,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campus_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const growthRefreshPriority = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ranked: number }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshGrowthPriority } = await import("@/lib/growth-priority-data.server");
    const res = await refreshGrowthPriority(supabaseAdmin as any);
    return { ranked: res.ranked };
  },
);

// ---------------------------------------------------------------------------------
// CAMPUS DETAIL (drawer Overview)
// ---------------------------------------------------------------------------------

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail: string | null;
}
export interface ExamStatus {
  name: string;
  level: "campus" | "starter";
  topics: number;
  coveredTopics: number;
  status: "READY" | "PARTIAL" | "NOT_READY";
}
export interface CampusProfessorRow {
  id: string | null;
  name: string;
  evidenceState: string | null;
  docCount: number;
  email: string | null;
  title: string | null;
  mapState: string;
}
export interface CampusChapterRow {
  id: string;
  name: string;
  council: string | null;
  members: number | null;
  hasEmail: boolean;
  hasInstagram: boolean;
  contacted: boolean;
  claimed: boolean;
  has990: boolean;
  hasAcademics: boolean;
}
export interface CampusDetail {
  campusId: string;
  name: string;
  slug: string | null;
  state: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  priority: {
    rank: number;
    score: number;
    why: string[];
    components: Record<string, number | string[] | null>;
  } | null;
  market: {
    businessBachelors: number | null;
    undergradEnrollment: number | null;
    estimatedIntro1: number | null;
    growthLabel: string | null;
    asOf: string | null;
  } | null;
  competitive: {
    paidMarketStatus: string | null;
    introPaidStatus: string | null;
    courseSpecificCompetitors: number | null;
    studyEdge: boolean | null;
    marketStatus: string | null;
    strongestCompetitor: string | null;
    priceContext: string | null;
  } | null;
  results: {
    pageViews: number | null;
    users: number;
    identified: number;
    paid: number;
    questionsAnswered: number;
    waitlist: number;
    orders: number;
  };
  examTiming: { date: string | null; term: string | null; isCurrentTerm: boolean };
  checklist: ChecklistItem[];
  exams: ExamStatus[];
  professors: CampusProfessorRow[];
  chapters: CampusChapterRow[];
}

export const growthCampusDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CampusDetail> => {
    const db = await adminDb();
    const campusId = data.campusId;
    const [
      campusR,
      priR,
      marketR,
      compR,
      statusR,
      chaptersR,
      leadsR,
      profEvR,
      eligR,
      eventsR,
      claimsR,
      waitR,
      ordersR,
      councilR,
      repR,
    ] = await Promise.all([
      db
        .from("campuses")
        .select(
          "id,name,display_name,slug,state,color_primary,color_secondary,course_family_codes_json,course_family_titles_json",
        )
        .eq("id", campusId)
        .maybeSingle(),
      db
        .from("growth_campus_priority")
        .select("rank,score,why,components")
        .eq("campus_id", campusId)
        .maybeSingle(),
      db
        .from("campus_market_intelligence")
        .select(
          "business_bachelors,undergrad_enrollment,estimated_intro1_annual,growth_label,generated_at",
        )
        .eq("campus_id", campusId)
        .maybeSingle(),
      db.from("campus_competitive_intel").select("*").eq("campus_id", campusId).maybeSingle(),
      db.from("course_intel_campus_status").select("*").eq("campus_id", campusId).maybeSingle(),
      db
        .from("campus_greek_chapters")
        .select("id,council,greek_org_id")
        .eq("campus_id", campusId)
        .is("archived_at", null),
      db
        .from("campus_lead_suggestions")
        .select("id,first_name,last_name,email,title")
        .eq("campus_id", campusId)
        .is("archived_at", null),
      db
        .from("professor_intro1_evidence")
        .select("professor_name,lead_suggestion_id,evidence_state,source_document_id")
        .eq("campus_id", campusId),
      db
        .from("growth_outreach_eligibility")
        .select("chapter_id,council_type,email,instagram,outreach_eligible")
        .eq("campus_id", campusId),
      db
        .from("growth_outreach_events")
        .select("entity_type,entity_id,channel,direction,status")
        .eq("campus_id", campusId),
      db.from("greek_chapter_claims").select("campus_greek_chapter_id,status"),
      db
        .from("campus_waitlist")
        .select("id", { count: "exact", head: true })
        .eq("campus_id", campusId)
        .not("is_test", "is", true),
      db.from("orders").select("id", { count: "exact", head: true }).eq("campus_id", campusId),
      db
        .from("campus_council_status")
        .select("council_type,status,contacts_found")
        .eq("campus_id", campusId),
      db
        .from("referral_partners")
        .select("id,status,type")
        .eq("campus_id", campusId)
        .not("is_test", "is", true),
    ]);
    const campus = campusR.data;
    if (!campus) throw new Error("campus not found");
    const s = statusR.data ?? {};
    const comp = compR.data;

    // org names + academics + 990 + eligibility per chapter
    const chapters = (chaptersR.data ?? []) as any[];
    const chapterIds = chapters.map((c) => c.id);
    const orgIds = [...new Set(chapters.map((c) => c.greek_org_id).filter(Boolean))];
    const orgs = new Map<string, { name: string; org_type: string }>();
    if (orgIds.length) {
      const { data } = await db.from("greek_orgs").select("id,name,org_type").in("id", orgIds);
      for (const o of data ?? [])
        orgs.set(o.id, { name: o.name, org_type: o.org_type ?? "unknown" });
    }
    const academics = new Map<string, number | null>();
    const has990 = new Set<string>();
    if (chapterIds.length) {
      for (let i = 0; i < chapterIds.length; i += 200) {
        const slice = chapterIds.slice(i, i + 200);
        const [{ data: acad }, { data: legal }] = await Promise.all([
          db
            .from("greek_chapter_academic_metrics")
            .select("campus_greek_chapter_id,latest_member_count")
            .in("campus_greek_chapter_id", slice),
          db
            .from("greek_chapter_legal_entity")
            .select("chapter_id,match_confidence")
            .in("chapter_id", slice)
            .eq("match_confidence", "HIGH_CONFIDENCE"),
        ]);
        for (const a of acad ?? [])
          academics.set(a.campus_greek_chapter_id, a.latest_member_count ?? null);
        for (const l of legal ?? []) has990.add(l.chapter_id);
      }
    }
    const claimed = new Set(((claimsR.data ?? []) as any[]).map((c) => c.campus_greek_chapter_id));
    const eligByChapter = new Map<string, { email: boolean; ig: boolean }>();
    let councilEmail = false;
    for (const e of (eligR.data ?? []) as any[]) {
      if (e.chapter_id) {
        const cur = eligByChapter.get(e.chapter_id) ?? { email: false, ig: false };
        if (e.email && e.outreach_eligible) cur.email = true;
        if (e.instagram) cur.ig = true;
        eligByChapter.set(e.chapter_id, cur);
      } else if (e.council_type && e.email && e.outreach_eligible) councilEmail = true;
    }
    const events = (eventsR.data ?? []) as any[];
    const contactedChapters = new Set(
      events
        .filter((e) => e.entity_type === "chapter" && e.direction === "outbound")
        .map((e) => e.entity_id),
    );

    const chapterRows: CampusChapterRow[] = chapters
      .filter(
        (c) =>
          !["professional", "honor", "service"].includes(
            orgs.get(c.greek_org_id)?.org_type ?? "unknown",
          ),
      )
      .map((c) => ({
        id: c.id,
        name: orgs.get(c.greek_org_id)?.name ?? "Chapter",
        council: c.council ?? null,
        members: academics.get(c.id) ?? null,
        hasEmail: eligByChapter.get(c.id)?.email ?? false,
        hasInstagram: eligByChapter.get(c.id)?.ig ?? false,
        contacted: contactedChapters.has(c.id),
        claimed: claimed.has(c.id),
        has990: has990.has(c.id),
        hasAcademics: academics.has(c.id),
      }))
      .sort((a, b) => (b.members ?? -1) - (a.members ?? -1) || a.name.localeCompare(b.name));

    // Professors (evidence-first ordering; raw directory rows without evidence come last)
    const leadName = new Map<
      string,
      { name: string; email: string | null; title: string | null }
    >();
    for (const l of (leadsR.data ?? []) as any[]) {
      leadName.set(l.id, {
        name: `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim(),
        email: l.email ?? null,
        title: l.title ?? null,
      });
    }
    const stateRank: Record<string, number> = {
      CONFIRMED_INTRO1: 0,
      LIKELY_INTRO1: 1,
      POSSIBLE_INTRO1: 2,
    };
    const profMap = new Map<string, CampusProfessorRow>();
    for (const p of (profEvR.data ?? []) as any[]) {
      const key = p.lead_suggestion_id ?? `name:${p.professor_name}`;
      const lead = p.lead_suggestion_id ? leadName.get(p.lead_suggestion_id) : null;
      const cur = profMap.get(key) ?? {
        id: p.lead_suggestion_id ?? null,
        name: lead?.name || p.professor_name || "Unknown",
        evidenceState: null,
        docCount: 0,
        email: lead?.email ?? null,
        title: lead?.title ?? null,
        mapState: "starter",
      };
      if (p.source_document_id) cur.docCount++;
      if (
        cur.evidenceState == null ||
        (stateRank[p.evidence_state] ?? 9) < (stateRank[cur.evidenceState] ?? 9)
      )
        cur.evidenceState = p.evidence_state;
      profMap.set(key, cur);
    }
    // campus/professor map state for professors
    const courseIdR = await db.from("courses").select("id").eq("course_family", "intro_1").limit(1);
    const courseId = (courseIdR.data?.[0] as any)?.id ?? "11111111-1111-1111-1111-111111111111";
    const { data: activeExams } = await db
      .from("campus_exams")
      .select("professor_id")
      .eq("course_id", courseId)
      .eq("campus_id", campusId)
      .eq("status", "active");
    const hasCampusMap = (activeExams ?? []).some((e: any) => !e.professor_id);
    const profWithMap = new Set(
      (activeExams ?? []).filter((e: any) => e.professor_id).map((e: any) => e.professor_id),
    );
    for (const p of profMap.values()) {
      p.mapState =
        p.id && profWithMap.has(p.id) ? "professor" : hasCampusMap ? "campus" : "starter";
    }
    const professors = [...profMap.values()].sort(
      (a, b) =>
        (stateRank[a.evidenceState ?? ""] ?? 9) - (stateRank[b.evidenceState ?? ""] ?? 9) ||
        b.docCount - a.docCount ||
        a.name.localeCompare(b.name),
    );

    // Results (first-party; slug for attempts)
    const slug = campus.slug as string | null;
    let attempts = 0;
    const attemptUsers = new Set<string>();
    if (slug) {
      const { data: pa } = await db
        .from("practice_attempts")
        .select("user_id")
        .eq("campus", slug)
        .not("is_test", "is", true);
      for (const a of pa ?? []) {
        attempts++;
        if (a.user_id) attemptUsers.add(a.user_id);
      }
    }
    const { data: ents } = await db
      .from("student_entitlements")
      .select("user_id,source")
      .eq("campus_id", campusId)
      .is("revoked_at", null)
      .not("is_test", "is", true);
    const entUsers = new Set(((ents ?? []) as any[]).map((e) => e.user_id).filter(Boolean));
    const paidUsers = new Set(
      ((ents ?? []) as any[])
        .filter((e) => e.source === "stripe")
        .map((e) => e.user_id)
        .filter(Boolean),
    );
    const identified = new Set([...attemptUsers, ...entUsers]).size;
    const { count: viewCount } = await db
      .from("landing_page_events")
      .select("id", { count: "exact", head: true })
      .eq("campus_id", campusId);

    // Exam ladder: resolved campus/starter exams × content coverage from the student tree
    const exams: ExamStatus[] = [];
    try {
      const { fetchStudentTree } = await import("@/lib/student.functions");
      const tree = (await fetchStudentTree({ data: { campusId } })) as any[];
      const intro = tree.find((c: any) => c.family === "intro_1") ?? tree[0];
      const coveredUnit = new Set<string>();
      const allTopics = [
        ...(intro?.topics ?? []),
        ...((intro?.units ?? []) as any[]).flatMap((u: any) => u.topics ?? []),
      ];
      for (const t of allTopics) {
        if ((t.sets ?? []).some((st: any) => st.ceqCount > 0 || st.playbackId))
          coveredUnit.add(t.id);
      }
      const level = hasCampusMap ? ("campus" as const) : ("starter" as const);
      let q = db
        .from("campus_exams")
        .select("id,name,position")
        .eq("course_id", courseId)
        .eq("status", "active")
        .is("professor_id", null);
      q = hasCampusMap ? q.eq("campus_id", campusId) : q.is("campus_id", null);
      const { data: resolvedExams } = await q.order("position");
      const ids = ((resolvedExams ?? []) as any[]).map((e) => e.id);
      const topicsByExam = new Map<string, string[]>();
      if (ids.length) {
        const { data: ts } = await db
          .from("campus_exam_topics")
          .select("campus_exam_id,chapter_id")
          .in("campus_exam_id", ids);
        for (const t of (ts ?? []) as any[]) {
          const l = topicsByExam.get(t.campus_exam_id) ?? [];
          l.push(t.chapter_id);
          topicsByExam.set(t.campus_exam_id, l);
        }
      }
      for (const e of (resolvedExams ?? []) as any[]) {
        const topicIds = topicsByExam.get(e.id) ?? [];
        const covered = topicIds.filter((t) => coveredUnit.has(t)).length;
        exams.push({
          name: e.name,
          level,
          topics: topicIds.length,
          coveredTopics: covered,
          status:
            topicIds.length === 0
              ? "NOT_READY"
              : covered === topicIds.length
                ? "READY"
                : covered > 0
                  ? "PARTIAL"
                  : "NOT_READY",
        });
      }
    } catch {
      /* content tree unavailable — ladder omitted, never fabricated */
    }

    // Exam timing (historical evidence NEVER becomes a countdown)
    const examTerm = s.exam_1_date_term ?? null;
    const isCurrentTerm =
      s.exam_1_date != null && Number(String(examTerm ?? "").match(/\d{4}/)?.[0] ?? 0) >= 2026;

    // Checklist (all derived)
    const jsonCode =
      campus.course_family_codes_json && typeof campus.course_family_codes_json === "object"
        ? ((campus.course_family_codes_json as any).intro_1 ?? null)
        : null;
    const courseCode = s.course_code ?? jsonCode;
    const councils = (councilR.data ?? []) as any[];
    const councilTypesOnChapters = new Set(
      chapters.map((c) => String(c.council ?? "").toLowerCase()),
    );
    const councilPresent = (t: string) =>
      councilTypesOnChapters.has(t) ||
      councils.some((c) => c.council_type === t && c.status === "complete");
    const councilOutreach = events.some(
      (e) => e.entity_type === "council" && e.direction === "outbound",
    );
    const chapterOutreach = events.some(
      (e) => e.entity_type === "chapter" && e.direction === "outbound",
    );
    const repHired = ((repR.data ?? []) as any[]).some((r) => r.status === "active");
    const exam1 = exams.find((e) => /1/.test(e.name));
    const exam2 = exams.find((e) => /2/.test(e.name));
    const confirmedProfs = professors.filter((p) => p.evidenceState === "CONFIRMED_INTRO1").length;

    const checklist: ChecklistItem[] = [
      {
        key: "course_code",
        label: "Course code identified",
        done: !!courseCode,
        detail: courseCode,
      },
      {
        key: "prof_evidence",
        label: "Intro-1 professor evidence",
        done: professors.length > 0,
        detail: professors.length
          ? `${confirmedProfs} confirmed · ${professors.length} with evidence`
          : null,
      },
      {
        key: "docs",
        label: "Course documents found",
        done: (s.documents_found ?? 0) > 0,
        detail: s.documents_found ? `${s.documents_found} docs` : null,
      },
      {
        key: "textbook",
        label: "Textbook identified",
        done: (s.textbook_docs_found ?? 0) > 0,
        detail: null,
      },
      {
        key: "exam1_map",
        label: "Exam 1 map ready",
        done: !!exam1 && exam1.status === "READY",
        detail: exam1
          ? `${exam1.level} map · ${exam1.coveredTopics}/${exam1.topics} topics with content`
          : null,
      },
      {
        key: "exam2_ready",
        label: "Exam 2 sellable",
        done: !!exam2 && exam2.status === "READY",
        detail: exam2 ? `${exam2.status}` : "no Exam 2 mapping",
      },
      { key: "ifc", label: "IFC identified", done: councilPresent("ifc"), detail: null },
      {
        key: "panhellenic",
        label: "Panhellenic identified",
        done: councilPresent("panhellenic"),
        detail: null,
      },
      {
        key: "council_contact",
        label: "Council contact available",
        done: councilEmail,
        detail: null,
      },
      {
        key: "council_outreach",
        label: "Council outreach started",
        done: councilOutreach,
        detail: null,
      },
      {
        key: "chapter_outreach",
        label: "Chapter outreach started",
        done: chapterOutreach,
        detail: null,
      },
      { key: "rep", label: "Campus rep hired", done: repHired, detail: null },
      {
        key: "first_student",
        label: "First student",
        done: attempts > 0,
        detail: attempts ? `${attempts} questions answered` : null,
      },
      {
        key: "first_identified",
        label: "First identified student",
        done: identified > 0,
        detail: null,
      },
      { key: "first_paid", label: "First paid student", done: paidUsers.size > 0, detail: null },
      {
        key: "first_claim",
        label: "First chapter claimed",
        done: chapterRows.some((c) => c.claimed),
        detail: null,
      },
    ];

    const pri = priR.data;
    return {
      campusId,
      name: campus.display_name || campus.name,
      slug,
      state: campus.state ?? null,
      colorPrimary: campus.color_primary ?? null,
      colorSecondary: campus.color_secondary ?? null,
      courseCode,
      courseTitle:
        campus.course_family_titles_json && typeof campus.course_family_titles_json === "object"
          ? ((campus.course_family_titles_json as any).intro_1 ?? null)
          : null,
      priority: pri
        ? {
            rank: pri.rank,
            score: Number(pri.score),
            why: pri.why ?? [],
            components: pri.components ?? {},
          }
        : null,
      market: marketR.data
        ? {
            businessBachelors: marketR.data.business_bachelors ?? null,
            undergradEnrollment: marketR.data.undergrad_enrollment ?? null,
            estimatedIntro1: marketR.data.estimated_intro1_annual ?? null,
            growthLabel: marketR.data.growth_label ?? null,
            asOf: marketR.data.generated_at ?? null,
          }
        : null,
      competitive: comp
        ? {
            paidMarketStatus: comp.paid_market_status,
            introPaidStatus: comp.intro_accounting_paid_market_status,
            courseSpecificCompetitors: comp.course_specific_competitors,
            studyEdge: comp.study_edge_present,
            marketStatus: comp.market_status,
            strongestCompetitor: comp.strongest_competitor_name,
            priceContext: comp.competitor_price_context,
          }
        : null,
      results: {
        pageViews: (viewCount ?? 0) > 0 ? viewCount : null,
        users: identified,
        identified,
        paid: paidUsers.size,
        questionsAnswered: attempts,
        waitlist: (waitR as any)?.count ?? 0,
        orders: (ordersR as any)?.count ?? 0,
      },
      examTiming: { date: isCurrentTerm ? s.exam_1_date : null, term: examTerm, isCurrentTerm },
      checklist,
      exams,
      professors,
      chapters: chapterRows,
    };
  });

// ---------------------------------------------------------------------------------
// PROFESSOR DETAIL (nested drawer)
// ---------------------------------------------------------------------------------

export interface ProfessorDetail {
  id: string | null;
  name: string;
  campusId: string;
  title: string | null;
  department: string | null;
  email: string | null;
  evidence: {
    state: string;
    confidence: string | null;
    sourceUrl: string | null;
    term: string | null;
    year: number | null;
    quality: string | null;
  }[];
  documents: { url: string | null; type: string | null; title: string | null }[];
  textbookEvidence: string[];
  examEvidence: { label: string | null; chapters: number[] }[];
  mapState: "professor" | "campus" | "starter";
  rmp: { rating: number | null; count: number | null; url: string | null } | null;
}

export const growthProfessorDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        professorId: z.string().uuid().nullable().optional(),
        name: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ProfessorDetail> => {
    const db = await adminDb();
    let lead: any = null;
    if (data.professorId) {
      const { data: l } = await db
        .from("campus_lead_suggestions")
        .select(
          "id,first_name,last_name,title,department,email,rmp_rating,rmp_num_ratings,rmp_profile_url",
        )
        .eq("id", data.professorId)
        .maybeSingle();
      lead = l;
    }
    const name = lead
      ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim()
      : (data.name ?? "Unknown");
    let evQ = db.from("professor_intro1_evidence").select("*").eq("campus_id", data.campusId);
    evQ = data.professorId
      ? evQ.eq("lead_suggestion_id", data.professorId)
      : evQ.eq("professor_name", name);
    const { data: evidence } = await evQ;
    const docIds = [
      ...new Set(((evidence ?? []) as any[]).map((e) => e.source_document_id).filter(Boolean)),
    ];
    let docs: any[] = [];
    if (docIds.length) {
      const { data: d2 } = await db
        .from("course_document")
        .select("id,source_url,document_type,title")
        .in("id", docIds);
      docs = d2 ?? [];
    }
    const { data: namedDocs } = await db
      .from("course_document")
      .select("id,source_url,document_type,title")
      .eq("campus_id", data.campusId)
      .eq("professor_name", name)
      .limit(20);
    for (const d2 of namedDocs ?? []) if (!docs.some((x) => x.id === d2.id)) docs.push(d2);
    const { data: ce } = await db
      .from("course_evidence")
      .select("evidence_type,exam_label,exam_chapters,textbook_ref")
      .eq("campus_id", data.campusId)
      .eq("professor_name", name)
      .is("superseded_by", null);
    const courseIdR = await db.from("courses").select("id").eq("course_family", "intro_1").limit(1);
    const courseId = (courseIdR.data?.[0] as any)?.id ?? "11111111-1111-1111-1111-111111111111";
    let mapState: ProfessorDetail["mapState"] = "starter";
    if (data.professorId) {
      const { data: pe } = await db
        .from("campus_exams")
        .select("id")
        .eq("course_id", courseId)
        .eq("campus_id", data.campusId)
        .eq("professor_id", data.professorId)
        .eq("status", "active")
        .limit(1);
      if (pe?.length) mapState = "professor";
    }
    if (mapState === "starter") {
      const { data: ce2 } = await db
        .from("campus_exams")
        .select("id")
        .eq("course_id", courseId)
        .eq("campus_id", data.campusId)
        .is("professor_id", null)
        .eq("status", "active")
        .limit(1);
      if (ce2?.length) mapState = "campus";
    }
    return {
      id: lead?.id ?? data.professorId ?? null,
      name,
      campusId: data.campusId,
      title: lead?.title ?? null,
      department: lead?.department ?? null,
      email: lead?.email ?? null,
      evidence: ((evidence ?? []) as any[]).map((e) => ({
        state: e.evidence_state,
        confidence: e.confidence ?? null,
        sourceUrl: e.source_url ?? null,
        term: e.term ?? null,
        year: e.year ?? null,
        quality: e.source_quality ?? null,
      })),
      documents: docs.map((d2) => ({
        url: d2.source_url ?? null,
        type: d2.document_type ?? null,
        title: d2.title ?? null,
      })),
      textbookEvidence: ((ce ?? []) as any[])
        .filter((e) => e.evidence_type === "textbook_reference" && e.textbook_ref)
        .map((e) => e.textbook_ref),
      examEvidence: ((ce ?? []) as any[])
        .filter((e) => e.evidence_type === "exam_chapter_range")
        .map((e) => ({ label: e.exam_label, chapters: e.exam_chapters ?? [] })),
      mapState,
      rmp: lead
        ? {
            rating: lead.rmp_rating ?? null,
            count: lead.rmp_num_ratings ?? null,
            url: lead.rmp_profile_url ?? null,
          }
        : null,
    };
  });

// ---------------------------------------------------------------------------------
// CHAPTER DETAIL (nested drawer)
// ---------------------------------------------------------------------------------

export interface ChapterDetail {
  id: string;
  campusId: string;
  name: string;
  council: string | null;
  letters: string | null;
  survive: { claimed: boolean; accessRequests: number } | null;
  academics: {
    members: number | null;
    membersRecentAvg: number | null;
    memberTrend: number | null;
    gpa: number | null;
    diffFromCouncil: number | null;
    labels: string[];
    confidence: string | null;
    sourceUrl: string | null;
    term: string | null;
    year: number | null;
  } | null;
  contacts: {
    name: string | null;
    role: string | null;
    email: string | null;
    instagram: string | null;
    class: string;
    qcId: string;
  }[];
  legal: {
    kind: "chapter" | "national_only" | "none";
    entities: {
      name: string;
      type: string;
      ein: string | null;
      latestFilingYear: number | null;
      revenue: number | null;
      assets: number | null;
      filesN990Only: boolean;
    }[];
    stakeholder: { name: string; role: string; entityType: string; taxYear: number } | null;
  };
  history: { at: string; label: string; note: string | null }[];
}

export const growthChapterDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ chapterId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ChapterDetail> => {
    const db = await adminDb();
    const { data: ch } = await db
      .from("campus_greek_chapters")
      .select("id,campus_id,council,greek_org_id")
      .eq("id", data.chapterId)
      .maybeSingle();
    if (!ch) throw new Error("chapter not found");
    const [
      { data: org },
      { data: metrics },
      { data: claims },
      { data: elig },
      { data: links },
      { data: events },
    ] = await Promise.all([
      db.from("greek_orgs").select("name,letters").eq("id", ch.greek_org_id).maybeSingle(),
      db
        .from("greek_chapter_academic_metrics")
        .select("*")
        .eq("campus_greek_chapter_id", data.chapterId)
        .maybeSingle(),
      db
        .from("greek_chapter_claims")
        .select("id,status")
        .eq("campus_greek_chapter_id", data.chapterId),
      db.from("growth_outreach_eligibility").select("*").eq("chapter_id", data.chapterId),
      db
        .from("greek_chapter_legal_entity")
        .select("legal_entity_id,match_confidence")
        .eq("chapter_id", data.chapterId)
        .eq("match_confidence", "HIGH_CONFIDENCE"),
      db
        .from("growth_outreach_events")
        .select("occurred_at,channel,direction,status,notes")
        .eq("entity_id", data.chapterId)
        .order("occurred_at", { ascending: false })
        .limit(20),
    ]);

    // 990 entities (HIGH-confidence links only; national parent handled separately)
    const entityIds = ((links ?? []) as any[]).map((l) => l.legal_entity_id);
    let legal: ChapterDetail["legal"] = { kind: "none", entities: [], stakeholder: null };
    if (entityIds.length) {
      const { data: ents } = await db
        .from("greek_legal_entity")
        .select("id,legal_name,entity_type,ein")
        .in("id", entityIds);
      const nonParent = ((ents ?? []) as any[]).filter((e) => e.entity_type !== "NATIONAL_PARENT");
      if (nonParent.length === 0) {
        legal = { kind: "national_only", entities: [], stakeholder: null };
      } else {
        const npIds = nonParent.map((e) => e.id);
        const [{ data: filings }, { data: officers }] = await Promise.all([
          db
            .from("greek_990_filing")
            .select("legal_entity_id,tax_year,total_revenue,total_assets,rich_filing_available")
            .in("legal_entity_id", npIds)
            .order("tax_year", { ascending: false }),
          db
            .from("greek_990_officer")
            .select("legal_entity_id,person_name,normalized_title,latest_filing_year")
            .in("legal_entity_id", npIds),
        ]);
        const latestRich = new Map<string, any>();
        const anyFiling = new Map<string, any>();
        for (const f of (filings ?? []) as any[]) {
          if (!anyFiling.has(f.legal_entity_id)) anyFiling.set(f.legal_entity_id, f);
          if (f.rich_filing_available && !latestRich.has(f.legal_entity_id))
            latestRich.set(f.legal_entity_id, f);
        }
        const entityType = new Map(nonParent.map((e) => [e.id, e.entity_type]));
        // Primary stakeholder — governing entity first, role rank, most recent (contract §5)
        const govRank = (t: string) =>
          [
            "HOUSE_CORPORATION",
            "EDUCATIONAL_FOUNDATION",
            "SCHOLARSHIP_FOUNDATION",
            "ALUMNI_CORPORATION",
            "PROPERTY_HOLDING_ENTITY",
          ].includes(t)
            ? 0
            : 1;
        const roleRank = (t: string | null) =>
          /president/i.test(t ?? "")
            ? 0
            : /treasurer/i.test(t ?? "")
              ? 1
              : /director|chair/i.test(t ?? "")
                ? 2
                : 3;
        const best = ((officers ?? []) as any[])
          .map((o) => ({
            o,
            g: govRank(entityType.get(o.legal_entity_id) ?? ""),
            r: roleRank(o.normalized_title),
            y: o.latest_filing_year ?? 0,
          }))
          .sort((a, b) => a.g - b.g || a.r - b.r || b.y - a.y)[0];
        legal = {
          kind: "chapter",
          entities: nonParent.map((e) => {
            const rich = latestRich.get(e.id);
            const any2 = anyFiling.get(e.id);
            return {
              name: e.legal_name,
              type: e.entity_type,
              ein: e.ein ?? null,
              latestFilingYear: rich?.tax_year ?? any2?.tax_year ?? null,
              revenue: rich?.total_revenue ?? null,
              assets: rich?.total_assets ?? null,
              filesN990Only: !rich && !!any2,
            };
          }),
          stakeholder: best
            ? {
                name: best.o.person_name,
                role: best.o.normalized_title ?? best.o.title_as_reported ?? "Officer",
                entityType: entityType.get(best.o.legal_entity_id) ?? "",
                taxYear: best.y,
              }
            : null,
        };
      }
    }

    const m = metrics;
    const hasAcademics = m && (m.latest_gpa != null || m.latest_member_count != null);
    const claimedRows = (claims ?? []) as any[];
    return {
      id: ch.id,
      campusId: ch.campus_id,
      name: org?.name ?? "Chapter",
      council: ch.council ?? null,
      letters: org?.letters ?? null,
      survive: claimedRows.length
        ? {
            claimed: claimedRows.some((c) => c.status === "approved" || c.status === "pending"),
            accessRequests: claimedRows.length,
          }
        : null,
      academics: hasAcademics
        ? {
            members: m.latest_member_count ?? null,
            membersRecentAvg:
              m.average_member_count_recent != null ? Number(m.average_member_count_recent) : null,
            memberTrend: m.member_count_trend ?? null,
            gpa: m.latest_gpa != null ? Number(m.latest_gpa) : null,
            diffFromCouncil:
              m.difference_from_council != null ? Number(m.difference_from_council) : null,
            labels: (m.academic_context_labels ?? []).filter((l: string) => l !== "UNKNOWN"),
            confidence: m.data_confidence ?? null,
            sourceUrl: m.source_url ?? null,
            term: m.latest_term ?? null,
            year: m.latest_year ?? null,
          }
        : null,
      contacts: ((elig ?? []) as any[]).map((e) => ({
        name: e.name ?? null,
        role: e.role ?? null,
        email: e.email ?? null,
        instagram: e.instagram ?? null,
        class:
          e.campaign_purpose === "ADVISORY_ESCALATION" || e.contact_type === "staff_advisor"
            ? "ADVISORY"
            : e.freshness_status === "verify_before_use"
              ? "VERIFY"
              : !e.email && e.instagram
                ? "SOCIAL"
                : e.outreach_eligible && e.confidence === "high"
                  ? "CURRENT_HIGH"
                  : "USABLE",
        qcId: e.qc_id,
      })),
      legal,
      history: ((events ?? []) as any[]).map((e) => ({
        at: e.occurred_at,
        label: `${e.channel === "ig_dm" ? "Instagram" : "Email"} ${e.direction === "inbound" ? "reply" : e.status}`,
        note: e.notes ?? null,
      })),
    };
  });
