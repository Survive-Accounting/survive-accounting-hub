// GREEK CLAIMS (server) — Phase 2a. An exec claims their chapter; Lee gets a text; Lee approves or
// rejects from an authed route. Tables: greek_chapter_claims (0115).
//
// AUTH — READ THIS BEFORE CHANGING THE APPROVAL PATH.
//
// `AdminGate` is a localStorage flag guarding a passcode that is compiled into the public client
// bundle; its own source calls it "a deterrent, not real security". Approving a claim hands a
// stranger a chapter dashboard, a member roster with names and phone numbers, and (in 2b) seat
// entitlements. That is a real privilege grant, so it cannot be gated by a string anyone can read
// out of the JS.
//
// Every function here that reads or decides a claim verifies the caller's Supabase JWT server-side
// and matches the resulting email against ADMIN_EMAILS. AdminGate still wraps the PAGE, because it
// keeps the route out of the way day to day — but it is decoration. The server never trusts it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getGoChapter, goPath } from "@/lib/greek-go.functions";
import { normalizePhoneE164, sendSms } from "@/lib/greek-chapters.functions";

type DB = {
  from: (t: string) => any;
  auth: { getUser: (jwt: string) => Promise<{ data: { user: { email?: string | null } | null }; error: unknown }> };
};
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** Who may decide a claim. Server-side only — this list never reaches the browser. */
const ADMIN_EMAILS = ["lee@surviveaccounting.com", "king@surviveaccounting.com"];

/** Verify a Supabase JWT and confirm it belongs to an admin. Returns the email or null.
 *  Null is always treated as "no", never as "probably fine". */
async function adminEmailFromToken(db: DB, accessToken: string): Promise<string | null> {
  const { data, error } = await db.auth.getUser(accessToken);
  if (error) return null;
  const email = (data.user?.email ?? "").trim().toLowerCase();
  return email && ADMIN_EMAILS.includes(email) ? email : null;
}

// Greek-specific roles, in the order a house's exec board is usually listed. Stored as a plain
// string in greek_chapter_claims.position (≤60 chars), so extending this list never needs SQL —
// old rows keep whatever label they were submitted under.
const POSITIONS = [
  "President",
  "Vice President",
  "Treasurer",
  "Academic / Scholarship Chair",
  "Secretary",
  "Recruitment Chair",
  "New Member Educator",
  "Chapter / House Advisor",
  "Other Exec / Advisor",
] as const;
export const CLAIM_POSITIONS: readonly string[] = POSITIONS;

// ── SUBMIT (public) ───────────────────────────────────────────────────────────────────────────

