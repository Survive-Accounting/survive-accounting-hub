// Course Intel cockpit — data layer.
// Read-only leaderboard + per-campus professor drill-down, plus the review
// mutation that promotes a scraped professor to BOTH outreach and the student
// player (student_visible). Student surfaces read only name + RMP rating; the
// scraped email never leaves the admin/outreach side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ALL_SCHOOLS } from "./schools";

// supabase-js caps a select at 1000 rows; page through everything.
async function pageAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await make(from, from + size - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < size) break;
  }
  return out;
}

function parseTextbook(raw: unknown): { title: string; authors: string; edition: string } | null {
  let j = raw;
  if (typeof j === "string") { try { j = JSON.parse(j); } catch { return null; } }
  if (!j || typeof j !== "object") return null;
  const b = (j as Record<string, { title?: string; authors?: string; edition?: string }>).intro_1;
  if (!b || !b.title) return null;
  return { title: b.title, authors: b.authors ?? "", edition: b.edition ?? "" };
}

export type CourseIntelRow = {
  campusId: string;
  name: string;
  state: string | null;
  inPicker: boolean;
  profTotal: number;
  profWithEmail: number;
  profStudentVisible: number;
  profPending: number;
  textbook: string | null;
  hasMapping: boolean;
};

export const getCourseIntelOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const campuses = await pageAll<{
    id: string; name: string; state: string | null; course_family_textbooks_json: unknown;
  }>((f, t) =>
    supabaseAdmin.from("campuses").select("id,name,state,course_family_textbooks_json").range(f, t),
  );

  const sugg = await pageAll<{
    campus_id: string; email: string | null; archived_at: string | null; student_visible: boolean | null; status: string | null;
  }>((f, t) =>
    supabaseAdmin.from("campus_lead_suggestions").select("campus_id,email,archived_at,student_visible,status").range(f, t),
  );

  // Which textbook editions have an approved-or-proposed mapping (edition_key → covered)
  const mapped = await pageAll<{ textbook_id: string }>((f, t) =>
    supabaseAdmin.from("textbook_chapter_topic_mapping").select("textbook_id").range(f, t),
  );
  const mappedTextbookIds = new Set(mapped.map((m) => m.textbook_id));
  const mappedTextbooks = await pageAll<{ id: string; edition_key: string | null; authors: string | null; title: string }>((f, t) =>
    supabaseAdmin.from("textbooks").select("id,edition_key,authors,title").range(f, t),
  );
  // crude: a campus "hasMapping" if its intro_1 author matches a mapped textbook's author
  const mappedAuthors = new Set(
    mappedTextbooks.filter((tb) => mappedTextbookIds.has(tb.id)).map((tb) => (tb.authors ?? "").split(/[,;]/)[0].trim().toLowerCase()).filter(Boolean),
  );

  const inPicker = new Set(ALL_SCHOOLS.map((s) => s.campusId));

  const agg = new Map<string, { total: number; email: number; visible: number; pending: number }>();
  for (const s of sugg) {
    const archived = s.archived_at != null && s.archived_at !== "";
    if (archived) continue;
    const a = agg.get(s.campus_id) ?? { total: 0, email: 0, visible: 0, pending: 0 };
    a.total++;
    if (s.email) a.email++;
    if (s.student_visible) a.visible++;
    if ((s.status ?? "pending") === "pending") a.pending++;
    agg.set(s.campus_id, a);
  }

  const rows: CourseIntelRow[] = campuses.map((c) => {
    const a = agg.get(c.id) ?? { total: 0, email: 0, visible: 0, pending: 0 };
    const tb = parseTextbook(c.course_family_textbooks_json);
    const author = (tb?.authors ?? "").split(/[,;]/)[0].trim().toLowerCase();
    return {
      campusId: c.id, name: c.name, state: c.state, inPicker: inPicker.has(c.id),
      profTotal: a.total, profWithEmail: a.email, profStudentVisible: a.visible, profPending: a.pending,
      textbook: tb ? `${tb.title}${tb.authors ? " — " + tb.authors : ""}` : null,
      hasMapping: !!author && mappedAuthors.has(author),
    };
  });

  const totals = {
    campuses: rows.length,
    withProfs: rows.filter((r) => r.profTotal > 0).length,
    pickable: rows.filter((r) => r.inPicker).length,
    pickableNoProfs: rows.filter((r) => r.inPicker && r.profTotal === 0).length,
    studentVisible: rows.reduce((s, r) => s + r.profStudentVisible, 0),
    pendingReview: rows.reduce((s, r) => s + r.profPending, 0),
  };
  return { rows, totals };
});

export const getCampusProfessors = createServerFn({ method: "GET" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .select("id,first_name,last_name,title,email,department,is_cpa,is_phd,rmp_rating,rmp_num_ratings,status,student_visible,research_label,source_url,created_at")
      .eq("campus_id", data.campusId)
      .is("archived_at", null)
      .order("student_visible", { ascending: false })
      .order("rmp_num_ratings", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      name: `${(r.first_name as string) ?? ""} ${(r.last_name as string) ?? ""}`.trim(),
      title: (r.title as string) ?? null,
      hasEmail: !!r.email,
      department: (r.department as string) ?? null,
      isCpa: !!r.is_cpa, isPhd: !!r.is_phd,
      rmpRating: (r.rmp_rating as number) ?? null,
      rmpNumRatings: (r.rmp_num_ratings as number) ?? null,
      status: (r.status as string) ?? "pending",
      studentVisible: !!r.student_visible,
      source: (r.research_label as string) ?? null,
    }));
  });

export const reviewProfessor = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; action: "approve" | "reject" | "unapprove"; who?: string }) =>
    z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject", "unapprove"]), who: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { reviewed_at: new Date().toISOString(), reviewed_by: data.who ?? null };
    if (data.action === "approve") { patch.status = "approved"; patch.student_visible = true; }
    else if (data.action === "reject") { patch.status = "rejected"; patch.student_visible = false; patch.archived_at = new Date().toISOString(); patch.archived_reason = "cockpit_reject"; }
    else { patch.status = "pending"; patch.student_visible = false; }
    const { error } = await supabaseAdmin.from("campus_lead_suggestions").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTextbookMappings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: books } = await supabaseAdmin.from("textbooks").select("id,title,authors,edition,edition_key").not("edition_key", "is", null);
  const { data: maps } = await supabaseAdmin
    .from("textbook_chapter_topic_mapping")
    .select("textbook_id,survive_topic_label,confidence,state,textbook_chapter_id")
    .order("textbook_id");
  const { data: chapters } = await supabaseAdmin.from("textbook_chapters").select("id,textbook_id,number,title").order("number");
  return { books: books ?? [], maps: maps ?? [], chapters: chapters ?? [] };
});
