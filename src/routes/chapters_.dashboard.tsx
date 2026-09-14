// /chapters/dashboard — THE CHAPTER DASHBOARD (rebuilt minimal, 2026-09-13).
//
// Lee: "make the Greek dashboard really minimal … show them the stats on dashboard at day 0, like
// nothing yet, but give them action steps to get the number growing (send groupme, show slide at
// chapter meeting, print flyer for the house) maybe with checklists for 'Mark done'? … Dashboard
// is just for tracking usage, no nationals or GPA reporting yet." And instead of a text-Lee link,
// a basic "Buy seats" that is a request: pick how many (10 minimum, batches of 10), Lee is pinged,
// the chair is told Lee will reach out. Checkout comes later.
//
// So, top to bottom: the chapter + the members' link · three numbers (joined, this week, minutes
// watched) · the three action steps with Mark done · who joined · request seats. Nothing locked,
// nothing projected, no digest toggle, no per-member activity. Sign-in is unchanged: a magic link
// to the email the chair activated with. Server half: lib/chapter-dashboard.functions.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { authEmailError, authErrorDetail } from "@/lib/auth-errors";
import { readTestSession } from "@/lib/test-mode";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { FitWordmark, SiteHeader } from "@/components/site/SiteHeader";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { getChapterHome, type ChapterHome } from "@/lib/chapter-dashboard.functions";
import { Dashboard, PANEL } from "@/components/site/ChapterDashboard";

export const Route = createFileRoute("/chapters_/dashboard")({
  head: () => ({ meta: [{ title: "Chapter dashboard — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: DashboardPage,
});


function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<ChapterHome | null | undefined>(undefined); // undefined=loading, null=no chapter
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
  // A test run pre-fills the tester's address — the only address its sign-in link can go to.
  useEffect(() => { const t = readTestSession(); if (t?.email) setLoginEmail((v) => v || t.email); }, []);

  useEffect(() => {
    if (!token) { setData(token === null && checked ? null : undefined); return; }
    let active = true;
    setData(undefined);
    void getChapterHome({ data: { accessToken: token } }).then((d) => { if (active) setData(d); }).catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [token, checked]);

  const wrap = { ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative" as const, overflowX: "hidden" as const };

  // Never claim "sent" without checking — invalid emails, failures and a busy state are surfaced.
  const sendLink = async () => {
    if (sendBusy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail.trim())) { setSendErr("That email doesn't look right — check it and try again."); return; }
    setSendBusy(true); setSendErr(null);
    try {
      // Built from THIS origin, so a link requested on localhost returns to localhost (when the
      // origin is on Supabase's redirect allow-list — otherwise GoTrue silently uses SITE_URL).
      const redirect = typeof window !== "undefined" ? `${window.location.origin}/chapters/dashboard` : undefined;
      // In a test run the link goes to the tester, whatever was typed: Supabase Auth mail bypasses
      // our send layer entirely.
      const test = readTestSession();
      const dest = test?.email || loginEmail.trim();
      const { error } = await supabase.auth.signInWithOtp({ email: dest, options: { emailRedirectTo: redirect } });
      if (error) { console.warn("[chapter-dashboard] otp failed:", authErrorDetail(error)); setSendErr(authEmailError(error)); }
      else setSent(true);
    } catch { setSendErr("Couldn't reach the server — check your connection and try again."); }
    finally { setSendBusy(false); }
  };

  return (
    <div style={wrap}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "0 20px" }}>
        <div className="flex flex-col items-center pt-12 pb-6"><FitWordmark size={64} /></div>

        {!token ? (
          <div className="mx-auto max-w-sm p-6" style={{ ...PANEL, fontFamily: BRAND_SANS }}>
            <h1 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Chapter dashboard</h1>
            {sent ? (
              <>
                <p className="mt-3 text-[14px]" style={{ color: "var(--brand-cream)" }}>Check your email — I sent a sign-in link to {readTestSession()?.email || loginEmail}.</p>
                <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>Not there in a minute? Check spam, or <button onClick={() => setSent(false)} className="font-semibold underline" style={{ color: "var(--accent)" }}>resend it</button>.</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>Sign in with the email you used to activate your chapter&apos;s dashboard.</p>
                <input value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); setSendErr(null); }} type="email" placeholder="you@school.edu" className="mt-3 w-full rounded-xl px-4 py-3 text-[14px] outline-none" style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }} />
                {sendErr && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{sendErr}</p>}
                <button onClick={() => void sendLink()} disabled={sendBusy} className="mt-4 w-full rounded-xl py-3 text-[15px] font-black disabled:opacity-50" style={{ background: "var(--accent)", color: "#0B1220" }}>{sendBusy ? "Sending…" : "Email me a sign-in link"}</button>
              </>
            )}
          </div>
        ) : data === undefined ? (
          <p className="text-center text-[13px] italic" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : data === null ? (
          <div className="mx-auto max-w-sm p-6 text-center" style={{ ...PANEL, fontFamily: BRAND_SANS }}>
            <p className="text-[14px]" style={{ color: "var(--brand-cream)" }}>No chapter dashboard is linked to {email} yet.</p>
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Just activated? Lee will text you when it&apos;s live.</p>
            <button onClick={() => void supabase.auth.signOut()} className="mx-auto mt-4 block text-[11.5px] underline" style={{ color: "var(--text-muted)" }}>Sign out</button>
          </div>
        ) : (
          <Dashboard data={data} auth={{ accessToken: token }} onChange={setData} />
        )}
      </main>
    </div>
  );
}

