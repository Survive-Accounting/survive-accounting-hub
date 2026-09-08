// REP AUTH — application, phone verification and the rep session. The V1 lifecycle the build
// brief fixes: APPLICANT → APPROVED (admin) → PHONE VERIFIED → ACTIVE.
//
// WHY A SESSION COOKIE AND NOT THE ?k= TOKEN. The original portal put a WRITE-capable bearer token
// in the URL — fine for a test loop, not for real reps (tokens leak through screenshots, chat
// pastes and browser history). The session is now an HttpOnly cookie the page can't read, set only
// after a successful phone OTP. The dashboard_token still exists as the underlying credential the
// cookie carries, which keeps admin "rotate = revoke everywhere" a one-column update.
//
// PHONE OTP = LOGIN. One mechanism does both jobs: the first successful check stamps
// phone_verified_at and activates the rep; every later login is the same OTP against the same
// number. Twilio Verify owns the code lifecycle (twilio-verify.server.ts); when it isn't
// configured, ONLY test reps in Test Mode can pass, using the fixed test code.
//
// BUILD-SAFETY: everything that touches @tanstack/react-start/server lives in rep-auth.server.ts
// and is imported ONLY inside .handler() bodies (which the client bundle strips). A plain export
// here must stay browser-buildable — that rule is what broke the first cut of this file.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { schoolBySlug } from "@/lib/schools";
import { normalizeVenmo } from "@/lib/rep-portal";
import type { RepStatus } from "@/lib/rep-shared";
import type { RepRow } from "@/lib/rep-auth.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention shared with the referral modules
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

async function testEnabled(): Promise<boolean> {
  try { const { testModeOn } = await import("@/lib/test-mode.server"); return testModeOn(); } catch { return false; }
}

/** +1 555-0xxx and friends: the North American range reserved for fiction, which is where the
 *  tester phones are minted (test-mode.ts testerRepPhone). No SMS provider can deliver to one. */
export function isFictionalUsNumber(e164: string): boolean {
  const m = /^\+1(\d{10})$/.exec(e164.trim());
  return !!m && m[1].slice(3, 6) === "555";
}

function newToken(): string {
  const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(28);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (n) => A[n % A.length]).join("");
}

