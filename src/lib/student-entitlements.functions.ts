// STUDENT ENTITLEMENTS (Phase B, 08-23) — the two client-callable server fns the paid-content
// unlock path needs.
//
//  * createCheckoutSession — for a signed-in student, create a Stripe Checkout Session for the
//    requested kind and return its URL. `metadata.user_id` + `metadata.kind` are what the
//    webhook reads back to insert the entitlement row; `client_reference_id` doubles up.
//
//  * listMyEntitlements — the client-side unlock check. Returns the kinds this signed-in user
//    holds (RLS scopes reads to their own rows). A `pass` grant expands to include exam_2/3/final
//    so unlock checks stay a simple `kinds.includes(kind)`.
//
// A separate `entitlements.functions.ts` already exists for the chapter/order pipeline
// (greek-seats etc). This is the student-Stripe path only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const KIND = z.enum(["exam_2", "exam_3", "final", "pass"]);
export type EntitlementKind = z.infer<typeof KIND>;

// ────────────────────────────────────────────────────────────────────────────────────────────
// CHECKOUT — create a Stripe Checkout Session for one paid-content kind.
// ────────────────────────────────────────────────────────────────────────────────────────────
export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      accessToken: z.string().min(20),
      kind: KIND,
      /** Where to return the student after payment (the campus/exam they came from). Same-origin
       *  path only; nothing external. */
      returnPath: z.string().max(200).default("/"),
      /** Optional campus id — recorded on the entitlement so a paid Exam-2 attached to Alabama
       *  doesn't accidentally unlock at LSU. Null = global (Pass / homepage). */
      campusId: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stripe, priceIdForKind, stripeIsTest } = await import("./stripe.server");
    const { data: u } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (!u?.user) return { ok: false, error: "not signed in" };
    const price = priceIdForKind(data.kind);
    if (!price) return { ok: false, error: `STRIPE_PRICE_${data.kind.toUpperCase()} is not set` };
    const path = data.returnPath.startsWith("/") ? data.returnPath : "/";
    const origin = process.env.SITE_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://surviveaccounting.com");
    try {
      const session = await stripe().checkout.sessions.create({
        mode: "payment",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: u.user.id,
        customer_email: u.user.email ?? undefined,
        success_url: `${origin}${path}?checkout=success&kind=${data.kind}`,
        cancel_url:  `${origin}${path}?checkout=cancel&kind=${data.kind}`,
        metadata: {
          user_id: u.user.id,
          kind: data.kind,
          campus_id: data.campusId ?? "",
          is_test: stripeIsTest() ? "1" : "0",
        },
        allow_promotion_codes: true,
      });
      return { ok: true, url: session.url ?? "", sessionId: session.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "checkout failed" };
    }
  });

// ────────────────────────────────────────────────────────────────────────────────────────────
// TEST GRANT — unlock a paid kind WITHOUT Stripe, for testing the purchase → unlock → rep-credit
// loop while the real Stripe price ids are not set yet. Gated three ways: Test Mode must be enabled
// on the server, the caller must be signed in, and the row is written is_test so it never counts as
// real revenue. It also records a referral PURCHASE conversion from the sa_ref cookie (forced test),
// so a rep whose link the tester followed sees the sale land in their dashboard — the whole point.
// ────────────────────────────────────────────────────────────────────────────────────────────
const KIND_PRICE_CENTS: Record<EntitlementKind, number> = { exam_2: 5000, exam_3: 5000, final: 5000, pass: 12000 };

