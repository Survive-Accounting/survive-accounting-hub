// GREEK SEATS + OWNERSHIP TRANSFER (server) — Phase 2b. Tables: 0116 on top of 0115.
//
// THE CHECKOUT THAT ISN'T. The brief said "seat entitlements wired to checkout". There is no
// checkout in this codebase: Stripe appears exactly once, commented out (config.server.ts), the one
// payment constant STRIPE_TUTORING_PAYMENT_LINK is "" and is read by nothing, and fulfillment is
// claimMyOrders — whose own header says "No Stripe: this stands in for 'on order paid'".
//
// So rather than invent a checkout, this file makes the GRANT PATH real and payment-agnostic:
// `setChapterSeats` records how many seats a chapter has and how it paid, and `assignSeat` turns
// one of those seats into an actual entitlement. Whatever eventually collects the money — a Stripe
// webhook, an invoice marked paid, Lee's own hand — calls setChapterSeats and nothing else changes.
// That is one function away from any payment system, and it does not pretend money moved.
//
// WHY scope 'course': entitlements.functions.ts resolves 'topic' | 'exam_unit' | 'course' and
// expands 'course' to every chapter in it. A seat IS "everything, all semester", so it is a course
// grant — no resolver change, and a seat cannot drift from what an individual purchase unlocks.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sendSms } from "@/lib/greek-chapters.functions";
import { ADMIN_EMAILS } from "@/lib/admin-emails";

type DB = {
  from: (t: string) => any;
  auth: { getUser: (jwt: string) => Promise<{ data: { user: { email?: string | null } | null }; error: unknown }> };
};
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** Server-side only — never reaches the browser. Same list as greek-claims. */

async function emailFromToken(db: DB, accessToken: string): Promise<string | null> {
  const { data, error } = await db.auth.getUser(accessToken);
  if (error) return null;
  const email = (data.user?.email ?? "").trim().toLowerCase();
  return email || null;
}
async function isAdmin(db: DB, accessToken: string): Promise<string | null> {
  const e = await emailFromToken(db, accessToken);
  return e && ADMIN_EMAILS.includes(e) ? e : null;
}
/** The chapter this token may act on: an admin may act on any, an owner only on their own.
 *  Returns the chapter row plus which of the two the caller is. */
async function chapterForActor(db: DB, accessToken: string, chapterId: string) {
  const email = await emailFromToken(db, accessToken);
  if (!email) return null;
  const { data: ch } = await db.from("greek_chapters").select("*").eq("id", chapterId).maybeSingle();
  if (!ch) return null;
  if (ADMIN_EMAILS.includes(email)) return { ch, email, role: "admin" as const };
  if ((ch.admin_email ?? "").trim().toLowerCase() === email) return { ch, email, role: "owner" as const };
  return null;
}

/** The course a seat unlocks — NAMED, not inferred.
 *
 *  The first version of this matched /intro/ against the course list. There are five courses and
 *  TWO of them match: intro-accounting-1 and intro-accounting-2. `.find()` would have returned
 *  whichever came back first and silently granted the wrong semester to a paying chapter, with no
 *  error anywhere. (The `name` column it also tested does not exist; only `slug` does.)
 *
 *  A seat is "the course this chapter's members are taking" — Intro 1, the course the landing page
 *  sells Exams 1/2/3/Final of. When that stops being true, this constant is the one line to change,
 *  and it will be changed deliberately instead of drifting.
 *
 *  Resolved by slug rather than hardcoding the uuid so a re-seeded database does not grant a
 *  dangling id, and returns null — never a fallback — if the slug is missing. A seat that cannot
 *  name its course must fail loudly at the point of sale, not hand out access to something else. */
const SEAT_COURSE_SLUG = "intro-accounting-1";

async function seatCourseId(db: DB): Promise<string | null> {
  const { data } = await db.from("courses").select("id,slug").eq("slug", SEAT_COURSE_SLUG).maybeSingle();
  return (data?.id as string) ?? null;
}

// ── SEATS ─────────────────────────────────────────────────────────────────────────────────────

/** Record how many seats a chapter has bought, and how it paid. ADMIN ONLY — this is the money
 *  step, and until a checkout exists a human is the payment processor. */
export const setChapterSeats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    chapterId: z.string().uuid(),
    seatsTotal: z.number().int().min(0).max(2000),
    note: z.string().trim().max(300).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; assigned?: number }> => {
    const db = await admin();
    const who = await isAdmin(db, data.accessToken);
    if (!who) return { ok: false, error: "Not authorised." };

    // Lowering the total below what is already handed out would leave members holding seats the
    // chapter no longer owns. Report the conflict instead of silently over-committing or silently
    // revoking someone mid-semester.
    const { count: assigned } = await db.from("greek_chapter_members")
      .select("*", { count: "exact", head: true }).eq("chapter_id", data.chapterId).not("seat_assigned_at", "is", null);
    if ((assigned ?? 0) > data.seatsTotal) {
      return { ok: false, error: `${assigned} seats are already assigned — unassign down to ${data.seatsTotal} first.`, assigned: assigned ?? 0 };
    }

    const { error } = await db.from("greek_chapters").update({
      seats_total: data.seatsTotal,
      seats_note: data.note ?? null,
      seats_updated_at: new Date().toISOString(),
    }).eq("id", data.chapterId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, assigned: assigned ?? 0 };
  });