// ── SIGN UP (SELF-VERIFY — no admin approval gate) ───────────────────────────────────────────
// Form → Twilio phone verify → dashboard. Signing up creates the rep as `approved` ("cleared to
// verify") with the ENGINE paused; the successful OTP check is the activation gate. Duplicates
// never stack: an existing verified+active rep is told to sign in, an unverified one resumes
// verification on the same row, and a paused/deactivated rep stays behind the admin brake.
export const applyAsRep = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(7).max(40),
    campusSlug: z.string().trim().min(1).max(120),
    venmo: z.string().trim().max(120).optional().nullable(),   // legacy input — no longer collected at signup
    isTest: z.boolean().optional(),
    // THE APPLICATION (spec §2, 2026-09-06). Optional so the old two-field caller still parses;
    // the new apply page always sends them.
    studentStatus: z.enum(["student", "alumni"]).optional(),
    major: z.string().trim().max(120).optional(),
    tookCourse: z.enum(["taken", "taking_now", "not_yet"]).optional(),
    greekChapterId: z.string().uuid().optional().nullable(),
    greek: z.string().trim().max(200).optional(),
    // Retired from the form 2026-09-08 but still accepted: an in-flight tab on the old page
    // must not 400 mid-application.
    why: z.string().trim().max(2000).optional(),
    /** Its replacement — the one-tap involvement answer (rep-pre-onboarding.ts). */
    involvement: z.enum(["campus_only", "expansion"]).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; state?: "verify" | "existing_active" | "campus_closed"; isTest?: boolean; error?: string }> => {
    const db = await admin();
    const isTest = !!data.isTest && (await testEnabled());
    // THE ASK AND THE ANSWER MUST MATCH (2026-09-08). A browser in Test Mode whose server has
    // TEST_MODE_ENABLED unset used to create a REAL rep from a 555 number and then hand that
    // number to Twilio, which is where the flow died with "couldn't send the code". Refusing
    // here, by name, beats creating a row nobody wanted: the tester sees the cause, and a
    // fictional number never reaches the SMS provider.
    if (data.isTest && !isTest) {
      return { ok: false, error: "Test Mode is off on this server (TEST_MODE_ENABLED). Nothing was created — a test application can't fall through to a real one." };
    }

    // The application answers: the columns V2 already has, plus rep_profile for the rest.
    // Written on a fresh signup AND on a resume (same person finishing later).
    const answers = {
      ...(data.tookCourse ? { course_status: data.tookCourse } : {}),
      ...(data.greekChapterId !== undefined ? { own_chapter_id: data.greekChapterId } : {}),
      ...(data.why ? { pitch: data.why } : {}),
      rep_profile: {
        ...(data.studentStatus ? { studentStatus: data.studentStatus } : {}),
        ...(data.major ? { major: data.major } : {}),
        ...(data.tookCourse ? { tookCourse: data.tookCourse } : {}),
        ...(data.greek ? { greek: data.greek } : {}),
        ...(data.greekChapterId ? { greekChapterId: data.greekChapterId } : {}),
        ...(data.why ? { why: data.why } : {}),
        ...(data.involvement ? { involvement: data.involvement } : {}),
        applyCampusSlug: data.campusSlug,
      },
    };
    const gate = async (err: { message: string } | null): Promise<string | null> => {
      if (!err) return null;
      const { isMissingRepColumns, MISSING_MIGRATION_ERROR, reportMissingRepMigration } = await import("@/lib/rep-review.server");
      if (isMissingRepColumns(err)) { reportMissingRepMigration(); return MISSING_MIGRATION_ERROR; }
      return err.message;
    };

    const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");
    const phone = normalizePhoneE164(data.phone);
    if (!phone) return { ok: false, error: "That phone number doesn't look right — use a US number." };

    let campusId: string | null = null;
    if (schoolBySlug(data.campusSlug)) {
      const { data: c } = await db.from("campuses").select("id").eq("slug", data.campusSlug).maybeSingle();
      campusId = (c?.id as string) ?? null;
    }
    if (!campusId) return { ok: false, error: "Pick your school from the list." };

    // Phone is the identity; email is the tie-breaker for "same person, new number" typos.
    const { signupResolution } = await import("@/lib/rep-shared");
    let { data: existing } = await db.from("referral_partners").select("id,rep_status,phone_verified_at")
      .eq("type", "campus_rep").eq("phone", phone).maybeSingle();
    if (!existing?.id) {
      const { data: byEmail } = await db.from("referral_partners").select("id,rep_status,phone_verified_at")
        .eq("type", "campus_rep").eq("email", data.email.toLowerCase()).maybeSingle();
      existing = byEmail ?? null;
    }
    const res = signupResolution(existing?.id ? { repStatus: (existing.rep_status ?? null) as never, phoneVerifiedAt: existing.phone_verified_at ?? null } : null);

    if (res === "blocked") return { ok: false, error: "This rep account is paused. Text Lee if that's a surprise." };
    if (res === "existing_active") return { ok: true, state: "existing_active", isTest };

    if (res === "resume") {
      // Same person finishing signup: refresh their details on the SAME row, then verify.
      const { error: rErr } = await db.from("referral_partners").update({
        name: data.name, email: data.email.toLowerCase(), phone, campus_id: campusId,
        rep_status: "approved", ...answers,
      }).eq("id", existing!.id);
      const g = await gate(rErr);
      if (g) return { ok: false, error: g };
      return { ok: true, state: "verify", isTest };
    }

    // CAMPUS CAPACITY (V2): one rep by default, two max split by council. Counting only
    // APPROVED reps of the same test-ness — a test rep never closes a real campus. Resumes and
    // existing accounts bypass this; only brand-new signups hit the gate, and Lee can always
    // approve past it by hand.
    {
      const { campusCapacity } = await import("@/lib/rep-shared");
      const { data: approvedRows } = await db.from("referral_partners").select("rep_coverage")
        .eq("type", "campus_rep").eq("campus_id", campusId)
        .eq("application_status", "approved").eq("is_test", isTest).limit(10);
      const cap = campusCapacity(((approvedRows ?? []) as Array<{ rep_coverage: string | null }>).map((r) => r.rep_coverage as never));
      if (!cap.open) return { ok: true, state: "campus_closed", isTest };
    }

    // Fresh signup. ENGINE STATUS 'paused' UNTIL VERIFIED: no link may attribute before the
    // phone check flips the rep active.
    const { error } = await db.from("referral_partners").insert({
      name: data.name, type: "campus_rep", email: data.email.toLowerCase(), phone,
      status: "paused", rep_status: "approved",
      default_commission_type: "percent", default_commission_rate: 10,
      campus_id: campusId, venmo: data.venmo ? normalizeVenmo(data.venmo) : null,
      dashboard_token: newToken(), is_test: isTest,
      notes: `applied${isTest ? " · TEST" : ""}`,
      ...answers,
    });
    const g = await gate(error);
    if (g) return { ok: false, error: g };

    // Founder heads-up (informational — nothing waits on Lee). Best-effort.
    try {
      const { founderAlert } = await import("@/lib/comms/send.server");
      await founderAlert({ ctx: { kind: "rep", name: data.name, school: data.campusSlug, email: data.email, phone }, isTest });
    } catch { /* alert is never load-bearing */ }
    return { ok: true, state: "verify", isTest };
  });

