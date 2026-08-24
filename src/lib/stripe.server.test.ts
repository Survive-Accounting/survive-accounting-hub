import { describe, expect, it } from "bun:test";
import { stripeKeys, stripeReady, stripeStatus, verifyStripeSignature } from "./stripe.server";
const reset = (env: Record<string, string | undefined>) => { for (const k of ["STRIPE_SECRET_TEST","STRIPE_SECRET_KEY","STRIPE_PUBLIC_TEST","STRIPE_PUBLIC_KEY"]) delete process.env[k]; Object.assign(process.env, env); };
describe("stripe key guard", () => {
  it("is off with no keys", () => { reset({}); expect(stripeReady()).toBe(false); expect(stripeStatus().ready).toBe(false); });
  it("REFUSES a live secret and stays off", () => { reset({ STRIPE_SECRET_KEY: "sk_live_abc123", STRIPE_PUBLIC_KEY: "pk_live_abc" }); expect(stripeKeys()).toBeNull(); expect(stripeReady()).toBe(false); expect(stripeStatus().reason).toContain("not a test key"); });
  it("accepts STRIPE_SECRET_TEST", () => { reset({ STRIPE_SECRET_TEST: "sk_test_abc", STRIPE_PUBLIC_TEST: "pk_test_abc" }); const k = stripeKeys(); expect(k?.secret).toBe("sk_test_abc"); expect(k?.mode).toBe("test"); });
  it("accepts the legacy name only when it holds a test key", () => { reset({ STRIPE_SECRET_KEY: "sk_test_legacy" }); expect(stripeKeys()?.secret).toBe("sk_test_legacy"); });
  it("never mixes a live secret with a test one", () => { reset({ STRIPE_SECRET_TEST: "sk_test_ok", STRIPE_SECRET_KEY: "sk_live_nope" }); expect(stripeKeys()?.secret).toBe("sk_test_ok"); });
  it("rejects an unsigned webhook", async () => { expect(await verifyStripeSignature("{}", null, "whsec_x")).toBe(false); expect(await verifyStripeSignature("{}", "t=1,v1=deadbeef", undefined)).toBe(false); });
  it("rejects a stale timestamp", async () => { expect(await verifyStripeSignature("{}", "t=1,v1=deadbeef", "whsec_x")).toBe(false); });
  it("accepts a correctly signed payload", async () => {
    const secret = "whsec_test"; const t = Math.floor(Date.now()/1000); const body = JSON.stringify({ hello: "world" });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
    const sig = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret)).toBe(true);
    expect(await verifyStripeSignature(body + "tampered", `t=${t},v1=${sig}`, secret)).toBe(false);
  });
});
