// /outreach/greek-claims — Lee's approval queue for chapter claims. Phase 2a.
//
// AUTH. AdminGate wraps this page, but AdminGate is a localStorage flag guarding a passcode that
// ships inside the public client bundle — its own source calls it "a deterrent, not real security".
// Approving a claim hands someone a chapter dashboard, a roster of student names and phone numbers,
// and eventually paid seats. So the gate here is a real Supabase session: the page asks for a
// magic link, and every server call re-verifies that JWT and matches it against a server-side admin
// allowlist. AdminGate only keeps the route out from underfoot; deleting it would change nothing
// about who can actually approve a claim.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import AdminGate from "@/components/AdminGate";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { supabase } from "@/integrations/supabase/client";
import { decideChapterClaim, listChapterClaims, type ClaimRow } from "@/lib/greek-claims.functions";

export const Route = createFileRoute("/outreach/greek-claims")({
  head: () => ({ meta: [{ title: "Chapter claims — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGate><ClaimsPage /></AdminGate>,
});

function ClaimsPage() {
  useNavyDocument();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh" }}>
      <SiteHeader />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 20px", width: "100%" }}>
        <h1 className="pt-10 text-[24px] font-black">Chapter claims</h1>
        {!token ? (
          <div className="mt-6 max-w-sm" style={{ fontFamily: BRAND_SANS }}>
            {/* The passcode got you to this page; it does NOT get you a decision button. */}
            <p className="mb-3 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
              Sign in to review claims — approving one grants access to a chapter&apos;s roster, so it needs a real session, not the admin passcode.
            </p>
            {sent ? (
              <p className="text-[13.5px]" style={{ color: "var(--brand-cream)" }}>Check your email for the link.</p>
            ) : (
              <>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="lee@surviveaccounting.com" className="mb-2 w-full rounded-lg px-3 text-[14px] outline-none" style={{ minHeight: 44, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
                <button
                  onClick={() => { void supabase.auth.signInWithOtp({ email: email.trim() }); setSent(true); }}
                  className="w-full rounded-xl text-[15px] font-black"
                  style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}
                >
                  Email me a sign-in link
                </button>
              </>
            )}
          </div>
        ) : (
          <ClaimQueue token={token} />
        )}
      </main>
    </div>
  );
}

function ClaimQueue({ token }: { token: string }) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["greek-claims", status],
    queryFn: () => listChapterClaims({ data: { accessToken: token, status } }),
    networkMode: "always",
  });

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusyId(id); setErr(null);
    try {
      const r = await decideChapterClaim({ data: { accessToken: token, claimId: id, decision } });
      if (!r.ok) setErr(r.error ?? "Failed.");
      await q.refetch();
    } finally { setBusyId(null); }
  };

  // null means the server rejected the token — a signed-in NON-admin. Said plainly rather than
  // shown as an empty queue, which would read as "no claims" and hide the real problem.
  if (q.data === null) {
    return <p className="mt-6 text-[13.5px]" style={{ color: "#F3C6CC", fontFamily: BRAND_SANS }}>That account isn&apos;t on the admin list.</p>;
  }

  const rows: ClaimRow[] = q.data ?? [];

  return (
    <div className="mt-6 mb-16" style={{ fontFamily: BRAND_SANS }}>
      <div className="mb-4 flex gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold capitalize"
            style={{ background: status === s ? "var(--accent)" : "rgba(245,239,230,0.06)", color: status === s ? "#0B1220" : "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.14)" }}>
            {s}
          </button>
        ))}
      </div>

      {err && <p className="mb-3 text-[13px]" style={{ color: "#F3C6CC" }}>{err}</p>}
      {q.isLoading && <p className="text-[13.5px]" style={{ color: "var(--text-muted)" }}>Loading…</p>}
      {!q.isLoading && !rows.length && <p className="text-[13.5px]" style={{ color: "var(--text-muted)" }}>Nothing {status === "all" ? "here" : status} right now.</p>}

      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.id} className="rounded-xl p-4" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>{c.chapterName}</p>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>{c.schoolName}</p>
                <p className="mt-2 text-[13.5px]" style={{ color: "var(--brand-cream)" }}>{c.name} — {c.position}</p>
                {/* Tappable: the whole point of 2a is that Lee can answer from his phone. */}
                <p className="text-[13px]">
                  <a href={`sms:${c.phone}`} style={{ color: "var(--accent)" }}>{c.phone}</a>
                  <span style={{ color: "var(--text-muted)" }}> · </span>
                  <a href={`mailto:${c.email}`} style={{ color: "var(--accent)" }}>{c.email}</a>
                </p>
                {/* Both numbers: a chapter that kept growing while the claim sat in the queue is a
                    different proposition from one that stalled. */}
                <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {c.membersAtClaim} member{c.membersAtClaim === 1 ? "" : "s"} at claim · {c.membersNow} now
                </p>
                {c.goUrl && <a href={c.goUrl} className="text-[12.5px] underline underline-offset-2" style={{ color: "var(--text-muted)" }}>{c.goUrl}</a>}
              </div>
              {c.status === "pending" ? (
                <div className="flex shrink-0 gap-2">
                  <button disabled={busyId === c.id} onClick={() => void decide(c.id, "approved")} className="rounded-lg px-3 py-2 text-[13px] font-black disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>Approve</button>
                  <button disabled={busyId === c.id} onClick={() => void decide(c.id, "rejected")} className="rounded-lg px-3 py-2 text-[13px] font-bold disabled:opacity-40" style={{ background: "rgba(245,239,230,0.08)", color: "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.16)" }}>Reject</button>
                </div>
              ) : (
                <span className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold capitalize" style={{ background: "rgba(245,239,230,0.08)", color: "var(--text-muted)" }}>{c.status}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
