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
import { isIntro1Qualified, intro1Tier } from "./course-intel-shared";

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

function hasIntro1Code(cfc: unknown, cc: unknown): boolean {
  for (let j of [cfc, cc]) {
    if (typeof j === "string") { try { j = JSON.parse(j); } catch { continue; } }
    if (!j || typeof j !== "object") continue;
    const o = j as Record<string, unknown>;
    const v = o.intro_1 ?? o["intro-accounting-1"];
    if (typeof v === "string" && v.trim()) return true;
    if (v && typeof v === "object") {
      const vc = v as Record<string, unknown>;
      if ((vc.local_course_code && String(vc.local_course_code).trim()) || (vc.code && String(vc.code).trim())) return true;
    }
  }
  return false;
}

export type CourseIntelRow = {
  campusId: string;
  name: string;
  displayName: string;      // student-facing label (falls back to name)
  searchText: string;       // name + display + aliases + system, lowercased for search
  systemName: string | null;
  resolutionStatus: string | null; // resolved | needs_campus_resolution
  state: string | null;
  inPicker: boolean;
  campusLive: boolean;      // campuses.active_roster = 'sec'
  profTotal: number;
  profWithEmail: number;
  profLive: number;         // professors with active_roster set (on the player)
  profPlayerReady: number;  // active_roster AND rmp_profile_url (actually show)
  profIntro1: number;       // qualified "teaches Intro 1" (RMP target-course signal)
  hasIntro1Code: boolean;   // campus has an intro-1 course code (prereq to qualify)
  greekOrgs: number;        // campus_greek_chapters count
  greekEligibility: string | null; // unknown|eligible|no_social_greek|ambiguous
  profPending: number;
  textbook: string | null;
  hasMapping: boolean;
};

export const getCourseIntelOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const campuses = await pageAll<{
    id: string; name: string; display_name: string | null; aliases: unknown; parent_system_id: string | null;
    campus_resolution_status: string | null; state: string | null; active_roster: string | null; course_family_textbooks_json: unknown;
    course_family_codes_json: unknown; course_codes_json: unknown; greek_eligibility: string | null;
  }>((f, t) =>
    (supabaseAdmin.from("campuses") as any).select("id,name,display_name,aliases,parent_system_id,campus_resolution_status,state,active_roster,course_family_textbooks_json,course_family_codes_json,course_codes_json,greek_eligibility").range(f, t),
  );

  const systems = await pageAll<{ id: string; name: string; aliases: unknown }>((f, t) =>
    (supabaseAdmin.from("campus_systems") as any).select("id,name,aliases").range(f, t),
  );
  const systemById = new Map(systems.map((s) => [s.id, s]));

  const sugg = await pageAll<{
    campus_id: string; email: string | null; archived_at: string | null; active_roster: string | null; rmp_profile_url: string | null; status: string | null;
    rmp_target_course_counts_json: unknown; rmp_recent_target_match: boolean | null;
  }>((f, t) =>
    (supabaseAdmin.from("campus_lead_suggestions") as any).select("campus_id,email,archived_at,active_roster,rmp_profile_url,status,rmp_target_course_counts_json,rmp_recent_target_match").range(f, t),
  );

  const greek = await pageAll<{ campus_id: string }>((f, t) =>
    (supabaseAdmin.from("campus_greek_chapters") as any).select("campus_id").range(f, t),
  );
  const greekCount = new Map<string, number>();
  for (const g of greek) greekCount.set(g.campus_id, (greekCount.get(g.campus_id) ?? 0) + 1);

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

  const agg = new Map<string, { total: number; email: number; live: number; ready: number; pending: number; intro1: number }>();
  for (const s of sugg) {
    if (s.archived_at) continue;
    const a = agg.get(s.campus_id) ?? { total: 0, email: 0, live: 0, ready: 0, pending: 0, intro1: 0 };
    a.total++;
    if (s.email) a.email++;
    if (s.active_roster) { a.live++; if (s.rmp_profile_url) a.ready++; }
    if ((s.status ?? "pending") === "pending") a.pending++;
    if (isIntro1Qualified(s)) a.intro1++;
    agg.set(s.campus_id, a);
  }

  const rows: CourseIntelRow[] = campuses.map((c) => {
    const a = agg.get(c.id) ?? { total: 0, email: 0, live: 0, ready: 0, pending: 0, intro1: 0 };
    const tb = parseTextbook(c.course_family_textbooks_json);
    const author = (tb?.authors ?? "").split(/[,;]/)[0].trim().toLowerCase();
    const sys = c.parent_system_id ? systemById.get(c.parent_system_id) : null;
    const aliasArr = Array.isArray(c.aliases) ? (c.aliases as string[]) : [];
    const sysAliases = sys && Array.isArray(sys.aliases) ? (sys.aliases as string[]) : [];
    const searchText = [c.name, c.display_name, ...aliasArr, sys?.name, ...sysAliases].filter(Boolean).join(" | ").toLowerCase();
    return {
      campusId: c.id, name: c.name,
      displayName: (c.display_name as string) || c.name, searchText,
      systemName: sys?.name ?? null, resolutionStatus: (c.campus_resolution_status as string) ?? null,
      state: c.state, inPicker: inPicker.has(c.id),
      campusLive: c.active_roster === "sec",
      profTotal: a.total, profWithEmail: a.email, profLive: a.live, profPlayerReady: a.ready, profIntro1: a.intro1,
      hasIntro1Code: hasIntro1Code(c.course_family_codes_json, c.course_codes_json), greekOrgs: greekCount.get(c.id) ?? 0,
      greekEligibility: (c.greek_eligibility as string) ?? null, profPending: a.pending,
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
    profsIntro1: rows.reduce((s, r) => s + r.profIntro1, 0),
    campusesWithIntro1: rows.filter((r) => r.profIntro1 > 0).length,
    campusesNeedCodes: rows.filter((r) => r.profTotal > 0 && r.profIntro1 === 0 && !r.hasIntro1Code).length,
    campusesWithGreek: rows.filter((r) => r.greekOrgs > 0).length,
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
      .select("id,first_name,last_name,title,email,department,is_cpa,is_phd,rmp_rating,rmp_num_ratings,rmp_profile_url,status,active_roster,research_label,rmp_target_course_counts_json,rmp_recent_target_match,rmp_latest_target_course_code,rmp_latest_target_rating_date,profintel_score")
      .eq("campus_id", data.campusId)
      .is("archived_at", null)
      .limit(600);
    if (error) throw new Error(error.message);
    const professors = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const sig = { rmp_target_course_counts_json: r.rmp_target_course_counts_json ?? null, rmp_recent_target_match: (r.rmp_recent_target_match as boolean) ?? null };
      return {
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
        intro1: isIntro1Qualified(sig),
        intro1Tier: intro1Tier(sig),
        targetCode: (r.rmp_latest_target_course_code as string) ?? null,
        targetDate: (r.rmp_latest_target_rating_date as string) ?? null,
        score: (r.profintel_score as number) ?? null,
      };
    });
    // Qualified intro-1 teachers first (recent > confirmed > prior), then by score / ratings.
    const tierRank: Record<string, number> = { recent: 0, confirmed: 1, prior: 2, none: 3 };
    professors.sort((a, b) =>
      (tierRank[a.intro1Tier] - tierRank[b.intro1Tier]) ||
      ((b.score ?? -1) - (a.score ?? -1)) ||
      ((b.rmpNumRatings ?? 0) - (a.rmpNumRatings ?? 0)));
    const intro1Count = professors.filter((p) => p.intro1).length;
    return { campusLive: (campus?.active_roster as string) === "sec", intro1Count, professors };
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