// ── PHONE OTP: start ─────────────────────────────────────────────────────────────────────────
// Also the login entry: we look the rep up by phone. Responses are deliberately uniform — an
// unknown phone gets the same "code sent" shape so this can't be used to probe who is a rep.
export const startRepVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    phone: z.string().trim().min(7).max(40),
    /** The caller's Test Mode state, honoured only when the server's flag is on (2026-09-08). */
    isTest: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; testHint?: boolean; error?: string }> => {
    const db = await admin();
    const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");
    const phone = normalizePhoneE164(data.phone);
    if (!phone) return { ok: false, error: "That phone number doesn't look right." };

    const { data: rep } = await db.from("referral_partners").select("id,is_test,rep_status")
      .eq("type", "campus_rep").eq("phone", phone).maybeSingle();

    // Test reps in Test Mode skip Twilio entirely — the fixed code passes checkRepVerification.
    // The caller's own flag counts too, behind the same server lock: this used to depend solely
    // on the row's is_test, so a row written a moment earlier by a server that disagreed about
    // Test Mode sent the tester down the real-SMS path with a fictional number.
    const testMode = await testEnabled();
    if (testMode && (rep?.is_test || data.isTest)) return { ok: true, testHint: true };

    // A RESERVED FICTIONAL NUMBER IS NEVER AN SMS DESTINATION. 555-01xx is reserved for fiction
    // (and the tester phones are minted in that range), so reaching Twilio with one can only
    // fail — loudly here, naming the cause, instead of "couldn't send the code, try again".
    if (isFictionalUsNumber(phone)) {
      return { ok: false, error: "That's a reserved 555 test number. Turn Test Mode on (TEST_MODE_ENABLED) or use a real phone." };
    }

    const { startVerification, verifyConfigured } = await import("@/lib/twilio-verify.server");
    if (!verifyConfigured()) return { ok: false, error: "Phone verification isn't configured yet — try again soon." };
    // Send the OTP even for unknown phones (uniform response; Twilio rate-limits abuse).
    const r = await startVerification(phone);
    return r.ok ? { ok: true } : { ok: false, error: "Couldn't send the code — try again in a minute." };
  });

// ── PHONE OTP: check → activate + session ────────────────────────────────────────────────────
export const checkRepVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    phone: z.string().trim().min(7).max(40),
    code: z.string().trim().min(4).max(10),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; state?: "active"; error?: string }> => {
    const db = await admin();
    const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");
    const phone = normalizePhoneE164(data.phone);
    if (!phone) return { ok: false, error: "That phone number doesn't look right." };

    const { REP_COLS, setRepCookie } = await import("@/lib/rep-auth.server");
    const { data: repRow } = await db.from("referral_partners").select(REP_COLS)
      .eq("type", "campus_rep").eq("phone", phone).maybeSingle();
    const rep = repRow as RepRow | null;
    if (!rep?.id) return { ok: false, error: "No rep account for that number yet. Sign up first — it takes 30 seconds." };

    const rs = (rep.rep_status ?? "active") as RepStatus;
    if (rs === "paused" || rs === "deactivated") return { ok: false, error: "Your rep account is paused. Reach out to Lee if that's a surprise." };

    // Verify the code: Twilio when configured; the fixed test code only for a test rep in Test Mode.
    const tv = await import("@/lib/twilio-verify.server");
    let passed = false;
    if (rep.is_test && (await testEnabled()) && data.code === tv.TEST_OTP_CODE) passed = true;
    else {
      const r = await tv.checkVerification(phone, data.code);
      passed = r.ok;
    }
    if (!passed) return { ok: false, error: "That code didn't match — check it and try again." };

    // SELF-VERIFY: a passed OTP IS the activation gate. First verify (approved, or a legacy
    // 'applied' row) activates + mints the main link; every later login just refreshes the session.
    const firstVerify = rs === "approved" || rs === "applied";
    const updates: Record<string, unknown> = { phone_verified_at: rep.phone_verified_at ?? new Date().toISOString() };
    if (firstVerify) { updates.rep_status = "active"; updates.status = "active"; }
    let token = rep.dashboard_token;
    if (!token) { token = newToken(); updates.dashboard_token = token; }
    await db.from("referral_partners").update(updates).eq("id", rep.id);

    if (firstVerify) {
      try {
        const { ensureMainCampusLink } = await import("@/lib/rep-workspace.functions");
        await ensureMainCampusLink(db, rep);
      } catch (e) { console.warn("main link create deferred:", (e as Error).message); }
    }

    await setRepCookie(token!);
    try {
      await db.from("rep_activity").insert({ partner_id: rep.id, kind: "rep_login", is_test: rep.is_test, meta: { firstActivation: firstVerify } });
    } catch { /* ledger is best-effort */ }
    return { ok: true, state: "active" };
  });

// ── LOGOUT ───────────────────────────────────────────────────────────────────────────────────
export const repLogout = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean }> => {
    try {
      const db = await admin();
      const { repFromSession, clearRepCookie } = await import("@/lib/rep-auth.server");
      const s = await repFromSession(db, { requireActive: false });
      if ("rep" in s) {
        await db.from("rep_activity").insert({ partner_id: s.rep.id, kind: "rep_logout", is_test: s.rep.is_test }).then(() => undefined, () => undefined);
      }
      await clearRepCookie();
    } catch { /* nothing to clear */ }
    return { ok: true };
  });
