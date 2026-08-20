// GREEK /go/ (server) — Phase 1. The canonical public chapter surface:
//
//     /go/<campus.slug>/<campus_greek_chapters.slug>
//
// Every one of the 1,107 roster chapters is public from day one — no claim required, no exec
// signup required. That is the whole shape change from 0111, which could not represent a chapter
// until someone claimed it.
//
// LINK LAW: nothing in this file (or anywhere else, from now on) emits a /c/<slug> URL. /c/ is
// redirect-only. `goPath()` below is the ONE place a chapter URL is built, so there is exactly one
// thing to change if the scheme ever moves again.
//
// Tables: 0115 (manual-apply) on top of 0111.
import { canonicalSchoolName } from "@/lib/schools";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** THE canonical chapter URL builder. Everything that shows, copies, QR-encodes or prints a
 *  chapter link goes through this — share toolkit, dashboard, flyer, admin list. */
export function goPath(schoolSlug: string, chapterSlug: string): string {
  return `/go/${schoolSlug}/${chapterSlug}`;
}

export interface GoChapter {
  campusGreekChapterId: string;
  campusId: string;
  schoolSlug: string;
  schoolName: string;
  chapterSlug: string;
  chapterName: string;
  /** e.g. "Mississippi Alpha" — the chapter's own Greek designation. STORE-ONLY: this must never
   *  appear in student-facing output (pages, flyers, share copy). */
  designation: string | null;
  /** The chapter's letters shorthand from the roster (e.g. "ATO"), when GreekIntel has it. */
  letters: string | null;
  /** What students actually call the chapter ("ADPi", "Pike") — the 66-campus roster import
   *  fills this; share copy and flyers prefer it over the formal organization name. */
  nickname: string | null;
  council: string | null;
  claimStatus: "unclaimed" | "pending" | "claimed";
  /** Members banked against this chapter so far. Real count or 0 — never a decorative number. */
  members: number;
}

/** Resolve a /go/ URL to its chapter. Returns null for an unknown school or chapter, which the
 *  route renders as the plain landing page rather than a 404 — a bad flyer QR should still land
 *  the student on something that works. */
export const getGoChapter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schoolSlug: z.string().trim().min(1).max(80),
    chapterSlug: z.string().trim().min(1).max(60),
  }).parse(d))
  .handler(async ({ data }): Promise<GoChapter | null> => {
    const db = await admin();
    const { data: campus } = await db.from("campuses").select("id,slug,name,short_name").eq("slug", data.schoolSlug).maybeSingle();
    if (!campus?.id) return null;

    // nickname arrives with 20260820_1209 (manual-apply). The fallback select keeps every /go/
    // page alive if this code deploys before Lee applies the migration — a 42703 on a bonus
    // column must never blank 2,000 live chapter pages.
    let row: { id: string; campus_id: string; greek_org_id: string | null; slug: string; chapter_designation: string | null; letters: string | null; nickname?: string | null; council: string | null; claim_status: string | null } | null = null;
    {
      const r1 = await db.from("campus_greek_chapters")
        .select("id,campus_id,greek_org_id,slug,chapter_designation,letters,nickname,council,claim_status")
        .eq("campus_id", campus.id).eq("slug", data.chapterSlug).maybeSingle();
      if (r1.error) {
        const r2 = await db.from("campus_greek_chapters")
          .select("id,campus_id,greek_org_id,slug,chapter_designation,letters,council,claim_status")
          .eq("campus_id", campus.id).eq("slug", data.chapterSlug).maybeSingle();
        row = r2.data ?? null;
      } else row = r1.data ?? null;
    }
    if (!row?.id) return null;

    const { data: org } = row.greek_org_id
      ? await db.from("greek_orgs").select("name").eq("id", row.greek_org_id).maybeSingle()
      : { data: null };

    // The member count comes from the shell chapter row if one exists yet; no shell = nobody has
    // joined = 0. Reported as-is.
    const { data: shell } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", row.id).maybeSingle();
    let members = 0;
    if (shell?.id) {
      const { count } = await db.from("greek_chapter_members").select("*", { count: "exact", head: true }).eq("chapter_id", shell.id);
      members = count ?? 0;
    }

    return {
      campusGreekChapterId: row.id,
      campusId: campus.id,
      schoolSlug: campus.slug,
      schoolName: campus.short_name || campus.name,
      chapterSlug: row.slug,
      chapterName: (org?.name ?? "").trim() || "Chapter",
      designation: row.chapter_designation ?? null,
      letters: row.letters ?? null,
      nickname: row.nickname ?? null,
      council: row.council ?? null,
      claimStatus: (row.claim_status ?? "unclaimed") as GoChapter["claimStatus"],
      members,
    };
  });

