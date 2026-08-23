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
  // ?claim=<id> — where the founder alert points. It is a POINTER, not a permission: the claim it
  // names is only shown after the same Supabase session check as everything else on this page,
  // and it grants nothing on its own. That is the whole reason the alert links here instead of
  // carrying a one-tap approve token, which would be an approval credential sitting in an inbox.
  validateSearch: (search: Record<string, unknown>): { claim?: string } => ({
    claim: typeof search.claim === "string" && search.claim.length < 64 ? search.claim : undefined,
  }),
  head: () => ({ meta: [{ title: "Chapter claims — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGate><ClaimsPage /></AdminGate>,
});

/** "3 minutes ago" / "Yesterday, 4:12 PM". How long a claim has been waiting is the first thing
 *  that decides whether to deal with it now, and a raw ISO string makes you do that arithmetic. */
function submittedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  const { claim: focusId } = Route.useSearch();

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

  // The alert named one claim; put it first rather than making Lee find it in a list of twenty.
  // Sorting rather than filtering, so the rest of the queue is still one glance away.
  const all: ClaimRow[] = q.data ?? [];
  const rows: ClaimRow[] = focusId
    ? [...all].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0))
    : all;

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
          <div
            key={c.id}
            className="rounded-xl p-4"
            style={{
              background: c.id === focusId ? "rgba(252,163,17,0.10)" : "rgba(245,239,230,0.04)",
              border: c.id === focusId ? "1px solid rgba(252,163,17,0.5)" : "1px solid rgba(245,239,230,0.1)",
            }}
          >
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
                {/* WHEN. A claim that came in four minutes ago and one that has been sitting for
                    three days are different decisions, and the queue never said which was which.
                    The exact time is in the title for when the relative one is not enough. */}
                <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }} title={new Date(c.createdAt).toLocaleString()}>
                  Submitted {submittedLabel(c.createdAt)}
                </p>
                {c.goUrl && <a href={c.goUrl} className="text-[12.5px] underline underline-offset-2" style={{ color: "var(--text-muted)" }}>{c.goUrl}</a>}
              </div>
              {c.status === "pending" ? (
                <div className="flex shrink-0 flex-col items-stretch gap-2">
                  {/* One primary action, named after what it does to the chapter rather than to
                      the row. Approving sends the exec their dashboard and their approval
                      message — no follow-up step, and nothing to do in the database. */}
                  <button
                    disabled={busyId === c.id}
                    onClick={() => void decide(c.id, "approved")}
                    className="rounded-lg px-4 py-2.5 text-[13px] font-black disabled:opacity-40"
                    style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}
                  >
                    {busyId === c.id ? "Approving…" : "Approve chapter"}
                  </button>
                  {/* "Reject" alone reads as a verdict on the person. Most of the time this means
                      "I could not confirm they are an officer", which is a different thing and the
                      reason to text them first. */}
                  <button
                    disabled={busyId === c.id}
                    onClick={() => void decide(c.id, "rejected")}
                    className="rounded-lg px-4 py-2 text-[12.5px] font-bold disabled:opacity-40"
                    style={{ minHeight: 40, background: "rgba(245,239,230,0.08)", color: "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.16)" }}
                  >
                    Reject / needs verification
                  </button>
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
