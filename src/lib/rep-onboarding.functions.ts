// REP ONBOARDING (V2) — the application, INSIDE the workspace. Same data the old gate-form would
// have collected, different psychology: at the gate it's a hurdle, in here it's the rep's first
// task. Completing the coverage map is what submits them for Lee's review; nothing here
// self-approves anything.
//
// Scope law unchanged: every read/write resolves the rep from the session and stays inside their
// own row + their campus's public chapter directory.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { canonicalSchoolName } from "@/lib/schools";
import { socialCouncil } from "@/lib/rep-workspace.functions";
import {
  CAMPUS_ROLE_CHIPS, onboardingProblem, reachCount,
  type ApplicationStatus, type CourseStatus, type ReachLevel, type ReachMap,
} from "@/lib/rep-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export type OnboardingChapter = { id: string; name: string; letters: string | null; council: string | null };
export type OnboardingState = {
  ok: true;
  applicationStatus: ApplicationStatus;
  campusName: string | null;
  courseCode: string | null;
  prefill: {
    name: string; email: string | null; phone: string | null;
    graduationYear: number | null; courseStatus: CourseStatus | null;
    ownChapterId: string | null; roles: string[]; pitch: string | null;
    reach: ReachMap;
  };
  chapters: OnboardingChapter[];
};
export type OnboardingResult = OnboardingState | { ok: false; error: string };

async function campusChapters(db: DB, campusId: string): Promise<OnboardingChapter[]> {
  const { data: chRows } = await db.from("campus_greek_chapters")
    .select("id,slug,greek_org_id,council,nickname").eq("campus_id", campusId).is("archived_at", null).limit(1000);
  const rows = ((chRows ?? []) as Array<{ id: string; slug: string; greek_org_id: string | null; council: string | null; nickname: string | null }>)
    .map((r) => ({ ...r, social: socialCouncil(r.council) }))
    .filter((r) => r.social !== null);
  const orgIds = Array.from(new Set(rows.map((r) => r.greek_org_id).filter(Boolean))) as string[];
  const orgById = new Map<string, { name: string; letters: string | null }>();
  for (let i = 0; i < orgIds.length; i += 100) {
    const { data: orgs } = await db.from("greek_orgs").select("id,name,letters").in("id", orgIds.slice(i, i + 100));
    for (const o of (orgs ?? []) as Array<{ id: string; name: string; letters: string | null }>) orgById.set(o.id, { name: o.name, letters: o.letters ?? null });
  }
  return rows
    .map((r) => {
      const org = r.greek_org_id ? orgById.get(r.greek_org_id) : undefined;
      return { id: r.id, name: r.nickname || org?.name || r.slug.replace(/-/g, " "), letters: org?.letters ?? null, council: r.social };
    })
    .sort((a, b) => (a.council ?? "").localeCompare(b.council ?? "") || a.name.localeCompare(b.name));
}

export const getRepOnboarding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ legacyToken: z.string().max(80).optional().nullable() }).parse(d))
  .handler(async ({ data }): Promise<OnboardingResult> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    const rep = s.rep;
    if (!rep.campus_id) return { ok: false, error: "Your rep account has no campus — text Lee." };

    const { data: p } = await db.from("referral_partners")
      .select("application_status,graduation_year,course_status,own_chapter_id,campus_roles,pitch")
      .eq("id", rep.id).maybeSingle();
    const { data: reachRows } = await db.from("rep_chapter_reach")
      .select("campus_greek_chapter_id,reach").eq("partner_id", rep.id).limit(1000);
    const reach: ReachMap = {};
    for (const r of (reachRows ?? []) as Array<{ campus_greek_chapter_id: string; reach: ReachLevel }>) reach[r.campus_greek_chapter_id] = r.reach;

    const { data: c } = await db.from("campuses").select("slug,name,short_name,course_family_codes_json").eq("id", rep.campus_id).maybeSingle();
    const raw = c?.course_family_codes_json;
    const codes = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});

    return {
      ok: true,
      applicationStatus: ((p?.application_status as ApplicationStatus) ?? "setup"),
      campusName: c?.slug ? canonicalSchoolName(c.slug as string, (c.short_name as string) || (c.name as string)) : null,
      courseCode: (((codes?.intro_1 ?? "") as string).trim() || null),
      prefill: {
        name: rep.name, email: rep.email, phone: rep.phone,
        graduationYear: (p?.graduation_year as number) ?? null,
        courseStatus: (p?.course_status as CourseStatus) ?? null,
        ownChapterId: (p?.own_chapter_id as string) ?? null,
        roles: Array.isArray(p?.campus_roles) ? (p.campus_roles as string[]) : [],
        pitch: (p?.pitch as string) ?? null,
        reach,
      },
      chapters: await campusChapters(db, rep.campus_id),
    };
  });

