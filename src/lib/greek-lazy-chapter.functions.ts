// LAZY CHAPTER CREATION — a member creates their own chapter when we do not have it.
//
// WHY THERE IS NO CHAPTER SEED. Scraped chapter coverage is thin and uneven: the SEC campuses
// average 55 chapters each while every other campus averages 2, which measures how much we
// scraped rather than how much Greek life is there. Seeding the gap would mean inventing rows.
// Instead a chapter appears the moment a real member asks for it, which is also the only evidence
// that it is worth having.
//
// PENDING IS NOT BLOCKED. The row is created with status "pending" and lands in an admin queue,
// but the /go/ page works immediately — that resolver keys on campus + slug and filters on
// neither status nor archived_at. Making someone wait for review before they can watch a free
// video would be a queue protecting nothing.
//
// EXISTING RECORDS WIN. If a chapter for this campus and org already exists, it is returned
// untouched — including one already claimed or renamed. Self-serve creation must never overwrite
// what GreekIntel or an exec has already established.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** greek_orgs.council holds the NATIONAL bodies; campus councils (and the council pages) use the
 *  campus names. Without this map a self-created chapter never appears on its council page. */
const COUNCIL_FROM_NATIONAL: Record<string, string> = {
  NIC: "IFC",          // North-American Interfraternity Conference -> campus IFC
  NPC: "Panhellenic",  // National Panhellenic Conference           -> campus Panhellenic
  NPHC: "NPHC",
  MGC: "MGC",
  Professional: "Professional",
};

export type NationalOrg = {
  id: string; name: string;
  /** Greek letters, for the row's leading glyphs. */
  letters: string | null;
  /** "SigEp", "Tri Delta" — what members actually call it. Matched in search. */
  nickname: string | null;
  orgType: string | null;
  council: string | null;
};

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

export const listNationalOrgs = createServerFn({ method: "POST" })
  .handler(async (): Promise<NationalOrg[]> => {
    const db = await admin();
    const { data } = await db.from("greek_orgs")
      .select("id,name,letters,nickname,org_type,council")
      .not("letters", "is", null)          // the curated national list; un-enriched rows are noise here
      .order("name")
      .limit(400);
    return ((data ?? []) as any[]).map((o) => ({
      id: o.id, name: o.name, letters: o.letters, nickname: o.nickname,
      orgType: o.org_type, council: o.council,
    }));
  });

const slugify = (s: string) => (s || "").toLowerCase().normalize("NFKD")
  .replace(/[\u2010-\u2015]/g, "-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const createPendingChapter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schoolSlug: z.string().trim().min(1).max(160),
    orgId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; chapterSlug: string; created: boolean } | { ok: false; error: string }> => {
    const db = await admin();

    const { data: campus } = await db.from("campuses").select("id,name").eq("slug", data.schoolSlug).maybeSingle();
    if (!campus?.id) return { ok: false, error: "We don't have that school yet." };

    const { data: org } = await db.from("greek_orgs")
      .select("id,name,letters,council,org_type").eq("id", data.orgId).maybeSingle();
    if (!org?.id) return { ok: false, error: "We don't have that organization yet." };

    // EXISTING WINS — return it rather than creating a second row for the same chapter.
    const { data: existing } = await db.from("campus_greek_chapters")
      .select("id,slug").eq("campus_id", campus.id).eq("greek_org_id", org.id).maybeSingle();
    if (existing?.slug) return { ok: true, chapterSlug: existing.slug as string, created: false };

    // The slug is the org's name, made unique WITHIN the campus. /go/ keys on (campus, slug), so
    // a clash only matters against this campus's own rows.
    const base = slugify(org.name as string);
    const { data: taken } = await db.from("campus_greek_chapters")
      .select("slug").eq("campus_id", campus.id).like("slug", `${base}%`);
    const used = new Set(((taken ?? []) as any[]).map((r) => r.slug));
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;

    const { error } = await db.from("campus_greek_chapters").insert({
      campus_id: campus.id,
      greek_org_id: org.id,
      slug,
      status: "pending",
      claim_status: "unclaimed",
      council: org.council ? (COUNCIL_FROM_NATIONAL[org.council as string] ?? org.council) : null,
      letters: org.letters ?? null,
      // Provenance, so the admin queue can tell a member-created row from a scraped one and Lee
      // knows which rows have a real person behind them.
      discovery_source: "member_self_serve",
      needs_verification: true,
    });
    if (error) return { ok: false, error: "Couldn't set that up — try again in a moment." };

    return { ok: true, chapterSlug: slug, created: true };
  });

export type PendingChapter = {
  id: string; chapterSlug: string; chapterName: string;
  schoolName: string; schoolSlug: string; council: string | null; status: string; createdAt: string;
};

