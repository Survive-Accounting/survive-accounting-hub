// REP AUTH (server-only) — the session cookie + the ONE rep resolver. Import this module ONLY
// dynamically from inside *.functions.ts `.handler()` bodies: it touches
// @tanstack/react-start/server, which the client build refuses. (Plain exports of a *.functions.ts
// module are NOT stripped from the client bundle — only handler bodies are — which is exactly the
// import-protection failure that moved this code out of rep-auth.functions.ts.)
import type { RepStatus } from "@/lib/rep-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };

export const REP_COOKIE = "sa_rep";
const SESSION_DAYS = 30;

export type RepRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  campus_id: string | null;
  venmo: string | null;
  is_test: boolean;
  status: string;
  rep_status: RepStatus | null;
  phone_verified_at: string | null;
  dashboard_token: string | null;
  default_commission_type: string;
  default_commission_rate: number;
};

export const REP_COLS = "id,name,email,phone,campus_id,venmo,is_test,status,rep_status,phone_verified_at,dashboard_token,default_commission_type,default_commission_rate";

export async function setRepCookie(token: string): Promise<void> {
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(REP_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearRepCookie(): Promise<void> {
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(REP_COOKIE, { path: "/" });
}

/** The ONE resolver every rep server function uses. Reads the session cookie (or an explicit
 *  legacy token for the test loop), loads the partner, and enforces the lifecycle:
 *  · paused/deactivated reps are rejected (the admin brake works instantly)
 *  · `requireActive` (default) additionally demands an activated rep (approved+verified)
 *  A legacy `?k=` token is honoured ONLY for test reps — real reps go through the phone OTP. */
export async function repFromSession(db: DB, opts: { legacyToken?: string | null; requireActive?: boolean } = {}):
  Promise<{ rep: RepRow } | { error: string; state: "invalid" | "pending" | "paused" }> {
  let token: string | null = null;
  try {
    const { getCookie } = await import("@tanstack/react-start/server");
    token = getCookie(REP_COOKIE) ?? null;
  } catch { /* no request context */ }
  let viaLegacy = false;
  if (!token && opts.legacyToken) { token = opts.legacyToken; viaLegacy = true; }
  if (!token) return { error: "Sign in to your rep dashboard.", state: "invalid" };

  const { data } = await db.from("referral_partners").select(REP_COLS)
    .eq("dashboard_token", token).eq("type", "campus_rep").maybeSingle();
  const rep = data as RepRow | null;
  if (!rep?.id) return { error: "That session isn't valid — sign in again.", state: "invalid" };
  if (viaLegacy && !rep.is_test) return { error: "Sign in with your phone number.", state: "invalid" };

  const rs = (rep.rep_status ?? "active") as RepStatus; // pre-migration rows default to active
  if (rs === "paused" || rs === "deactivated") return { error: "Your rep account is paused. Reach out to Lee if that's a surprise.", state: "paused" };
  if (opts.requireActive !== false) {
    if (rs === "applied") return { error: "Your application is in — we'll text you when you're approved.", state: "pending" };
    if (rs === "approved" && !rep.is_test) return { error: "Verify your phone to open your dashboard.", state: "pending" };
  }
  return { rep };
}