/** Schools that actually have chapters, with their REAL campuses.slug.
 *
 *  Read from the database rather than from landing.tsx's SCHOOLS list, whose `id` is a short label
 *  ("ole-miss") and not the campus slug ("university-of-mississippi"). Hardcoding a second mapping
 *  between the two is how /go/ URLs would start 404-ing the first time a campus slug changed. */
export const listGoSchools = createServerFn({ method: "GET" })
  .handler(async (): Promise<Array<{ slug: string; name: string }>> => {
    const db = await admin();
    // ALL live campuses, not just SEC — the 66-campus roster import put chapters on 50 non-SEC
    // campuses, and a picker that filtered is_sec would hide every one of them. "Has at least
    // one slugged chapter" is still the gate: a school whose roster has no reachable /go/ page
    // would be a dropdown entry that leads nowhere.
    const { data: camps } = await db.from("campuses").select("id,slug,name,short_name").is("archived_at", null).not("slug", "is", null);
    const list = (camps ?? []) as Array<{ id: string; slug: string; name: string; short_name: string | null }>;
    if (!list.length) return [];
    // PAGED, not .limit(): PostgREST caps any response at 1,000 rows, and there are 3,000+
    // slugged chapters after the import — a single read would silently drop the campuses whose
    // rows landed past the cap.
    const have = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: rows } = await db.from("campus_greek_chapters")
        .select("campus_id").not("slug", "is", null).range(from, from + 999);
      const page = (rows ?? []) as Array<{ campus_id: string }>;
      for (const r of page) have.add(r.campus_id);
      if (page.length < 1000) break;
    }
    return list
      .filter((c) => have.has(c.id))
      // CANONICAL NAME, not short_name. short_name holds nicknames — Bama, Mizzou, OU, Vandy,
      // UT Austin — so the Greek picker spelled schools differently from the main site picker,
      // and inconsistently between each other. canonicalSchoolName resolves the slug through the
      // one school table; a campus not in that table keeps its own name.
      .map((c) => ({ slug: c.slug, name: canonicalSchoolName(c.slug, c.short_name || c.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

/** One chapter row as the pickers see it. nickname + letters exist so search can match what a
 *  student actually types ("ADPi", "ΑΔΠ") — they are search aliases, displayed nowhere. */
export interface GoChapterListItem {
  slug: string;
  name: string;
  council: string | null;
  nickname: string | null;
  letters: string | null;
}

/** Every chapter at one school — the self-report picker and the school index both read this.
 *  ALL councils, always: IFC, Panhellenic, NPHC, MGC and Other chapters are one roster here,
 *  and nothing in this function may filter by council. */
export const listGoChapters = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ schoolSlug: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<GoChapterListItem[]> => {
    const db = await admin();
    const { data: campus } = await db.from("campuses").select("id").eq("slug", data.schoolSlug).maybeSingle();
    if (!campus?.id) return [];
    // nickname is a 20260820_1209 column — fall back without it pre-migration (see getGoChapter).
    let list: Array<{ slug: string; greek_org_id: string | null; council: string | null; nickname?: string | null; letters: string | null }> = [];
    {
      const r1 = await db.from("campus_greek_chapters")
        .select("slug,greek_org_id,council,nickname,letters").eq("campus_id", campus.id).not("slug", "is", null).limit(600);
      if (r1.error) {
        const r2 = await db.from("campus_greek_chapters")
          .select("slug,greek_org_id,council,letters").eq("campus_id", campus.id).not("slug", "is", null).limit(600);
        list = (r2.data ?? []) as typeof list;
      } else list = (r1.data ?? []) as typeof list;
    }
    const ids = [...new Set(list.map((r) => r.greek_org_id).filter(Boolean))] as string[];
    if (!ids.length) return [];
    // Org nickname backs up the chapter's own: the catalog carries "Phi Psi"/"KD"-style
    // nicknames for about half the national orgs, and a chapter row imported without one
    // should still be findable by what students call it.
    const { data: orgs } = await db.from("greek_orgs").select("id,name,nickname").in("id", ids);
    const byId = new Map<string, { name: string; nickname: string | null }>(
      (orgs ?? []).map((o: { id: string; name: string | null; nickname: string | null }) => [o.id, { name: (o.name ?? "").trim(), nickname: o.nickname?.trim() || null }]),
    );
    return list
      .map((r) => {
        const org = r.greek_org_id ? byId.get(r.greek_org_id) : undefined;
        return {
          slug: r.slug,
          name: org?.name ?? "",
          council: r.council,
          nickname: r.nickname?.trim() || org?.nickname || null,
          letters: r.letters?.trim() || null,
        };
      })
      .filter((r) => r.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

/** The shell chapter record for a roster row, created on demand.
 *
 *  A chapter can bank members long before an exec claims it, but greek_chapter_members keys to
 *  greek_chapters, so the first join has to materialise that row. 0115 relaxed the three admin_*
 *  NOT NULLs for exactly this. school_name / chapter_name / slug are all fillable from the roster
 *  row, so they stay NOT NULL — the shell is a real, complete chapter record that simply has no
 *  admin yet. The global slug is <campus>-<chapter>, which is unique because campus slugs are. */
async function shellChapterId(db: DB, ch: GoChapter): Promise<string | null> {
  const { data: found } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", ch.campusGreekChapterId).maybeSingle();
  if (found?.id) return found.id as string;
  const { data: ins, error } = await db.from("greek_chapters").insert({
    slug: `${ch.schoolSlug}-${ch.chapterSlug}`,
    campus_id: ch.campusId,
    campus_greek_chapter_id: ch.campusGreekChapterId,
    school_name: ch.schoolName,
    chapter_name: ch.chapterName,
    claim_status: "unclaimed",
  }).select("id").single();
  if (error) {
    // A concurrent first-join races here; the unique index on campus_greek_chapter_id is what makes
    // that safe, so re-read rather than surfacing a collision as a failure.
    const { data: again } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", ch.campusGreekChapterId).maybeSingle();
    return (again?.id as string) ?? null;
  }
  return ins.id as string;
}

/** Tag a student as a member of a chapter.
 *
 *  THE INVARIANT: one account, one membership per chapter. When a userId is present the write is an
 *  upsert against the (chapter_id, user_id) unique index from 0115, so joining twice — a second
 *  visit, a re-scanned QR, a link forwarded back to someone already in — updates one row instead of
 *  creating a second person. Anonymous tags (no account yet) carry name/phone only and are
 *  reconciled to an account when the student signs in. */
export const tagChapterMember = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schoolSlug: z.string().trim().min(1).max(80),
    chapterSlug: z.string().trim().min(1).max(60),
    userId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(120).nullable().optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    source: z.enum(["link", "self_report", "exec_invite"]).default("link"),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; members: number }> => {
    const db = await admin();
    const ch = await getGoChapter({ data: { schoolSlug: data.schoolSlug, chapterSlug: data.chapterSlug } });
    if (!ch) return { ok: false, members: 0 };
    const chapterId = await shellChapterId(db, ch);
    if (!chapterId) return { ok: false, members: ch.members };

    if (data.userId) {
      await db.from("greek_chapter_members").upsert({
        chapter_id: chapterId, user_id: data.userId, name: data.name ?? null, phone: data.phone ?? null,
        source: data.source, tagged_at: new Date().toISOString(),
      }, { onConflict: "chapter_id,user_id" });
    } else {
      // No account yet. Without a user_id the unique index does not apply, so de-dupe on phone —
      // the only stable handle an anonymous student has — rather than banking the same person twice.
      const phone = (data.phone ?? "").trim();
      const { data: dupe } = phone
        ? await db.from("greek_chapter_members").select("id").eq("chapter_id", chapterId).eq("phone", phone).maybeSingle()
        : { data: null };
      if (!dupe?.id) {
        await db.from("greek_chapter_members").insert({
          chapter_id: chapterId, name: data.name ?? null, phone: phone || null, source: data.source,
        });
      }
    }

    const { count } = await db.from("greek_chapter_members").select("*", { count: "exact", head: true }).eq("chapter_id", chapterId);
    return { ok: true, members: count ?? 0 };
  });

/** LEGACY /c/<slug> -> /go/. Returns the canonical path for an old chapter link, or null.
 *
 *  0111's greek_chapters.slug was the old public key. A row that predates Phase 1 has no
 *  campus_greek_chapter_id, so it falls back to matching its campus — an old link keeps working
 *  even if it cannot name a specific chapter. */
export const resolveLegacyChapterSlug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data }): Promise<string | null> => {
    const db = await admin();
    const { data: ch } = await db.from("greek_chapters")
      .select("campus_id,campus_greek_chapter_id").eq("slug", data.slug).maybeSingle();
    if (!ch) return null;
    const { data: campus } = ch.campus_id
      ? await db.from("campuses").select("slug").eq("id", ch.campus_id).maybeSingle()
      : { data: null };
    if (!campus?.slug) return null;
    if (!ch.campus_greek_chapter_id) return null;
    const { data: roster } = await db.from("campus_greek_chapters").select("slug").eq("id", ch.campus_greek_chapter_id).maybeSingle();
    if (!roster?.slug) return null;
    return goPath(campus.slug, roster.slug);
  });

/** GREEK PAGE EVENTS — visits and shares, on a chapter.
 *
 *  WHY NOT logExpandEvent: that one validates `event` against a CLOSED ENUM of five strings, so a
 *  dynamic "greek_visit:<school>/<chapter>" fails validation and is rejected. The first version of
 *  this tracking called it anyway and wrapped the call in .catch(() => {}), so every visit and every
 *  share was silently recorded nowhere — the sessionStorage key was written, the request went out,
 *  and nothing landed. Analytics that fail quietly are worse than no analytics: they read as data.
 *
 *  The client sends a KIND from a fixed list plus the slugs; the string is composed here. That keeps
 *  the enum tight (no arbitrary text reaches the table from a browser) while still allowing the
 *  per-chapter detail an exec actually wants.
 *
 *  Best-effort by design — a failed log must never break a share — but the INSERT error is logged
 *  server-side rather than swallowed, so a broken pipe is discoverable. */
export const GREEK_EVENT_KINDS = ["visit", "copy_link", "copy_message", "flyer_download", "flyer_print"] as const;

export const logGreekEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(GREEK_EVENT_KINDS),
    schoolSlug: z.string().trim().min(1).max(80),
    chapterSlug: z.string().trim().min(1).max(60),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const db = await admin();
      const { error } = await db.from("expand_events")
        .insert({ event: `greek_${data.kind}:${data.schoolSlug}/${data.chapterSlug}` });
      if (error) { console.warn("logGreekEvent insert failed:", error.message); return { ok: false }; }
      return { ok: true };
    } catch (e) {
      console.warn("logGreekEvent failed:", (e as Error).message);
      return { ok: false };
    }
  });
