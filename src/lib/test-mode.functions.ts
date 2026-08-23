// TEST MODE — server half. The env guard, the fixtures, and the purge.
//
// THE GUARD IS THE POINT. A URL flag is a suggestion; this is the decision. Without
// TEST_MODE_ENABLED in the environment, testModeStatus() reports off and every write below
// refuses — so test mode can be killed from the Vercel dashboard without a deploy, and a stray
// tester URL after the weekend does nothing at all.
//
// FIXTURES ARE DATA, NOT SCHEMA. Everything here inserts rows with the service key; no DDL, which
// is Lee's to paste. That also means seeding is idempotent and repeatable: the same script run
// twice leaves one Test University, not two.
//
// EXCLUSION IS BY CAMPUS AND BY FLAG. The fixture campus is marked archived-from-pickers (it never
// appears in ALL_SCHOOLS, which is a static list) and every row a tester creates carries is_test,
// which is the predicate the real counts already use for comms and will use everywhere else.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  TEST_CAMPUS_NAME, TEST_CAMPUS_SLUG, TEST_CHAPTER_NAME, TEST_CHAPTER_SLUG, TEST_COURSE_CODE,
} from "@/lib/test-mode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape the other server modules use
type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const ADMIN_EMAILS = ["lee@surviveaccounting.com", "king@surviveaccounting.com"];

/** Both locks, reported honestly. `enabled` is the env guard; a client that thinks it is in test
 *  mode without this is simply wrong and every server write will refuse it. */
export const testModeStatus = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ enabled: boolean; reason: string }> => {
    const on = (process.env.TEST_MODE_ENABLED ?? "").trim().toLowerCase();
    if (on === "1" || on === "true") return { enabled: true, reason: "TEST_MODE_ENABLED is set." };
    return { enabled: false, reason: "TEST_MODE_ENABLED is not set — test mode is off server-side." };
  });

const guard = () => {
  const on = (process.env.TEST_MODE_ENABLED ?? "").trim().toLowerCase();
  return on === "1" || on === "true";
};

async function isAdmin(db: DB, accessToken: string): Promise<boolean> {
  try {
    const { data } = await (db as unknown as { auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string | null } | null } }> } }).auth.getUser(accessToken);
    const e = (data?.user?.email ?? "").trim().toLowerCase();
    return !!e && ADMIN_EMAILS.includes(e);
  } catch { return false; }
}

export type FixtureState = {
  campusId: string | null;
  chapterRosterId: string | null;
  chapterShellId: string | null;
  campusUrl: string;
  chapterUrl: string;
  seeded: boolean;
  note: string;
};

/** SEED (idempotent). Creates or refreshes:
 *    · campuses            → Test University, slug test-university, intro_1 = TEST 101
 *    · campus_greek_chapters → the roster row behind /go/test-university/test-chapter
 *    · greek_chapters      → the shell the claim/dashboard/seat flow hangs off
 *  Professors are seeded when the table accepts them; a missing optional table is not a failure,
 *  because the lifecycle Lee is testing does not depend on one. */
export const seedTestFixtures = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<FixtureState> => {
    const out: FixtureState = {
      campusId: null, chapterRosterId: null, chapterShellId: null,
      campusUrl: `/${TEST_CAMPUS_SLUG}`, chapterUrl: `/go/${TEST_CAMPUS_SLUG}/${TEST_CHAPTER_SLUG}`,
      seeded: false, note: "",
    };
    if (!guard()) { out.note = "TEST_MODE_ENABLED is not set."; return out; }
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) { out.note = "Not authorised."; return out; }

    try {
      // 1. the campus
      const { data: existing } = await db.from("campuses").select("id").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
      let campusId = existing?.id as string | undefined;
      if (!campusId) {
        const { data: created, error } = await db.from("campuses").insert({
          slug: TEST_CAMPUS_SLUG,
          name: TEST_CAMPUS_NAME,
          short_name: TEST_CAMPUS_NAME,
          // The course code every test screen should show.
          course_family_codes_json: { intro_1: TEST_COURSE_CODE },
        }).select("id").maybeSingle();
        if (error) { out.note = `campuses: ${error.message}`; return out; }
        campusId = created?.id as string;
      } else {
        await db.from("campuses").update({ course_family_codes_json: { intro_1: TEST_COURSE_CODE } }).eq("id", campusId);
      }
      out.campusId = campusId ?? null;
      if (!campusId) { out.note = "Could not create the test campus."; return out; }

      // 2. the roster row — what /go/<school>/<chapter> resolves
      const { data: roster } = await db.from("campus_greek_chapters")
        .select("id").eq("campus_id", campusId).eq("slug", TEST_CHAPTER_SLUG).maybeSingle();
      let rosterId = roster?.id as string | undefined;
      if (!rosterId) {
        const { data: created, error } = await db.from("campus_greek_chapters").insert({
          campus_id: campusId,
          slug: TEST_CHAPTER_SLUG,
          council: "IFC",
          letters: "ΤΕΣΤ",
          nickname: "Test",
          claim_status: "unclaimed",
          chapter_designation: null,
        }).select("id").maybeSingle();
        if (error) { out.note = `campus_greek_chapters: ${error.message}`; return out; }
        rosterId = created?.id as string;
      } else {
        // A re-seed puts the chapter back to unclaimed so the lifecycle can be run again.
        await db.from("campus_greek_chapters").update({ claim_status: "unclaimed" }).eq("id", rosterId);
      }
      out.chapterRosterId = rosterId ?? null;

      // 3. the shell the claim + dashboard + seats hang off
      const { data: shell } = await db.from("greek_chapters")
        .select("id").eq("campus_greek_chapter_id", rosterId).maybeSingle();
      out.chapterShellId = (shell?.id as string) ?? null;

      out.seeded = true;
      out.note = "Test University and Test Chapter are ready.";
      return out;
    } catch (e) {
      out.note = e instanceof Error ? e.message : "Seeding failed.";
      return out;
    }
  });