export const submitChapterClaim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schoolSlug: z.string().trim().min(1).max(80),
    chapterSlug: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2).max(120),
    position: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(7).max(20),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; claimId?: string; notifyPending?: boolean }> => {
    const db = await admin();

    // SMS-TRUTH: a phone Twilio cannot reach fails at the form, not silently later — Lee's alert
    // carries an sms: deep link built from this number, so a bad one makes the alert useless.
    const phone = normalizePhoneE164(data.phone);
    if (!phone) return { ok: false, error: "That phone number doesn't look right — use (XXX) XXX-XXXX." };

    const ch = await getGoChapter({ data: { schoolSlug: data.schoolSlug, chapterSlug: data.chapterSlug } });
    if (!ch) return { ok: false, error: "Couldn't find that chapter — check the link and try again." };
    if (ch.claimStatus === "claimed") return { ok: false, error: "This chapter is already claimed. Text Lee if that's wrong." };

    // An existing pending claim is reported, not duplicated. Two execs claiming the same week is a
    // normal thing to happen, and a second row would just mean Lee gets two texts about one chapter.
    const { data: existing } = await db.from("greek_chapter_claims")
      .select("id").eq("campus_greek_chapter_id", ch.campusGreekChapterId).eq("status", "pending").maybeSingle();
    if (existing?.id) return { ok: false, error: "Someone from your chapter already claimed this — I'm reviewing it now." };

    const { data: inserted, error } = await db.from("greek_chapter_claims").insert({
      campus_greek_chapter_id: ch.campusGreekChapterId,
      name: data.name, position: data.position, email: data.email, phone,
      // Snapshot: how many members this chapter had already banked at the moment of the claim.
      // Recorded now because it is the number that made the claim interesting, and it keeps moving.
      members_at_claim: ch.members,
    }).select("id").single();
    if (error) return { ok: false, error: "Couldn't save that — try again in a moment." };

    await db.from("campus_greek_chapters").update({ claim_status: "pending" }).eq("id", ch.campusGreekChapterId);

    // ── THE CLAIM IS SAVED; THE EXEC IS DONE WAITING ─────────────────────────────────────────
    //
    // This used to `await runIntake(...)` right here, and runIntake is three sequential network
    // calls — insert the lead, send the exec's confirmation through Resend, then the founder
    // alert (another Resend call plus a Twilio one). The exec sat on a spinner for all of it,
    // several seconds, for work whose outcome does not change a single thing they see. Worse, a
    // slow provider looked exactly like a form that had hung.
    //
    // The claim row above is the record of truth — it is the approval queue Lee actually works
    // from — so once it is written there is nothing left to make anyone wait for. The
    // notifications are handed to whatever the runtime gives us for work-after-response, and if
    // the runtime gives us nothing, the CLIENT is told to fire the second call itself. Either
    // way notifyChapterClaim is idempotent, so a retry or a double-fire cannot mail twice.
    const claimId = (inserted?.id as string) ?? null;
    // Resolved HERE, inside the handler, for two reasons. The cookie needs a live request, and
    // work handed to afterResponse may run once the request is gone. And the handler body is what
    // TanStack strips from the client bundle — a dynamic import of a server module from a plain
    // module-level function in this file would survive into the browser graph and fail the build.
    const { isTestRequest } = await import("@/lib/test-mode.functions");
    const isTest = await isTestRequest();
    const scheduled = afterResponse(() => runClaimIntake(claimId, isTest));
    return { ok: true, claimId: claimId ?? undefined, notifyPending: !scheduled };
  });

/** Run the claim's notifications. Extracted so it can be reached from either scheduling path, and
 *  written to be safe to call twice: the intake row it would create is looked for first. */
async function runClaimIntake(claimId: string | null, isTest: boolean): Promise<{ ok: boolean; reason?: string }> {
  if (!claimId) return { ok: false, reason: "no_claim" };
  try {
    const db = await admin();
    const { data: claim } = await db.from("greek_chapter_claims").select("*").eq("id", claimId).maybeSingle();
    if (!claim) return { ok: false, reason: "claim_gone" };

    const { data: roster } = await db.from("campus_greek_chapters")
      .select("id,slug,campus_id").eq("id", claim.campus_greek_chapter_id).maybeSingle();
    if (!roster) return { ok: false, reason: "roster_gone" };
    const { data: campus } = await db.from("campuses").select("slug").eq("id", roster.campus_id).maybeSingle();
    const schoolSlug = (campus?.slug as string) ?? "";
    const ch = schoolSlug ? await getGoChapter({ data: { schoolSlug, chapterSlug: roster.slug as string } }) : null;
    if (!ch) return { ok: false, reason: "chapter_gone" };

    // IDEMPOTENCE. A lead already banked for this claimant on this chapter means the work is
    // done — a second pass would mean a second "Got your claim" in the exec's inbox.
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { data: prior } = await db.from("campus_waitlist")
      .select("id").eq("source", "intake:greek_claim").ilike("email", claim.email as string)
      .eq("chapter", ch.chapterName).gte("created_at", since).limit(1);
    if (prior?.length) return { ok: true, reason: "already_sent" };

    // TEST RUNS ARE MARKED AT THE SOURCE. isTest arrives from the handler, which read it from
    // the server-held tester session — never from anything the client sent. So a test claim cannot
    // land in the real intake table as a real lead, and a real claim cannot be hidden by a flag.

    // UNIFIED INTAKE (greek_claim — a PRIORITY kind): the exec gets "Got your claim for
    // <Chapter>" with the members' link; Lee gets the consolidated priority alert. The mobile
    // field sits beside the SmsConsentNote in ChapterAccessForm, so phone = consent.
    const { runIntake } = await import("@/lib/comms/intake.server");
    await runIntake({
      kind: "greek_claim", name: claim.name as string, email: claim.email as string, phone: claim.phone as string,
      campusName: ch.schoolName, campusSlug: ch.schoolSlug, chapter: ch.chapterName,
      chapterLink: `https://surviveaccounting.com${goPath(ch.schoolSlug, ch.chapterSlug)}`,
      note: `${claim.position} · ${ch.members} member${ch.members === 1 ? "" : "s"} banked`,
      sourcePath: goPath(ch.schoolSlug, ch.chapterSlug), smsConsent: true, isTest,
    });
    return { ok: true };
  } catch (e) {
    console.warn("claim intake failed (claim saved)", e instanceof Error ? e.message : e);
    return { ok: false, reason: "send_failed" };
  }
}

