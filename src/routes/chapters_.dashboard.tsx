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
import { Check, FileText, Image as ImageIcon, Loader2, MessageSquare, Minus, Plus, Presentation } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { authEmailError, authErrorDetail } from "@/lib/auth-errors";
import { readTestSession } from "@/lib/test-mode";
import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { FitWordmark, SiteHeader } from "@/components/site/SiteHeader";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { SEAT_PRICE } from "@/components/site/ChapterAccess";
import { chapterGroupMe } from "@/components/learn/LearnChapterBar";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { saveFlyerImage } from "@/lib/flyer-image";
import { buildShareUrl } from "@/lib/share-url";
import { schoolBySlug } from "@/lib/schools";
import { LEE_PHONE_DISPLAY, LEE_SMS_HREF } from "@/lib/partners";
import {
  getChapterHome, markChapterStep, requestChapterSeats, SEAT_REQUEST_MIN, SEAT_REQUEST_STEP,
  type ChapterHome, type ChapterStep,
} from "@/lib/chapter-dashboard.functions";

export const Route = createFileRoute("/chapters_/dashboard")({
  head: () => ({ meta: [{ title: "Chapter dashboard — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: DashboardPage,
});

const PANEL: React.CSSProperties = { background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)", borderRadius: 16 };
const BTN_QUIET: React.CSSProperties = { minHeight: 38, borderRadius: 10, padding: "0 12px", background: "rgba(245,239,230,0.08)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)", fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" };

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
          <Dashboard data={data} token={token} onChange={setData} />
        )}
      </main>
    </div>
  );
}

function Dashboard({ data, token, onChange }: { data: ChapterHome; token: string; onChange: (d: ChapterHome) => void }) {
  const short = data.letters || data.chapterName;
  const schoolId = (data.schoolSlug && schoolBySlug(data.schoolSlug)?.id) || data.schoolSlug;
  const membersLink = schoolId && data.chapterSlug ? buildShareUrl({ campus: schoolId, chapter: data.chapterSlug }) : null;
  const post = membersLink ? chapterGroupMe({ courseCode: data.courseCode, url: membersLink, chapter: short }) : null;
  const art = data.schoolSlug && data.chapterSlug ? `/api/flyer/${data.schoolSlug}/${data.chapterSlug}` : null;
  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return "—"; } };

  const [copied, setCopied] = useState<"link" | "post" | null>(null);
  const copy = async (what: "link" | "post") => {
    const text = what === "link" ? membersLink : post;
    if (text && (await copyToClipboard(text))) { setCopied(what); window.setTimeout(() => setCopied(null), 1800); }
  };
  const [imgBusy, setImgBusy] = useState(false);
  const flyerImage = async () => {
    if (!art || imgBusy) return;
    setImgBusy(true);
    try { await saveFlyerImage(`${art}?f=svg`, `survive-${(data.chapterSlug ?? "chapter")}-flyer.png`); } catch { window.open(`${art}?f=svg`, "_blank", "noopener"); }
    finally { setImgBusy(false); }
  };

  const [stepBusy, setStepBusy] = useState<ChapterStep | null>(null);
  const toggleStep = async (step: ChapterStep) => {
    if (stepBusy) return;
    const done = !data.steps[step];
    setStepBusy(step);
    try {
      const r = await markChapterStep({ data: { accessToken: token, step, done } });
      if (r.ok) onChange({ ...data, steps: { ...data.steps, [step]: r.at } });
    } finally { setStepBusy(null); }
  };

  const nothingYet = data.membersJoined === 0;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Members joined", value: data.membersJoined ? String(data.membersJoined) : "—" },
    { label: "Joined this week", value: data.joinedThisWeek ? String(data.joinedThisWeek) : "—" },
    { label: "Minutes watched this week", value: data.usage && data.usage.minutesWatched ? String(data.usage.minutesWatched) : "—" },
  ];
  const doneCount = Object.values(data.steps).filter(Boolean).length;

  return (
    <div className="mb-16 grid gap-3" style={{ fontFamily: BRAND_SANS }}>
      {/* THE CHAPTER + THE LINK THEIR MEMBERS JOIN FROM */}
      <section className="p-5" style={{ ...PANEL, border: "1px solid rgba(252,163,17,0.4)" }}>
        <p className="text-[11px] font-black uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-muted)" }}>Chapter dashboard{data.isTest ? " · test" : ""}</p>
        <h1 className="mt-1 text-[22px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{data.chapterName}</h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{data.schoolName}{data.courseCode ? ` · ${data.courseCode}` : ""}</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(245,239,230,0.14)" }}>
          {membersLink ? (
            <>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: "var(--accent)" }}>{membersLink.replace(/^https?:\/\//, "")}</span>
              <button onClick={() => void copy("link")} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-black" style={{ background: copied === "link" ? "#3BF5A0" : "var(--accent)", color: "#0B1220" }}>{copied === "link" ? "Copied" : "Copy"}</button>
            </>
          ) : (
            <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Your members&apos; link is being set up — Lee will finish it.</span>
          )}
        </div>
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>Your members join {short}&apos;s page from this link with their email.</p>
      </section>

      {/* THE NUMBERS — real rows only; an honest dash until there is something to count. */}
      <section className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="px-2 py-4 text-center" style={PANEL}>
            <div className="text-[26px] font-black leading-none" style={{ color: s.value === "—" ? "var(--text-muted)" : "var(--accent)" }}>{s.value}</div>
            <div className="mt-1.5 text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </section>
      {nothingYet && <p className="-mt-1 text-center text-[13px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>Nothing yet. These three steps get the first members in.</p>}

      {/* THE ACTION STEPS */}
      <section className="p-5" style={PANEL}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Get your members in</h2>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{doneCount} of 3 done</span>
        </div>
        <div className="mt-3 grid gap-2.5">
          <StepRow n={1} title="Post in the chapter GroupMe" note="Paste the post in your chapter's group chat." done={data.steps.groupme} busy={stepBusy === "groupme"} onToggle={() => void toggleStep("groupme")} fmtDate={fmtDate}>
            {post && <button type="button" onClick={() => void copy("post")} style={BTN_QUIET}>{copied === "post" ? <><Check className="h-4 w-4" /> Copied</> : <><MessageSquare className="h-4 w-4" /> Copy GroupMe post</>}</button>}
          </StepRow>
          <StepRow n={2} title="Show the slide at chapter meeting" note="Put it on the screen; members scan the QR and join." done={data.steps.slide} busy={stepBusy === "slide"} onToggle={() => void toggleStep("slide")} fmtDate={fmtDate}>
            {art && <a href={`${art}?f=slide&pdf=1`} download={`survive-${data.chapterSlug}-slide.pdf`} style={BTN_QUIET}><Presentation className="h-4 w-4" /> Download slide</a>}
          </StepRow>
          <StepRow n={3} title="Print a flyer for the house" note="Hang it where members study. The image works in texts too." done={data.steps.flyer} busy={stepBusy === "flyer"} onToggle={() => void toggleStep("flyer")} fmtDate={fmtDate}>
            {art && <a href={art} target="_blank" rel="noreferrer" style={BTN_QUIET}><FileText className="h-4 w-4" /> Print flyer</a>}
            {art && <button type="button" onClick={() => void flyerImage()} disabled={imgBusy} style={BTN_QUIET}>{imgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} Flyer image</button>}
          </StepRow>
        </div>
      </section>

      {/* WHO JOINED */}
      <section className="overflow-hidden" style={PANEL}>
        <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "rgba(245,239,230,0.1)" }}>
          <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--brand-cream)" }}>Who joined</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{data.membersJoined} member{data.membersJoined === 1 ? "" : "s"}</span>
        </div>
        {data.roster.length === 0
          ? <div className="px-4 py-4 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>No one yet.</div>
          : (
            <div className="max-h-72 overflow-y-auto">
              {data.roster.map((m) => (
                <div key={m.id} className="flex items-center gap-2 border-b px-4 py-2 text-[12.5px]" style={{ borderColor: "rgba(245,239,230,0.06)", color: "var(--brand-cream)" }}>
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{fmtDate(m.joinedAt)}</span>
                </div>
              ))}
            </div>
          )}
      </section>

      <SeatRequest data={data} token={token} short={short} fmtDate={fmtDate} onRequested={(r) => onChange({ ...data, seatRequest: r })} />

      <p className="mt-1 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        Questions? <a href={LEE_SMS_HREF} className="font-bold underline underline-offset-4" style={{ color: "var(--brand-cream)" }}>Text Lee {LEE_PHONE_DISPLAY}</a>
        <span aria-hidden> · </span>
        <button onClick={() => void supabase.auth.signOut()} className="underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Sign out</button>
      </p>
    </div>
  );
}

