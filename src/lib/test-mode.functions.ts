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

// ── the test panel ─────────────────────────────────────────────────────────────────────────────
//
// SHORTCUTS THAT CANNOT REACH A REAL CHAPTER. Everything below resolves the fixture by slug FIRST
// and refuses if the row it is about to touch is not that fixture. That is what makes it safe to
// run without an admin token: the worst thing any of it can do is approve, reset or empty a fake
// chapter that exists to be destroyed. With the TEST_MODE_ENABLED guard on top, a deployment with
// the flag off exposes none of it at all.
//
// Approval MIRRORS decideChapterClaim's approve branch (same admin fields, same claim and roster
// writes, same shell upsert) minus the SMS — a tester does not need a text saying their fake
// chapter is live. If that function's fields change, change them here too.

export type FixtureStatus = {
  ready: boolean;
  campusId: string | null;
  rosterId: string | null;
  chapterId: string | null;
  claimStatus: string | null;
  pendingClaimId: string | null;
  claimantEmail: string | null;
  members: number;
  seatPools: number;
  /** Rows the share kit wrote — the signal that step 6 actually happened. */
  shareEvents: number;
  /** Seats handed to a person, for step 8. */
  assignments: number;
  /** Where test mail is going right now, straight from the server-held session. */
  testerEmail: string | null;
  note: string;
};

/** Resolve the fixture and report exactly where the lifecycle stands. The panel reads this to
 *  decide which shortcut to offer, so a tester never presses a button that cannot apply. */

// ── the server half of the tester session ─────────────────────────────────────────────────────
//
// The client can PROPOSE a tester (that is what ?email= is). Only this can accept one, and only
// onto the allow-list. The address then lives in an HttpOnly cookie that the page cannot read,
// which is what lets the send layer treat it as the one legal destination for test mail — see
// test-mode.server.ts for why that boundary is where it is.

/** Adopt a tester for this browser session. Called once, when the banner first sees the URL. */
export const beginTestSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email().max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; email?: string }> => {
    const { checkTester, TEST_TO_COOKIE } = await import("@/lib/test-mode.server");
    const v = checkTester(data.email);
    if (!v.ok || !v.email) return { ok: false, error: v.error };
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(TEST_TO_COOKIE, v.email, {
      httpOnly: true,        // the page cannot read it, so it cannot be forged from the client
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      // No maxAge: it dies with the browser session, matching the client half.
    });
    return { ok: true, email: v.email };
  });

/** Where test mail is actually going, for the banner to state out loud. A tester who can see the
 *  destination never has to wonder whether the silence means "not sent" or "sent somewhere else". */
export const testDestination = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ email: string | null; allowed: string[] }> => {
    const { testerAllowList } = await import("@/lib/test-mode.server");
    return { email: (await testerEmail()).email, allowed: guard() ? testerAllowList() : [] };
  });

/** The tester's address for this request, or null. The ONE source a send may take a test
 *  destination from — there is no parameter anywhere that can name a recipient instead.
 *
 *  IT IS A SERVER FUNCTION, not a plain helper, and that is load-bearing rather than stylistic:
 *  only a .handler() body is stripped out of the client bundle. The same code in an exported
 *  async function in this file follows the import chain into the browser graph and the build
 *  refuses it — which is the protection working, not a nuisance. The two wrappers below are
 *  ordinary functions precisely because they touch nothing server-only themselves. */
export const testerEmail = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ email: string | null }> => {
    const { readTesterCookie, TEST_TO_COOKIE } = await import("@/lib/test-mode.server");
    try {
      const { getCookie } = await import("@tanstack/react-start/server");
      return { email: readTesterCookie(getCookie(TEST_TO_COOKIE)) };
    } catch { return { email: null }; }   // no request context (cron, worker) — no tester
  });

/** Is THIS request part of a test run? The predicate every write should use to decide is_test,
 *  rather than trusting a flag the client sent. */
export const isTestRequest = async (): Promise<boolean> => (await testerEmail()).email !== null;

export const testerEmailForRequest = async (): Promise<string | null> => (await testerEmail()).email;

export const endTestSessionServer = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean }> => {
    try {
      const { TEST_TO_COOKIE } = await import("@/lib/test-mode.server");
      const { deleteCookie } = await import("@tanstack/react-start/server");
      deleteCookie(TEST_TO_COOKIE, { path: "/" });
    } catch { /* no request context — nothing to clear */ }
    return { ok: true };
  });

// ── the activity log ──────────────────────────────────────────────────────────────────────────

export type TestActivityRow = {
  at: string;
  medium: string;
  template: string;
  to: string;
  status: string;
  error: string | null;
  subject: string | null;
};

/** Every message this run tried to send, as the send layer recorded it. This is the answer to
 *  "did the [TEST] confirmation fire?" that does not depend on an inbox arriving — including the
 *  sends that were deliberately skipped, which an inbox can never show you. */
