// /chapters/dashboard — magic-link (Supabase OTP) chapter dashboard. One screen: link + QR + copy,
// three coarse numbers, roster, a "Buy seats" text-to-Lee action (no checkout), and a digest toggle.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { authEmailError, authErrorDetail } from "@/lib/auth-errors";
import { readTestSession } from "@/lib/test-mode";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { FitWordmark, SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { getChapterDashboard, setChapterDigest, type ChapterDashboard } from "@/lib/greek-chapters.functions";
import { assignSeat, transferChapterOwnership } from "@/lib/greek-seats.functions";
import { confirmSeatCheckout, getChapterSeatState, type ChapterSeatState } from "@/lib/chapter-seats.functions";
import { SeatOfferBlock, SeatPurchase } from "@/components/site/SeatOffer";
import { SeatDashboard } from "@/components/site/SeatDashboard";
import { ChapterShareKit } from "@/components/site/ShareKit";

export const Route = createFileRoute("/chapters_/dashboard")({
  head: () => ({ meta: [{ title: "⚡ Chapter dashboard — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: DashboardPage,
});

const ORIGIN = "surviveaccounting.com";
const LEE_TEL = "+16625658818";

function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<ChapterDashboard | null | undefined>(undefined); // undefined=loading, null=no chapter
  const [loginEmail, setLoginEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data: s }) => { if (!active) return; setToken(s.session?.access_token ?? null); setEmail(s.session?.user?.email ?? null); setChecked(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setToken(s?.access_token ?? null); setEmail(s?.user?.email ?? null); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // Bumped after any action that changes server state (a seat toggle). Re-reading is deliberate:
  // seat counts and entitlements are decided server-side, so patching them in the client would be
  // a second source of truth that can disagree with the first.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!token) { setData(token === null && checked ? null : undefined); return; }
    let active = true;
    setData(undefined);
    void getChapterDashboard({ data: { accessToken: token } }).then((d) => { if (active) setData(d); }).catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [token, checked, reloadKey]);

  const wrap = { ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative" as const, overflowX: "hidden" as const };

  // DASHBOARD-BRIDGE: never claim "sent" without checking — surface invalid emails, failures,
  // and a busy state instead of unconditionally flipping to the success screen.
  const sendLink = async () => {
    if (sendBusy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail.trim())) { setSendErr("That email doesn't look right — check it and try again."); return; }
    setSendBusy(true); setSendErr(null);
    try {
      // The return URL is built from THIS origin, so a link requested on localhost comes back to
      // localhost — provided the origin is on Supabase's redirect allow-list. When it is not,
      // GoTrue does not error: it silently substitutes SITE_URL, and the tester lands on
      // production wondering where their fixture went. See set_auth_limits.ts.
      const redirect = typeof window !== "undefined" ? `${window.location.origin}/chapters/dashboard` : undefined;
      // Same rule as the member gate: in a test run the link goes to the tester, whatever the
      // exec's email says, because Supabase Auth mail bypasses our send layer entirely.
      const test = readTestSession();
      const dest = test?.email || loginEmail.trim();
      const { error } = await supabase.auth.signInWithOtp({ email: dest, options: { emailRedirectTo: redirect } });
      if (error) {
        // One mapping for both sign-in surfaces (see lib/auth-errors.ts). The substring match on
        // "rate" that used to live here caught the rate limit but folded every other cause —
        // redirect not on the allow-list, provider outage, signups disabled — into one sentence
        // that told nobody anything.
        console.warn("[chapter-dashboard] otp failed:", authErrorDetail(error));
        setSendErr(authEmailError(error));
      } else setSent(true);
    } catch { setSendErr("Couldn't reach the server — check your connection and try again."); }
    finally { setSendBusy(false); }
  };

  return (
    <div style={wrap}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "0 20px" }}>
        <div className="flex flex-col items-center pt-14 pb-6"><FitWordmark size={72} /></div>

        {!token ? (
          <div className="mx-auto max-w-sm rounded-2xl p-6" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)", fontFamily: BRAND_SANS }}>
            <h1 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Chapter dashboard</h1>
            {sent ? (
              <>
                <p className="mt-3 text-[14px]" style={{ color: "var(--brand-cream)" }}>Check your email — I sent a sign-in link to {readTestSession()?.email || loginEmail}.</p>
                <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>Not there in a minute? Check spam, or <button onClick={() => { setSent(false); }} className="font-semibold underline" style={{ color: "var(--accent)" }}>resend it</button>.</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>Sign in with the email you used to set up your chapter.</p>
                <input value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); setSendErr(null); }} type="email" placeholder="you@email.com" className="mt-3 w-full rounded-xl px-4 py-3 text-[14px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
                {sendErr && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{sendErr}</p>}
                <button onClick={sendLink} disabled={sendBusy} className="mt-4 w-full rounded-xl py-3 text-[15px] font-black disabled:opacity-50" style={{ background: "var(--accent)", color: "#0B1220" }}>{sendBusy ? "Sending…" : "Email me a sign-in link"}</button>
              </>
            )}
          </div>
        ) : data === undefined ? (
          <p className="text-center text-[13px] italic" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : data === null ? (
          <div className="mx-auto max-w-sm rounded-2xl p-6 text-center" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)", fontFamily: BRAND_SANS }}>
            <p className="text-[14px]" style={{ color: "var(--brand-cream)" }}>No chapter is linked to {email}.</p>
            <a href="/chapters" className="mt-3 inline-block text-[13px] font-bold" style={{ color: "var(--accent)" }}>Set one up →</a>
            <button onClick={() => void supabase.auth.signOut()} className="mt-4 block text-[11.5px]" style={{ color: "var(--text-muted)" }}>sign out</button>
          </div>
        ) : (
          <Dashboard data={data} token={token} onDigest={(v) => setData({ ...data, digestEnabled: v })} onReload={reload} />
        )}
      </main>
    </div>
  );
}