export const grantTestEntitlement = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(20), kind: KIND, campusId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; credited?: boolean }> => {
    const { testModeOn } = await import("@/lib/test-mode.server");
    if (!testModeOn()) return { ok: false, error: "Test Mode is not enabled." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (!u?.user) return { ok: false, error: "not signed in" };

    const row = {
      user_id: u.user.id, kind: data.kind, campus_id: data.campusId ?? null,
      source: "test", is_test: true,
      stripe_session_id: `test-${data.kind}-${u.user.id}`,   // synthetic → idempotent on the unique index
      granted_at: new Date().toISOString(), meta: { test_grant: true },
    };
    const { error } = await (supabaseAdmin.from("student_entitlements" as never) as unknown as { insert: (r: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> }).insert(row);
    if (error && !/duplicate|conflict|unique/i.test(String(error.message ?? ""))) return { ok: false, error: error.message };

    // Credit the rep whose link brought this student here (if any). Test-forced so it can't pollute
    // real commission totals.
    let credited = false;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { recordConversionForRequest } = await import("@/lib/referral.server");
      const request = getRequest();
      if (request) {
        const r = await recordConversionForRequest(request, {
          kind: "purchase", amountCents: KIND_PRICE_CENTS[data.kind],
          subjectType: "entitlement", subjectId: `${u.user.id}:${data.kind}`,
          email: u.user.email ?? null, forceTest: true,
        });
        credited = r.attributed;
      }
    } catch { /* attribution is best-effort — the unlock still happened */ }

    return { ok: true, credited };
  });

// ────────────────────────────────────────────────────────────────────────────────────────────
// VALIDATE PRICES — answers "are my STRIPE_PRICE_* env vars real price ids?" definitively. For each
// kind it looks up the configured id and RETRIEVES it from Stripe: a valid `price_…` comes back with
// an amount; a product id (`prod_…`) or a wrong id returns Stripe's "No such price" error. Test-Mode
// gated so it is safe to expose. This is the check that settles whether real checkout will work.
// ────────────────────────────────────────────────────────────────────────────────────────────
export const validateStripePrices = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ ready: boolean; rows: Array<{ kind: EntitlementKind; idPrefix: string; ok: boolean; amount?: string; error?: string }> }> => {
    const { testModeOn } = await import("@/lib/test-mode.server");
    if (!testModeOn()) return { ready: false, rows: [] };
    const { stripe, priceIdForKind } = await import("./stripe.server");
    const kinds: EntitlementKind[] = ["exam_2", "exam_3", "final", "pass"];
    const rows: Array<{ kind: EntitlementKind; idPrefix: string; ok: boolean; amount?: string; error?: string }> = [];
    for (const kind of kinds) {
      const id = priceIdForKind(kind) ?? "";
      const idPrefix = id ? id.slice(0, 5) : "(unset)";
      if (!id) { rows.push({ kind, idPrefix, ok: false, error: "env var not set" }); continue; }
      if (!id.startsWith("price_")) { rows.push({ kind, idPrefix, ok: false, error: id.startsWith("prod_") ? "this is a PRODUCT id (prod_), not a PRICE id (price_)" : "not a price_ id" }); continue; }
      try {
        const price = await stripe().prices.retrieve(id);
        rows.push({ kind, idPrefix, ok: true, amount: price.unit_amount != null ? `$${(price.unit_amount / 100).toFixed(2)}` : "—" });
      } catch (e) {
        rows.push({ kind, idPrefix, ok: false, error: e instanceof Error ? e.message : "retrieve failed" });
      }
    }
    return { ready: rows.every((r) => r.ok), rows };
  });

// ────────────────────────────────────────────────────────────────────────────────────────────
// LIST MY ENTITLEMENTS
// ────────────────────────────────────────────────────────────────────────────────────────────
export const listMyEntitlements = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(20) }).parse(d))
  .handler(async ({ data }): Promise<{ kinds: EntitlementKind[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (!u?.user) return { kinds: [] };
    const { data: rows } = await (supabaseAdmin.from("student_entitlements" as never) as unknown as { select: (c: string) => { eq: (k: string, v: string) => { is: (k: string, v: null) => Promise<{ data: Array<{ kind: string }> | null }> } } })
      .select("kind").eq("user_id", u.user.id).is("revoked_at", null);
    const raw = (rows ?? []).map((r) => r.kind).filter((k): k is EntitlementKind => k === "exam_2" || k === "exam_3" || k === "final" || k === "pass");
    const set = new Set<EntitlementKind>(raw);
    if (set.has("pass")) { set.add("exam_2"); set.add("exam_3"); set.add("final"); }
    return { kinds: Array.from(set) };
  });