/** Hand work to the platform to finish after the response is flushed. Vercel exposes waitUntil on
 *  a well-known symbol; other runtimes expose nothing, and inventing a floating promise there
 *  would just get the function frozen mid-send. Returns whether anyone took the work — the caller
 *  needs to know, because if nobody did, the client has to ask for it. */
function afterResponse(work: () => Promise<unknown>): boolean {
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      | { get?: () => { waitUntil?: (p: Promise<unknown>) => void } }
      | undefined;
    const waitUntil = ctx?.get?.()?.waitUntil;
    if (typeof waitUntil === "function") { waitUntil(work().catch(() => undefined)); return true; }
  } catch { /* fall through to the client-driven path */ }
  return false;
}

/** The client-driven half of the same work, for runtimes with no waitUntil (local dev, Node
 *  servers). Idempotent — see runClaimIntake — so calling it when the platform already ran the
 *  work is a no-op rather than a duplicate email. */
export const notifyChapterClaim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ claimId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const { isTestRequest } = await import("@/lib/test-mode.functions");
    return runClaimIntake(data.claimId, await isTestRequest());
  });

// ── REVIEW (admin, JWT-verified) ──────────────────────────────────────────────────────────────

export interface ClaimRow {
  id: string;
  chapterName: string;
  schoolName: string;
  goUrl: string | null;
  name: string;
  position: string;
  email: string;
  phone: string;
  status: string;
  membersAtClaim: number;
  membersNow: number;
  createdAt: string;
}

export const listChapterClaims = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
  }).parse(d))
  .handler(async ({ data }): Promise<ClaimRow[] | null> => {
    const db = await admin();
    // null (not []) so the UI can tell "you are not signed in as an admin" apart from "no claims".
    if (!(await adminEmailFromToken(db, data.accessToken))) return null;

    let q = db.from("greek_chapter_claims").select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: claims } = await q;
    const rows = (claims ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) return [];

    const out: ClaimRow[] = [];
    for (const c of rows) {
      const rosterId = c.campus_greek_chapter_id as string;
      const { data: roster } = await db.from("campus_greek_chapters").select("id,campus_id,slug,greek_org_id").eq("id", rosterId).maybeSingle();
      const { data: campus } = roster?.campus_id
        ? await db.from("campuses").select("slug,name,short_name").eq("id", roster.campus_id).maybeSingle()
        : { data: null };
      const { data: org } = roster?.greek_org_id
        ? await db.from("greek_orgs").select("name").eq("id", roster.greek_org_id).maybeSingle()
        : { data: null };

      // membersNow vs membersAtClaim: a chapter that kept growing while the claim sat in the queue
      // is a different proposition from one that stalled, and Lee should see both numbers.
      const { data: shell } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", rosterId).maybeSingle();
      let membersNow = 0;
      if (shell?.id) {
        const { count } = await db.from("greek_chapter_members").select("*", { count: "exact", head: true }).eq("chapter_id", shell.id);
        membersNow = count ?? 0;
      }

      out.push({
        id: c.id as string,
        chapterName: ((org?.name as string) ?? "").trim() || "Chapter",
        schoolName: (campus?.short_name as string) || (campus?.name as string) || "",
        goUrl: campus?.slug && roster?.slug ? goPath(campus.slug as string, roster.slug as string) : null,
        name: c.name as string,
        position: c.position as string,
        email: c.email as string,
        phone: c.phone as string,
        status: c.status as string,
        membersAtClaim: (c.members_at_claim as number) ?? 0,
        membersNow,
        createdAt: c.created_at as string,
      });
    }
    return out;
  });

