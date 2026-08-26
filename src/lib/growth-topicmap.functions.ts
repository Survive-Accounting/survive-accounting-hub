// GROWTH TOPIC MAP — Lee's course-readiness workflow for one campus.
//
// Three states: STARTER MAP → CAMPUS MAP → PROFESSOR VARIATION. Resolution stays
// professor → campus → Global Starter Map (map-resolver.functions.ts is the law;
// this file only READS the same tables and WRITES exclusively through the
// transactional growth_approve_map / growth_revert_map SQL functions).
//
// Proposals come from Course-Intel evidence (course_evidence exam ranges + real
// textbook_chapters titles). Proposed ≠ live: nothing student-facing changes
// until Lee explicitly approves in the dashboard.
//
// LAW: ships to the client bundle — dynamic imports inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const INTRO1_FALLBACK = "11111111-1111-1111-1111-111111111111";

async function intro1CourseId(db: DB): Promise<string> {
  const { data } = await db.from("courses").select("id").eq("course_family", "intro_1").limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? INTRO1_FALLBACK;
}

export interface SurviveUnit {
  id: string;
  name: string;
  number: number | null;
}
export interface MapExam {
  id: string | null;
  name: string;
  topicIds: string[];
}
export interface SuggestedExam {
  label: string; // "Exam 1"
  chapters: number[]; // textbook chapter numbers from evidence
  chapterTitles: { number: number; title: string }[]; // REAL titles from textbook_chapters (never invented)
  confidence: string; // High / Medium / Low (worst of contributing evidence)
  sources: { url: string | null; type: string | null }[];
  suggestedTopicIds: string[]; // prefilled from starter exam of same number (editable)
}

export interface TopicMapState {
  campusId: string;
  courseId: string;
  level: "campus" | "starter"; // what the campus currently resolves to
  mapStatus: string | null; // map_meta.status at the campus level
  units: SurviveUnit[]; // all Survive Units (the exact approvable topic ids)
  currentExams: MapExam[]; // the resolved current map (campus or starter)
  starterExams: MapExam[];
  suggested: SuggestedExam[]; // evidence-backed proposal (empty = no campus evidence)
  textbook: { id: string; title: string; edition: string | null } | null;
  professors: {
    id: string | null;
    name: string;
    evidenceState: string | null;
    docCount: number;
    mapState: "professor" | "campus" | "proposed" | "starter";
  }[];
  approvals: { action: string; approvedBy: string; at: string }[];
  /** The SETS that actually exist under each Survive Unit — what a student would get if this
   *  topic is on the map. Clicking a topic opens this, so mapping decisions are made against
   *  real content rather than a topic name. Keyed by chapters.id. */
  setsByUnit: Record<string, TopicSet[]>;
}

export interface TopicSet {
  id: string;
  name: string;
  shortLabel: string | null;
  questions: number;
  hasCram: boolean;
  hasReview: boolean;
  access: "free" | "paid";
}

async function examsAt(
  db: DB,
  courseId: string,
  campusId: string | null,
  professorId: string | null,
): Promise<MapExam[]> {
  let q = db
    .from("campus_exams")
    .select("id,name,position")
    .eq("course_id", courseId)
    .eq("status", "active");
  q = campusId ? q.eq("campus_id", campusId) : q.is("campus_id", null);
  q = professorId ? q.eq("professor_id", professorId) : q.is("professor_id", null);
  const { data: exams } = await q.order("position");
  if (!exams?.length) return [];
  const ids = exams.map((e: any) => e.id);
  const { data: topics } = await db
    .from("campus_exam_topics")
    .select("campus_exam_id,chapter_id,position")
    .in("campus_exam_id", ids);
  const byExam = new Map<string, { chapter_id: string; position: number | null }[]>();
  for (const t of (topics ?? []) as any[]) {
    const l = byExam.get(t.campus_exam_id) ?? [];
    l.push(t);
    byExam.set(t.campus_exam_id, l);
  }
  return (exams as any[]).map((e) => ({
    id: e.id,
    name: e.name,
    topicIds: (byExam.get(e.id) ?? [])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((t) => t.chapter_id),
  }));
}

