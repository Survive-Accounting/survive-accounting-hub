// THE REP APPLICATION (spec §1–2, 2026-09-06). One component, two doors:
//   /rep/join/<campus>   campus preloaded — name in the copy, that school's course code in the
//                        course question, that school's Greek list in the affiliation picker
//   /rep/join            no campus yet — the searchable picker, then the same page
//
//   FORM → VERIFY PHONE (Twilio OTP) → PENDING ("finish the 15-minute onboarding") → /rep/onboarding
//
// Mobile first: one column, 16px inputs (no iOS zoom), 52px targets, the CTA never above the
// fold of what it submits. Alumni are eligible and the copy says so.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS, Bolt } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { SearchPicker } from "@/components/site/SearchPicker";
import { BetaFeedback } from "@/components/reps/BetaFeedback";
import { ALL_SCHOOLS, boltForSlug } from "@/lib/schools";
import { applyAsRep, checkRepVerification, startRepVerification } from "@/lib/rep-auth.functions";
import { getRepJoinCampus, type JoinCampus } from "@/lib/rep-pre-onboarding.functions";
import { APPLY_COPY, PENDING_COPY, type StudentStatus, type TookCourse } from "@/lib/rep-pre-onboarding";
import { LEVEL_1_ROWS, LEVEL_1_TITLE, CHAPTER_BONUS_GATE, DURATION_RULE } from "@/lib/rep-copy";
import { formatUsPhoneInput } from "@/lib/rep-shared";
import { nbspCode } from "@/lib/course-code";
import { parseTestParams, readTestSession } from "@/lib/test-mode";

export const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 50, borderRadius: 12, padding: "0 14px",
  background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)",
  color: "var(--brand-cream)", fontSize: 16, outline: "none",
};
export const AREA: React.CSSProperties = { ...FIELD, minHeight: 96, padding: "12px 14px", lineHeight: 1.4, resize: "vertical" };
export const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary, #AAB4C8)", marginBottom: 6 };
export const CTA: React.CSSProperties = { minHeight: 52, background: "var(--accent)", color: "#0B1220" };
export const CHIP = (on: boolean): React.CSSProperties => ({
  minHeight: 44, borderRadius: 12, padding: "0 14px", fontSize: 14, fontWeight: 800, cursor: "pointer",
  background: on ? "rgba(252,163,17,0.16)" : "var(--bg-input, rgba(0,0,0,0.22))",
  border: `1px solid ${on ? "var(--accent)" : "var(--border-default)"}`, color: on ? "var(--accent)" : "var(--brand-cream)",
});

export function RepShell({ children }: { children: React.ReactNode }) {
  useNavyDocument();
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      <SiteHeader />
      {/* Longhand side padding — the shorthand would override the class's padding-bottom (the
          old footer-collision bug). */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", paddingLeft: 20, paddingRight: 20, width: "100%" }} className="pb-24 sm:pb-32">
        {children}
      </main>
      <Footer />
    </div>
  );
}

type Stage = "form" | "verify" | "pending" | "existing" | "closed";