export const decideChapterClaim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    claimId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    const who = await adminEmailFromToken(db, data.accessToken);
    if (!who) return { ok: false, error: "Not authorised." };

    const { data: claim } = await db.from("greek_chapter_claims").select("*").eq("id", data.claimId).maybeSingle();
    if (!claim) return { ok: false, error: "Claim not found." };
    if (claim.status !== "pending") return { ok: false, error: `Already ${claim.status}.` };

    const rosterId = claim.campus_greek_chapter_id as string;
    const { data: roster } = await db.from("campus_greek_chapters").select("id,campus_id,slug,greek_org_id").eq("id", rosterId).maybeSingle();
    if (!roster) return { ok: false, error: "That chapter no longer exists." };

    if (data.decision === "rejected") {
      await db.from("greek_chapter_claims").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", data.claimId);
      // Back to unclaimed, not left dangling on 'pending' — a rejected claim must not block the
      // next person from claiming the same chapter.
      await db.from("campus_greek_chapters").update({ claim_status: "unclaimed" }).eq("id", rosterId);
      return { ok: true };
    }

    // APPROVE. The chapter record may already exist as an unclaimed shell (created by the first
    // member to join from the /go/ page), so this attaches the admin to whatever is there rather
    // than assuming a fresh insert — inserting blind would either fail on the unique index or
    // orphan every member already banked against the shell.
    const { data: campus } = roster.campus_id
      ? await db.from("campuses").select("slug,name,short_name").eq("id", roster.campus_id).maybeSingle()
      : { data: null };
    const { data: org } = roster.greek_org_id
      ? await db.from("greek_orgs").select("name").eq("id", roster.greek_org_id).maybeSingle()
      : { data: null };
    const chapterName = ((org?.name as string) ?? "").trim() || "Chapter";
    const schoolName = (campus?.short_name as string) || (campus?.name as string) || "";

    const adminFields = {
      admin_name_role: `${claim.name}, ${claim.position}`,
      admin_email: claim.email,
      admin_phone: claim.phone,
      claim_status: "claimed",
      status: "active",
      // Lee approving IS the verification — he answered this person. Leaving phone_verified_at null
      // would lock the new admin out of their own dashboard.
      phone_verified_at: new Date().toISOString(),
    };

    const { data: shell } = await db.from("greek_chapters").select("id").eq("campus_greek_chapter_id", rosterId).maybeSingle();
    if (shell?.id) {
      const { error } = await db.from("greek_chapters").update(adminFields).eq("id", shell.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await db.from("greek_chapters").insert({
        slug: `${campus?.slug ?? "chapter"}-${roster.slug ?? claim.id}`,
        campus_id: roster.campus_id, campus_greek_chapter_id: rosterId,
        school_name: schoolName, chapter_name: chapterName, greek_org_id: roster.greek_org_id,
        ...adminFields,
      });
      if (error) return { ok: false, error: error.message };
    }

    await db.from("greek_chapter_claims").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", data.claimId);
    await db.from("campus_greek_chapters").update({ claim_status: "claimed", claimed_at: new Date().toISOString() }).eq("id", rosterId);

    // Tell the exec, with the link they now own. Non-fatal: the approval already happened, and
    // reporting failure is better than pretending the text went out.
    const url = campus?.slug && roster.slug ? `surviveaccounting.com${goPath(campus.slug as string, roster.slug as string)}` : "surviveaccounting.com";
    const sms = await sendSms(claim.phone as string, `⚡ ${chapterName} is approved — your chapter link is ${url}. Sign in at surviveaccounting.com/chapters/dashboard with ${claim.email}.`);
    if (!sms.ok) console.warn("approval SMS failed:", sms.error);

    return { ok: true };
  });
