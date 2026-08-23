// STRIPE — server-only. One Stripe client for the whole app, keyed on STRIPE_SECRET_KEY_TEST
// (Phase B is test-mode only for now; the same file will read STRIPE_SECRET_KEY once we're live).
// Also exports the four EXAM/PASS price ids and the entitlement kind map, so the checkout server
// fn and the webhook handler stay in sync about which price maps to which entitlement.
import Stripe from "stripe";

let cached: Stripe | null = null;

/** Lazily instantiate — the constructor throws if the key is missing, and we want that error
 *  to surface at call time (the code base compiles + boots without Stripe keys). */
export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY_TEST is not set");
  cached = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
  return cached;
}

/** True when the running key is a test key. Any is_test flag on a resulting entitlement is
 *  derived from this — never the client-passed testmode flag, which is spoofable. */
export function stripeIsTest(): boolean {
  const k = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || "";
  return k.startsWith("sk_test_");
}

export type EntitlementKind = "exam_2" | "exam_3" | "final" | "pass";

/** Which price id in env maps to which entitlement. The webhook reads the resolved price back
 *  off the Checkout Session and looks up the kind here. If a price shows up we don't recognise
 *  (someone bought via a Payment Link we didn't ship), we still record the row for admin
 *  triage — kind='pass' as the safest fallback (grants the most). */
export function kindForPriceId(priceId: string): EntitlementKind | null {
  const map: Record<string, EntitlementKind> = {
    [process.env.STRIPE_PRICE_EXAM2 ?? ""]: "exam_2",
    [process.env.STRIPE_PRICE_EXAM3 ?? ""]: "exam_3",
    [process.env.STRIPE_PRICE_FINAL ?? ""]: "final",
    [process.env.STRIPE_PRICE_PASS  ?? ""]: "pass",
  };
  return map[priceId] ?? null;
}

/** The inverse: from an entitlement kind, get its configured price id. Used by checkout. */
export function priceIdForKind(kind: EntitlementKind): string | null {
  switch (kind) {
    case "exam_2": return process.env.STRIPE_PRICE_EXAM2 || null;
    case "exam_3": return process.env.STRIPE_PRICE_EXAM3 || null;
    case "final":  return process.env.STRIPE_PRICE_FINAL || null;
    case "pass":   return process.env.STRIPE_PRICE_PASS  || null;
  }
}