export interface SeatState { seatsTotal: number; assigned: number; remaining: number; note: string | null }

/** Assign one seat to one member. Admin OR the chapter's own owner — handing seats to your own
 *  members is the exec's job, not Lee's. */
export const assignSeat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    chapterId: z.string().uuid(),
    memberId: z.string().uuid(),
    assign: z.boolean(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; seats?: SeatState }> => {
    const db = await admin();
    const actor = await chapterForActor(db, data.accessToken, data.chapterId);
    if (!actor) return { ok: false, error: "Not authorised." };
    const { ch } = actor;

    const { data: member } = await db.from("greek_chapter_members")
      .select("id,user_id,seat_assigned_at,chapter_id").eq("id", data.memberId).maybeSingle();
    if (!member || member.chapter_id !== data.chapterId) return { ok: false, error: "That member isn't in this chapter." };

    const seatState = async (): Promise<SeatState> => {
      const { count } = await db.from("greek_chapter_members")
        .select("*", { count: "exact", head: true }).eq("chapter_id", data.chapterId).not("seat_assigned_at", "is", null);
      const total = (ch.seats_total as number) ?? 0;
      return { seatsTotal: total, assigned: count ?? 0, remaining: Math.max(0, total - (count ?? 0)), note: ch.seats_note ?? null };
    };

    if (data.assign) {
      if (member.seat_assigned_at) return { ok: true, seats: await seatState() };  // already has one
      const s = await seatState();
      if (s.remaining <= 0) return { ok: false, error: `No seats left — ${s.assigned} of ${s.seatsTotal} are assigned.`, seats: s };

      await db.from("greek_chapter_members").update({ seat_assigned_at: new Date().toISOString() }).eq("id", data.memberId);

      // The entitlement only exists once the member has an ACCOUNT. A seat assigned to someone who
      // has not signed in yet is recorded on the member row and converts the moment they do —
      // reconcileSeatGrants below is what closes that gap. Writing an entitlement against a null
      // user_id would be a grant nobody holds.
      if (member.user_id) {
        const courseId = await seatCourseId(db);
        if (!courseId) return { ok: false, error: "Couldn't resolve which course a seat unlocks — tell Lee.", seats: await seatState() };
        const { error } = await db.from("entitlements").upsert({
          user_id: member.user_id, scope: "course", scope_id: courseId,
          source: "greek_seat", greek_chapter_id: data.chapterId,
        }, { onConflict: "user_id,scope,scope_id" });
        if (error) return { ok: false, error: error.message, seats: await seatState() };
      }
      return { ok: true, seats: await seatState() };
    }

    // UNASSIGN. Revoke only grants THIS chapter created: the greek_chapter_id filter is what stops
    // a chapter from deleting a student's own paid entitlement.
    await db.from("greek_chapter_members").update({ seat_assigned_at: null }).eq("id", data.memberId);
    if (member.user_id) {
      await db.from("entitlements").delete()
        .eq("user_id", member.user_id).eq("greek_chapter_id", data.chapterId).eq("source", "greek_seat");
    }
    return { ok: true, seats: await seatState() };
  });

/** Convert seats that were assigned before the member had an account. Called on sign-in and after
 *  any tagging, so a seat handed out in August still lands when the student signs in in September. */
export const reconcileSeatGrants = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ granted: number }> => {
    const db = await admin();
    const { data: seats } = await db.from("greek_chapter_members")
      .select("chapter_id,seat_assigned_at").eq("user_id", data.userId).not("seat_assigned_at", "is", null);
    const rows = (seats ?? []) as Array<{ chapter_id: string }>;
    if (!rows.length) return { granted: 0 };
    const courseId = await seatCourseId(db);
    if (!courseId) return { granted: 0 };
    let granted = 0;
    for (const r of rows) {
      const { error } = await db.from("entitlements").upsert({
        user_id: data.userId, scope: "course", scope_id: courseId,
        source: "greek_seat", greek_chapter_id: r.chapter_id,
      }, { onConflict: "user_id,scope,scope_id" });
      if (!error) granted++;
    }
    return { granted };
  });

// ── OWNERSHIP TRANSFER ────────────────────────────────────────────────────────────────────────

/** Hand a chapter to the next exec. Admin OR the current owner — officers turn over every year and
 *  routing every handoff through Lee would make him the bottleneck on a calendar event he does not
 *  control. Every transfer is recorded; overwriting admin_email in place would erase the answer to
 *  "who gave this to whom", which is exactly the question asked when two people both claim it. */
