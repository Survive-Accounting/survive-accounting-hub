// STRIPE WEBHOOK — the only path that writes student_entitlements(source='stripe'). Called by
// Stripe (not the browser) on `checkout.session.completed` (and its retries). We verify the
// signature with STRIPE_WEBHOOK_SECRET (or _TEST) — an unverified request is a 400. On a valid
// completed session we upsert the entitlement keyed on session id (idempotent for Stripe
// retries).
//
// SETUP: Stripe Dashboard → Developers → Webhooks → Add endpoint. URL:
//   https://surviveaccounting.com/api/stripe/webhook
// Events: `checkout.session.completed`.
// Copy the signing secret (starts `whsec_`) and add it to Vercel as
// `STRIPE_WEBHOOK_SECRET_TEST` (or `STRIPE_WEBHOOK_SECRET` for live). Then re-deploy.
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function handleWebhook({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const sig = request.headers.get("stripe-signature");
  if (!sig) return json({ error: "missing stripe-signature" }, 400);
  const secret = process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) { console.warn("STRIPE_WEBHOOK_SECRET_TEST is not set"); return json({ error: "webhook secret not configured" }, 503); }

  // We must verify against the RAW body bytes — request.text() gives us that; do NOT parse json first.
  const raw = await request.text();

  const { stripe, kindForPriceId, stripeIsTest } = await import("@/lib/stripe.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, sig, secret);
  } catch (e) {
    return json({ error: "invalid signature", detail: e instanceof Error ? e.message : String(e) }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    // Not fatal — Stripe will retry only for 5xx. Ack so it doesn't.
    return json({ ok: true, ignored: event.type });
  }

  const s = event.data.object as {
    id: string; client_reference_id: string | null; customer: string | null;
    metadata?: { user_id?: string; kind?: string; campus_id?: string; is_test?: string };
    line_items?: unknown;
  };
  const userId = s.metadata?.user_id || s.client_reference_id || null;
  if (!userId) return json({ error: "no user_id" }, 400);

  // Resolve the KIND. Prefer metadata (set by our own checkout fn); fall back to the price on
  // the first line item (covers Payment-Link-style purchases we haven't wired here).
  let kind = (s.metadata?.kind ?? "") as "exam_2" | "exam_3" | "final" | "pass" | "";
  if (!kind) {
    try {
      const full = await stripe().checkout.sessions.retrieve(s.id, { expand: ["line_items.data.price"] });
      const priceId = full.line_items?.data?.[0]?.price?.id ?? "";
      const m = kindForPriceId(priceId);
      if (m) kind = m;
    } catch { /* fall through — logged below */ }
  }
  if (!kind) return json({ error: "no kind on session" }, 400);

  const campusId = s.metadata?.campus_id ? s.metadata.campus_id : null;
  // Trust the server-side flag on the KEY, not the metadata (metadata could be spoofed).
  const isTest = stripeIsTest();

  const row = {
    user_id: userId,
    kind,
    campus_id: campusId,
    source: "stripe",
    is_test: isTest,
    stripe_session_id: s.id,
    stripe_customer_id: typeof s.customer === "string" ? s.customer : null,
    granted_at: new Date().toISOString(),
    meta: { event_id: event.id, is_test_key: isTest },
  };
  const { error } = await (supabaseAdmin.from("student_entitlements" as never) as unknown as { insert: (r: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> })
    .insert(row);
  if (error) {
    // Duplicate unique index → this user already holds this entitlement (Stripe retry). Ack.
    if (/duplicate|conflict|unique/i.test(String(error.message ?? ""))) return json({ ok: true, dedup: true });
    console.warn("student_entitlements insert failed:", error.message);
    return json({ error: error.message }, 500);
  }
  return json({ ok: true, granted: kind, is_test: isTest });
}

export const Route = createFileRoute("/api/stripe/webhook")({
  // See the notes in api.cron.backup.tsx — `server.handlers` is a runtime feature not present
  // in this version's route-option types, so the options object is cast.
  server: { handlers: { POST: handleWebhook } },
} as never);
