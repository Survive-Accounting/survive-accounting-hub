// Course Intel cockpit — data layer.
// Read-only leaderboard + per-campus professor drill-down, plus the review
// mutations that promote a scraped professor to the STUDENT PLAYER.
//
// IMPORTANT: the student player's professor picker (orders.functions
// searchOrderProfessors) shows professors where `active_roster IS NOT NULL`
// AND `rmp_profile_url IS NOT NULL`, on campuses whose own `active_roster='sec'`.
// So "publish to students" = set active_roster on BOTH the professor row and the
// campus. This cockpit writes those existing flags — it does NOT invent a new
// visibility system. (student_visible column exists from 20260823_1900 but the
// player reads active_roster; we keep active_roster as the source of truth.)
// Student surfaces read name + RMP only; the scraped email stays outreach-side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ALL_SCHOOLS } from "./schools";

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

function parseTextbook(raw: unknown): { title: string; authors: string } | null {
  let j = raw;
  if (typeof j === "string") { try { j = JSON.parse(j); } catch { return null; } }
  if (!j || typeof j !== "object") return null;
  const b = (j as Record<string, { title?: string; authors?: string }>).intro_1;
  if (!b || !b.title) return null;
  return { title: b.title, authors: b.authors ?? "" };
}

export type CourseIntelRow = {
  campusId: string;
  name: string;
  state: string | null;
  inPicker: boolean;
  campusLive: boolean;      // campuses.active_roster = 'sec'
  profTotal: number;
  profWithEmail: number;
  profLive: number;         // professors with active_roster set (on the player)
  profPlayerReady: number;  // active_roster AND rmp_profile_url (actually show)
  profPending: number;
  textbook: string | null;
  hasMapping: boolean;
};

export const getCourseIntelOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const campuses = await pageAll<{
    id: string; name: string; state: string | null; active_roster: string | null; course_family_textbooks_json: unknown;
  }>((f, t) =>
    (supabaseAdmin.from("campuses") as any).select("id,name,state,active_roster,course_family_textbooks_json").range(f, t),
  );

  const sugg = await pageAll<{
    campus_id: string; email: string | null; archived_at: string | null; active_roster: string | null; rmp_profile_url: string | null; status: string | null;
  }>((f, t) =>
    (supabaseAdmin.from("campus_lead_suggestions") as any).select("campus_id,email,archived_at,active_roster,rmp_profile_url,status").range(f, t),
  );

  const mapped = await pageAll<{ textbook_id: string }>((f, t) =>
    supabaseAdmin.from("textbook_chapter_topic_mapping").select("textbook_id").range(f, t),
  );
  const mappedTextbookIds = new Set(mapped.map((m) => m.textbook_id));
  const mappedTextbooks = await pageAll<{ id: string; authors: string | null }>((f, t) =>
    supabaseAdmin.from("textbooks").select("id,authors").range(f, t),
  );
  const mappedAuthors = new Set(
    mappedTextbooks.filter((tb) => mappedTextbookIds.has(tb.id)).map((tb) => (tb.authors ?? "").split(/[,;]/)[0].trim().toLowerCase()).filter(Boolean),
  );

  const inPicker = new Set(ALL_SCHOOLS.map((s) => s.campusId));

  const agg = new Map<string, { total: number; email: number; live: number; ready: number; pending: number }>();
  for (const s of sugg) {
    if (s.archived_at) continue;
    const a = agg.get(s.campus_id) ?? { total: 0, email: 0, live: 0, ready: 0, pending: 0 };
    a.total++;
    if (s.email) a.email++;
    if (s.active_roster) { a.live++; if (s.rmp_profile_url) a.ready++; }
    if ((s.status ?? "pending") === "pending") a.pending++;
    agg.set(s.campus_id, a);
  }

  const rows: CourseIntelRow[] = campuses.map((c) => {
    const a = agg.get(c.id) ?? { total: 0, email: 0, live: 0, ready: 0, pending: 0 };
    const tb = parseTextbook(c.course_family_textbooks_json);
    const author = (tb?.authors ?? "").split(/[,;]/)[0].trim().toLowerCase();
    return {
      campusId: c.id, name: c.name, state: c.state, inPicker: inPicker.has(c.id),
      campusLive: c.active_roster === "sec",
      profTotal: a.total, profWithEmail: a.email, profLive: a.live, profPlayerReady: a.ready, profPending: a.pending,
      textbook: tb ? `${tb.title}${tb.authors ? " — " + tb.authors : ""}` : null,
      hasMapping: !!author && mappedAuthors.has(author),
    };
  });

  const totals = {
    campuses: rows.length,
    withProfs: rows.filter((r) => r.profTotal > 0).length,
    pickable: rows.filter((r) => r.inPicker).length,
    pickableNoProfs: rows.filter((r) => r.inPicker && r.profTotal === 0).length,
    campusesLive: rows.filter((r) => r.campusLive).length,
    profsPlayerReady: rows.reduce((s, r) => s + r.profPlayerReady, 0),
    pendingReview: rows.reduce((s, r) => s + r.profPending, 0),
  };
  return { rows, totals };
});