function StepRow({ n, title, note, done, busy, onToggle, fmtDate, children }: {
  n: number; title: string; note: string; done: string | null; busy: boolean; onToggle: () => void; fmtDate: (s: string) => string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: done ? "rgba(59,245,160,0.06)" : "rgba(0,0,0,0.18)", border: `1px solid ${done ? "rgba(59,245,160,0.35)" : "rgba(245,239,230,0.1)"}` }}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-black" style={done ? { background: "#3BF5A0", color: "#0B1220" } : { border: "1px solid rgba(245,239,230,0.3)", color: "var(--text-muted)" }}>
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>{title}</div>
          <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{done ? `Done ${fmtDate(done)}` : note}</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {children}
            <button type="button" onClick={onToggle} disabled={busy} aria-pressed={!!done} style={{ ...BTN_QUIET, ...(done ? { background: "transparent", color: "var(--text-muted)", fontWeight: 600 } : { background: "var(--accent)", color: "#0B1220", border: 0 }) }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? "Undo" : "Mark done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeatRequest({ data, token, short, fmtDate, onRequested }: { data: ChapterHome; token: string; short: string; fmtDate: (s: string) => string; onRequested: (r: { seats: number; at: string }) => void }) {
  const [seats, setSeats] = useState(Math.max(SEAT_REQUEST_MIN, Math.ceil(Math.max(data.membersJoined, SEAT_REQUEST_MIN) / SEAT_REQUEST_STEP) * SEAT_REQUEST_STEP));
  const [editing, setEditing] = useState(!data.seatRequest);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await requestChapterSeats({ data: { accessToken: token, seats } });
      if (r.ok && r.at) { onRequested({ seats, at: r.at }); setEditing(false); }
      else setErr(r.error ?? "Couldn't send that — try again.");
    } catch { setErr("Couldn't reach the server — try again."); }
    finally { setBusy(false); }
  };
  return (
    <section className="p-5" style={PANEL}>
      <h2 className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Fund your members&apos; access</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Seats unlock Exams 2, 3 and the Final for the members you choose, all semester. ${SEAT_PRICE} per member, {SEAT_REQUEST_MIN} minimum.
      </p>
      {!editing && data.seatRequest ? (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "rgba(252,163,17,0.1)", border: "1px solid rgba(252,163,17,0.4)" }}>
          <p className="text-[14px] font-black" style={{ color: "var(--brand-cream)" }}>Request sent — {data.seatRequest.seats} seats</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>Lee will reach out to set up {short}&apos;s seats. Requested {fmtDate(data.seatRequest.at)}.</p>
          <button type="button" onClick={() => { setSeats(data.seatRequest!.seats); setEditing(true); }} className="mt-2 text-[12px] underline underline-offset-4" style={{ color: "var(--text-muted)" }}>Change the number</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-xl" style={{ border: "1px solid rgba(245,239,230,0.18)" }}>
            <button type="button" aria-label="Ten fewer" disabled={seats <= SEAT_REQUEST_MIN} onClick={() => setSeats((n) => Math.max(SEAT_REQUEST_MIN, n - SEAT_REQUEST_STEP))} className="grid h-11 w-11 place-items-center disabled:opacity-30" style={{ color: "var(--brand-cream)" }}><Minus className="h-4 w-4" /></button>
            <span className="min-w-[88px] text-center text-[15px] font-black tabular-nums" style={{ color: "var(--brand-cream)" }}>{seats} seats</span>
            <button type="button" aria-label="Ten more" disabled={seats >= 500} onClick={() => setSeats((n) => Math.min(500, n + SEAT_REQUEST_STEP))} className="grid h-11 w-11 place-items-center disabled:opacity-30" style={{ color: "var(--brand-cream)" }}><Plus className="h-4 w-4" /></button>
          </div>
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>${(seats * SEAT_PRICE).toLocaleString("en-US")} for the semester</span>
          <button type="button" onClick={() => void send()} disabled={busy} className="ml-auto rounded-xl px-4 text-[14px] font-black disabled:opacity-50" style={{ minHeight: 44, background: "var(--accent)", color: "#0B1220" }}>
            {busy ? "Sending…" : `Request ${seats} seats`}
          </button>
          <p className="w-full text-[11.5px]" style={{ color: "var(--text-muted)" }}>This is a request, not a charge. Lee reaches out to set it up.</p>
          {err && <p className="w-full text-[12px]" role="alert" style={{ color: "#F3C6CC" }}>{err}</p>}
        </div>
      )}
    </section>
  );
}
