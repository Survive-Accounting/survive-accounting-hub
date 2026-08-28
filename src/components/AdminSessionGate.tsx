// ADMIN SESSION GATE — passcode-only since 2026-08-28 (Lee's call: no magic link).
//
// <AdminGate> already collected the team passcode and the operator identity
// (Lee/King). This gate exchanges that same passcode for the HttpOnly session
// cookie the server functions require (verified server-side — see
// installPasscodeSession). The exchange is automatic, so someone who typed the
// passcode never sees a second prompt; the input below only appears if the
// silent exchange fails (e.g. the passcode was rotated via the ADMIN_PASSCODE
// env var after this browser unlocked).
import { useEffect, useRef, useState } from "react";

import { ADMIN_PASSCODE, getAdminWho } from "@/components/AdminGate";
import { adminSessionOk, installPasscodeSession } from "@/lib/admin-session.functions";

type Phase = "checking" | "ask" | "ready";

export function AdminSessionGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const tried = useRef(false);

  const install = async (passcode: string): Promise<boolean> => {
    const who = getAdminWho() === "king" ? ("king" as const) : ("lee" as const);
    try {
      const r = await installPasscodeSession({ data: { passcode, who } });
      if (r.ok) {
        setPhase("ready");
        return true;
      }
      setErr(r.error ?? "Wrong passcode.");
    } catch {
      setErr("Couldn't reach the server.");
    }
    return false;
  };

  useEffect(() => {
    let alive = true;
    void adminSessionOk().then(async (r) => {
      if (!alive) return;
      if (r.ok) {
        setPhase("ready");
        return;
      }
      // Silent exchange: they already typed this passcode at the AdminGate.
      if (!tried.current) {
        tried.current = true;
        const ok = await install(ADMIN_PASSCODE);
        if (!alive || ok) return;
      }
      setPhase("ask");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (phase === "ready") return <>{children}</>;
  if (phase === "checking") {
    return (
      <div className="mx-auto max-w-sm px-5 py-16">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-lg font-semibold text-foreground">Team passcode</h1>
      <p className="mt-2 text-sm text-muted-foreground">Enter the passcode to continue.</p>
      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) void install(code.trim());
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          type="password"
          autoFocus
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          Unlock
        </button>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </form>
    </div>
  );
}
