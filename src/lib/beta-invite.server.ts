// BETA INVITES (Lee, 2026-09-17: "a beta test version of the entire site, where everything uses test data,
// any verification sms is bypassable, emails still send though").
//
// THE EXISTING TEST MODE, WIDENED BY ONE DOOR. A QA tester (Lee, King) is an address on the allow-list
// (test-mode.server.ts) and test mail is REDIRECTED to them. A beta tester is anyone Lee invites: the invite
// link carries a signature over their address, so no env var edit is needed, and their session cookie
// carries the same signature so it is re-checked on every read. For a beta session, email is NOT redirected —
// it goes to the address typed, exactly as it would for a student, with the [TEST] banner — while every row
// they create is still is_test, texts are still never sent, and the rep phone code is still 000000.
//
// SERVER ONLY. node:crypto lives here, so import this module dynamically from handler bodies and .server
// files only (the reason test-mode.server.ts stays pure is documented there).
import { createHmac, timingSafeEqual } from "node:crypto";

import { EMAIL_RE, readTesterCookie, TEST_TO_COOKIE, testModeOn } from "@/lib/test-mode.server";

/** The cookie value of a beta session: `beta:<email>:<signature>`. A QA session stays a bare address. */
const BETA_PREFIX = "beta:";

function secret(): string | null {
  const s = process.env.BETA_INVITE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return s.length >= 16 ? s : null;
}

/** The invite signature for an address — 24 url-safe characters, stable per address. */
export function betaSignature(email: string): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac("sha256", s).update(`sa-beta:${email.trim().toLowerCase()}`).digest("base64url").slice(0, 24);
}

export function verifyBetaSignature(email: string, sig: string | null | undefined): boolean {
  const want = betaSignature(email);
  if (!want || !sig || sig.length !== want.length) return false;
  try { return timingSafeEqual(Buffer.from(want), Buffer.from(sig)); } catch { return false; }
}

export const betaCookieValue = (email: string, sig: string): string => `${BETA_PREFIX}${email.trim().toLowerCase()}:${sig}`;

export interface TesterSession { email: string; beta: boolean }

/** A raw cookie value → the session it proves, or null. Test mode off, a bad signature, or an address off the
 *  allow-list all read as "no tester" — so switching TEST_MODE_ENABLED off ends every session at once. */
export function readTesterSession(raw: string | undefined | null): TesterSession | null {
  const v = (raw ?? "").trim();
  if (v.startsWith(BETA_PREFIX)) {
    if (!testModeOn()) return null;
    const rest = v.slice(BETA_PREFIX.length);
    const i = rest.lastIndexOf(":");
    if (i <= 0) return null;
    const email = rest.slice(0, i).toLowerCase(), sig = rest.slice(i + 1);
    if (!EMAIL_RE.test(email) || !verifyBetaSignature(email, sig)) return null;
    return { email, beta: true };
  }
  const qa = readTesterCookie(v);
  return qa ? { email: qa, beta: false } : null;
}

/** THIS request's tester, read straight from the cookie (no test-mode.functions import — see team-alerts.server.ts
 *  for the import loop that avoids). Null outside a request (cron, worker) or for a real visitor. */
export async function testerFromRequest(): Promise<TesterSession | null> {
  try {
    const { getCookie } = await import("@tanstack/react-start/server");
    return readTesterSession(getCookie(TEST_TO_COOKIE));
  } catch { return null; }
}

/** Is THIS request part of a test or beta run? The predicate a write uses to force is_test, whatever the client said. */
export async function isTestOrBetaRequest(): Promise<boolean> {
  return (await testerFromRequest()) !== null;
}
