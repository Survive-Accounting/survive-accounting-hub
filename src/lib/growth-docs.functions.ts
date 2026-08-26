// GROWTH DOCS — every document we hold for a campus, in one list Lee can actually read.
//
// Two sources, deliberately kept distinct because they mean different things:
//   SCRAPED    course_document      — public syllabi/schedules the crawler found
//   SUBMITTED  syllabus_submissions — a student uploaded their own syllabus (the good stuff,
//              and the reason this list is built to grow)
//
// Topic-map work is a reading job: the AI proposes, but Lee checks the source. So every row
// carries its type, term, professor and a direct link, and the drawer previews it inline
// when the host allows embedding.
//
// LAW: ships to the client bundle — service-role client + admin gate imported dynamically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any };

const adminDb = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export interface CampusDoc {
  id: string;
  origin: "scraped" | "submitted";
  title: string;
  docType: string; // syllabus · schedule · study_guide · exam · other
  professor: string | null;
  term: string | null;
  url: string | null;
  domain: string | null;
  fileType: string | null;
  /** Higher = more useful for mapping (course-intel's value_tier). */
  tier: number | null;
  firstSeen: string | null;
  /** Evidence extracted FROM this document — why it matters for the topic map. */
  evidence: { type: string; label: string | null; detail: string | null }[];
}

export interface CampusDocs {
  docs: CampusDoc[];
  counts: { total: number; scraped: number; submitted: number; byType: Record<string, number> };
}

const prettyType = (t: string | null | undefined): string => {
  const s = (t ?? "other").toLowerCase();
  if (s.includes("syllab")) return "syllabus";
  if (s.includes("schedule") || s.includes("calendar")) return "schedule";
  if (s.includes("study") || s.includes("guide") || s.includes("review")) return "study guide";
  if (s.includes("exam") || s.includes("test")) return "exam";
  return s.replace(/_/g, " ");
};

export const growthCampusDocs = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CampusDocs> => {
    const db = await adminDb();
    const [{ data: scraped }, { data: submitted }, { data: evidence }] = await Promise.all([
      db
        .from("course_document")
        .select(
          "id,title,document_type,value_tier,professor_name,term,year,source_url,source_domain,file_type,first_seen",
        )
        .eq("campus_id", data.campusId)
        .order("value_tier", { ascending: false })
        .limit(300),
      db
        .from("syllabus_submissions")
        .select("id,email,professor_name,file_paths,file_names,note,status,created_at")
        .eq("campus_id", data.campusId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("course_evidence")
        .select("course_document_id,evidence_type,exam_label,exam_chapters,textbook_ref")
        .eq("campus_id", data.campusId)
        .is("superseded_by", null),
    ]);

    const evByDoc = new Map<string, CampusDoc["evidence"]>();
    for (const e of (evidence ?? []) as any[]) {
      if (!e.course_document_id) continue;
      const list = evByDoc.get(e.course_document_id) ?? [];
      list.push({
        type: e.evidence_type,
        label: e.exam_label ?? null,
        detail:
          e.evidence_type === "exam_chapter_range" && Array.isArray(e.exam_chapters)
            ? `Ch ${e.exam_chapters.join(", ")}`
            : (e.textbook_ref ?? null),
      });
      evByDoc.set(e.course_document_id, list);
    }

    const docs: CampusDoc[] = [];
    for (const d of (scraped ?? []) as any[]) {
      docs.push({
        id: d.id,
        origin: "scraped",
        title: d.title || d.source_url?.split("/").pop() || "Untitled document",
        docType: prettyType(d.document_type),
        professor: d.professor_name ?? null,
        term: [d.term, d.year].filter(Boolean).join(" ") || null,
        url: d.source_url ?? null,
        domain: d.source_domain ?? null,
        fileType: d.file_type ?? null,
        tier: d.value_tier ?? null,
        firstSeen: d.first_seen ?? null,
        evidence: evByDoc.get(d.id) ?? [],
      });
    }
    for (const s of (submitted ?? []) as any[]) {
      const names: string[] = Array.isArray(s.file_names) ? s.file_names : [];
      const paths: string[] = Array.isArray(s.file_paths) ? s.file_paths : [];
      docs.push({
        id: s.id,
        origin: "submitted",
        title: names[0] || "Student-submitted syllabus",
        docType: "syllabus",
        professor: s.professor_name ?? null,
        term: null,
        url: paths[0] ?? null,
        domain: null,
        fileType: (names[0]?.split(".").pop() ?? null) as string | null,
        tier: 4, // a real syllabus from a real student in the class outranks anything scraped
        firstSeen: s.created_at ?? null,
        evidence: [],
      });
    }

    const byType: Record<string, number> = {};
    for (const d of docs) byType[d.docType] = (byType[d.docType] ?? 0) + 1;
    docs.sort(
      (a, b) =>
        (b.tier ?? 0) - (a.tier ?? 0) ||
        (b.firstSeen ?? "").localeCompare(a.firstSeen ?? "") ||
        a.title.localeCompare(b.title),
    );
    return {
      docs,
      counts: {
        total: docs.length,
        scraped: docs.filter((d) => d.origin === "scraped").length,
        submitted: docs.filter((d) => d.origin === "submitted").length,
        byType,
      },
    };
  });