export function RepApply({ campusKey }: { campusKey: string | null }) {
  const nav = useNavigate();
  const [campusPick, setCampusPick] = useState<string | null>(campusKey);
  const [campus, setCampus] = useState<JoinCampus | null>(null);
  const [campusErr, setCampusErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentStatus, setStudentStatus] = useState<StudentStatus | null>(null);
  const [major, setMajor] = useState("");
  const [tookCourse, setTookCourse] = useState<TookCourse | null>(null);
  const [greekChapterId, setGreekChapterId] = useState<string | null>(null);
  const [greekNone, setGreekNone] = useState(false);
  const [greekText, setGreekText] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [code, setCode] = useState("");
  const [testHint, setTestHint] = useState(false);
  const [resent, setResent] = useState(false);

  const isTest = useMemo(() => typeof window !== "undefined" && (!!readTestSession() || !!parseTestParams(window.location.search)), []);

  // The campus loads the moment we know it — from the URL or the picker — and everything
  // campus-specific (course code, Greek list, name in the copy) fills in.
  useEffect(() => {
    if (!campusPick) { setCampus(null); return; }
    let live = true;
    setCampusErr(null);
    void getRepJoinCampus({ data: { campus: campusPick } })
      .then((c) => { if (!live) return; if (c) setCampus(c); else setCampusErr("That campus isn't on the list yet — pick it below."); })
      .catch(() => live && setCampusErr("Couldn't load that campus — try again."));
    return () => { live = false; };
  }, [campusPick]);

  const campusName = campus?.name ?? "your campus";
  const course = campus?.courseCode ? nbspCode(campus.courseCode) : "the intro accounting course";
  const greekOk = greekNone ? true : !!greekChapterId;
  const ok = !!campus && name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 10
    && !!studentStatus && major.trim().length > 1 && !!tookCourse && greekOk && why.trim().length >= 12;

  const sendCode = async (): Promise<boolean> => {
    const r = await startRepVerification({ data: { phone: phone.trim() } });
    if (r.ok) { setTestHint(!!r.testHint); return true; }
    setErr(r.error ?? "Couldn't send the code — try again in a minute.");
    return false;
  };

  const submit = async () => {
    if (!ok || busy || !campus) return;
    setBusy(true); setErr(null);
    try {
      const greek = greekNone ? (greekText.trim() || "Not in a chapter") : (campus.chapters.find((c) => c.id === greekChapterId)?.name ?? "");
      const r = await applyAsRep({ data: {
        name: name.trim(), email: email.trim(), phone: phone.trim(), campusSlug: campus.slug, isTest,
        studentStatus: studentStatus!, major: major.trim(), tookCourse: tookCourse!, greekChapterId: greekNone ? null : greekChapterId, greek, why: why.trim(),
      } });
      if (!r.ok) { setErr(r.error ?? "Couldn't send your application — try again."); return; }
      if (r.state === "existing_active") { setStage("existing"); return; }
      if (r.state === "campus_closed") { setStage("closed"); return; }
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
      setStage("pending");
    } catch { setErr("Couldn't reach the server — try again in a moment."); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setResent(false);
    try { if (await sendCode()) setResent(true); } finally { setBusy(false); }
  };

  const beta = campus?.beta !== false;
  const radio = <T extends string>(value: T | null, set: (v: T) => void, opts: Array<{ v: T; label: string }>) => (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => <button key={o.v} type="button" onClick={() => set(o.v)} aria-pressed={value === o.v} style={CHIP(value === o.v)}>{o.label}</button>)}
    </div>
  );

  return (
    <RepShell>
      {stage === "closed" && (
        <section className="pt-16 text-center" style={{ fontFamily: BRAND_SANS }}>
          <h1 className="text-[26px] font-black leading-[1.1]" style={{ color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY }}>{campusName} already has its two reps.</h1>
          <p className="mx-auto mt-2 max-w-[40ch] text-[14px]" style={{ color: "var(--text-muted)" }}>Maximum of two per campus so nobody's stepping on each other. Spots open up — text Lee and he'll keep you in mind.</p>
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
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={8} autoFocus
              className="sa-field" style={{ ...FIELD, textAlign: "center", letterSpacing: "0.35em", fontWeight: 800 }} onKeyDown={(e) => e.key === "Enter" && void verify()} />
            <button type="button" onClick={() => void verify()} disabled={busy || code.trim().length < 4} aria-busy={busy} className="w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={CTA}>
              {busy ? "Checking…" : "Verify"}
            </button>
            {err && <p className="text-center text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
            <div className="flex items-center justify-center gap-5 text-[12.5px] font-bold" style={{ color: "var(--text-muted)" }}>
              <button type="button" onClick={() => void resend()} disabled={busy} className="underline underline-offset-4 disabled:opacity-40">Resend code</button>
              <button type="button" onClick={() => { setStage("form"); setCode(""); setErr(null); setResent(false); }} className="underline underline-offset-4">Change number</button>
            </div>
          </div>
          {beta && <BetaFeedback screen="Verify phone" who={name} isTest={isTest} />}
        </section>
      )}

      {stage === "pending" && (
        <section className="mx-auto max-w-sm pt-14" style={{ fontFamily: BRAND_SANS }}>
          <p className="text-center text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>Application received</p>
          <h1 className="mt-2 text-center text-[26px] font-black leading-[1.1]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{PENDING_COPY.title}</h1>
          <p className="mt-3 text-center text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{PENDING_COPY.body}</p>
          <button type="button" onClick={() => void nav({ to: "/rep/onboarding" })} className="mt-6 w-full rounded-xl text-[15px] font-black" style={CTA}>{PENDING_COPY.cta} →</button>
          <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Six short steps, each with a response. Progress saves — leave and come back any time from /rep/onboarding.</p>
          {beta && <BetaFeedback screen="Pending" who={name} isTest={isTest} />}
        </section>
      )}

      {stage === "form" && (
        <>
          <section className="pt-10 sm:pt-14" style={{ fontFamily: BRAND_SANS }}>
            <p className="text-center text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>{APPLY_COPY.eyebrow}</p>
            <h1 className="mt-3 text-center text-[30px] font-black leading-[1.08] sm:text-[38px]" style={{ color: "var(--brand-cream)", letterSpacing: "-0.015em", fontFamily: BRAND_DISPLAY }}>
              {APPLY_COPY.headline(campusName)}
            </h1>
            <p className="mx-auto mt-4 max-w-[46ch] text-center text-[15px] leading-snug" style={{ color: "var(--brand-cream)" }}>{APPLY_COPY.sub}</p>
            <p className="mx-auto mt-4 max-w-[46ch] rounded-xl px-4 py-3 text-[13.5px] leading-relaxed" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-muted)" }}>
              {APPLY_COPY.bar(campusName)}
            </p>
            <div className="mx-auto mt-4 max-w-[46ch] rounded-xl px-4 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              <p className="text-[11.5px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.12em" }}>{LEVEL_1_TITLE}</p>
              <div className="mt-1.5 grid gap-1">
                {LEVEL_1_ROWS.map((r) => (
                  <div key={r.what} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span style={{ color: "var(--brand-cream)" }}>{r.what}</span>
                    <b className="shrink-0" style={{ color: "var(--accent)" }}>{r.amount}</b>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{CHAPTER_BONUS_GATE} {DURATION_RULE}</p>
            </div>
          </section>

          <div className="mt-6 rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
            {isTest && <p className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3" }}>Test Mode — this creates a test rep, excluded from real totals.</p>}
            <div className="grid gap-4">
              <div>
                <label style={LABEL}>Your campus</label>
                {campusKey && campus ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl px-3" style={{ ...FIELD, display: "flex" }}>
                    <span className="flex items-center gap-2 font-bold"><span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(campus.slug)} /></span>{campus.name}</span>
                    <button type="button" onClick={() => setCampusPick(null)} className="text-[12.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Not your school?</button>
                  </div>
                ) : (
                  <SearchPicker
                    items={ALL_SCHOOLS.map((s) => ({ value: s.slug, label: s.name, aliases: s.aliases, icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span> }))}
                    value={campus?.slug ?? null} placeholder="Pick your campus" searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`} onPick={(v) => setCampusPick(v)}
                  />
                )}
                {campusErr && <p className="mt-1 text-[12px]" style={{ color: "#F3C6CC" }}>{campusErr}</p>}
              </div>
              <div><label style={LABEL} htmlFor="rj-name">Your name</label><input id="rj-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jordan Ellis" className="sa-field" style={FIELD} /></div>
              <div><label style={LABEL} htmlFor="rj-email">Your email</label><input id="rj-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" className="sa-field" style={FIELD} /></div>
              <div>
                <label style={LABEL} htmlFor="rj-phone">Your phone</label>
                <input id="rj-phone" value={phone} onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" className="sa-field" style={FIELD} />
                <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>We'll text you a code to verify your number. This is also how you'll sign in.</p>
              </div>
              <div>
                <label style={LABEL}>Current student or alumni?</label>
                {radio<StudentStatus>(studentStatus, setStudentStatus, [{ v: "student", label: "Current student" }, { v: "alumni", label: "Alumni" }])}
                <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>{APPLY_COPY.alumni}</p>
              </div>
              <div>
                <label style={LABEL}>Greek affiliation at {campusName}</label>
                {campus && campus.chapters.length > 0 ? (
                  <select value={greekNone ? "__none" : (greekChapterId ?? "")} onChange={(e) => { const v = e.target.value; if (v === "__none") { setGreekNone(true); setGreekChapterId(null); } else { setGreekNone(false); setGreekChapterId(v || null); } }}
                    className="sa-field" style={{ ...FIELD, appearance: "auto" }}>
                    <option value="">Pick your chapter…</option>
                    {campus.chapters.map((c) => <option key={c.id} value={c.id}>{c.letters ? `${c.letters} · ` : ""}{c.name}{c.council ? ` (${c.council === "ifc" ? "IFC" : c.council === "panhellenic" ? "Panhellenic" : c.council})` : ""}</option>)}
                    <option value="__none">Not in a chapter (but connected)</option>
                  </select>
                ) : (
                  <button type="button" onClick={() => { setGreekNone(true); setGreekChapterId(null); }} style={CHIP(greekNone)}>Not in a chapter (but connected)</button>
                )}
                {greekNone && <input value={greekText} onChange={(e) => setGreekText(e.target.value)} placeholder="How you're connected — roommate's chapter, business frat, council…" className="sa-field mt-2" style={FIELD} />}
              </div>
              <div><label style={LABEL} htmlFor="rj-major">Major</label><input id="rj-major" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="Accounting, Finance, Marketing…" className="sa-field" style={FIELD} /></div>
              <div>
                <label style={LABEL}>Have you taken {course}?</label>
                {radio<TookCourse>(tookCourse, setTookCourse, [{ v: "taken", label: "Yes" }, { v: "taking_now", label: "Taking it now" }, { v: "not_yet", label: "Not yet" }])}
              </div>
              <div>
                <label style={LABEL} htmlFor="rj-why">Why do you want to do this?</label>
                <textarea id="rj-why" value={why} onChange={(e) => setWhy(e.target.value)} rows={3} placeholder="A few honest sentences. Lee reads every one." className="sa-field" style={AREA} />
              </div>
            </div>
            {err && <p className="mt-3 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
            <button onClick={() => void submit()} disabled={!ok || busy} aria-busy={busy} className="mt-4 w-full rounded-xl text-[15px] font-black transition-opacity disabled:opacity-40" style={CTA}>
              {busy ? "One sec…" : "Apply — then verify your phone"}
            </button>
            <p className="mt-2 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              Already a rep? <a href="/rep/dashboard" className="font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>Sign in →</a>
            </p>
          </div>
          {beta && <BetaFeedback screen="Apply" who={name} isTest={isTest} />}
        </>
      )}
    </RepShell>
  );
}