export const getCampusProfessors = createServerFn({ method: "GET" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campus } = await (supabaseAdmin.from("campuses") as any).select("active_roster").eq("id", data.campusId).maybeSingle();
    const { data: rows, error } = await (supabaseAdmin.from("campus_lead_suggestions") as any)
      .select("id,first_name,last_name,title,email,department,is_cpa,is_phd,rmp_rating,rmp_num_ratings,rmp_profile_url,status,active_roster,research_label")
      .eq("campus_id", data.campusId)
      .is("archived_at", null)
      .order("active_roster", { ascending: false, nullsFirst: false })
      .order("rmp_num_ratings", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return {
      campusLive: (campus?.active_roster as string) === "sec",
      professors: ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        name: `${(r.first_name as string) ?? ""} ${(r.last_name as string) ?? ""}`.trim(),
        title: (r.title as string) ?? null,
        hasEmail: !!r.email,
        department: (r.department as string) ?? null,
        isCpa: !!r.is_cpa, isPhd: !!r.is_phd,
        rmpRating: (r.rmp_rating as number) ?? null,
        rmpNumRatings: (r.rmp_num_ratings as number) ?? null,
        rmpMatched: !!r.rmp_profile_url,
        status: (r.status as string) ?? "pending",
        live: !!r.active_roster,
        source: (r.research_label as string) ?? null,
      })),
    };
  });

// Approve/unpublish/reject a professor. Approve sets active_roster='sec' (the
// flag the player reads); reject archives. Also keeps student_visible in sync.
export const reviewProfessor = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; action: "approve" | "reject" | "unapprove"; who?: string }) =>
    z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject", "unapprove"]), who: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { reviewed_at: new Date().toISOString(), reviewed_by: data.who ?? null };
    if (data.action === "approve") { patch.status = "approved"; patch.active_roster = "sec"; patch.student_visible = true; }
    else if (data.action === "reject") { patch.status = "rejected"; patch.active_roster = null; patch.student_visible = false; patch.archived_at = new Date().toISOString(); patch.archived_reason = "cockpit_reject"; }
    else { patch.status = "pending"; patch.active_roster = null; patch.student_visible = false; }
    const { error } = await (supabaseAdmin.from("campus_lead_suggestions") as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Put a whole campus on / off the student roster (campuses.active_roster='sec').
// A professor only shows in the player if BOTH the campus and the prof are live.
export const setCampusRoster = createServerFn({ method: "POST" })
  .inputValidator((d: { campusId: string; live: boolean }) =>
    z.object({ campusId: z.string().uuid(), live: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("campuses") as any).update({ active_roster: data.live ? "sec" : null }).eq("id", data.campusId);
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
