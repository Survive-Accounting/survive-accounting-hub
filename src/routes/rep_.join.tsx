// /rep/join — become a tracked Survive rep. Public, no auth: fill four fields, get a shareable link
// and a dashboard on the same click. This is the top of the outreach funnel, so it is deliberately
// short — the reward (your link + dashboard) is one submit away.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS, Bolt } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { SearchPicker } from "@/components/site/SearchPicker";
import { ALL_SCHOOLS, boltForSlug } from "@/lib/schools";
import { signUpRep, exampleEarn } from "@/lib/rep-portal.functions";
import { formatCents } from "@/lib/referral-shared";
import { parseTestParams, readTestSession } from "@/lib/test-mode";
import { ogMeta } from "@/lib/og";

export const Route = createFileRoute("/rep_/join")({
  head: () => ({ meta: ogMeta({ title: "Get paid to share Survive Accounting at your school.", description: "Become a campus rep: share your link, and earn on every exam prep your friends buy through it.", path: "/rep/join" }) }),
  component: RepJoin,
});

const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 50, borderRadius: 12, padding: "0 14px",
  background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)",
  color: "var(--brand-cream)", fontSize: 16, outline: "none",
};
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary, #AAB4C8)", marginBottom: 6 };

function RepJoin() {
  useNavyDocument();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [campus, setCampus] = useState<string | null>(null);
  const [venmo, setVenmo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Test rep if a test session is active OR the tester URL (?testmode=1) is present. Reading the URL
  // directly avoids a race: TestModeBar writes the session in an effect that may not have run before
  // this first render, but the ?testmode=1 param is available synchronously.
  const isTest = useMemo(() => typeof window !== "undefined" && (!!readTestSession() || !!parseTestParams(window.location.search)), []);
  const ok = name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && !!campus;
  const earn = formatCents(exampleEarn(5000)); // 10% of a $50 exam

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await signUpRep({ data: { name: name.trim(), email: email.trim(), campusSlug: campus!, venmo: venmo.trim() || null, isTest } });
      if (r.ok && r.token) void nav({ to: "/rep/dashboard", search: { k: r.token, welcome: 1 } });
      else { setErr(r.error ?? "Couldn't create your account — try again."); setBusy(false); }
    } catch { setErr("Couldn't reach the server — try again in a moment."); setBusy(false); }
  };

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "0 20px", width: "100%" }} className="pb-16">
        <section className="pt-10 text-center sm:pt-14">
          <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em", fontFamily: BRAND_SANS }}>Campus reps</p>
          <h1 className="mt-3 text-[30px] font-black leading-[1.08] sm:text-[40px]" style={{ color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>Share Survive. Get paid.</h1>
          <p className="mx-auto mt-3 max-w-[42ch] text-[15px] leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>
            Post your link in your group chats. When someone buys exam prep through it, you earn <b style={{ color: "var(--brand-cream)" }}>10%</b> — about <b style={{ color: "var(--accent)" }}>{earn}</b> per exam. Sign up in 20 seconds and start sharing.
          </p>
        </section>

        <div className="mt-8 rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
          {isTest && <p className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3" }}>Test Mode — this creates a test rep, excluded from real totals.</p>}
          <div className="grid gap-3.5">
            <div><label style={LABEL} htmlFor="rj-name">Your name</label><input id="rj-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jordan Ellis" className="sa-field" style={FIELD} /></div>
            <div><label style={LABEL} htmlFor="rj-email">Your email</label><input id="rj-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="sa-field" style={FIELD} /></div>
            <div>
              <label style={LABEL}>Your campus</label>
              <SearchPicker
                items={ALL_SCHOOLS.map((s) => ({ value: s.slug, label: s.name, aliases: s.aliases, icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span> }))}
                value={campus} placeholder="Pick your campus" searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`} onPick={setCampus}
              />
            </div>
            <div><label style={LABEL} htmlFor="rj-venmo">Venmo <span style={{ textTransform: "none", opacity: 0.7 }}>— for getting paid (optional now)</span></label><input id="rj-venmo" value={venmo} onChange={(e) => setVenmo(e.target.value)} placeholder="@your-venmo" className="sa-field" style={FIELD} /></div>
          </div>
          {err && <p className="mt-3 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
          <button onClick={() => void submit()} disabled={!ok || busy} aria-busy={busy} className="mt-4 w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}>
            {busy ? "Setting up your link…" : "Get my link →"}
          </button>
          <p className="mt-2 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Payouts by Venmo on the 1st — Oct, Nov, Dec, Jan.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