const examNumOf = (label: string): number | null => {
  const m = String(label).match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return /final/i.test(label) ? 99 : null;
};

export const growthTopicMapState = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<TopicMapState> => {
    const db = await adminDb();
    const courseId = await intro1CourseId(db);
    const campusId = data.campusId;

    const [unitsR, campusExams, starterExams, metaR, evidenceR, approvalsR, profEvR, leadsR] =
      await Promise.all([
        db
          .from("chapters")
          .select("id,chapter_name,chapter_number,parked")
          .eq("course_id", courseId)
          .order("chapter_number"),
        examsAt(db, courseId, campusId, null),
        examsAt(db, courseId, null, null),
        db
          .from("map_meta")
          .select("status")
          .eq("course_id", courseId)
          .eq("campus_id", campusId)
          .is("professor_id", null)
          .maybeSingle(),
        db
          .from("course_evidence")
          .select(
            "id,evidence_type,exam_label,exam_chapters,textbook_ref,confidence,course_document_id,professor_name",
          )
          .eq("campus_id", campusId)
          .is("superseded_by", null),
        db
          .from("growth_map_approvals")
          .select("action,approved_by,created_at")
          .eq("campus_id", campusId)
          .order("created_at", { ascending: false })
          .limit(10),
        db
          .from("professor_intro1_evidence")
          .select("professor_name,lead_suggestion_id,evidence_state,source_document_id")
          .eq("campus_id", campusId),
        db
          .from("campus_lead_suggestions")
          .select("id,first_name,last_name")
          .eq("campus_id", campusId)
          .is("archived_at", null),
      ]);

    const units: SurviveUnit[] = ((unitsR.data ?? []) as any[])
      .filter((u) => !u.parked)
      .map((u) => ({
        id: u.id,
        name: u.chapter_name,
        number: u.chapter_number != null ? Number(u.chapter_number) : null,
      }));

    const evidence = (evidenceR.data ?? []) as any[];
    const ranges = evidence.filter(
      (e) =>
        e.evidence_type === "exam_chapter_range" &&
        Array.isArray(e.exam_chapters) &&
        e.exam_chapters.length > 0,
    );

    // Textbook for the campus (best evidence: docs with a textbook_id).
    let textbook: TopicMapState["textbook"] = null;
    let tocByNumber = new Map<number, string>();
    const { data: tbDocs } = await db
      .from("course_document")
      .select("textbook_id")
      .eq("campus_id", campusId)
      .not("textbook_id", "is", null)
      .limit(50);
    const tbCounts = new Map<string, number>();
    for (const d2 of (tbDocs ?? []) as any[])
      tbCounts.set(d2.textbook_id, (tbCounts.get(d2.textbook_id) ?? 0) + 1);
    const topTb = [...tbCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topTb) {
      const [{ data: tb }, { data: toc }] = await Promise.all([
        db.from("textbooks").select("id,title,edition").eq("id", topTb).maybeSingle(),
        db
          .from("textbook_chapters")
          .select("number,title")
          .eq("textbook_id", topTb)
          .order("number"),
      ]);
      if (tb) textbook = { id: tb.id, title: tb.title, edition: tb.edition ?? null };
      tocByNumber = new Map(((toc ?? []) as any[]).map((c) => [Number(c.number), c.title]));
    }

    // Documents for provenance links
    const docIds = [...new Set(ranges.map((r) => r.course_document_id).filter(Boolean))];
    const docInfo = new Map<string, { url: string | null; type: string | null }>();
    if (docIds.length) {
      const { data: docs } = await db
        .from("course_document")
        .select("id,source_url,document_type")
        .in("id", docIds);
      for (const d2 of (docs ?? []) as any[])
        docInfo.set(d2.id, { url: d2.source_url ?? null, type: d2.document_type ?? null });
    }

    // Build one suggestion per exam number: merge evidence rows, worst confidence wins the label.
    const confRank: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    const byExamNum = new Map<
      number,
      {
        chapters: Set<number>;
        conf: string;
        sources: { url: string | null; type: string | null }[];
      }
    >();
    for (const r of ranges) {
      const num = examNumOf(r.exam_label ?? "");
      if (num == null) continue;
      const chapters = (r.exam_chapters as number[]).filter((n) => Number.isFinite(n));
      if (chapters.length === 0 || chapters.length > 8) continue; // >8 = suspected cumulative/mis-parse (flagged in enrichment)
      const cur = byExamNum.get(num) ?? {
        chapters: new Set<number>(),
        conf: (r.confidence ?? "Medium") as string,
        sources: [] as { url: string | null; type: string | null }[],
      };
      for (const c of chapters) cur.chapters.add(c);
      if ((confRank[r.confidence ?? "Medium"] ?? 1) > (confRank[cur.conf] ?? 1))
        cur.conf = r.confidence ?? "Medium";
      const src = r.course_document_id ? docInfo.get(r.course_document_id) : null;
      if (src && !cur.sources.some((s) => s.url === src.url)) cur.sources.push(src);
      byExamNum.set(num, cur);
    }
    const starterByNum = new Map<number, MapExam>();
    for (const e of starterExams) {
      const n = examNumOf(e.name);
      if (n != null) starterByNum.set(n, e);
    }

    const suggested: SuggestedExam[] = [...byExamNum.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, s]) => ({
        label: num === 99 ? "Final" : `Exam ${num}`,
        chapters: [...s.chapters].sort((a, b) => a - b),
        chapterTitles: [...s.chapters]
          .sort((a, b) => a - b)
          .map((n) => ({ number: n, title: tocByNumber.get(n) ?? "" }))
          .filter((c) => c.title !== ""), // REAL titles only — never invent
        confidence: s.conf,
        sources: s.sources,
        suggestedTopicIds: starterByNum.get(num)?.topicIds ?? [],
      }));

    // Professor variations
    const leadName = new Map<string, string>();
    for (const l of (leadsR.data ?? []) as any[])
      leadName.set(l.id, `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim());
    const profExamIds = new Set<string>();
    {
      const { data: profExams } = await db
        .from("campus_exams")
        .select("professor_id")
        .eq("course_id", courseId)
        .eq("campus_id", campusId)
        .eq("status", "active")
        .not("professor_id", "is", null);
      for (const p of (profExams ?? []) as any[]) profExamIds.add(p.professor_id);
    }
    const stateRank: Record<string, number> = {
      CONFIRMED_INTRO1: 0,
      LIKELY_INTRO1: 1,
      POSSIBLE_INTRO1: 2,
    };
    const profMap = new Map<
      string,
      { id: string | null; name: string; evidenceState: string | null; docCount: number }
    >();
    for (const p of (profEvR.data ?? []) as any[]) {
      const key = p.lead_suggestion_id ?? `name:${p.professor_name}`;
      const name = p.lead_suggestion_id
        ? leadName.get(p.lead_suggestion_id) || p.professor_name
        : p.professor_name;
      const cur = profMap.get(key) ?? {
        id: p.lead_suggestion_id ?? null,
        name,
        evidenceState: null,
        docCount: 0,
      };
      cur.docCount += p.source_document_id ? 1 : 0;
      if (
        cur.evidenceState == null ||
        (stateRank[p.evidence_state] ?? 9) < (stateRank[cur.evidenceState] ?? 9)
      )
        cur.evidenceState = p.evidence_state;
      profMap.set(key, cur);
    }
    // SETS PER UNIT — read through the same student tree the player uses, so what Lee sees
    // while mapping is exactly what a student at this campus would receive. Degrades to an
    // empty map if the content tree is unavailable; never invents a set.
    const setsByUnit: Record<string, TopicSet[]> = {};
    try {
      const { fetchStudentTree } = await import("@/lib/student.functions");
      const tree = (await fetchStudentTree({ data: { campusId } })) as any[];
      for (const course of tree ?? []) {
        const topics = [...(course.topics ?? []), ...((course.units ?? []) as any[]).flatMap((u: any) => u.topics ?? [])];
        for (const t of topics) {
          if (!t?.id || setsByUnit[t.id]) continue;
          setsByUnit[t.id] = ((t.sets ?? []) as any[]).map((s) => ({
            id: s.id,
            name: s.name,
            shortLabel: s.shortLabel ?? null,
            questions: s.ceqCount ?? 0,
            hasCram: !!s.playbackId || s.access === "paid",
            hasReview: !!s.hasReview,
            access: s.access === "paid" ? "paid" : "free",
          }));
        }
      }
    } catch {
      /* content tree unavailable — topics still map, they just don't expand */
    }

    const hasCampusMap = campusExams.length > 0;
    const profRanges = new Set(
      ranges.filter((r) => r.professor_name).map((r) => String(r.professor_name)),
    );
    const professors = [...profMap.values()]
      .sort(
        (a, b) =>
          (stateRank[a.evidenceState ?? ""] ?? 9) - (stateRank[b.evidenceState ?? ""] ?? 9) ||
          b.docCount - a.docCount,
      )
      .map((p) => ({
        ...p,
        mapState: (p.id && profExamIds.has(p.id)
          ? "professor"
          : profRanges.has(p.name)
            ? "proposed"
            : hasCampusMap
              ? "campus"
              : "starter") as "professor" | "campus" | "proposed" | "starter",
      }));

    return {
      campusId,
      courseId,
      level: hasCampusMap ? "campus" : "starter",
      mapStatus: metaR.data?.status ?? null,
      units,
      currentExams: hasCampusMap ? campusExams : starterExams,
      starterExams,
      suggested,
      textbook,
      professors,
      approvals: ((approvalsR.data ?? []) as any[]).map((a) => ({
        action: a.action,
        approvedBy: a.approved_by,
        at: a.created_at,
      })),
      setsByUnit,
    };
  });

/** Approve a campus- or professor-level map. Transactional via the SQL function;
 *  validates exact Survive Unit ids; audited with who/when/what evidence. */
export const growthApproveMap = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        professorId: z.string().uuid().nullable().optional(),
        exams: z
          .array(
            z.object({
              name: z.string().min(1),
              topicIds: z.array(z.string().uuid()).min(1),
            }),
          )
          .min(1)
          .max(8),
        textbookId: z.string().uuid().nullable().optional(),
        source: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const who = (await adminSessionOk())?.email ?? "admin";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as DB;
    const courseId = await intro1CourseId(db);
    const { error } = await db.rpc("growth_approve_map", {
      p_campus_id: data.campusId,
      p_professor_id: data.professorId ?? null,
      p_course_id: courseId,
      p_exams: data.exams.map((e, i) => ({ name: e.name, position: i + 1, topic_ids: e.topicIds })),
      p_textbook_id: data.textbookId ?? null,
      p_approved_by: who,
      p_source: data.source ?? {},
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

/** Revert a level to inheritance (Keep Starter / Use Campus Map). Audited. */
export const growthKeepStarter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        campusId: z.string().uuid(),
        professorId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { assertAdmin, adminSessionOk } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const who = (await adminSessionOk())?.email ?? "admin";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as DB;
    const courseId = await intro1CourseId(db);
    const { error } = await db.rpc("growth_revert_map", {
      p_campus_id: data.campusId,
      p_professor_id: data.professorId ?? null,
      p_course_id: courseId,
      p_approved_by: who,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
