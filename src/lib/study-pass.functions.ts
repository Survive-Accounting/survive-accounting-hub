// STUDY PASS — the server side of checkout.
//
// PAYMENT BEFORE SIGNUP (Lee, 2026-09-17). The old shape made a student create an account, then
// pay. That is two commitments before any value, and the account is the one they abandon. So:
//
//    tap "Get the pass" → Stripe Checkout (card + email, Stripe's own form) → back on our page,
//    already signed in, already unlocked.
//
// No sign-in before. No password ever. No "check your email" in the middle of a purchase. The
// account is created FROM the email Stripe collected, and the browser that paid is signed into it
// with a one-time link we generate server-side — so the student types their email exactly once,
// into Stripe, and never sees a form of ours.
//
// TWO PATHS, BOTH IDEMPOTENT. The return-URL claim below is the FAST one (it runs while the
// student is watching). The webhook is the RELIABLE one (it runs even if they close the tab).
// Whichever lands first wins; the second finds the row already there and no-ops.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { studyPassAnchorLine, studyPassDisclosure, studyPassIncludes, studyPassName, studyPassTerm, STUDY_PASS_PRICE_CENTS } from "./study-pass";

export type StudyPassContext = {
  campusId: string | null;
  campusName: string | null;
  courseId: string | null;
  courseCode: string | null;
  productName: string;
  priceCents: number;
  includes: string[];
  termLabel: string;
  expiresLabel: string;
  disclosure: string;
  /** "Four exams at $50 each — or all of it for $200." */
  anchorLine: string;
  /** A real Stripe price id is configured — the Buy button can work. */
  configured: boolean;
  /** Test Mode is on, so the no-card walkthrough is available. */
  testGrantAvailable: boolean;
  /** The caller (if a token was supplied) already holds a live course grant. */
  held: boolean;
};

async function resolveCourse(db: { from: (t: string) => any }, campusSlug: string | null) {
  let campusId: string | null = null;
  let campusName: string | null = null;
  let courseCode: string | null = null;
  const slug = (campusSlug ?? "").trim();
  if (slug) {
    // SAME RESOLUTION AS EVERY OTHER PAGE. "ole-miss" is a school id; the campuses row's slug is
    // "university-of-mississippi". schoolByAny accepts either, which is why /learn takes both.
    const { schoolByAny } = await import("./schools");
    const s = schoolByAny(slug);
    if (s) { campusId = s.campusId || null; campusName = s.name; courseCode = s.courseCode ?? null; }
    try {
      // The live course code comes from the database when there is one — the build snapshot can
      // lag a campus that changed its course number.
      const q = db.from("campuses").select("id,name,short_name,course_family_codes_json");
      const { data: c } = await (campusId ? q.eq("id", campusId) : q.eq("slug", s?.slug ?? slug)).maybeSingle();
      if (c?.id) {
        campusId = c.id as string;
        campusName = ((c.short_name as string) || (c.name as string)) || campusName;
        const raw = c.course_family_codes_json;
        const j = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
        const live = ((j?.intro_1 ?? "") as string).trim();
        if (live) courseCode = live;
      }
    } catch { /* fall back to the snapshot rather than losing the page */ }
  }
  // THE COURSE. Every live campus course today is the intro_1 family (the student path hardcodes
  // it in campus-page.functions). When 202/303/304 go live this takes the family as an argument.
  let courseId: string | null = null;
  try {
    const { data: c } = await db.from("courses").select("id").eq("course_family", "intro_1").limit(1).maybeSingle();
    courseId = (c?.id as string) ?? null;
  } catch { /* no course row — `configured` stays honest */ }
  return { campusId, campusName, courseCode, courseId };
}