const ADMIN_EMAILS = ["lee@surviveaccounting.com", "king@surviveaccounting.com", "lee@survivestudios.com"];

async function isAdmin(db: any, accessToken: string): Promise<boolean> {
  try {
    const { data } = await db.auth.getUser(accessToken);
    const e = (data?.user?.email ?? "").toLowerCase();
    return !!e && ADMIN_EMAILS.includes(e);
  } catch { return false; }
}

/** The admin queue. Member-created rows only — a list that also held the thousand scraped rows
 *  would not be a queue.
 *
 *  ADMIN-GATED. Returns null (not an empty list) for a non-admin, so the page can tell "you may
 *  not see this" apart from "there is nothing here" and show the right thing. */
export const listPendingChapters = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<PendingChapter[] | null> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return null;
    const { data: rows } = await db.from("campus_greek_chapters")
      .select("id,slug,campus_id,greek_org_id,council,created_at,status")
      .eq("discovery_source", "member_self_serve").order("created_at", { ascending: false }).limit(300);
    const list = (rows ?? []) as any[];
    if (!list.length) return [];

    const { data: campuses } = await db.from("campuses").select("id,name,short_name,slug")
      .in("id", [...new Set(list.map((r) => r.campus_id))]);
    const { data: orgs } = await db.from("greek_orgs").select("id,name")
      .in("id", [...new Set(list.map((r) => r.greek_org_id).filter(Boolean))]);
    const cById = new Map(((campuses ?? []) as any[]).map((c) => [c.id, c]));
    const oById = new Map(((orgs ?? []) as any[]).map((o) => [o.id, o]));

    return list.map((r) => {
      const c = cById.get(r.campus_id);
      return {
        id: r.id, chapterSlug: r.slug,
        chapterName: oById.get(r.greek_org_id)?.name ?? r.slug,
        schoolName: c?.short_name || c?.name || "—",
        schoolSlug: c?.slug ?? "",
        council: r.council, status: r.status ?? "pending", createdAt: r.created_at,
      };
    });
  });

export type IncompleteRosterCampus = { schoolName: string; schoolSlug: string; chapters: number; asOf: string | null };

/** Campuses whose imported Greek roster is KNOWN to be partial (roster_status = 'incomplete',
 *  stamped by the 66-campus import). This is the re-collection worklist: the pages work, but the
 *  chapter counts are implausibly low for these Greek systems.
 *
 *  ADMIN-GATED like the queue above; null = not an admin. Degrades to [] before 20260820_1209
 *  is applied (the column doesn't exist yet, which also means nothing has been flagged). */
export const listIncompleteRosterCampuses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<IncompleteRosterCampus[] | null> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return null;
    const { data: rows, error } = await db.from("campus_greek_chapters")
      .select("campus_id,as_of").eq("roster_status", "incomplete").limit(1000);
    if (error) return []; // pre-migration: no column, nothing flagged
    const list = (rows ?? []) as Array<{ campus_id: string; as_of: string | null }>;
    if (!list.length) return [];
    const byCampus = new Map<string, { chapters: number; asOf: string | null }>();
    for (const r of list) {
      const v = byCampus.get(r.campus_id) ?? { chapters: 0, asOf: null };
      v.chapters++;
      if (r.as_of && (!v.asOf || r.as_of > v.asOf)) v.asOf = r.as_of;
      byCampus.set(r.campus_id, v);
    }
    const { data: campuses } = await db.from("campuses").select("id,name,short_name,slug").in("id", [...byCampus.keys()]);
    const cById = new Map(((campuses ?? []) as any[]).map((c) => [c.id, c]));
    return [...byCampus.entries()]
      .map(([id, v]) => {
        const c = cById.get(id);
        return { schoolName: c?.short_name || c?.name || "—", schoolSlug: c?.slug ?? "", chapters: v.chapters, asOf: v.asOf };
      })
      .sort((a, b) => a.chapters - b.chapters || a.schoolName.localeCompare(b.schoolName));
  });

/** Approve or remove one member-created chapter.
 *
 *  APPROVE clears needs_verification and marks it active. REMOVE archives rather than deletes: the
 *  /go/ URL may already have been shared in a group chat, and a delete would turn a link somebody
 *  sent their whole house into a dead end. */
export const setPendingChapterStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    id: z.string().uuid(),
    action: z.enum(["approve", "remove"]),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return { ok: false };
    const patch = data.action === "approve"
      ? { status: "active", needs_verification: false }
      : { archived_at: new Date().toISOString() };
    const { error } = await db.from("campus_greek_chapters").update(patch).eq("id", data.id);
    return { ok: !error };
  });