function Dashboard({ data, token, onDigest, onReload }: { data: ChapterDashboard; token: string; onDigest: (v: boolean) => void; onReload: () => void }) {
  // data.url is /go/<school>/<chapter>, or null when this chapter has no roster row behind it yet.
  // Null shows a plain "link pending" line instead of a copyable URL: half a link in a Copy button
  // is worse than none, and the fallback that USED to fill this gap was a /c/ link, which is
  // exactly what Phase 1 retired.
  const full = data.url ? `${ORIGIN}${data.url}` : null;
  const [copied, setCopied] = useState(false);
  const doCopy = async () => { if (!full) return; try { await navigator.clipboard.writeText(`https://${full}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* long-press fallback */ } };
  const qr = full ? `https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=0&data=${encodeURIComponent(`https://${full}`)}` : null;
  const seatsLeft = Math.max(0, data.seatsTotal - data.seatsAssigned);
  const [seatBusy, setSeatBusy] = useState<string | null>(null);
  const [seatErr, setSeatErr] = useState<string | null>(null);
  const [xferOpen, setXferOpen] = useState(false);
  const [xEmail, setXEmail] = useState("");
  const [xName, setXName] = useState("");
  const [xPhone, setXPhone] = useState("");
  const [xBusy, setXBusy] = useState(false);
  const [xDone, setXDone] = useState(false);
  const [xErr, setXErr] = useState<string | null>(null);

  // ── TERM SEATS ───────────────────────────────────────────────────────────────────────────────
  // Loaded beside the legacy dashboard rather than replacing it: the free tier keeps everything it
  // had, and this only adds the term-scoped layer on top. A chapter with no pools sees the offer;
  // a chapter with an active pool sees seat management.
  const [seatState, setSeatState] = useState<ChapterSeatState | null>(null);
  const [showBuy, setShowBuy] = useState(false);
  const [showKit, setShowKit] = useState(false);
  const [offerDismissed, setOfferDismissed] = useState(() => {
    try { return localStorage.getItem(`sa-seat-offer-${data.chapterId}`) === "dismissed"; } catch { return false; }
  });
  const loadSeats = () => {
    void getChapterSeatState({ data: { accessToken: token, chapterId: data.chapterId } })
      .then((s) => setSeatState(s))
      .catch(() => { /* the seat tables may not be applied yet — the free dashboard still works */ });
  };
  useEffect(loadSeats, [data.chapterId, token]);

  // CONFIRM ON RETURN from Stripe card checkout (?seats=paid&pool=…): verify + activate the pool
  // now instead of waiting on the webhook, so the treasurer sees seats immediately (and so this
  // works on a preview URL the webhook can't reach). Idempotent; clears the param after.
  useEffect(() => {
    if (!token) return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("seats") !== "paid") return;
    const pool = p.get("pool");
    if (!pool) return;
    let active = true;
    void (async () => {
      try { await confirmSeatCheckout({ data: { accessToken: token, poolId: pool } }); } catch { /* webhook is the fallback */ }
      if (!active) return;
      loadSeats(); onReload();
      try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activePool = seatState?.pools.find((x) => x.id === seatState.currentPoolId) ?? null;
  const dismissOffer = () => {
    setOfferDismissed(true);
    try { localStorage.setItem(`sa-seat-offer-${data.chapterId}`, "dismissed"); } catch { /* private mode */ }
  };

  const onSeat = async (memberId: string, assign: boolean) => {
    setSeatBusy(memberId); setSeatErr(null);
    try {
      const r = await assignSeat({ data: { accessToken: token, chapterId: data.chapterId, memberId, assign } });
      if (!r.ok) setSeatErr(r.error ?? "Couldn't change that seat.");
      else onReload();
    } catch { setSeatErr("Couldn't reach the server — try again."); }
    finally { setSeatBusy(null); }
  };

  const onTransfer = async () => {
    setXBusy(true); setXErr(null);
    try {
      const r = await transferChapterOwnership({ data: { accessToken: token, chapterId: data.chapterId, toEmail: xEmail.trim(), toNameRole: xName.trim(), toPhone: xPhone.trim() || undefined } });
      if (r.ok) setXDone(true); else setXErr(r.error ?? "Transfer failed.");
    } catch { setXErr("Couldn't reach the server — try again."); }
    finally { setXBusy(false); }
  };

  const seatSection = (
    <div className="mt-6 grid gap-6">
      {showBuy ? (
        <SeatPurchase
          chapterId={data.chapterId}
          chapterName={data.chapterName}
          courseCode={data.courseCode ?? null}
          accessToken={token}
          onCancel={() => setShowBuy(false)}
          onDone={() => { setShowBuy(false); loadSeats(); }}
        />
      ) : null}

      {/* THE OFFER — only while there is nothing active, and only until it is dismissed. Dismissing
          leaves the chapter on the free tier; "Add seats" in the paid block brings it back. */}
      {!showBuy && !activePool && !offerDismissed && (
        <SeatOfferBlock onChoose={() => setShowBuy(true)} onShareKit={() => setShowKit(true)} onDismiss={dismissOffer} />
      )}

      {/* Reachable again after a dismiss — the offer is never gone, just quiet. */}
      {!showBuy && !activePool && offerDismissed && (
        <button type="button" onClick={() => setShowBuy(true)} className="self-start rounded-xl px-4 text-[14px] font-black" style={{ minHeight: 44, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>
          Cover your members — choose seats →
        </button>
      )}

      {seatState && seatState.pools.length > 0 && (
        <SeatDashboard state={seatState} accessToken={token} onBuyMore={() => setShowBuy(true)} onReload={loadSeats} />
      )}

      {showKit && seatState && (
        <ChapterShareKit
          chapterId={data.chapterId}
          chapterName={data.chapterName}
          courseCode={data.courseCode ?? null}
          chapterUrl={full ? `https://${full}` : null}
          onClose={() => setShowKit(false)}
        />
      )}
    </div>
  );

  const toggleDigest = async () => { const next = !data.digestEnabled; onDigest(next); await setChapterDigest({ data: { accessToken: token, enabled: next } }); };
  const buySeats = `sms:${LEE_TEL}?&body=${encodeURIComponent(`${data.chapterName} is interested in semester seats.`)}`;
  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return "—"; } };
  return (
    <div className="mb-16" style={{ fontFamily: BRAND_SANS }}>
      <div className="rounded-2xl p-6" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(252,163,17,0.4)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[20px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{data.chapterName}</h1>
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>{data.schoolName}</p>
            <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(245,239,230,0.14)" }}>
              {full ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "var(--accent)" }}>{full}</span>
                  <button onClick={() => void doCopy()} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-black" style={{ background: copied ? "#3BF5A0" : "var(--accent)", color: "#0B1220" }}>{copied ? "Copied ⚡" : "Copy"}</button>
                </>
              ) : (
                <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Your share link is being set up — text Lee and he&apos;ll finish it in a minute.</span>
              )}
            </div>
          </div>
          {qr && <img src={qr} alt="Chapter link QR" width={130} height={130} className="shrink-0 rounded-lg" style={{ background: "#fff", padding: 6 }} />}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[["Members joined", data.membersJoined], ["Sets completed", data.setsCompleted], ["Active this week", data.activeThisWeek]].map(([label, n]) => (
          <div key={label as string} className="rounded-2xl px-3 py-4 text-center" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
            <div className="text-[24px] font-black" style={{ color: "var(--accent)" }}>{n as number}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{label as string}</div>
          </div>
        ))}
      </div>

      {/* TERM SEATS — the offer, the purchase flow and (once a pool is active) seat management.
          Placed under the aggregate numbers and above the roster, because it is the decision the
          numbers argue for. The free roster below is untouched. */}
      {seatSection}

      <div className="mt-3 overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
          <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>Roster</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{data.roster.length} members</span>
        </div>
        {data.roster.length === 0 && <div className="px-4 py-4 text-center text-[12.5px] italic" style={{ color: "var(--text-muted)" }}>No members yet — share your link.</div>}
        <div className="max-h-72 overflow-y-auto">
          {data.roster.map((m) => (
            <div key={m.id} className="flex items-center gap-2 border-b px-4 py-2 text-[12.5px]" style={{ borderColor: "rgba(245,239,230,0.06)", color: "var(--brand-cream)" }}>
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{fmtDate(m.joinedAt)}</span>
              <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>{m.setsCompleted} sets</span>
              {/* Disabled rather than hidden when no seats remain: hiding it would leave the exec
                  wondering whether the feature exists, and the title says which case this is. */}
              <button
                onClick={() => void onSeat(m.id, !m.hasSeat)}
                disabled={seatBusy === m.id || (!m.hasSeat && seatsLeft <= 0)}
                title={!m.hasSeat && seatsLeft <= 0 ? "No seats left" : m.hasSeat ? "Remove this seat" : "Give this member a seat"}
                className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-black disabled:opacity-35"
                style={m.hasSeat
                  ? { background: "var(--accent)", color: "#0B1220" }
                  : { background: "rgba(245,239,230,0.08)", color: "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.16)" }}
              >
                {m.hasSeat ? "Seat ✓" : "Seat"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <button onClick={toggleDigest} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--brand-cream)" }}>
          <span className="grid h-5 w-9 place-items-center rounded-full px-0.5" style={{ background: data.digestEnabled ? "var(--accent)" : "rgba(245,239,230,0.2)", justifyContent: data.digestEnabled ? "flex-end" : "flex-start", display: "flex" }}><span className="h-4 w-4 rounded-full" style={{ background: "#0B1220" }} /></span>
          Daily digest email {data.digestEnabled ? "on" : "off"}
        </button>
        <a href={buySeats} className="rounded-xl px-4 py-2 text-[13px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>Buy seats</a>
      </div>

      {/* SEATS — the honest state of the account: what was paid for, and what has been handed out.
          Lee sets the total (it is the money step); the exec chooses who gets one. */}
      <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-black" style={{ color: "var(--brand-cream)" }}>
            {data.seatsAssigned} of {data.seatsTotal} seats assigned
          </span>
          <span className="text-[12px]" style={{ color: seatsLeft > 0 ? "var(--accent)" : "var(--text-muted)" }}>
            {data.seatsTotal === 0 ? "— none bought yet" : seatsLeft > 0 ? `${seatsLeft} left` : "all assigned"}
          </span>
        </div>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {data.seatsTotal === 0
            ? "Seats unlock every exam for a member, all semester. Text Lee to buy them."
            : "A seat unlocks every exam for that member, all semester. Toggle it on any row above."}
        </p>
        {seatErr && <p className="mt-1 text-[11.5px]" style={{ color: "#F3C6CC" }}>{seatErr}</p>}
      </div>

      {/* SHARE KIT + HANDOFF — exec-lifecycle tools; neither belongs on a student surface. */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        {data.kitPath
          ? <a href={data.kitPath} className="rounded-xl px-3 py-2 text-[12.5px] font-black" style={{ background: "rgba(245,239,230,0.08)", color: "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.16)" }}>Flyer &amp; slide kit →</a>
          : <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Share kit unavailable until your link is set up.</span>}
        <button onClick={() => setXferOpen((v) => !v)} className="text-[12.5px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
          Handing over to the next exec?
        </button>
      </div>

      {xferOpen && (
        <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(252,163,17,0.35)" }}>
          {/* Said plainly because it is irreversible from this side: afterwards the page is theirs. */}
          <p className="text-[12.5px] font-bold" style={{ color: "var(--brand-cream)" }}>Transfer this chapter</p>
          <p className="mb-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>They&apos;ll sign in with their own email. You&apos;ll lose access.</p>
          <input value={xEmail} onChange={(e) => setXEmail(e.target.value)} type="email" placeholder="their@school.edu" className="mb-2 w-full rounded-lg px-3 text-[13.5px] outline-none" style={{ minHeight: 42, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
          <input value={xName} onChange={(e) => setXName(e.target.value)} placeholder="Their name and role" className="mb-2 w-full rounded-lg px-3 text-[13.5px] outline-none" style={{ minHeight: 42, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
          <input value={xPhone} onChange={(e) => setXPhone(e.target.value)} inputMode="tel" placeholder="Their mobile (optional)" className="w-full rounded-lg px-3 text-[13.5px] outline-none" style={{ minHeight: 42, background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
          {xErr && <p className="mt-1 text-[11.5px]" style={{ color: "#F3C6CC" }}>{xErr}</p>}
          {xDone
            ? <p className="mt-2 text-[12.5px] font-bold" style={{ color: "#3BF5A0" }}>Done — {xEmail} runs this chapter now.</p>
            : <button onClick={() => void onTransfer()} disabled={xBusy || !xEmail.trim() || xName.trim().length < 2} className="mt-2 w-full rounded-xl text-[14px] font-black disabled:opacity-40" style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}>{xBusy ? "…" : "Transfer chapter"}</button>}
        </div>
      )}

      <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>Semester seats are $100/member (10 min) — text me and I'll set it up.</p>
    </div>
  );
}
