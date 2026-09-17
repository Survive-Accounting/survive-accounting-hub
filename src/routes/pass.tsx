// /pass — the Study Pass checkout. $150, the whole course, through the end of the term.
//
// THE WHOLE PAGE IS ONE BUTTON. No account, no email field, no password, nothing to fill in before
// paying. Tap → Stripe's hosted form (card + email, once) → back here already signed in and
// unlocked. The account is built from the email Stripe collected; see study-pass.functions.ts.
//
// HONEST WHEN IT IS NOT WIRED. No Stripe price configured ⇒ the page says so rather than offering
// a button that throws.
//
// noindex — this is not a marketing page.
import { useEffect, useRef, useState } from "react";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Lock, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/site/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { claimStudyPassSession, startStudyPassCheckout, studyPassContext } from "@/lib/study-pass.functions";
import { useStudentAuth } from "@/lib/use-student-auth";

const NAVY = "#14213D";
const CREAM = "#F6F2E9";
const GOLD = "#FCA311";
const INK = "#0B1322";

interface PassSearch { campus?: string; session_id?: string; checkout?: string; back?: string }

export const Route = createFileRoute("/pass")({
  validateSearch: (s: Record<string, unknown>): PassSearch => ({
    campus: typeof s.campus === "string" ? s.campus : undefined,
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
    // Same-origin path to land on after the pass is claimed — the page they were locked out of.
    back: typeof s.back === "string" && s.back.startsWith("/") ? s.back : undefined,
  }),
  head: () => ({ meta: [{ title: "Study Pass — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: PassPage,
});

function PassPage() {
  const search = Route.useSearch();
  const auth = useStudentAuth();
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [claiming, setClaiming] = useState(!!search.session_id);
  const claimed = useRef(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, [auth.userId]);

  const ctxQ = useQuery({
    queryKey: ["study-pass", search.campus ?? "", token ?? ""],
    queryFn: () => studyPassContext({ data: { campusSlug: search.campus ?? null, accessToken: token } }),
  });
  const ctx = ctxQ.data;
  const back = `/pass${search.campus ? `?campus=${encodeURIComponent(search.campus)}` : ""}`;

  // BACK FROM STRIPE. Verify, create the account, grant, then follow the one-time link so they
  // land signed in. The student does nothing.
  useEffect(() => {
    if (!search.session_id || claimed.current) return;
    claimed.current = true;
    void (async () => {
      // The one-time sign-in link drops them on the page they were locked out of, already
      // unlocked — so a purchase ends in the video, not on a receipt.
      const r = await claimStudyPassSession({ data: { sessionId: search.session_id!, redirectTo: search.back ?? back } });
      if (!r.ok) { setErr(r.error); setClaiming(false); return; }
      if (r.signInUrl) { window.location.replace(r.signInUrl); return; }
      setClaiming(false);
      await ctxQ.refetch();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.session_id]);

  const buy = useMutation({
    mutationFn: async () => {
      const r = await startStudyPassCheckout({ data: { campusSlug: search.campus ?? null, returnPath: back } });
      if (!r.ok) throw new Error(r.error);
      window.location.assign(r.url);
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "checkout failed"),
  });

  const price = ctx ? `$${Math.round(ctx.priceCents / 100)}` : "$150";
  const learnHref = search.campus ? `/learn/${encodeURIComponent(search.campus)}` : "/learn";

  return (
    <div style={{ minHeight: "100vh", background: NAVY }}>
      <SiteHeader />
      <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 64px" }}>
        <h1 style={{ color: CREAM, fontSize: 28, fontWeight: 900, lineHeight: 1.15, margin: "8px 0 6px" }}>
          {ctx?.productName ?? "Study Pass"}
        </h1>
        <p style={{ color: "rgba(246,242,233,0.72)", fontSize: 14.5, margin: "0 0 18px" }}>
          {ctx?.campusName ? `${ctx.campusName} · ` : ""}Everything for the whole semester. One price, once.
        </p>

        <section style={{ background: CREAM, borderRadius: 18, padding: 20, boxShadow: "0 18px 40px rgba(0,0,0,0.28)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ color: INK, fontSize: 40, fontWeight: 900, letterSpacing: -1 }}>{price}</span>
            <span style={{ color: "rgba(11,19,34,0.6)", fontSize: 13.5, fontWeight: 700 }}>
              through {ctx?.expiresLabel ?? "the end of the term"}
            </span>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 10 }}>
            {(ctx?.includes ?? []).map((line) => (
              <li key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Check size={17} strokeWidth={3} style={{ color: "#1B7F4B", flex: "0 0 auto", marginTop: 2 }} />
                <span style={{ color: INK, fontSize: 14.5, lineHeight: 1.35 }}>{line}</span>
              </li>
            ))}
          </ul>

          <p style={{ color: INK, fontSize: 13, fontWeight: 700, margin: "14px 0 0" }}>{ctx?.anchorLine ?? ""}</p>
          <p style={{ color: "rgba(11,19,34,0.6)", fontSize: 12.5, lineHeight: 1.4, margin: "6px 0 0" }}>
            {ctx?.disclosure ?? ""}
          </p>

          <div style={{ marginTop: 18, borderTop: "1px solid rgba(11,19,34,0.12)", paddingTop: 16 }}>
            {claiming ? (
              <p style={{ color: INK, fontSize: 14.5, fontWeight: 800, margin: 0 }}>Unlocking your course…</p>
            ) : ctx?.held ? (
              <div>
                <p style={{ display: "flex", gap: 8, alignItems: "center", color: "#1B7F4B", fontWeight: 900, fontSize: 15, margin: 0 }}>
                  <ShieldCheck size={18} strokeWidth={2.5} /> You're in for {ctx.termLabel}.
                </p>
                <a href={learnHref}
                  style={{ display: "block", marginTop: 12, textAlign: "center", background: INK, color: CREAM, borderRadius: 12, padding: "13px 18px", fontWeight: 900, fontSize: 13.5, textDecoration: "none", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Start studying
                </a>
              </div>
            ) : ctx?.configured ? (
              <>
                <button type="button" onClick={() => buy.mutate()} disabled={buy.isPending}
                  style={{ width: "100%", minHeight: 52, borderRadius: 12, border: "none", background: GOLD, color: INK, fontWeight: 900, fontSize: 15, textTransform: "uppercase", letterSpacing: 0.4, cursor: "pointer", opacity: buy.isPending ? 0.7 : 1 }}>
                  {buy.isPending ? "Opening checkout…" : `Get the pass — ${price}`}
                </button>
                <p style={{ color: "rgba(11,19,34,0.55)", fontSize: 12, margin: "10px 0 0", textAlign: "center" }}>
                  No account needed. You'll be signed in automatically after you pay.
                </p>
              </>
            ) : (
              <p style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "rgba(11,19,34,0.7)", fontSize: 13.5, margin: 0, lineHeight: 1.4 }}>
                <Lock size={16} strokeWidth={2.5} style={{ flex: "0 0 auto", marginTop: 2 }} />
                Checkout isn't switched on for this deployment yet (no <code>STRIPE_PRICE_STUDY_PASS_V4</code>).
              </p>
            )}

            {err && <p style={{ color: "#B3261E", fontSize: 13, margin: "10px 0 0" }}>{err}</p>}
          </div>
        </section>

        {!ctx?.held && (
          <p style={{ color: "rgba(246,242,233,0.5)", fontSize: 12.5, textAlign: "center", margin: "16px 0 0" }}>
            Already bought it? <Link to="/learn/{-$campus}/{-$chapter}" params={{ campus: search.campus, chapter: undefined }} style={{ color: CREAM, textDecoration: "underline" }}>Sign in on /learn</Link>.
          </p>
        )}
      </main>
    </div>
  );
}
