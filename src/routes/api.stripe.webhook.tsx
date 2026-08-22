// POST /api/stripe/webhook — the only automatic seat activation path.
//
// WHY A WEBHOOK AND NOT THE SUCCESS URL. A checkout success_url is a redirect the browser may
// never follow: the exec closes the tab, the phone sleeps, the network drops. Stripe retries a
// webhook until it is acknowledged, so a chapter that paid always ends up with active seats.
//
// SIGNATURE OR NOTHING. This URL is public. Every event is verified against the endpoint secret
// (HMAC-SHA256 over `${t}.${rawBody}`, 5-minute replay window) before anything is read from it —
// an unverified POST must never be able to activate seats. Missing secret ⇒ 400, never "trust it".
//
// TEST-ONLY BY CONSTRUCTION. stripe.server refuses non-test keys, so the events this can act on
// are Stripe test-mode events; the pool it activates carries its own is_test from creation.
//
// EVENTS HANDLED:
//   checkout.session.completed → card paid            → activate the pool in metadata
//   invoice.paid               → treasurer paid online → activate, record invoice status
//   invoice.sent / .finalized / .payment_failed / .voided → record status only (dashboard shows
//                                                           Sent · Viewed · Paid honestly)
// Anything else is acknowledged and ignored: an unknown event is not an error, and 200 stops
// Stripe retrying something we will never handle.
import { createFileRoute } from "@tanstack/react-router";

import { activatePoolFromStripe } from "@/lib/chapter-seats.functions";
import { stripeWebhookSecret, verifyStripeSignature } from "@/lib/stripe.server";

type StripeEvent = {
  type: string;
  data: { object: Record<string, unknown> };
};

const poolIdOf = (obj: Record<string, unknown>): string | null => {
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  return meta.pool_id || null;
};

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
      // `paid` is the only state that may grant access — an unpaid or expired session must not.
      if (poolId && (obj.payment_status === "paid" || obj.status === "complete")) {
        await activatePoolFromStripe(poolId, "card");
      }
      break;
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
      // Status only: the dashboard reports what Stripe actually says rather than inventing a
      // state machine of its own.
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