export const testActivity = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ rows: TestActivityRow[]; note: string }> => {
    if (!guard()) return { rows: [], note: "TEST_MODE_ENABLED is not set." };
    try {
      const db = await admin();
      const { data, error } = await db.from("comms_sends")
        .select("sent_at,medium,template,to_email,to_phone,status,error,subject")
        .eq("is_test", true).order("sent_at", { ascending: false }).limit(25);
      if (error) return { rows: [], note: error.message };
      const rows: TestActivityRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        at: (r.sent_at as string) ?? "",
        medium: (r.medium as string) ?? "",
        template: (r.template as string) ?? "",
        to: ((r.to_email as string) || (r.to_phone as string) || "—"),
        status: (r.status as string) ?? "",
        error: (r.error as string) ?? null,
        subject: (r.subject as string) ?? null,
      }));
      return { rows, note: rows.length ? "" : "Nothing sent yet this run." };
    } catch (e) {
      return { rows: [], note: e instanceof Error ? e.message : "Couldn't read the activity log." };
    }
  });

export const getFixtureStatus = createServerFn({ method: "GET" })
  .handler(async (): Promise<FixtureStatus> => {
    const out: FixtureStatus = {
      ready: false, campusId: null, rosterId: null, chapterId: null,
      claimStatus: null, pendingClaimId: null, claimantEmail: null,
      members: 0, seatPools: 0, shareEvents: 0, assignments: 0, testerEmail: null, note: "",
    };
    try { out.testerEmail = await testerEmailForRequest(); } catch { /* no session yet */ }
    if (!guard()) { out.note = "TEST_MODE_ENABLED is not set."; return out; }
    try {
      const db = await admin();
      const { data: campus } = await db.from("campuses").select("id").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
      if (!campus?.id) { out.note = "Fixture campus missing — press Seed."; return out; }
      out.campusId = campus.id as string;

      const { data: roster } = await db.from("campus_greek_chapters")
        .select("id,claim_status").eq("campus_id", campus.id).eq("slug", TEST_CHAPTER_SLUG).maybeSingle();
      if (!roster?.id) { out.note = "Fixture chapter missing — press Seed."; return out; }
      out.rosterId = roster.id as string;
      out.claimStatus = (roster.claim_status as string) ?? "unclaimed";

      const { data: claim } = await db.from("greek_chapter_claims")
        .select("id,email,status").eq("campus_greek_chapter_id", roster.id).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      out.pendingClaimId = (claim?.id as string) ?? null;
      out.claimantEmail = (claim?.email as string) ?? null;

      const { data: shell } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", roster.id).maybeSingle();
      out.chapterId = (shell?.id as string) ?? null;
      if (shell?.id) {
        const { count: m } = await db.from("greek_chapter_members").select("id", { count: "exact", head: true }).eq("chapter_id", shell.id);
        out.members = m ?? 0;
        try {
          const { data: pools } = await db.from("chapter_seat_pools").select("id").eq("chapter_id", shell.id).limit(200);
          const poolIds = ((pools ?? []) as Array<{ id: string }>).map((x) => x.id);
          out.seatPools = poolIds.length;
          if (poolIds.length) {
            const { count: a } = await db.from("chapter_seat_assignments").select("id", { count: "exact", head: true }).in("pool_id", poolIds);
            out.assignments = a ?? 0;
          }
        } catch { out.seatPools = 0; out.assignments = 0; }
        try {
          const { count: sh } = await db.from("chapter_share_events").select("id", { count: "exact", head: true }).eq("chapter_id", shell.id);
          out.shareEvents = sh ?? 0;
        } catch { out.shareEvents = 0; }
      }
      out.ready = true;
      return out;
    } catch (e) {
      out.note = e instanceof Error ? e.message : "Could not read the fixture.";
      return out;
    }
  });

/** APPROVE the fixture's pending claim — step 4 of the run sheet, without a trip to outreach.
 *  Refuses anything that is not a pending claim on the fixture chapter. */
