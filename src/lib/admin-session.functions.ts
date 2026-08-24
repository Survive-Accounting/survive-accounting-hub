// ADMIN SESSION — the real authorization behind the admin workspaces.
//
// WHY THIS EXISTS. The admin routes are wrapped in <AdminGate>, a localStorage passcode that ships
// in the public browser bundle — its own source calls it "a deterrent, not real security". The
// server functions behind those routes use the SERVICE-ROLE key, so anyone who called the
// endpoint directly (bypassing the client gate) could read contacts, revenue rollups and
// commission data, or write to them. RLS on the tables is moot: the service role bypasses it.
//
// THE FIX, mirroring /outreach/greek-claims. Real authorization is a Supabase admin SESSION, not a
// passcode. The admin signs in with a magic link; the browser hands the resulting JWT to
// installAdminSession, which verifies it server-side against the admin allow-list and, only then,
// stores it in an HTTP-ONLY cookie the page cannot read or forge. Every admin server function
// gates its database handle on adminSessionOk(), which re-verifies that cookie's JWT on each call.
// An attacker without an admin Supabase session cannot produce a passing cookie.
//
// BUILD-SAFETY. The cookie is read/written with @tanstack/react-start/server, which may only be
// imported inside a .handler() body (a plain module-level import leaks into the client graph and
// the build refuses it). So the three pieces here are server functions; other server code calls
// them and inherits the same request context, so the cookie is visible.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ADMIN_EMAILS } from "@/lib/admin-emails";


const COOKIE = "sa_admin_jwt";

/** Verify a Supabase JWT belongs to an admin. Returns the lowercased email or null. */
async function emailFromJwt(jwt: string | undefined | null): Promise<string | null> {
  if (!jwt) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as unknown as {
      auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string | null } | null }; error: unknown }> };
    }).auth.getUser(jwt);
    if (error) return null;
    const email = (data.user?.email ?? "").trim().toLowerCase();
    return email && ADMIN_EMAILS.includes(email) ? email : null;
  } catch {
    return null;
  }
}

/** Adopt an admin session: verify the browser's Supabase JWT is an admin, then stash it in an
 *  HttpOnly cookie. Called once by the gate after sign-in (and again on token refresh). */
export const installAdminSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; email?: string; error?: string }> => {
    const email = await emailFromJwt(data.accessToken);
    if (!email) return { ok: false, error: "Not an admin account." };
    try {
      const { setCookie } = await import("@tanstack/react-start/server");
      setCookie(COOKIE, data.accessToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 8, // a working session; the JWT inside also has its own ~1h expiry, re-checked every call
      });
      return { ok: true, email };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't set the session." };
    }
  });

/** THE GATE every admin server function checks. Reads the cookie's JWT and re-verifies it is still
 *  a valid admin session on every call — an expired or tampered token fails. */
export const adminSessionOk = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ ok: boolean; email?: string }> => {
    try {
      const { getCookie } = await import("@tanstack/react-start/server");
      const email = await emailFromJwt(getCookie(COOKIE));
      return email ? { ok: true, email } : { ok: false };
    } catch {
      return { ok: false }; // no request context (cron/worker) — never an admin
    }
  });

export const clearAdminSession = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean }> => {
    try {
      const { deleteCookie } = await import("@tanstack/react-start/server");
      deleteCookie(COOKIE, { path: "/" });
    } catch { /* nothing to clear */ }
    return { ok: true };
  });

/** Throw unless the current request carries a valid admin session cookie. The one line every
 *  admin data path calls. Kept as a plain async helper (no server-only import of its own — it
 *  delegates to the adminSessionOk server function) so it is safe to call from anywhere. */
export async function assertAdmin(): Promise<void> {
  // Fail CLOSED and cleanly: any result that is not an explicit {ok:true} — including a null/undefined
  // from a context without a request runtime — is treated as "not an admin".
  let ok = false;
  try { ok = (await adminSessionOk())?.ok === true; } catch { ok = false; }
  if (!ok) throw new Error("Not authorised — sign in as an admin.");
}