export const transferChapterOwnership = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    chapterId: z.string().uuid(),
    toEmail: z.string().trim().email().max(200),
    toNameRole: z.string().trim().min(2).max(160),
    toPhone: z.string().trim().max(20).optional(),
    reason: z.string().trim().max(200).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    const actor = await chapterForActor(db, data.accessToken, data.chapterId);
    if (!actor) return { ok: false, error: "Not authorised." };
    const { ch, email: actorEmail } = actor;

    const to = data.toEmail.trim().toLowerCase();
    if ((ch.admin_email ?? "").trim().toLowerCase() === to) return { ok: false, error: "That's already the owner." };

    const { error: tErr } = await db.from("greek_chapter_transfers").insert({
      greek_chapter_id: data.chapterId,
      from_email: ch.admin_email ?? null,
      from_name_role: ch.admin_name_role ?? null,
      to_email: to,
      to_name_role: data.toNameRole,
      to_phone: data.toPhone ?? null,
      decided_by: actorEmail,
      reason: data.reason ?? null,
    });
    if (tErr) return { ok: false, error: tErr.message };

    // The trail is written FIRST. If the update below fails, the record of an attempted handoff
    // survives; if the order were reversed a crash would leave a chapter whose owner changed with
    // nothing saying why.
    const { error } = await db.from("greek_chapters").update({
      admin_email: to,
      admin_name_role: data.toNameRole,
      admin_phone: data.toPhone ?? ch.admin_phone ?? null,
      // The incoming exec must be able to sign in immediately — the outgoing one already vouched.
      phone_verified_at: new Date().toISOString(),
    }).eq("id", data.chapterId);
    if (error) return { ok: false, error: error.message };

    if (data.toPhone) {
      const sms = await sendSms(data.toPhone, `⚡ You now run ${ch.chapter_name} on Survive Accounting. Sign in at surviveaccounting.com/chapters/dashboard with ${to}.`);
      if (!sms.ok) console.warn("transfer SMS failed:", sms.error);
    }
    return { ok: true };
  });

/** The handoff history, newest first. Admin or current owner. */
export const listChapterTransfers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), chapterId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Array<{ toEmail: string; toNameRole: string; fromEmail: string | null; decidedBy: string; createdAt: string }> | null> => {
    const db = await admin();
    const actor = await chapterForActor(db, data.accessToken, data.chapterId);
    if (!actor) return null;
    const { data: rows } = await db.from("greek_chapter_transfers")
      .select("to_email,to_name_role,from_email,decided_by,created_at")
      .eq("greek_chapter_id", data.chapterId).order("created_at", { ascending: false }).limit(50);
    return ((rows ?? []) as Array<Record<string, string | null>>).map((r) => ({
      toEmail: r.to_email as string, toNameRole: r.to_name_role as string,
      fromEmail: r.from_email, decidedBy: r.decided_by as string, createdAt: r.created_at as string,
    }));
  });

/** DOES THE SIGNED-IN VISITOR HOLD A SEAT FROM THIS CHAPTER?
 *
 *  The one thing an exec who spent money gets to see working: their members open the chapter page
 *  and it says the later exams are courtesy of the chapter. So this answers a deliberately narrow
 *  question — not "is this user paid up" but "did THIS chapter pay for THIS user".
 *
 *  That distinction is the whole point. A member who bought the semester themselves must NOT see
 *  "courtesy of Beta Sigma Psi": it would credit the chapter for something the student paid for,
 *  which is the same class of overclaim as the old "Free Exam 1, courtesy of X" line on pages
 *  where Exam 1 was free for everyone. Hence the filter on BOTH greek_chapter_id AND
 *  source = 'greek_seat' — exactly the pair assignSeat writes and unassign deletes.
 *
 *  Returns false for signed-out visitors, unknown chapters and any error: the line is a bonus, and
 *  an outage must never make a page claim something about a chapter. */
export const getChapterSeatStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    schoolSlug: z.string().trim().min(1).max(80),
    chapterSlug: z.string().trim().min(1).max(60),
  }).parse(d))
  .handler(async ({ data }): Promise<{ seated: boolean }> => {
    try {
      const db = await admin();
      const { data: auth } = await db.auth.getUser(data.accessToken);
      const userId = (auth?.user as { id?: string } | null)?.id;
      if (!userId) return { seated: false };

      const { data: campus } = await db.from("campuses").select("id").eq("slug", data.schoolSlug).maybeSingle();
      if (!campus?.id) return { seated: false };
      const { data: ch } = await db.from("campus_greek_chapters")
        .select("id").eq("campus_id", campus.id).eq("slug", data.chapterSlug).maybeSingle();
      if (!ch?.id) return { seated: false };

      const { data: ent } = await db.from("entitlements")
        .select("expires_at")
        .eq("user_id", userId)
        .eq("greek_chapter_id", ch.id)
        .eq("source", "greek_seat")
        .maybeSingle();
      if (!ent) return { seated: false };

      // An expired seat is not a seat. Same rule the entitlement resolver applies.
      if (ent.expires_at && ent.expires_at < new Date().toISOString()) return { seated: false };
      return { seated: true };
    } catch {
      return { seated: false };
    }
  });
