// /rep/join — become a campus rep, SELF-VERIFY flow (no approval, no waitlist):
//
//   FORM (name/email/phone/campus) → VERIFY PHONE (Twilio OTP) → /rep/dashboard
//
// A successful phone verification IS the activation gate — checkRepVerification flips the rep
// active, mints the main campus link and sets the session cookie, so the redirect lands on a
// working dashboard. Venmo is deliberately NOT collected here (friction before anything is
// earned); the dashboard prompts for it before the first payout.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS, Bolt } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { SearchPicker } from "@/components/site/SearchPicker";
import { ALL_SCHOOLS, boltForSlug } from "@/lib/schools";
import { applyAsRep, checkRepVerification, startRepVerification } from "@/lib/rep-auth.functions";
import { formatUsPhoneInput } from "@/lib/rep-shared";
import { parseTestParams, readTestSession } from "@/lib/test-mode";
import { ogMeta } from "@/lib/og";

export const Route = createFileRoute("/rep_/join")({
  head: () => ({ meta: ogMeta({ title: "Become a Survive campus rep.", description: "One job: get free Exam 1 prep into every chapter house on your campus — and earn 10% of the revenue you generate.", path: "/rep/join" }) }),
  component: RepJoin,
});

const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 50, borderRadius: 12, padding: "0 14px",
  background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)",
  color: "var(--brand-cream)", fontSize: 16, outline: "none",
};
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary, #AAB4C8)", marginBottom: 6 };
const CTA: React.CSSProperties = { minHeight: 52, background: "var(--accent)", color: "#0B1220" };

