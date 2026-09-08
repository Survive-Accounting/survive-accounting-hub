// THE REP APPLICATION (spec §1–2, 2026-09-06; step 1 rebuilt 2026-09-08). One component, two doors:
//   /rep/join/<campus>   campus preloaded — name in the copy, that school's course code in the
//                        course question, that school's Greek list in the affiliation picker
//   /rep/join            no campus yet — the searchable picker, then the same page
//
//   FORM → VERIFY PHONE (Twilio OTP) → PENDING ("finish the 15-minute onboarding") → /rep/onboarding
//
// STEP 1 IS HERO → FORM, NOTHING BETWEEN (Lee, 2026-09-08: "Hero copy ↓ Application form. Very
// little friction."). The two-reps line, the Level 1 pay table and the bonus rules moved out —
// they are step 4 of the onboarding, read by someone who has already applied. Every helper
// sentence that explained a control instead of being one went with them.
//
// THE FORM IS THE PAGE'S MAIN OBJECT: no card around it, no card around each question. Sections
// are separated by rhythm and a hairline, so the eye runs down one column of controls.
//
// VALIDATION SPEAKS ONLY AFTER A PRESS. The CTA is never disabled on incompleteness — a dead
// button that won't say why is the thing this page was losing people to. Continue validates,
// marks the offending fields, scrolls to the first one and focuses it; everything typed stays.
//
// Mobile first: one column, 16px inputs (no iOS zoom), 52px targets, the CTA never above the
// fold of what it submits.
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS, Bolt } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SiteHeader, useNavyDocument } from "@/components/site/SiteHeader";
import { Footer } from "@/components/site/SiteFooter";
import { SearchPicker } from "@/components/site/SearchPicker";
import { BetaFeedback } from "@/components/reps/BetaFeedback";
import { ALL_SCHOOLS, boltForSlug } from "@/lib/schools";
import { applyAsRep, checkRepVerification, startRepVerification } from "@/lib/rep-auth.functions";
import { getRepJoinCampus, type JoinCampus } from "@/lib/rep-pre-onboarding.functions";
import {
  APPLY_COPY, INVOLVEMENT_COPY, PENDING_COPY, campusShorthand,
  type Involvement, type StudentStatus, type TookCourse,
} from "@/lib/rep-pre-onboarding";
import { formatUsPhoneInput } from "@/lib/rep-shared";
import { nbspCode } from "@/lib/course-code";
import { parseTestParams, readTestSession, testerRepPhone } from "@/lib/test-mode";

export const FIELD: React.CSSProperties = {
  width: "100%", minHeight: 52, borderRadius: 12, padding: "0 14px",
  background: "var(--bg-input, rgba(0,0,0,0.22))", border: "1px solid var(--border-default)",
  color: "var(--brand-cream)", fontSize: 16, outline: "none",
};
export const AREA: React.CSSProperties = { ...FIELD, minHeight: 96, padding: "12px 14px", lineHeight: 1.4, resize: "vertical" };
export const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-secondary, #AAB4C8)", marginBottom: 8 };
export const CTA: React.CSSProperties = { minHeight: 54, background: "var(--accent)", color: "#0B1220" };
/** A tappable choice. Selected reads as selected without a legend: filled, ringed, accent text. */
export const CHIP = (on: boolean): React.CSSProperties => ({
  minHeight: 48, borderRadius: 12, padding: "0 16px", fontSize: 15, fontWeight: 800, cursor: "pointer",
  background: on ? "rgba(252,163,17,0.16)" : "var(--bg-input, rgba(0,0,0,0.22))",
  border: `1.5px solid ${on ? "var(--accent)" : "var(--border-default)"}`, color: on ? "var(--accent)" : "var(--brand-cream)",
  boxShadow: on ? "0 0 0 3px rgba(252,163,17,0.14)" : "none",
  transition: "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
});
/** The wide variant, for choices that are a sentence rather than a word. */
const WIDE_CHIP = (on: boolean): React.CSSProperties => ({
  ...CHIP(on), width: "100%", minHeight: 54, textAlign: "left", display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, lineHeight: 1.25, padding: "12px 14px",
});
const ERR_TEXT: React.CSSProperties = { marginTop: 6, fontSize: 12.5, fontWeight: 600, color: "#F3C6CC" };
const RULE: React.CSSProperties = { height: 1, background: "var(--border-default)", opacity: 0.6, border: 0, margin: 0 };

