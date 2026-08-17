// /chapters/dashboard — magic-link (Supabase OTP) chapter dashboard. One screen: link + QR + copy,
// three coarse numbers, roster, a "Buy seats" text-to-Lee action (no checkout), and a digest toggle.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { FitWordmark, SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { getChapterDashboard, setChapterDigest, type ChapterDashboard } from "@/lib/greek-chapters.functions";

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

  useEffect(() => {
    if (!token) { setData(token === null && checked ? null : undefined); return; }
    let active = true;
    setData(undefined);
    void getChapterDashboard({ data: { accessToken: token } }).then((d) => { if (active) setData(d); }).catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [token, checked]);

  const wrap = { ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative" as const, overflowX: "hidden" as const };

  // DASHBOARD-BRIDGE: never claim "sent" without checking — surface invalid emails, failures,
  // and a busy state instead of unconditionally flipping to the success screen.
  const sendLink = async () => {
    if (sendBusy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail.trim())) { setSendErr("That email doesn't look right — check it and try again."); return; }
    setSendBusy(true); setSendErr(null);
    try {
      const redirect = typeof window !== "undefined" ? `${window.location.origin}/chapters/dashboard` : undefined;
      const { error } = await supabase.auth.signInWithOtp({ email: loginEmail.trim(), options: { emailRedirectTo: redirect } });
      if (error) setSendErr(error.message.includes("rate") ? "Too many requests — wait a minute and try again." : "Couldn't send the link — try again in a moment.");
      else setSent(true);
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
                <p className="mt-3 text-[14px]" style={{ color: "var(--brand-cream)" }}>Check your email — I sent a sign-in link to {loginEmail}.</p>
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
          <Dashboard data={data} token={token} onDigest={(v) => setData({ ...data, digestEnabled: v })} />
        )}
      </main>
    </div>
  );
}

function Dashboard({ data, token, onDigest }: { data: ChapterDashboard; token: string; onDigest: (v: boolean) => void }) {
  // data.url is /go/<school>/<chapter>, or null when this chapter has no roster row behind it yet.
  // Null shows a plain "link pending" line instead of a copyable URL: half a link in a Copy button
  // is worse than none, and the fallback that USED to fill this gap was a /c/ link, which is
  // exactly what Phase 1 retired.
  const full = data.url ? `${ORIGIN}${data.url}` : null;
  const [copied, setCopied] = useState(false);
  const doCopy = async () => { if (!full) return; try { await navigator.clipboard.writeText(`https://${full}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* long-press fallback */ } };
  const qr = full ? `https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=0&data=${encodeURIComponent(`https://${full}`)}` : null;
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

      <div className="mt-3 overflow-hidden rounded-2xl" style={{ background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)" }}>
        <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
          <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>Roster</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{data.roster.length} members</span>
        </div>
        {data.roster.length === 0 && <div className="px-4 py-4 text-center text-[12.5px] italic" style={{ color: "var(--text-muted)" }}>No members yet — share your link.</div>}
        <div className="max-h-72 overflow-y-auto">
          {data.roster.map((m, i) => (
            <div key={i} className="flex items-center justify-between border-b px-4 py-2 text-[12.5px]" style={{ borderColor: "rgba(245,239,230,0.06)", color: "var(--brand-cream)" }}>
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="shrink-0 px-3" style={{ color: "var(--text-muted)" }}>{fmtDate(m.joinedAt)}</span>
              <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>{m.setsCompleted} sets</span>
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
      <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>Semester seats are $100/member (10 min) — text me and I'll set it up.</p>
    </div>
  );
}
