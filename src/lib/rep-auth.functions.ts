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

import { canonicalSchoolName, schoolBySlug } from "@/lib/schools";
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
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; state?: "verify" | "existing_active" | "campus_closed"; error?: string }> => {
    const db = await admin();
    const isTest = !!data.isTest && (await testEnabled());

    const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");
    const phone = normalizePhoneE164(data.phone);
    if (!phone) return { ok: false, error: "That phone number doesn't look right — use a US number." };

    let campusId: string | null = null;
    let campusLabel = data.campusSlug;
    if (schoolBySlug(data.campusSlug)) {
      const { data: c } = await db.from("campuses").select("id,name,short_name").eq("slug", data.campusSlug).maybeSingle();
      campusId = (c?.id as string) ?? null;
      campusLabel = canonicalSchoolName(data.campusSlug, (c?.short_name as string) || (c?.name as string) || data.campusSlug);
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
    if (res === "existing_active") return { ok: true, state: "existing_active" };

    if (res === "resume") {
      // Same person finishing signup: refresh their details on the SAME row, then verify.
      await db.from("referral_partners").update({
        name: data.name, email: data.email.toLowerCase(), phone, campus_id: campusId,
        rep_status: "approved",
      }).eq("id", existing!.id);
      return { ok: true, state: "verify" };
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
      if (!cap.open) return { ok: true, state: "campus_closed" };
    }

    // Fresh signup. ENGINE STATUS 'paused' UNTIL VERIFIED: no link may attribute before the
    // phone check flips the rep active.
    const { error } = await db.from("referral_partners").insert({
      name: data.name, type: "campus_rep", email: data.email.toLowerCase(), phone,
      status: "paused", rep_status: "approved",
      default_commission_type: "percent", default_commission_rate: 10,
      campus_id: campusId, venmo: data.venmo ? normalizeVenmo(data.venmo) : null,
      dashboard_token: newToken(), is_test: isTest,
      notes: `self-signup${isTest ? " · TEST" : ""}`,
    });
    if (error) return { ok: false, error: error.message };

    // Founder heads-up (informational — nothing waits on Lee). Best-effort. Carries the school's
    // display name (it used to send the slug) and the rep's #ref, so Lee can text back with
    // "#242 …" and open /x/242. The full application, with details, alerts separately when it
    // is submitted (rep-onboarding.functions.ts).
    try {
      const { ensureConversationRef, actionLink } = await import("@/lib/comms/refs.server");
      const refRow = await ensureConversationRef(db, { phone, campusId, kind: "rep", subject: `${campusLabel} rep signup: ${data.name}`, isTest });
      const { founderAlert } = await import("@/lib/comms/send.server");
      await founderAlert({
        ctx: {
          kind: "rep", name: data.name, school: campusLabel, campusSlug: data.campusSlug, email: data.email, phone,
          ref: refRow?.shortRef ?? null, actionLink: actionLink(refRow?.shortRef), repStage: "signup",
          applicationLink: "https://surviveaccounting.com/admin/reps/roster",
        },
        isTest,
      });
    } catch { /* alert is never load-bearing */ }
    return { ok: true, state: "verify" };
  });

// ── PHONE OTP: start ─────────────────────────────────────────────────────────────────────────
// Also the login entry: we look the rep up by phone. Responses are deliberately uniform — an
// unknown phone gets the same "code sent" shape so this can't be used to probe who is a rep.
export const startRepVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ phone: z.string().trim().min(7).max(40) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; testHint?: boolean; error?: string }> => {
    const db = await admin();
    const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");
    const phone = normalizePhoneE164(data.phone);
    if (!phone) return { ok: false, error: "That phone number doesn't look right." };

    const { data: rep } = await db.from("referral_partners").select("id,is_test,rep_status")
      .eq("type", "campus_rep").eq("phone", phone).maybeSingle();

    // Test reps in Test Mode skip Twilio entirely — the fixed code passes checkRepVerification.
    if (rep?.is_test && (await testEnabled())) return { ok: true, testHint: true };

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