export function RepShell({ children }: { children: React.ReactNode }) {
  useNavyDocument();
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.3} animate /></div>
      {/* THE HOMEPAGE BAR, the same component and the same props the two-door home passes minus
          onLanding (2026-09-08, Lee: "the navbar on /rep/join should match the / homepage navbar
          EXACTLY… find the navbar/header component used by the homepage and reuse that"). Without
          onLanding its anchors point at "/#reviews" — this page has no landing sections of its
          own — which is exactly what homeLinks(base) exists for. */}
      <SiteHeader homeNav />
      {/* Longhand side padding — the shorthand would override the class's padding-bottom (the
          old footer-collision bug). */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", paddingLeft: 20, paddingRight: 20, width: "100%" }} className="pb-24 sm:pb-32">
        {children}
      </main>
      <Footer />
    </div>
  );
}

/** Am I a tester? The session the Test Mode bar writes, or the tester URL itself. Safe on the
 *  server (returns false), where `window` does not exist. */
function detectTestMode(): boolean {
  if (typeof window === "undefined") return false;
  return !!readTestSession() || !!parseTestParams(window.location.search);
}

type Stage = "form" | "verify" | "pending" | "existing" | "closed";
/** Every field Continue can complain about, in the order they appear — the first one wins the
 *  scroll. The id doubles as the focus target. */
const FIELD_ORDER = ["campus", "name", "email", "phone", "studentStatus", "greek", "major", "tookCourse", "involvement"] as const;
type FieldKey = (typeof FIELD_ORDER)[number];
type Errors = Partial<Record<FieldKey, string>>;

