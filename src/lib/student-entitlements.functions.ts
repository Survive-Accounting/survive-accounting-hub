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