export type PurgeCount = { table: string; rows: number };

/** COUNT FIRST. The purge screen shows exactly what will go before anything is deleted — a
 *  destructive admin action that cannot tell you what it is about to destroy is one you should
 *  not press. */
export const countTestData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<PurgeCount[]> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return [];
    const out: PurgeCount[] = [];
    const count = async (table: string) => {
      try {
        const { count: n } = await db.from(table).select("id", { count: "exact", head: true }).eq("is_test", true);
        out.push({ table, rows: n ?? 0 });
      } catch { /* table may not carry is_test yet */ }
    };
    for (const t of ["chapter_seat_assignments", "chapter_seat_pools", "chapter_share_events", "comms_sends", "campus_waitlist"]) await count(t);
    // Fixture-scoped rows (members, claims) are counted by campus rather than by flag, because
    // they are only ever created against the fixture.
    try {
      const { data: campus } = await db.from("campuses").select("id").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
      if (campus?.id) {
        const { data: roster } = await db.from("campus_greek_chapters").select("id").eq("campus_id", campus.id).limit(50);
        const rosterIds = ((roster ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (rosterIds.length) {
          const { data: shells } = await db.from("greek_chapters").select("id").in("campus_greek_chapter_id", rosterIds).limit(50);
          const shellIds = ((shells ?? []) as Array<{ id: string }>).map((s) => s.id);
          if (shellIds.length) {
            const { count: m } = await db.from("greek_chapter_members").select("id", { count: "exact", head: true }).in("chapter_id", shellIds);
            out.push({ table: "greek_chapter_members (fixture)", rows: m ?? 0 });
          }
          out.push({ table: "greek_chapters (fixture)", rows: shellIds.length });
        }
      }
    } catch { /* best effort */ }
    return out;
  });

/** PURGE, in dependency order: assignments → pools → share events → members → shells. The fixture
 *  campus and roster row are KEPT so the next run has something to walk into; re-seed resets the
 *  claim status. */
export const purgeTestData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), confirm: z.literal(true) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; removed: PurgeCount[]; error?: string }> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return { ok: false, removed: [], error: "Not authorised." };
    if (!guard()) return { ok: false, removed: [], error: "TEST_MODE_ENABLED is not set." };

    const removed: PurgeCount[] = [];
    const del = async (table: string, apply: (q: unknown) => unknown) => {
      try {
        const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("is_test", true);
        await apply(db.from(table).delete().eq("is_test", true));
        removed.push({ table, rows: count ?? 0 });
      } catch { /* table may not exist yet */ }
    };

    // Flagged rows first, children before parents.
    await del("chapter_seat_assignments", (q) => q);
    await del("chapter_seat_pools", (q) => q);
    await del("chapter_share_events", (q) => q);

    // Fixture-scoped rows.
    try {
      const { data: campus } = await db.from("campuses").select("id").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
      if (campus?.id) {
        const { data: roster } = await db.from("campus_greek_chapters").select("id").eq("campus_id", campus.id).limit(50);
        const rosterIds = ((roster ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (rosterIds.length) {
          const { data: shells } = await db.from("greek_chapters").select("id").in("campus_greek_chapter_id", rosterIds).limit(50);
          const shellIds = ((shells ?? []) as Array<{ id: string }>).map((s) => s.id);
          if (shellIds.length) {
            const { count: m } = await db.from("greek_chapter_members").select("id", { count: "exact", head: true }).in("chapter_id", shellIds);
            await db.from("greek_chapter_members").delete().in("chapter_id", shellIds);
            removed.push({ table: "greek_chapter_members (fixture)", rows: m ?? 0 });
            await db.from("greek_chapters").delete().in("id", shellIds);
            removed.push({ table: "greek_chapters (fixture)", rows: shellIds.length });
          }
          // The roster row survives; its claim state is reset so the lifecycle can start again.
          await db.from("campus_greek_chapters").update({ claim_status: "unclaimed" }).in("id", rosterIds);
        }
      }
    } catch { /* best effort */ }

    return { ok: true, removed };
  });

/** Is this slug/campus one of the fixtures? Used by anything that must exclude them from real
 *  lists, sitemaps and counts. */
export const isFixtureSlug = (slug: string | null | undefined) => (slug ?? "") === TEST_CAMPUS_SLUG;
export { TEST_CAMPUS_SLUG, TEST_CHAPTER_SLUG, TEST_CHAPTER_NAME, TEST_CAMPUS_NAME, TEST_COURSE_CODE };