export function RepApply({ campusKey }: { campusKey: string | null }) {
  const nav = useNavigate();
  // Test rep if a test session is active OR the tester URL (?testmode=1) is present.
  //
  // STATE, NOT A MOUNT-ONLY MEMO (2026-09-08). This was a `useMemo(…, [])`, which is evaluated
  // once while the page is still server-rendered/hydrating — `window` is undefined there, so a
  // first visit on the tester URL rendered as a REAL application: no Test Mode banner, no tester
  // phone, and a 555 number heading for Twilio. It only appeared to work on the second load,
  // once TestModeBar had written the session. Now the sync read seeds it and an effect re-reads
  // after mount, so the URL alone is enough on the very first paint.
  const [isTest, setIsTest] = useState(detectTestMode);
  const [campusPick, setCampusPick] = useState<string | null>(campusKey);
  const [campus, setCampus] = useState<JoinCampus | null>(null);
  const [campusErr, setCampusErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // A tester's phone is minted for them (a 555 number, kept for the run) — one less thing to invent.
  const [phone, setPhone] = useState(() => (isTest ? formatUsPhoneInput(testerRepPhone()) : ""));
  const [studentStatus, setStudentStatus] = useState<StudentStatus | null>(null);
  const [major, setMajor] = useState("");
  const [tookCourse, setTookCourse] = useState<TookCourse | null>(null);
  const [greekChapterId, setGreekChapterId] = useState<string | null>(null);
  const [greekNone, setGreekNone] = useState(false);
  const [involvement, setInvolvement] = useState<Involvement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [code, setCode] = useState("");
  const [testHint, setTestHint] = useState(false);
  const [resent, setResent] = useState(false);
  // Nothing is marked wrong until Continue has been pressed once; after that the marks follow
  // along live, so fixing a field clears its message as you type.
  const [showErrors, setShowErrors] = useState(false);

  // Hydration settles, the Test Mode bar writes its session: re-read once and mint the tester's
  // phone if the first paint decided this was a real application (see detectTestMode above).
  useEffect(() => {
    if (isTest || !detectTestMode()) return;
    setIsTest(true);
    setPhone((p) => (p.trim() ? p : formatUsPhoneInput(testerRepPhone())));
  }, [isTest]);

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

  // "Ole Miss", "Alabama", "LSU" — the name a student says out loud, for the headline and the
  // first involvement option (campusShorthand keeps a bare-initial short_name out of the copy).
  const campusName = campus ? campusShorthand(campus.name, campus.formalName) : "your campus";
  const course = campus?.courseCode ? nbspCode(campus.courseCode) : "the intro accounting course";
  const hasChapterList = !!campus && campus.chapters.length > 0;

  const errors: Errors = useMemo(() => {
    const e: Errors = {};
    if (!campus) e.campus = "Pick your school.";
    if (name.trim().length < 2) e.name = "Your name, as your chapter would know it.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = "That email doesn't look right.";
    if (phone.replace(/\D/g, "").length < 10) e.phone = "A 10-digit US number.";
    if (!studentStatus) e.studentStatus = "Pick one.";
    if (!greekNone && !greekChapterId) e.greek = hasChapterList ? "Pick your chapter, or Not affiliated." : "Pick one.";
    if (major.trim().length < 2) e.major = "What you study.";
    if (!tookCourse) e.tookCourse = "Pick one.";
    if (!involvement) e.involvement = "Pick one.";
    return e;
  }, [campus, name, email, phone, studentStatus, greekNone, greekChapterId, hasChapterList, major, tookCourse, involvement]);
  const errorFor = (k: FieldKey): string | null => (showErrors ? errors[k] ?? null : null);

  /** Continue with something missing: mark everything, then take them to the first one. */
  const focusFirstError = useCallback((e: Errors) => {
    const first = FIELD_ORDER.find((k) => e[k]);
    if (!first) return;
    const el = document.getElementById(`rj-${first}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // A group's marker is a div; only a real control can take focus, so try and move on.
    window.setTimeout(() => { try { (el as HTMLElement).focus({ preventScroll: true }); } catch { /* not focusable */ } }, 220);
  }, []);

  const sendCode = async (): Promise<boolean> => {
    const r = await startRepVerification({ data: { phone: phone.trim(), isTest } });
    if (r.ok) { setTestHint(!!r.testHint); return true; }
    setErr(r.error ?? "Couldn't send the code — try again in a minute.");
    return false;
  };

  const submit = async () => {
    if (busy) return;
    setShowErrors(true);
    setErr(null);
    if (Object.keys(errors).length > 0 || !campus) { focusFirstError(errors); return; }
    setBusy(true);
    try {
      const greek = greekNone ? "Not affiliated" : (campus.chapters.find((c) => c.id === greekChapterId)?.name ?? "");
      const r = await applyAsRep({ data: {
        name: name.trim(), email: email.trim(), phone: phone.trim(), campusSlug: campus.slug, isTest,
        studentStatus: studentStatus!, major: major.trim(), tookCourse: tookCourse!,
        greekChapterId: greekNone ? null : greekChapterId, greek, involvement: involvement!,
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
  const radio = <T extends string>(group: FieldKey, value: T | null, set: (v: T) => void, opts: Array<{ v: T; label: string }>) => (
    <div className="flex flex-wrap gap-2.5" id={`rj-${group}`} role="radiogroup" aria-invalid={!!errorFor(group)}>
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => set(o.v)} role="radio" aria-checked={value === o.v} style={CHIP(value === o.v)}>{o.label}</button>
      ))}
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
          <p className="mt-2 text-center text-[15.5px] font-bold leading-snug" style={{ color: "var(--brand-cream)" }}>{PENDING_COPY.lead}</p>
          <p className="mt-3 text-center text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{PENDING_COPY.body}</p>
          <p className="mt-3 text-center text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{PENDING_COPY.review}</p>
          <button type="button" onClick={() => void nav({ to: "/rep/onboarding" })} className="mt-6 w-full rounded-xl text-[15px] font-black" style={CTA}>{PENDING_COPY.cta} →</button>
          <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>{PENDING_COPY.note}</p>
          {beta && <BetaFeedback screen="Pending" who={name} isTest={isTest} />}
        </section>
      )}

      {stage === "form" && (
        <>
          <section className="pt-10 sm:pt-14" style={{ fontFamily: BRAND_SANS }}>
            <p className="text-center text-[12px] font-black uppercase" style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>{APPLY_COPY.eyebrow}</p>
            <h1 className="mt-3 text-center text-[30px] font-black leading-[1.08] sm:text-[38px]" style={{ color: "var(--brand-cream)", letterSpacing: "-0.015em", fontFamily: BRAND_DISPLAY, textWrap: "balance" }}>
              {APPLY_COPY.headline(campusName)}
            </h1>
            <p className="mx-auto mt-4 max-w-[40ch] text-center text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{APPLY_COPY.sub}</p>
          </section>

          {/* THE FORM IS THE OBJECT — no card, no nested boxes. A hairline separates the
              who-you-are block from the about-you block; everything else is spacing. */}
          <div className="mt-9" style={{ fontFamily: BRAND_SANS }}>
            {isTest && (
              <p className="mb-5 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F", color: "#FFC9A3" }}>
                Test Mode — this creates a test rep, excluded from real totals. Your tester phone is already filled in; the code on the next screen is <b>000000</b>. Nothing here texts anyone.
              </p>
            )}
            <div className="grid gap-5">
              <div>
                <label style={LABEL} htmlFor="rj-campus">Your campus</label>
                {campusKey && campus ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl px-3" style={{ ...FIELD, display: "flex" }}>
                    <span className="flex items-center gap-2 font-bold"><span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(campus.slug)} /></span>{campusName}</span>
                    <button type="button" onClick={() => setCampusPick(null)} className="text-[12.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Not your school?</button>
                  </div>
                ) : (
                  <div id="rj-campus">
                    <SearchPicker
                      items={ALL_SCHOOLS.map((s) => ({ value: s.slug, label: s.name, aliases: s.aliases, icon: <span className="block shrink-0" style={{ width: 15 }} aria-hidden><Bolt {...boltForSlug(s.slug)} /></span> }))}
                      value={campus?.slug ?? null} placeholder="Pick your campus" searchPlaceholder={`Search ${ALL_SCHOOLS.length} schools…`} onPick={(v) => setCampusPick(v)}
                    />
                  </div>
                )}
                {campusErr && <p style={ERR_TEXT}>{campusErr}</p>}
                {!campusErr && errorFor("campus") && <p style={ERR_TEXT}>{errorFor("campus")}</p>}
              </div>

              <div>
                <label style={LABEL} htmlFor="rj-name">Your name</label>
                <input id="rj-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jordan Ellis" aria-invalid={!!errorFor("name")} className="sa-field" style={FIELD} />
                {errorFor("name") && <p style={ERR_TEXT}>{errorFor("name")}</p>}
              </div>

              <div>
                <label style={LABEL} htmlFor="rj-email">Your email</label>
                <input id="rj-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu" aria-invalid={!!errorFor("email")} className="sa-field" style={FIELD} />
                {errorFor("email") && <p style={ERR_TEXT}>{errorFor("email")}</p>}
              </div>

              <div>
                <label style={LABEL} htmlFor="rj-phone">Your phone</label>
                <input id="rj-phone" value={phone} onChange={(e) => setPhone(formatUsPhoneInput(e.target.value))} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" aria-invalid={!!errorFor("phone")} className="sa-field" style={FIELD} />
                {errorFor("phone") && <p style={ERR_TEXT}>{errorFor("phone")}</p>}
              </div>

              <hr style={RULE} />

              <div>
                <label style={LABEL}>Current student or alumni?</label>
                {radio<StudentStatus>("studentStatus", studentStatus, setStudentStatus, [{ v: "student", label: "Current student" }, { v: "alumni", label: "Alumni" }])}
                {errorFor("studentStatus") && <p style={ERR_TEXT}>{errorFor("studentStatus")}</p>}
              </div>

              <div>
                <label style={LABEL} htmlFor="rj-greek">Greek affiliation</label>
                {hasChapterList ? (
                  <select id="rj-greek" value={greekNone ? "__none" : (greekChapterId ?? "")} aria-invalid={!!errorFor("greek")}
                    onChange={(e) => { const v = e.target.value; if (v === "__none") { setGreekNone(true); setGreekChapterId(null); } else { setGreekNone(false); setGreekChapterId(v || null); } }}
                    className="sa-field" style={{ ...FIELD, appearance: "auto" }}>
                    <option value="">Pick your chapter…</option>
                    {campus!.chapters.map((c) => <option key={c.id} value={c.id}>{c.letters ? `${c.letters} · ` : ""}{c.name}{c.council ? ` (${c.council === "ifc" ? "IFC" : c.council === "panhellenic" ? "Panhellenic" : c.council})` : ""}</option>)}
                    <option value="__none">Not affiliated</option>
                  </select>
                ) : (
                  <div id="rj-greek">
                    <button type="button" onClick={() => { setGreekNone(true); setGreekChapterId(null); }} aria-pressed={greekNone} style={CHIP(greekNone)}>Not affiliated</button>
                  </div>
                )}
                {errorFor("greek") && <p style={ERR_TEXT}>{errorFor("greek")}</p>}
              </div>

              <div>
                <label style={LABEL} htmlFor="rj-major">Major</label>
                <input id="rj-major" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="Accounting, Finance, Marketing…" aria-invalid={!!errorFor("major")} className="sa-field" style={FIELD} />
                {errorFor("major") && <p style={ERR_TEXT}>{errorFor("major")}</p>}
              </div>

              <div>
                <label style={LABEL}>Have you taken {course}?</label>
                {radio<TookCourse>("tookCourse", tookCourse, setTookCourse, [
                  { v: "taken", label: "Yes, I have" },
                  { v: "taking_now", label: "Taking it now" },
                  { v: "not_yet", label: "Never taken it" },
                ])}
                {errorFor("tookCourse") && <p style={ERR_TEXT}>{errorFor("tookCourse")}</p>}
              </div>

              <div>
                <label style={LABEL}>{INVOLVEMENT_COPY.label}</label>
                <div className="grid gap-2.5" id="rj-involvement" role="radiogroup" aria-invalid={!!errorFor("involvement")}>
                  {([
                    { v: "campus_only" as const, label: INVOLVEMENT_COPY.campusOnly(campusName) },
                    { v: "expansion" as const, label: INVOLVEMENT_COPY.expansion },
                  ]).map((o) => (
                    <button key={o.v} type="button" role="radio" aria-checked={involvement === o.v} onClick={() => setInvolvement(o.v)} style={WIDE_CHIP(involvement === o.v)}>
                      <span aria-hidden style={{ fontSize: 13, opacity: involvement === o.v ? 1 : 0.35 }}>{involvement === o.v ? "●" : "○"}</span>
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                {errorFor("involvement") && <p style={ERR_TEXT}>{errorFor("involvement")}</p>}
              </div>
            </div>

            {err && <p className="mt-4 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
            {showErrors && Object.keys(errors).length > 0 && !err && (
              <p className="mt-4 text-[12.5px]" role="alert" style={{ color: "#F3C6CC" }}>
                {Object.keys(errors).length === 1 ? "One thing left — it's marked above." : `${Object.keys(errors).length} things left — they're marked above.`}
              </p>
            )}
            {/* NEVER DISABLED ON INCOMPLETENESS. Pressing it is how you find out what's missing. */}
            <button onClick={() => void submit()} disabled={busy} aria-busy={busy} className="mt-5 w-full rounded-xl text-[16px] font-black transition-opacity disabled:opacity-60" style={CTA}>
              {busy ? "One sec…" : "Continue →"}
            </button>
            <p className="mt-3.5 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              Already a rep? <a href="/rep/dashboard" className="underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Sign in →</a>
            </p>
          </div>
          {beta && <BetaFeedback screen="Apply" who={name} isTest={isTest} />}
        </>
      )}
    </RepShell>
  );
}