function RepJoin() {
  useNavyDocument();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [campus, setCampus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // form → verify (code entry) → done (navigating) · existing = "you already have an account"
  // · closed = campus already has its rep team (1 by default, 2 max split by council)
  const [stage, setStage] = useState<"form" | "verify" | "existing" | "closed">("form");
  const [code, setCode] = useState("");
  const [testHint, setTestHint] = useState(false);
  const [resent, setResent] = useState(false);

  // Test rep if a test session is active OR the tester URL (?testmode=1) is present — read
  // synchronously so the very first submit is already test-marked (the TestModeBar-effect race).
  const isTest = useMemo(() => typeof window !== "undefined" && (!!readTestSession() || !!parseTestParams(window.location.search)), []);
  const ok = name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 10 && !!campus;

  const sendCode = async (): Promise<boolean> => {
    const r = await startRepVerification({ data: { phone: phone.trim() } });
    if (r.ok) { setTestHint(!!r.testHint); return true; }
    setErr(r.error ?? "Couldn't send the code — try again in a minute.");
    return false;
  };

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await applyAsRep({ data: { name: name.trim(), email: email.trim(), phone: phone.trim(), campusSlug: campus!, isTest } });
      if (!r.ok) { setErr(r.error ?? "Couldn't sign you up — try again."); return; }
      if (r.state === "existing_active") { setStage("existing"); return; }
      if (r.state === "campus_closed") { setStage("closed"); return; }
      // fresh or resumed signup → straight into phone verification
      if (await sendCode()) setStage("verify");
    } catch { setErr("Couldn't reach the server — try again in a moment."); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (busy || code.trim().length < 4) return;
    setBusy(true); setErr(null);
    try {
      const r = await checkRepVerification({ data: { phone: phone.trim(), code: code.trim() } });
      if (!r.ok) { setErr(r.error ?? "That code didn't match — try again."); return; }
      // Verified = active + session set server-side. Straight to the workspace.
      void nav({ to: "/rep/dashboard" });
    } catch { setErr("Couldn't reach the server — try again in a moment."); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setResent(false);
    try { if (await sendCode()) setResent(true); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      {/* pb-24/sm:pb-32: deliberate breathing room so the card never sits against the footer.
          Left/right padding is set as LONGHAND — the shorthand `padding` would silently override
          the class's padding-bottom (which is exactly how the old footer collision happened). */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", paddingLeft: 20, paddingRight: 20, width: "100%" }} className="pb-24 sm:pb-32">

        {stage === "closed" && (
          <section className="pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
            <h1 className="text-[26px] font-black leading-[1.1]" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>This campus already has its rep team.</h1>
            <p className="mx-auto mt-2 max-w-[40ch] text-[14px]" style={{ color: "var(--text-muted)" }}>We keep it to one or two reps per campus so nobody's stepping on each other. Spots open up — text Lee and he'll keep you in mind.</p>
            <a href="sms:+16625658818" className="mt-5 inline-flex items-center rounded-xl px-6 text-[15px] font-black" style={CTA}>Text Lee</a>
          </section>
        )}

        {stage === "existing" && (
          <section className="pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
            <h1 className="text-[26px] font-black leading-[1.1]" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>Looks like you already have a rep account.</h1>
            <p className="mx-auto mt-2 max-w-[38ch] text-[14px]" style={{ color: "var(--text-muted)" }}>Sign in with your phone — we'll text you a code.</p>
            <a href="/rep/dashboard" className="mt-5 inline-flex items-center rounded-xl px-6 text-[15px] font-black" style={CTA}>Sign in →</a>
          </section>
        )}

        {stage === "verify" && (
          <section className="mx-auto max-w-sm pt-14" style={{ fontFamily: BRAND_SANS }}>
            <h1 className="text-center text-[24px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Verify your number</h1>
            <p className="mt-1.5 text-center text-[13.5px]" style={{ color: "var(--text-muted)" }}>We sent a code to <b style={{ color: "var(--brand-cream)" }}>{formatUsPhoneInput(phone) || phone}</b></p>
            {testHint && <p className="mt-3 rounded-lg px-3 py-2 text-center text-[12.5px] font-bold" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3" }}>Test rep — use code 000000.</p>}
            {resent && <p className="mt-3 rounded-lg px-3 py-2 text-center text-[12.5px] font-bold" style={{ background: "rgba(52,168,83,0.14)", color: "#8BE28B" }}>New code sent ⚡</p>}
            <div className="mt-4 grid gap-3">
              <input
                value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
                placeholder="6-digit code" maxLength={8} autoFocus
                className="sa-field" style={{ ...FIELD, textAlign: "center", letterSpacing: "0.35em", fontWeight: 800 }}
                onKeyDown={(e) => e.key === "Enter" && void verify()}
              />
              <button type="button" onClick={() => void verify()} disabled={busy || code.trim().length < 4} aria-busy={busy} className="w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={CTA}>
                {busy ? "Checking…" : "Verify & open my dashboard"}
              </button>
              {err && <p className="text-center text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
              <div className="flex items-center justify-center gap-5 text-[12.5px] font-bold" style={{ color: "var(--text-muted)" }}>
                <button type="button" onClick={() => void resend()} disabled={busy} className="underline underline-offset-4 disabled:opacity-40">Resend code</button>
                <button type="button" onClick={() => { setStage("form"); setCode(""); setErr(null); setResent(false); }} className="underline underline-offset-4">Change number</button>
              </div>
            </div>
          </section>
        )}

        {stage === "form" && (
        <>
        <section className="pt-10 sm:pt-14">
          <p className="text-center text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em", fontFamily: BRAND_SANS }}>Campus reps</p>
          <h1 className="mt-3 text-center text-[30px] font-black leading-[1.08] sm:text-[38px]" style={{ color: "var(--brand-cream)", letterSpacing: "-0.015em" }}>
            One job: get my free Exam&nbsp;1 prep into every chapter house.
          </h1>
          <ul className="mx-auto mt-5 grid max-w-[46ch] gap-2.5 text-[14.5px] leading-snug" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>
            <li className="flex gap-2.5"><span aria-hidden style={{ color: "var(--accent)" }}>•</span><span>Find the right execs or advisors in each fraternity and sorority.</span></li>
            <li className="flex gap-2.5"><span aria-hidden style={{ color: "var(--accent)" }}>•</span><span>Send them the free Exam 1 kit. Get the flyer in the house.</span></li>
            <li className="flex gap-2.5"><span aria-hidden style={{ color: "var(--accent)" }}>•</span><span>Earn <b style={{ color: "var(--accent)" }}>10%</b> of the revenue you generate — just one chapter can earn you <b style={{ color: "var(--accent)" }}>$300+</b>.</span></li>
          </ul>
          {/* The comp condition, stated plainly at signup — never fine print (comp spec §7). */}
          <p className="mx-auto mt-4 max-w-[46ch] rounded-xl px-4 py-2.5 text-[12.5px] leading-relaxed" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontFamily: BRAND_SANS }}>
            You earn <b style={{ color: "var(--brand-cream)" }}>10% of everything sold through your link, always</b>. On top of that, there's a one-time bonus of up to <b style={{ color: "var(--brand-cream)" }}>$300</b> for getting your campus off the ground — paid when your first chapter signs up. If no chapter signs up, the bonus isn't paid.
          </p>
        </section>

        <div className="mt-8 rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
          {isTest && <p className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3" }}>Test Mode — this creates a test rep, excluded from real totals.</p>}
          <div className="grid gap-3.5">
            <div><label style={LABEL} htmlFor="rj-name">Your name</label><input id="rj-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jordan Ellis" className="sa-field" style={FIELD} /></div>
            <div><label style={LABEL} htmlFor="rj-email">Your email</label><input id="rj-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="sa-field" style={FIELD} /></div>
            <div>
              <label style={LABEL} htmlFor="rj-phone">Your phone</label>
              <input id="rj-phone" value={phone} onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" className="sa-field" style={FIELD} />
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>We'll text you a code to verify your number. This is also how you'll sign in.</p>
            </div>
            <div>
              <label style={LABEL}>Your campus</label>
              <SearchPicker
                items={ALL_SCHOOLS.map((s) => ({ value: s.slug, label: s.name, aliases: s.aliases, icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span> }))}
                value={campus} placeholder="Pick your campus" searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`} onPick={setCampus}
              />
            </div>
          </div>
          {err && <p className="mt-3 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
          <button onClick={() => void submit()} disabled={!ok || busy} aria-busy={busy} className="mt-4 w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={CTA}>
            {busy ? "One sec…" : "Get started — takes 30 seconds"}
          </button>
          <p className="mt-2 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            Already a rep? <a href="/rep/dashboard" className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>Sign in →</a>
          </p>
        </div>
        </>
        )}
      </main>
      <Footer />
    </div>
  );
}
