// /rep/dashboard — the campus rep's operating workspace (V1).
//
// AUTH: an HttpOnly session cookie set after a phone OTP (Twilio Verify). No token in the URL for
// real reps any more — the legacy ?k= is honoured ONLY for test reps so the local test loop keeps
// working, and it never appears in normal navigation.
//
// The route is a small state machine: no session → phone sign-in · applied → "pending approval" ·
// approved → same OTP acts as first-time verification · active → the workspace.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { RepWorkspaceView } from "@/components/reps/RepWorkspaceView";
import { RepOnboarding } from "@/components/reps/RepOnboarding";
import { checkRepVerification, repLogout, startRepVerification } from "@/lib/rep-auth.functions";
import { getRepWorkspace } from "@/lib/rep-workspace.functions";
import { formatUsPhoneInput, type RepWorkspace } from "@/lib/rep-shared";

export const Route = createFileRoute("/rep_/dashboard")({
  validateSearch: (s: Record<string, unknown>): { k?: string } => ({
    k: typeof s.k === "string" ? s.k : undefined,   // legacy test-rep token only
  }),
  head: () => ({ meta: [{ title: "Your rep dashboard — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: RepDashboardPage,
});

type State =
  | { s: "loading" }
  | { s: "signin"; note?: string }
  | { s: "pending"; note: string }
  | { s: "paused"; note: string }
  | { s: "ready"; d: RepWorkspace };

function RepDashboardPage() {
  useNavyDocument();
  const { k } = Route.useSearch();
  const [st, setSt] = useState<State>({ s: "loading" });

  const load = useCallback(() => {
    void getRepWorkspace({ data: { legacyToken: k ?? null } })
      .then((r) => {
        if (r.ok) setSt({ s: "ready", d: r });
        else if (r.state === "pending") setSt({ s: "pending", note: r.error });
        else if (r.state === "paused") setSt({ s: "paused", note: r.error });
        else setSt({ s: "signin" });
      })
      .catch(() => setSt({ s: "signin", note: "Couldn't reach the server — try again." }));
  }, [k]);
  useEffect(load, [load]);

  const logout = () => { void repLogout().then(() => setSt({ s: "signin" })); };

  const wrap: React.CSSProperties = { ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" };

  return (
    <div style={wrap}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      {/* Longhand side padding — the `padding` shorthand would override the class's pb (the old
          footer-collision bug); pb-20/sm:pb-28 keeps the workspace clear of the footer. */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", paddingLeft: 20, paddingRight: 20, width: "100%" }} className="pb-20 sm:pb-28">
        {st.s === "loading" && <p className="pt-16 text-center text-[14px]" style={{ color: "var(--text-muted)", fontFamily: BRAND_SANS }}>Loading your dashboard…</p>}
        {st.s === "signin" && <SignIn note={st.note} onDone={load} />}
        {(st.s === "pending" || st.s === "paused") && (
          <div className="mx-auto max-w-sm pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
            <h1 className="text-[20px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>{st.s === "pending" ? "Almost there." : "Account paused."}</h1>
            <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>{st.note}</p>
            {st.s === "pending" && <button type="button" onClick={load} className="mt-4 rounded-xl px-4 text-[13.5px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Check again</button>}
          </div>
        )}
        {st.s === "ready" && st.d.applicationStatus === "setup" && (
          <RepOnboarding legacyToken={k ?? null} onSubmitted={load} />
        )}
        {st.s === "ready" && st.d.applicationStatus === "submitted" && (
          <div className="mx-auto max-w-sm pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
            <p className="text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.14em" }}>In review</p>
            <h1 className="mt-2 text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Coverage map in ⚡ Lee will call you.</h1>
            <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>Every rep gets a quick call before chapters turn on — usually within a couple days. Your dashboard opens the moment you're approved.</p>
            <button type="button" onClick={load} className="mt-4 rounded-xl px-4 text-[13.5px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Check again</button>
            <p className="mt-4 text-[12px]" style={{ color: "var(--text-muted)" }}>Need to fix something? <button type="button" onClick={logout} className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>Sign out</button> and back in, or text Lee.</p>
          </div>
        )}
        {st.s === "ready" && (st.d.applicationStatus === "waitlisted" || st.d.applicationStatus === "declined") && (
          <div className="mx-auto max-w-sm pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
            <h1 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>
              {st.d.applicationStatus === "waitlisted" ? "You're on the waitlist." : "This one didn't work out."}
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>
              {st.d.applicationStatus === "waitlisted"
                ? "Your campus has rep coverage right now. Lee keeps this list — you'll hear from him the moment a spot opens."
                : "Thanks for applying. Text Lee if you think that's a mistake — and Exam 1 is free for you either way."}
            </p>
            <a href="sms:+16625658818" className="mt-4 inline-flex items-center rounded-xl px-4 text-[13.5px] font-black" style={{ minHeight: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>Text Lee</a>
          </div>
        )}
        {st.s === "ready" && st.d.applicationStatus === "approved" && (
          <RepWorkspaceView d={st.d} legacyToken={k ?? null} reload={load} onLogout={logout} />
        )}
      </main>
      <Footer />
    </div>
  );
}

// ── phone → OTP sign-in (SELF-VERIFY: the same OTP is also first-time activation) ────────────
function SignIn({ note, onDone }: { note?: string; onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [testHint, setTestHint] = useState(false);
  const [err, setErr] = useState<string | null>(note ?? null);

  const FIELD: React.CSSProperties = {
    width: "100%", minHeight: 50, borderRadius: 12, padding: "0 14px",
    background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)",
    color: "var(--brand-cream)", fontSize: 16, outline: "none", textAlign: "center",
  };

  const start = () => {
    if (busy || phone.replace(/\D/g, "").length < 10) return;
    setBusy(true); setErr(null);
    void startRepVerification({ data: { phone: phone.trim() } })
      .then((r) => { if (r.ok) { setStage("code"); setTestHint(!!r.testHint); } else setErr(r.error ?? "Couldn't send the code."); })
      .catch(() => setErr("Couldn't reach the server."))
      .finally(() => setBusy(false));
  };
  const check = () => {
    if (busy || code.trim().length < 4) return;
    setBusy(true); setErr(null);
    void checkRepVerification({ data: { phone: phone.trim(), code: code.trim() } })
      .then((r) => {
        if (!r.ok) { setErr(r.error ?? "That code didn't match."); return; }
        onDone();
      })
      .catch(() => setErr("Couldn't reach the server."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mx-auto max-w-sm pt-14" style={{ fontFamily: BRAND_SANS }}>
      <h1 className="text-center text-[24px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Rep sign-in</h1>
      <p className="mt-1.5 text-center text-[13.5px]" style={{ color: "var(--text-muted)" }}>
        {stage === "phone" ? "Enter your phone number — we'll text you a code." : `Enter the code we texted ${phone.trim()}.`}
      </p>
      <div className="mt-5 grid gap-3">
        {stage === "phone" ? (
          <>
            <input value={phone} onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" className="sa-field" style={FIELD} onKeyDown={(e) => e.key === "Enter" && start()} />
            <button type="button" onClick={start} disabled={busy || phone.replace(/\D/g, "").length < 10} className="w-full rounded-xl text-[15px] font-black disabled:opacity-40" style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}>{busy ? "Sending…" : "Text me a code"}</button>
          </>
        ) : (
          <>
            {testHint && <p className="rounded-lg px-3 py-2 text-center text-[12.5px] font-bold" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3" }}>Test rep — use code 000000.</p>}
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={8} className="sa-field" style={{ ...FIELD, letterSpacing: "0.35em", fontWeight: 800 }} onKeyDown={(e) => e.key === "Enter" && check()} />
            <button type="button" onClick={check} disabled={busy || code.trim().length < 4} className="w-full rounded-xl text-[15px] font-black disabled:opacity-40" style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}>{busy ? "Checking…" : "Open my dashboard"}</button>
            <button type="button" onClick={() => { setStage("phone"); setCode(""); }} className="text-[12.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Different number</button>
          </>
        )}
        {err && <p className="text-center text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
        <p className="text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Not a rep yet? <a href="/rep/join" className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>Get started</a> — takes 30 seconds.</p>
      </div>
    </div>
  );
}
