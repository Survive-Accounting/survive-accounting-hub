// /rep/join — apply to be a campus rep. V1 LIFECYCLE: this creates an APPLICANT
// (referral_partners.rep_status='applied'); Lee approves from /admin/reps/roster; the rep then
// verifies their phone at /rep/dashboard and goes ACTIVE. No more instant self-minted active reps
// — the engine status stays paused until activation, so nothing attributes early.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS, Bolt } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { SearchPicker } from "@/components/site/SearchPicker";
import { ALL_SCHOOLS, boltForSlug } from "@/lib/schools";
import { applyAsRep } from "@/lib/rep-auth.functions";
import { exampleEarn } from "@/lib/rep-portal.functions";
import { formatCents } from "@/lib/referral-shared";
import { parseTestParams, readTestSession } from "@/lib/test-mode";
import { ogMeta } from "@/lib/og";

export const Route = createFileRoute("/rep_/join")({
  head: () => ({ meta: ogMeta({ title: "Become a Survive campus rep.", description: "One simple job: get free Exam 1 prep into every chapter house on your campus — and earn 10% of the revenue you generate.", path: "/rep/join" }) }),
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [campus, setCampus] = useState<string | null>(null);
  const [venmo, setVenmo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Test rep if a test session is active OR the tester URL (?testmode=1) is present — read
  // synchronously so the very first submit is already test-marked (the TestModeBar-effect race).
  const isTest = useMemo(() => typeof window !== "undefined" && (!!readTestSession() || !!parseTestParams(window.location.search)), []);
  const ok = name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 10 && !!campus;
  const earn = formatCents(exampleEarn(5000)); // 10% of a $50 exam

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await applyAsRep({ data: { name: name.trim(), email: email.trim(), phone: phone.trim(), campusSlug: campus!, venmo: venmo.trim() || null, isTest } });
      if (r.ok) setDone(true);
      else { setErr(r.error ?? "Couldn't send your application — try again."); setBusy(false); }
    } catch { setErr("Couldn't reach the server — try again in a moment."); setBusy(false); }
  };

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      <main style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "0 20px", width: "100%" }} className="pb-16">
        {done ? (
          <section className="pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
            <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>Application in ⚡</p>
            <h1 className="mt-3 text-[28px] font-black leading-[1.1]" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>You're on the list.</h1>
            <p className="mx-auto mt-3 max-w-[40ch] text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Lee reviews every application personally. Once you're approved we'll text <b style={{ color: "var(--brand-cream)" }}>{phone.trim()}</b> — you'll verify that number and your dashboard opens.
            </p>
            <a href="/rep/dashboard" className="mt-6 inline-flex items-center rounded-xl px-5 text-[14px] font-black" style={{ minHeight: 48, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Already approved? Sign in →</a>
          </section>
        ) : (
        <>
        <section className="pt-10 text-center sm:pt-14">
          <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em", fontFamily: BRAND_SANS }}>Campus reps</p>
          <h1 className="mt-3 text-[30px] font-black leading-[1.08] sm:text-[40px]" style={{ color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>One job: get Exam 1 into every chapter house.</h1>
          <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>
            Find the right contact in each chapter, send them the free Exam 1 kit, get the flyer up in the house. You earn a flat <b style={{ color: "var(--brand-cream)" }}>10%</b> of the revenue you generate — about <b style={{ color: "var(--accent)" }}>{earn}</b> per exam sold through your links.
          </p>
        </section>

        <div className="mt-8 rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
          {isTest && <p className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3" }}>Test Mode — this creates a test rep, excluded from real totals.</p>}
          <div className="grid gap-3.5">
            <div><label style={LABEL} htmlFor="rj-name">Your name</label><input id="rj-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jordan Ellis" className="sa-field" style={FIELD} /></div>
            <div><label style={LABEL} htmlFor="rj-email">Your email</label><input id="rj-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="sa-field" style={FIELD} /></div>
            <div><label style={LABEL} htmlFor="rj-phone">Your phone <span style={{ textTransform: "none", opacity: 0.7 }}>— we text you when you're approved; it's also your sign-in</span></label><input id="rj-phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" className="sa-field" style={FIELD} /></div>
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
            {busy ? "Sending…" : "Apply — takes 30 seconds"}
          </button>
          <p className="mt-2 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Payouts by Venmo on the 1st — Oct, Nov, Dec, Jan.</p>
        </div>
        </>
        )}
      </main>
      <Footer />
    </div>
  );
}