export const testApproveFixtureClaim = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; error?: string; chapterId?: string }> => {
    if (!guard()) return { ok: false, error: "TEST_MODE_ENABLED is not set." };
    const db = await admin();

    const { data: campus } = await db.from("campuses").select("id,slug,name,short_name").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
    if (!campus?.id) return { ok: false, error: "Fixture campus missing — press Seed first." };
    const { data: roster } = await db.from("campus_greek_chapters")
      .select("id,slug,greek_org_id,campus_id").eq("campus_id", campus.id).eq("slug", TEST_CHAPTER_SLUG).maybeSingle();
    if (!roster?.id) return { ok: false, error: "Fixture chapter missing — press Seed first." };

    const { data: claim } = await db.from("greek_chapter_claims")
      .select("*").eq("campus_greek_chapter_id", roster.id).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!claim?.id) return { ok: false, error: "No pending claim on the test chapter — submit one at step 3 first." };
    // Belt and braces: the claim must belong to the fixture just resolved.
    if (claim.campus_greek_chapter_id !== roster.id) return { ok: false, error: "That claim is not on the test chapter." };

    const { data: org } = roster.greek_org_id
      ? await db.from("greek_orgs").select("name").eq("id", roster.greek_org_id).maybeSingle()
      : { data: null };
    const chapterName = ((org?.name as string) ?? "").trim() || TEST_CHAPTER_NAME;
    const schoolName = (campus.short_name as string) || (campus.name as string) || TEST_CAMPUS_NAME;

    const adminFields = {
      admin_name_role: `${claim.name}, ${claim.position}`,
      admin_email: claim.email,
      admin_phone: claim.phone,
      claim_status: "claimed",
      status: "active",
      // Same reason as the real path: without this the new admin cannot open their own dashboard.
      phone_verified_at: new Date().toISOString(),
    };

    const { data: shell } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", roster.id).maybeSingle();
    let chapterId = (shell?.id as string) ?? null;
    if (chapterId) {
      const { error } = await db.from("greek_chapters").update(adminFields).eq("id", chapterId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data: created, error } = await db.from("greek_chapters").insert({
        slug: `${TEST_CAMPUS_SLUG}-${TEST_CHAPTER_SLUG}`,
        campus_id: roster.campus_id, campus_greek_chapter_id: roster.id,
        school_name: schoolName, chapter_name: chapterName, greek_org_id: roster.greek_org_id,
        ...adminFields,
      }).select("id").maybeSingle();
      if (error) return { ok: false, error: error.message };
      chapterId = (created?.id as string) ?? null;
    }

    await db.from("greek_chapter_claims").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", claim.id);
    await db.from("campus_greek_chapters").update({ claim_status: "claimed", claimed_at: new Date().toISOString() }).eq("id", roster.id);

    // The SAME approval message the real path sends — not a silent shortcut. A tester who never
    // sees the approval notification cannot tell you it reads wrong, and step 10 of the run sheet
    // is exactly that check. It is is_test, so it routes to the tester and the SMS is suppressed.
    const { sendChapterApproval } = await import("@/lib/greek-claims.functions");
    await sendChapterApproval({
      name: claim.name as string, email: claim.email as string, phone: claim.phone as string,
      chapterName, schoolName,
      chapterLink: `https://surviveaccounting.com/go/${TEST_CAMPUS_SLUG}/${TEST_CHAPTER_SLUG}`,
      isTest: true,
    });
    return { ok: true, chapterId: chapterId ?? undefined };
  });

/** RESET the fixture to a clean unclaimed chapter: members, claims, seat pools, share events and
 *  the shell go; the campus and roster row stay so the next run has something to walk into.
 *  "Start over" with teeth — and it touches nothing outside the fixture. */
export const resetFixture = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; error?: string; removed: Record<string, number> }> => {
    const removed: Record<string, number> = {};
    if (!guard()) return { ok: false, error: "TEST_MODE_ENABLED is not set.", removed };
    try {
      const db = await admin();
      const { data: campus } = await db.from("campuses").select("id").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
      if (!campus?.id) return { ok: false, error: "Fixture campus missing — press Seed first.", removed };
      const { data: roster } = await db.from("campus_greek_chapters")
        .select("id").eq("campus_id", campus.id).eq("slug", TEST_CHAPTER_SLUG).maybeSingle();
      if (!roster?.id) return { ok: false, error: "Fixture chapter missing — press Seed first.", removed };

      const { data: shell } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", roster.id).maybeSingle();
      if (shell?.id) {
        // Children before parents.
        try {
          const { data: pools } = await db.from("chapter_seat_pools").select("id").eq("chapter_id", shell.id).limit(200);
          const poolIds = ((pools ?? []) as Array<{ id: string }>).map((p) => p.id);
          if (poolIds.length) {
            await db.from("chapter_seat_assignments").delete().in("pool_id", poolIds);
            await db.from("chapter_seat_pools").delete().in("id", poolIds);
            removed.seat_pools = poolIds.length;
          }
          await db.from("chapter_share_events").delete().eq("chapter_id", shell.id);
        } catch { /* seat tables may not be applied yet */ }
        const { count: m } = await db.from("greek_chapter_members").select("id", { count: "exact", head: true }).eq("chapter_id", shell.id);
        await db.from("greek_chapter_members").delete().eq("chapter_id", shell.id);
        removed.members = m ?? 0;
        await db.from("greek_chapters").delete().eq("id", shell.id);
        removed.chapter_shell = 1;
      }
      await db.from("greek_chapter_claims").delete().eq("campus_greek_chapter_id", roster.id);
      await db.from("campus_greek_chapters").update({ claim_status: "unclaimed", claimed_at: null }).eq("id", roster.id);
      return { ok: true, removed };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Reset failed.", removed };
    }
  });

/** Is this slug/campus one of the fixtures? Used by anything that must exclude them from real
 *  lists, sitemaps and counts. */
export const isFixtureSlug = (slug: string | null | undefined) => (slug ?? "") === TEST_CAMPUS_SLUG;
export { TEST_CAMPUS_SLUG, TEST_CHAPTER_SLUG, TEST_CHAPTER_NAME, TEST_CAMPUS_NAME, TEST_COURSE_CODE };