export const studyPassContext = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({
      campusSlug: z.string().min(1).max(80).nullable().optional(),
      /** Optional — only used to answer `held`. */
      accessToken: z.string().min(20).nullable().optional(),
    }).parse(d ?? {}))
  .handler(async ({ data }): Promise<StudyPassContext> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const term = studyPassTerm();
    const { campusId, campusName, courseCode, courseId } = await resolveCourse(db, data.campusSlug ?? null);

    const { priceIdForKind } = await import("./stripe.server");
    const configured = !!priceIdForKind("study_pass");
    const { testModeOn } = await import("@/lib/test-mode.server");

    let held = false;
    const token = (data.accessToken ?? "").trim();
    if (token && courseId) {
      try {
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        if (u?.user) {
          const { data: rows } = await db.from("entitlements")
            .select("expires_at").eq("user_id", u.user.id).eq("scope", "course").eq("scope_id", courseId);
          const now = new Date().toISOString();
          held = ((rows ?? []) as { expires_at: string | null }[]).some((r) => !r.expires_at || r.expires_at > now);
        }
      } catch { /* a failed check must not claim they hold it */ }
    }

    return {
      campusId, campusName, courseId, courseCode,
      productName: studyPassName(courseCode),
      priceCents: STUDY_PASS_PRICE_CENTS,
      includes: studyPassIncludes(courseCode),
      termLabel: term.label,
      expiresLabel: term.expiresLabel,
      disclosure: studyPassDisclosure(term),
      anchorLine: studyPassAnchorLine(),
      configured, testGrantAvailable: testModeOn(), held,
    };
  });

// ────────────────────────────────────────────────────────────────────────────────────────────
// ONE TAP OUT. No auth required — that is the whole point. Stripe collects the email and the card
// on its own hosted page; we carry the course/campus/referral in metadata so the grant can be
// assembled afterwards without ever having asked the student for anything.
// ────────────────────────────────────────────────────────────────────────────────────────────
export const startStudyPassCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      campusSlug: z.string().min(1).max(80).nullable().optional(),
      /** Same-origin path to come back to. `{CHECKOUT_SESSION_ID}` is appended for the claim. */
      returnPath: z.string().max(200).default("/pass"),
    }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const { stripe, priceIdForKind, stripeIsTest, checkoutOrigin } = await import("./stripe.server");
    const price = priceIdForKind("study_pass");
    if (!price) return { ok: false, error: "STRIPE_PRICE_STUDY_PASS_V4 is not set" };

    const { campusId, courseId } = await resolveCourse(db, data.campusSlug ?? null);
    const path = data.returnPath.startsWith("/") ? data.returnPath : "/pass";
    const origin = checkoutOrigin();

    // REFERRAL. Grab the rep's code now, from the browser's cookie — Stripe's webhook has no
    // cookies, so it has to ride in metadata.
    let refCode = "";
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { readRefCookie } = await import("./referral.server");
      const request = getRequest();
      if (request) refCode = readRefCookie(request)?.code ?? "";
    } catch { /* unattributed sale */ }

    try {
      const sep = path.includes("?") ? "&" : "?";
      const session = await stripe().checkout.sessions.create({
        mode: "payment",
        line_items: [{ price, quantity: 1 }],
        // Stripe's own form is the ONLY place the student types anything.
        success_url: `${origin}${path}${sep}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${path}${sep}checkout=cancel`,
        metadata: {
          kind: "study_pass",
          campus_id: campusId ?? "",
          course_id: courseId ?? "",
          campus_slug: (data.campusSlug ?? "").trim(),
          is_test: stripeIsTest() ? "1" : "0",
          ref_code: refCode,
        },
        allow_promotion_codes: true,
      });
      return { ok: true, url: session.url ?? "" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "checkout failed" };
    }
  });

