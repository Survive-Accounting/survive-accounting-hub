// PARTNER PAGES — the data behind /partners/council/<school>/<council> and
// /partners/national/<org>.
//
// PUBLIC, UNLIKE /go/<school>/council/<council>?k=… . That page is a private, token-linked
// command centre for a chair we are already talking to. These are the OUTBOUND pages: a national
// exec or a council officer opens one cold, from an email, with no token — so nothing here is
// gated, and nothing here exposes anything a chapter page does not already show publicly.
//
// WHAT THAT MEANS FOR NUMBERS. The private council page reports per-chapter signups because the
// chair who opened it owns those chapters. A public page does not, so these functions return
// counts that are already public facts — how many chapters we have on file, and how many have
// been CLAIMED by an exec — and never per-chapter member counts. "Students reached" is therefore
// deliberately absent from the live shape: the page renders it as "not tracked yet" rather than
// inventing a number, and the field can be added here the day the instrumentation lands.
//
// EVERYTHING IS REUSED. Councils come from the COUNCILS registry, chapters from
// campus_greek_chapters (the same rows /go/ pages are built from, so links can never diverge),
// national orgs from greek_orgs, and course codes from campuses.course_family_codes_json — the
// one source every other surface reads.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { councilBySlug } from "@/lib/greek-councils.functions";
import { canonicalSchoolName } from "@/lib/schools";
import { orgSlugify, type PartnerChapterRow, type CouncilPartner, type NationalPartner, type NationalCampusRow } from "@/lib/partners";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape the other greek-* server modules use
type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** intro_1 out of campuses.course_family_codes_json — the ONE course-code source. Never guessed:
 *  a campus with no verified code yields null and every caller falls back to generic copy. */
const introCode = (j: unknown): string | null => {
  try {
    const o = typeof j === "string" ? JSON.parse(j || "{}") : ((j ?? {}) as Record<string, unknown>);
    const c = ((o as { intro_1?: unknown })?.intro_1 ?? "").toString().trim();
    return c || null;
  } catch { return null; }
};

const claimedOf = (s: string | null | undefined) => (s ?? "").toLowerCase() === "claimed";

// ── campus council ─────────────────────────────────────────────────────────────────────────────
export const getCouncilPartner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schoolSlug: z.string().trim().min(1).max(80),
    councilSlug: z.string().trim().min(1).max(20),
  }).parse(d))
  .handler(async ({ data }): Promise<CouncilPartner | null> => {
    const council = councilBySlug(data.councilSlug);
    if (!council) return null;
    const db = await admin();

    const { data: campus } = await db.from("campuses")
      .select("id,name,short_name,course_family_codes_json").eq("slug", data.schoolSlug).maybeSingle();
    if (!campus?.id) return null;

    // COUNCIL IS NOT STORED AS A SLUG. The column carries whatever the roster import found —
    // "IFC", "Panhellenic", "panhellenic", "NPHC" all exist at one campus — so matching
    // .eq("council", "ifc") would have found a single lowercase row and 404d every real page.
    // Fetched by campus and matched on a normalised form against the council slug, name and
    // full name instead.
    const { data: rows } = await db.from("campus_greek_chapters")
      .select("id,slug,greek_org_id,letters,nickname,claim_status,council")
      .eq("campus_id", campus.id)
      .not("slug", "is", null).limit(500);
    const norm = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const want = new Set([norm(council.slug), norm(council.name), norm(council.full)]);
    const chs = ((rows ?? []) as Array<{ id: string; slug: string; greek_org_id: string | null; letters: string | null; nickname: string | null; claim_status: string | null; council: string | null }>)
      .filter((c) => want.has(norm(c.council)));
    if (!chs.length) return null;

    const orgIds = [...new Set(chs.map((c) => c.greek_org_id).filter(Boolean))] as string[];
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
    const orgName = new Map<string, string>(((orgs ?? []) as Array<{ id: string; name: string | null }>).map((o) => [o.id, (o.name ?? "").trim()]));

    const chapters: PartnerChapterRow[] = chs
      .map((c) => ({
        name: c.greek_org_id ? (orgName.get(c.greek_org_id) || c.slug) : c.slug,
        slug: c.slug,
        letters: c.letters,
        nickname: c.nickname,
        // THE EXISTING chapter URL, never a parallel identity.
        goPath: `/go/${data.schoolSlug}/${c.slug}`,
        claimed: claimedOf(c.claim_status),
      }))
      // Claimed first (they are the proof), then alphabetical. Nothing is hidden — an unclaimed
      // chapter on this list is exactly what the council is being asked to fix.
      .sort((a, b) => Number(b.claimed) - Number(a.claimed) || a.name.localeCompare(b.name));

    return {
      schoolSlug: data.schoolSlug,
      schoolName: canonicalSchoolName(data.schoolSlug, (campus.short_name as string) || (campus.name as string)),
      councilSlug: council.slug, councilName: council.name, councilFull: council.full,
      courseCode: introCode(campus.course_family_codes_json),
      chapters,
      totalChapters: chapters.length,
      claimedChapters: chapters.filter((c) => c.claimed).length,
    };
  });

