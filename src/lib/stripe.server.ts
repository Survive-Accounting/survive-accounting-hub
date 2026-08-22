// STRIPE — TEST KEYS ONLY, FAIL CLOSED.
//
// THE ONE SAFETY RULE. This module will only ever hand back a key that starts with `sk_test_` /
// `pk_test_`. A live key in the environment is not "the fallback"; it is ignored and payments stay
// switched off. There is deliberately no branch that can promote a live key into service, because
// the failure mode — a chapter's real card charged during a test lifecycle, or a test invoice
// landing in a real treasurer's inbox — is not one you can apologise your way out of.
//
// KEY NAMES. Preferred: STRIPE_SECRET_TEST / STRIPE_PUBLIC_TEST. Also accepted:
// STRIPE_SECRET_KEY / STRIPE_PUBLIC_KEY, but ONLY when the value is itself a test key — the
// project has carried those two names since long before this work, and there is no way to know
// from here whether they hold live credentials, so the prefix is what decides.
//
// NO SDK. Stripe's REST API is form-encoded POSTs and this feature needs five endpoints; the
// `stripe` package would be a build-time dependency for very little (and heavy deps have broken
// this build before — see the @vercel/og note in og.ts). Webhook signatures are verified here
// with Web Crypto, which is the only genuinely subtle part.

export type StripeMode = "test";

export type StripeKeys = { secret: string; publishable: string | null; mode: StripeMode };

const isTestSecret = (v: string | undefined | null) => !!v && v.startsWith("sk_test_");
const isTestPublishable = (v: string | undefined | null) => !!v && v.startsWith("pk_test_");

/** The usable TEST keys, or null when there are none. Null means "payments are off", never
 *  "try the other environment". */
export function stripeKeys(): StripeKeys | null {
  const secret =
    (isTestSecret(process.env.STRIPE_SECRET_TEST) && process.env.STRIPE_SECRET_TEST) ||
    (isTestSecret(process.env.STRIPE_SECRET_KEY) && process.env.STRIPE_SECRET_KEY) ||
    null;
  if (!secret) return null;
  const publishable =
    (isTestPublishable(process.env.STRIPE_PUBLIC_TEST) && process.env.STRIPE_PUBLIC_TEST) ||
    (isTestPublishable(process.env.STRIPE_PUBLIC_KEY) && process.env.STRIPE_PUBLIC_KEY) ||
    null;
  return { secret, publishable, mode: "test" };
}

/** Is a chapter-seat payment possible right now? Every caller checks this before offering a card
 *  or invoice button, and the server functions check it again before touching Stripe. */
export const stripeReady = () => stripeKeys() !== null;

/** Why payments are off, for an admin-facing surface. Never shown to a chapter exec. */
export function stripeStatus(): { ready: boolean; reason: string } {
  if (stripeKeys()) return { ready: true, reason: "Stripe test keys loaded." };
  const anyKey = process.env.STRIPE_SECRET_TEST || process.env.STRIPE_SECRET_KEY;
  if (!anyKey) return { ready: false, reason: "No STRIPE_SECRET_TEST (or STRIPE_SECRET_KEY) in the environment." };
  return { ready: false, reason: "A Stripe secret is present but is not a test key (sk_test_…). Live keys are refused on purpose." };
}

/** Flatten nested params the way Stripe's form encoding expects: {a:{b:1}} → "a[b]=1". */
function encode(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") out.push(...encode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      out.push(...encode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** One call to the Stripe REST API with the test secret. GET when there are no params. */
export async function stripeCall<T = Record<string, unknown>>(
  path: string,
  params?: Record<string, unknown>,
  method: "GET" | "POST" = "POST",
): Promise<StripeResult<T>> {
  const keys = stripeKeys();
  if (!keys) return { ok: false, error: "Stripe test keys are not configured." };
  try {
    const body = params ? encode(params).join("&") : undefined;
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${keys.secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Guards against a half-completed retry creating two invoices for one purchase.
        ...(params?.idempotencyKey ? { "Idempotency-Key": String(params.idempotencyKey) } : {}),
      },
      body: method === "POST" ? body : undefined,
    });
    const json = (await res.json()) as { error?: { message?: string } } & T;
    if (!res.ok) return { ok: false, error: json?.error?.message ?? `Stripe ${res.status}` };
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe request failed." };
  }
}

/** Verify a webhook signature: HMAC-SHA256 over `${t}.${rawBody}`, compared in constant time
 *  against one of the v1 signatures in the Stripe-Signature header, with a 5-minute tolerance.
 *  An unverified webhook must never activate seats — anyone can POST to a public URL. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string | undefined): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = parts.t;
  const sig = parts.v1;
  if (!t || !sig) return false;
  // Replay window.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export const stripeWebhookSecret = () =>
  process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET || null;