export const submitRepOnboarding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    graduationYear: z.number().int().min(2026).max(2032),
    courseStatus: z.enum(["taking_now", "taken", "not_yet"]),
    ownChapterId: z.string().uuid().optional().nullable(),
    roles: z.array(z.string().max(40)).max(8),
    reach: z.record(z.string().uuid(), z.enum(["member", "knows_someone"])),
    pitch: z.string().trim().max(1000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; reachable?: number }> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    const rep = s.rep;
    if (!rep.campus_id) return { ok: false, error: "Your rep account has no campus — text Lee." };

    // Re-submitting while still in review just updates the same application. Approved reps
    // don't come back through here.
    const { data: p } = await db.from("referral_partners").select("application_status").eq("id", rep.id).maybeSingle();
    const st = (p?.application_status as ApplicationStatus) ?? "setup";
    if (st === "approved") return { ok: false, error: "You're already approved — this form is done." };
    if (st === "declined") return { ok: false, error: "This application was closed. Text Lee if that's a surprise." };

    const problem = onboardingProblem({ graduationYear: data.graduationYear, courseStatus: data.courseStatus, reach: data.reach });
    if (problem) return { ok: false, error: problem };

    // Roles: only known chips are stored (a stray value is dropped, not an error).
    const known = new Set(CAMPUS_ROLE_CHIPS.map((r) => r.slug as string));
    const roles = data.roles.filter((r) => known.has(r));

    // CAMPUS SCOPE on every chapter id — own chapter AND the whole reach map.
    const ids = [...Object.keys(data.reach), ...(data.ownChapterId ? [data.ownChapterId] : [])];
    if (ids.length) {
      const uniq = Array.from(new Set(ids));
      let okCount = 0;
      for (let i = 0; i < uniq.length; i += 100) {
        const { count } = await db.from("campus_greek_chapters").select("id", { count: "exact", head: true })
          .eq("campus_id", rep.campus_id).in("id", uniq.slice(i, i + 100));
        okCount += count ?? 0;
      }
      if (okCount !== uniq.length) return { ok: false, error: "One of those chapters isn't on your campus." };
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await db.from("referral_partners").update({
      graduation_year: data.graduationYear, course_status: data.courseStatus,
      own_chapter_id: data.ownChapterId ?? null, campus_roles: roles,
      pitch: data.pitch?.trim() || null,
      application_status: "submitted", onboarding_submitted_at: nowIso,
    }).eq("id", rep.id);
    if (upErr) return { ok: false, error: upErr.message };

    // Replace the coverage map wholesale — it is one answer, not an append-only log.
    await db.from("rep_chapter_reach").delete().eq("partner_id", rep.id);
    const rows = Object.entries(data.reach).map(([chapterId, reach]) => ({
      partner_id: rep.id, campus_greek_chapter_id: chapterId, reach,
    }));
    if (rows.length) {
      const { error: insErr } = await db.from("rep_chapter_reach").insert(rows);
      if (insErr) return { ok: false, error: insErr.message };
    }

    await db.from("rep_activity").insert({
      partner_id: rep.id, kind: "onboarding_submitted",
      meta: { reachable: reachCount(data.reach).total, roles }, is_test: rep.is_test,
    }).then(() => undefined, () => undefined);

    // THE ALERT LEE REVIEWS FROM. The signup alert said "someone signed up"; this one carries the
    // application: year, own chapter, roles, how many chapters they can reach, and their pitch —
    // enough to decide on the /x/ page without opening the roster. Best-effort: the application
    // is saved above and a failed alert must not make the rep think it was not.
    try {
      const reachable = reachCount(data.reach).total;
      let school: string | null = null;
      let campusSlug: string | null = null;
      const { data: c } = await db.from("campuses").select("slug,name,short_name").eq("id", rep.campus_id).maybeSingle();
      if (c?.slug) { campusSlug = c.slug as string; school = canonicalSchoolName(c.slug as string, (c.short_name as string) || (c.name as string)); }
      let ownChapter: string | null = null;
      if (data.ownChapterId) {
        const { data: ch } = await db.from("campus_greek_chapters").select("greek_org_id,nickname").eq("id", data.ownChapterId).maybeSingle();
        if (ch?.greek_org_id) { const { data: org } = await db.from("greek_orgs").select("name").eq("id", ch.greek_org_id).maybeSingle(); ownChapter = (org?.name as string) ?? (ch.nickname as string) ?? null; }
      }
      const roleLabels = roles.map((r) => CAMPUS_ROLE_CHIPS.find((c) => c.slug === r)?.label ?? r);
      const detail = [
        `Class of ${data.graduationYear}`,
        ownChapter ? `in ${ownChapter}` : "not Greek",
        `can reach ${reachable} chapter${reachable === 1 ? "" : "s"}`,
        ...roleLabels,
      ].join(", ");
      const phone = (rep.phone as string | null) ?? null;
      const { ensureConversationRef, actionLink } = await import("@/lib/comms/refs.server");
      const refRow = phone ? await ensureConversationRef(db, { phone, campusId: rep.campus_id, kind: "rep", subject: `${school ?? "campus"} rep application: ${rep.name as string}`, isTest: !!rep.is_test }) : null;
      const { founderAlert } = await import("@/lib/comms/send.server");
      await founderAlert({
        ctx: {
          kind: "rep", name: rep.name as string, school, campusSlug, email: (rep.email as string | null) ?? null, phone,
          ref: refRow?.shortRef ?? null, actionLink: actionLink(refRow?.shortRef), repStage: "applied", detail,
          note: data.pitch?.trim() || null, applicationLink: "https://surviveaccounting.com/admin/reps/roster",
        },
        isTest: !!rep.is_test,
      });
    } catch (e) { console.warn("rep application alert not sent (application saved):", (e as Error).message); }

    return { ok: true, reachable: reachCount(data.reach).total };
  });