// ── national organization ──────────────────────────────────────────────────────────────────────
export const getNationalPartner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ orgSlug: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<NationalPartner | null> => {
    const db = await admin();

    // greek_orgs has no slug column, so the slug is derived from the name — the same derivation
    // the route builds its links with, matched here rather than stored.
    const { data: orgRows } = await db.from("greek_orgs").select("id,name,nickname").limit(3000);
    const orgs = (orgRows ?? []) as Array<{ id: string; name: string | null; nickname: string | null }>;
    const org = orgs.find((o) => orgSlugify(o.name ?? "") === data.orgSlug);
    if (!org?.id) return null;

    const { data: rows } = await db.from("campus_greek_chapters")
      .select("campus_id,slug,claim_status").eq("greek_org_id", org.id).not("slug", "is", null).limit(1000);
    const chs = (rows ?? []) as Array<{ campus_id: string; slug: string; claim_status: string | null }>;
    if (!chs.length) return null;

    const campusIds = [...new Set(chs.map((c) => c.campus_id))];
    const { data: campusRows } = await db.from("campuses")
      .select("id,slug,name,short_name,course_family_codes_json").in("id", campusIds).is("archived_at", null).limit(400);
    const campusById = new Map(((campusRows ?? []) as Array<{ id: string; slug: string | null; name: string; short_name: string | null; course_family_codes_json: unknown }>).map((c) => [c.id, c]));

    const campuses: NationalCampusRow[] = chs
      .map((c) => {
        const camp = campusById.get(c.campus_id);
        if (!camp?.slug) return null;
        return {
          schoolSlug: camp.slug,
          schoolName: canonicalSchoolName(camp.slug, camp.short_name || camp.name),
          courseCode: introCode(camp.course_family_codes_json),
          chapterSlug: c.slug,
          goPath: `/go/${camp.slug}/${c.slug}`,
          claimed: claimedOf(c.claim_status),
        };
      })
      .filter(Boolean) as NationalCampusRow[];
    if (!campuses.length) return null;

    campuses.sort((a, b) => Number(b.claimed) - Number(a.claimed) || a.schoolName.localeCompare(b.schoolName));

    return {
      orgSlug: data.orgSlug,
      orgName: (org.name ?? "").trim(),
      orgShort: (org.nickname ?? "").trim() || (org.name ?? "").trim(),
      campuses,
      totalCampuses: campuses.length,
      claimedChapters: campuses.filter((c) => c.claimed).length,
      // A campus we have mapped a course code for is a campus where the tailoring claim is TRUE.
      codedCampuses: campuses.filter((c) => c.courseCode).length,
    };
  });

/** The national orgs with the widest campus coverage — the discovery page's examples, and the
 *  only place a visitor can find a national page without being sent one. */
export const listTopNationalPartners = createServerFn({ method: "GET" })
  .handler(async (): Promise<Array<{ orgSlug: string; orgName: string; campuses: number }>> => {
    const db = await admin();
    const { data: orgRows } = await db.from("greek_orgs").select("id,name").limit(3000);
    const orgs = (orgRows ?? []) as Array<{ id: string; name: string | null }>;
    const byId = new Map(orgs.map((o) => [o.id, (o.name ?? "").trim()]));

    // Paged: PostgREST caps a response at 1,000 rows and there are 3,000+ slugged chapters.
    const count = new Map<string, Set<string>>();
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("campus_greek_chapters")
        .select("greek_org_id,campus_id").not("slug", "is", null).not("greek_org_id", "is", null)
        .range(from, from + 999);
      const page = (data ?? []) as Array<{ greek_org_id: string; campus_id: string }>;
      for (const r of page) {
        const set = count.get(r.greek_org_id) ?? new Set<string>();
        set.add(r.campus_id);
        count.set(r.greek_org_id, set);
      }
      if (page.length < 1000) break;
    }

    return [...count.entries()]
      .map(([id, set]) => ({ orgSlug: orgSlugify(byId.get(id) ?? ""), orgName: byId.get(id) ?? "", campuses: set.size }))
      .filter((r) => r.orgName && r.orgSlug)
      .sort((a, b) => b.campuses - a.campuses || a.orgName.localeCompare(b.orgName))
      .slice(0, 12);
  });
