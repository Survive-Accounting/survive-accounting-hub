// ADMIN SESSION GATE — the real sign-in in front of the admin workspaces.
//
// Wraps the workspace INSIDE <AdminGate> (the passcode). The passcode gets you to the page; this
// gets you a verified admin SESSION, which is what the server functions actually require now (see
// admin-session.functions.ts). Without a Supabase admin session, the data calls all throw "Not
// authorised", so this gate makes that state legible instead of a wall of errors: it shows a
// magic-link sign-in until you are signed in as an admin, then plants the HttpOnly session cookie
// and renders the workspace.
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { adminSessionOk, clearAdminSession, installAdminSession } from "@/lib/admin-session.functions";

type Phase = "checking" | "signin" | "installing" | "ready" | "denied";

export function AdminSessionGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Given a Supabase access token, verify + plant the server cookie, then flip to ready.
  const install = useCallback(async (accessToken: string) => {
    setPhase("installing"); setErr(null);
    try {
      const r = await installAdminSession({ data: { accessToken } });
      if (r.ok) setPhase("ready");
      else { setPhase("denied"); setErr(r.error ?? "That account isn't an admin."); }
    } catch { setPhase("denied"); setErr("Couldn't reach the server."); }
  }, []);

  useEffect(() => {
    let alive = true;
    // If a valid admin cookie already exists, skip straight in.
    void adminSessionOk().then((r) => {
      if (!alive) return;
      if (r.ok) { setPhase("ready"); return; }
      // Otherwise look for a Supabase session to install from.
      void supabase.auth.getSession().then(({ data }) => {
        if (!alive) return;
        const t = data.session?.access_token;
        if (t) void install(t); else setPhase("signin");
      });
    });
    // Re-plant on sign-in / token refresh so an expiring JWT never strands the workspace.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      const t = session?.access_token;
      if (t) void install(t); else setPhase("signin");
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [install]);

  if (phase === "ready") return <>{children}</>;

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-lg font-semibold text-foreground">Admin sign-in</h1>
      {phase === "checking" || phase === "installing" ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking your session…</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            This workspace reads contacts, revenue and commission data, so it needs a real admin
            session — not just the passcode.
          </p>
          {sent ? (
            <p className="mt-4 text-sm text-foreground">Check your email for the sign-in link, then reopen this page.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="lee@surviveaccounting.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => { void supabase.auth.signInWithOtp({ email: email.trim() }); setSent(true); }}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
              >
                Email me a sign-in link
              </button>
            </div>
          )}
          {err && <p className="mt-3 text-sm text-red-500">{err}</p>}
          {phase === "denied" && (
            <button
              type="button"
              onClick={() => { void clearAdminSession(); void supabase.auth.signOut(); setPhase("signin"); setSent(false); }}
              className="mt-3 text-xs font-medium text-muted-foreground underline"
            >
              Use a different account
            </button>
          )}
        </>
      )}
    </div>
  );
}
