// POST /api/stripe/webhook — the one endpoint Stripe calls, serving BOTH paid products.
//
// TWO PRODUCTS, ONE ENDPOINT (reconciled 08-23). A Stripe project has a single webhook signing
// secret, so both flows arrive here and are told apart by their metadata:
//   • a session/invoice carrying metadata.pool_id  → CHAPTER SEATS: activate the pool.
//   • a checkout.session.completed without a pool_id → STUDENT ENTITLEMENT: grant the exam/pass.
//
// WHY A WEBHOOK AND NOT THE SUCCESS URL. A success_url is a redirect the browser may never follow
// (tab closed, phone asleep, network dropped). Stripe retries a webhook until it is acknowledged,
// so a payment always ends up applied.
//
// SIGNATURE OR NOTHING. This URL is public. Every event is verified (HMAC-SHA256 over
// `${t}.${rawBody}`, 5-minute replay window) before anything is read from it. Missing secret ⇒
// 400, never "trust it".
//
// TEST-ONLY BY CONSTRUCTION. stripe.server refuses non-test keys; every row it writes carries an
// is_test derived from the KEY, never from client-supplied metadata.
import { createFileRoute } from "@tanstack/react-router";

import { activatePoolFromStripe } from "@/lib/chapter-seats.functions";
import { kindForPriceId, stripe, stripeIsTest, stripeWebhookSecret, verifyStripeSignature } from "@/lib/stripe.server";

type StripeEvent = {
  id?: string;
  type: string;
  data: { object: Record<string, unknown> };
};

const poolIdOf = (obj: Record<string, unknown>): string | null => {
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  return meta.pool_id || null;
};

/** STUDENT ENTITLEMENT — a paid single exam / pass. Ported from Test Mode Phase B. Idempotent on
 *  the stripe_session_id unique index, so a Stripe retry acks rather than double-granting. */
async function grantStudentEntitlement(event: StripeEvent): Promise<Response> {
  const s = event.data.object as {
    id: string; client_reference_id?: string | null; customer?: string | null;
    metadata?: { user_id?: string; kind?: string; campus_id?: string };
  };
  const userId = s.metadata?.user_id || s.client_reference_id || null;
  if (!userId) return new Response("no user_id", { status: 400 });

  let kind = (s.metadata?.kind ?? "") as "exam_2" | "exam_3" | "final" | "pass" | "";
  if (!kind) {
    try {
      const full = await stripe().checkout.sessions.retrieve(s.id, { expand: ["line_items.data.price"] });
      const priceId = full.line_items?.data?.[0]?.price?.id ?? "";
      const m = kindForPriceId(priceId);
      if (m) kind = m;
    } catch { /* fall through */ }
  }
  if (!kind) return new Response("no kind on session", { status: 400 });

  const isTest = stripeIsTest();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row = {
    user_id: userId, kind, campus_id: s.metadata?.campus_id ?? null,
    source: "stripe", is_test: isTest,
    stripe_session_id: s.id, stripe_customer_id: typeof s.customer === "string" ? s.customer : null,
    granted_at: new Date().toISOString(), meta: { event_id: event.id, is_test_key: isTest },
  };
  const { error } = await (supabaseAdmin.from("student_entitlements" as never) as unknown as { insert: (r: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> }).insert(row);
  if (error) {
    if (/duplicate|conflict|unique/i.test(String(error.message ?? ""))) return new Response("ok", { status: 200 });
    console.warn("student_entitlements insert failed:", error.message);
    return new Response(error.message ?? "insert failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}

async function handle(request: Request): Promise<Response> {
  // RAW body — the signature is over the exact bytes Stripe sent, so it must be read as text
  // before any JSON parsing.
  const raw = await request.text();
  const secret = stripeWebhookSecret();
  const ok = await verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret ?? undefined);
  if (!ok) return new Response("bad signature", { status: 400 });

  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; } catch { return new Response("bad payload", { status: 400 }); }

  const obj = event.data?.object ?? {};
  const poolId = poolIdOf(obj);

  switch (event.type) {
    case "checkout.session.completed": {
      if (poolId) {
        // CHAPTER SEATS. `paid`/`complete` is the only state that may grant access.
        if (obj.payment_status === "paid" || obj.status === "complete") await activatePoolFromStripe(poolId, "card");
        break;
      }
      // STUDENT ENTITLEMENT (no pool_id). Returns its own 200/400/500 so Stripe's retry semantics
      // are preserved for a genuine insert failure.
      return grantStudentEntitlement(event);
    }
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      if (poolId) await activatePoolFromStripe(poolId, "invoice", "paid");
      break;
    }
    case "invoice.sent":
    case "invoice.finalized":
    case "invoice.payment_failed":
    case "invoice.voided": {
      if (poolId) {
        const { recordInvoiceStatus } = await import("@/lib/chapter-seats.functions");
        await recordInvoiceStatus(poolId, String(obj.status ?? event.type.replace("invoice.", "")));
      }
      break;
    }
    default:
      break;
  }

  return new Response("ok", { status: 200 });
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      // A GET is how you check the endpoint exists without sending an event.
      GET: () => new Response("stripe webhook", { status: 200 }),
    },
  },
});