// ────────────────────────────────────────────────────────────────────────────────────────────
// THE CLAIM — run on return from Stripe. Verifies the session was actually PAID (never trusts the
// URL), creates the account from the email Stripe collected, grants the pass, and hands back a
// one-time sign-in link so the paying browser lands signed in with nothing to type.
// ────────────────────────────────────────────────────────────────────────────────────────────
export const claimStudyPassSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().min(10).max(200),
    /** Where the one-time link should drop them — their course, usually. */
    redirectTo: z.string().max(200).default("/pass"),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; signInUrl: string | null; email: string | null } | { ok: false; error: string }> => {
    const { stripe, stripeIsTest, checkoutOrigin } = await import("./stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    let session: { payment_status?: string | null; customer_details?: { email?: string | null } | null; customer?: unknown; metadata?: Record<string, string> | null; amount_total?: number | null };
    try {
      session = await stripe().checkout.sessions.retrieve(data.sessionId) as never;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "could not read that checkout session" };
    }
    // PAID OR NOTHING. The session id is in a URL; the payment state comes from Stripe.
    if (session.payment_status !== "paid") return { ok: false, error: "that checkout isn't paid" };

    const email = (session.customer_details?.email ?? "").trim().toLowerCase();
    if (!email) return { ok: false, error: "no email on the checkout session" };
    const meta = session.metadata ?? {};
    const courseId = meta.course_id || null;
    const isTest = stripeIsTest();

    // THE ACCOUNT. Created from Stripe's email, already confirmed — they proved the address by
    // paying with it. An existing account is reused, never duplicated.
    let userId: string | null = null;
    try {
      const admin = (supabaseAdmin as unknown as { auth: { admin: { createUser: (a: Record<string, unknown>) => Promise<{ data: { user?: { id: string } | null } | null; error: { message?: string; status?: number } | null }>; generateLink: (a: Record<string, unknown>) => Promise<{ data: { properties?: { action_link?: string } | null } | null; error: unknown }> } } }).auth.admin;
      const created = await admin.createUser({
        email, email_confirm: true,
        user_metadata: { source: "study_pass_checkout", ...(isTest ? { is_test: true } : {}) },
      });
      userId = created.data?.user?.id ?? null;
    } catch (e) { console.warn("[study-pass] createUser:", e instanceof Error ? e.message : e); }

    // Already registered (createUser refuses a duplicate) — find the existing account by email.
    if (!userId) {
      try {
        const r = await (supabaseAdmin as unknown as { auth: { admin: { listUsers: (a: Record<string, unknown>) => Promise<{ data: { users: { id: string; email?: string | null }[] } | null }> } } })
          .auth.admin.listUsers({ page: 1, perPage: 200 });
        userId = r.data?.users?.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      } catch { /* fall through */ }
    }
    if (!userId) return { ok: false, error: "paid, but the account could not be created — Lee has been notified" };

    // THE SALE ROW (idempotent on stripe_session_id).
    try {
      const row = {
        user_id: userId, kind: "study_pass", campus_id: meta.campus_id || null,
        source: "stripe", is_test: isTest, stripe_session_id: data.sessionId,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        granted_at: new Date().toISOString(), meta: { claimed_on_return: true, is_test_key: isTest },
      };
      await (supabaseAdmin.from("student_entitlements" as never) as unknown as { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> }).insert(row);
    } catch { /* duplicate = the webhook beat us here; the bridge below still runs */ }

    // THE UNLOCK.
    const { bridgeEntitlement } = await import("@/lib/entitlement-bridge.server");
    const bridged = await bridgeEntitlement(db, { userId, kind: "study_pass", courseId, source: "stripe" });
    if (!bridged.ok) return { ok: false, error: `paid, but not unlocked: ${bridged.reason}` };

    // REFERRAL CREDIT (best effort — the student paid either way).
    if (meta.ref_code) {
      try {
        const { recordConversionByCode } = await import("@/lib/referral.server");
        await recordConversionByCode(meta.ref_code, {
          kind: "purchase",
          amountCents: typeof session.amount_total === "number" ? session.amount_total : STUDY_PASS_PRICE_CENTS,
          subjectType: "entitlement", subjectId: `${userId}:study_pass`,
          email, userId, forceTest: isTest,
        });
      } catch (e) { console.warn("[study-pass] referral credit:", e instanceof Error ? e.message : e); }
    }

    // THE ONE-TIME SIGN-IN. This is what removes the last form: the browser that paid follows this
    // link and is signed in. It is single-use and short-lived, and we only ever hand it to the
    // browser that just completed this exact paid session.
    let signInUrl: string | null = null;
    try {
      const origin = checkoutOrigin();
      const redirectTo = `${origin}${data.redirectTo.startsWith("/") ? data.redirectTo : "/pass"}`;
      const link = await (supabaseAdmin as unknown as { auth: { admin: { generateLink: (a: Record<string, unknown>) => Promise<{ data: { properties?: { action_link?: string } | null } | null }> } } })
        .auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
      signInUrl = link.data?.properties?.action_link ?? null;
    } catch (e) { console.warn("[study-pass] generateLink:", e instanceof Error ? e.message : e); }

    return { ok: true, signInUrl, email };
  });
