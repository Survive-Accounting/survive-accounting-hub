// /chapters — public self-serve onboarding for a Greek chapter: hero + 3 beats + a one-screen signup
// (4 fields), phone-verified over SMS, then the shareable /c/<slug> link is minted IMMEDIATELY on the
// confirmation screen. Navy/bolt/cream. Krug: one decision per screen, no field we don't need today.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DEFAULT_FRAME_THEME, FrameBackground, frameThemeVars } from "@/components/frames";
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { CampusSelector, type School } from "./landing";
import { supabase } from "@/integrations/supabase/client";
import { createGreekChapter, resendChapterCode, searchChapterOrgs, verifyChapterPhone } from "@/lib/greek-chapters.functions";

export const Route = createFileRoute("/chapters")({
  head: () => ({ meta: [{ title: "⚡ Free Exam 1 for your whole chapter — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: ChaptersPage,
});

const ORIGIN = "surviveaccounting.com";

function ChaptersPage() {
  const theme = DEFAULT_FRAME_THEME;
  return (
    <div style={{ ...frameThemeVars(theme), background: "var(--brand-navy)", color: "var(--brand-cream)", fontFamily: BRAND_DISPLAY, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><FrameBackground variant="orbital" intensity={0.34} animate /></div>
      <main style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "0 20px" }}>
        <section className="flex flex-col items-center pt-16 pb-6 text-center sm:pt-24">
          <SurviveWordmark size={84} />
          <h1 className="mt-6 text-[26px] font-black sm:text-[32px]" style={{ letterSpacing: "-0.01em" }}>Free Exam 1 for your whole chapter.</h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed sm:text-[16px]" style={{ color: "var(--brand-cream)", opacity: 0.88, fontFamily: BRAND_SANS }}>
            One link, every member. Share it in the group chat — I'll handle the rest. No cost, no contract. When you're ready, semester seats are $100/member (10 minimum).
          </p>
          <a href="#signup" className="mt-7 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15.5px] font-black transition-transform hover:scale-[1.03]" style={{ background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}>Get your chapter link</a>

          <div className="mt-8 flex w-full max-w-md flex-col gap-2 text-left" style={{ fontFamily: BRAND_SANS }}>
            {["Sign up your chapter — takes a minute", "Share your link — members get Exam 1 free", "Watch it work — you see who's using it"].map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(245,239,230,0.04)", border: "1px solid rgba(245,239,230,0.1)" }}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>{i + 1}</span>
                <span className="text-[13.5px]" style={{ color: "var(--brand-cream)" }}>{b}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="signup" className="mx-auto mb-16 max-w-md scroll-mt-6">
          <SignupFlow />
        </section>
      </main>
    </div>
  );
}

// SMS-TRUTH — live phone formatting so the officer sees "(662) 565-8818" as they type
// (server normalizes to E.164 before Twilio). "+…" international input passes through raw.
const fmtPhone = (v: string) => {
  if (v.trim().startsWith("+")) return "+" + v.replace(/\D/g, "").slice(0, 15);
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

const CODE_TTL_MS = 10 * 60_000, RESEND_COOLDOWN_MS = 60_000;

type Step = "form" | "verify" | "done";
function SignupFlow() {
  const [step, setStep] = useState<Step>("form");
  const [school, setSchool] = useState<School | null>(null);
  const [org, setOrg] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [nameRole, setNameRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // SMS-TRUTH: when the last code was texted — drives the "expires in m:ss" line + resend cooldown.
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // SHARE-THE-LINK: copied acknowledgement. DASHBOARD-BRIDGE: did the sign-in email actually send.
  const [copied, setCopied] = useState(false);
  const [linkSent, setLinkSent] = useState<boolean | null>(null);
  useEffect(() => { if (step !== "verify") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [step]);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const formOk = !!school && org.name.trim().length > 1 && nameRole.trim().length > 2 && emailOk && phone.replace(/\D/g, "").length >= 10;

  const submitForm = async () => {
    if (!formOk || busy) return;
    setBusy(true); setErr(null);
    try {
      if (chapterId) {
        // "Wrong number? Change it" round-trip — UPDATE the existing row, never mint a duplicate.
        const r = await resendChapterCode({ data: { chapterId, phone: phone.trim() } });
        if (!r.ok) setErr(r.error ?? "Couldn't resend — try again.");
        else if (r.smsSent === false) setErr(r.error ?? "Couldn't text that number — double-check it.");
        else { setSentAt(Date.now()); setCode(""); setStep("verify"); }
      } else {
        const r = await createGreekChapter({ data: { campusId: school!.campusId, schoolName: school!.name, chapterName: org.name.trim(), greekOrgId: org.id, adminNameRole: nameRole.trim(), adminEmail: email.trim(), adminPhone: phone.trim() } });
        setChapterId(r.chapterId);
        // SMS-TRUTH: only claim "I just texted you" when the text actually went out.
        if (r.smsSent) { setSentAt(Date.now()); setStep("verify"); }
        else setErr("Couldn't text that number — double-check it, or text me at (662) 565-8818 and I'll set you up.");
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong — try again."); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (!chapterId || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await resendChapterCode({ data: { chapterId } });
      if (!r.ok || r.smsSent === false) setErr(r.error ?? "Couldn't resend — try again.");
      else { setSentAt(Date.now()); setCode(""); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Try again."); }
    finally { setBusy(false); }
  };
  const submitCode = async () => {
    if (!chapterId || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await verifyChapterPhone({ data: { chapterId, code: code.trim() } });
      if (r.ok && r.url) {
        setUrl(r.url); setStep("done");
        // DASHBOARD-BRIDGE: actually send the promised dashboard sign-in link (the done screen
        // only claims it once this resolves). Never blocks the link reveal.
        void supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/chapters/dashboard` } })
          .then(({ error }) => setLinkSent(!error)).catch(() => setLinkSent(false));
      } else setErr(r.error ?? "That code isn't right.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Try again."); }
    finally { setBusy(false); }
  };

  const card = "rounded-2xl p-6";
  const cardStyle = { background: "rgba(245,239,230,0.05)", border: "1px solid rgba(245,239,230,0.12)", fontFamily: BRAND_SANS } as const;
  const inputCls = "w-full rounded-xl px-4 py-3 text-[14px] outline-none";
  const inputStyle = { background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" } as const;

  if (step === "done") {
    const full = `${ORIGIN}${url}`;
    const link = `https://${full}`;
    // SHARE-THE-LINK: the whole thesis is "share it in the group chat" — so texting it is the
    // PRIMARY action: native share sheet where available, sms: prefill otherwise.
    const shareText = `Free Exam 1 for the whole chapter ⚡ ${link}`;
    const doShare = async () => {
      if (typeof navigator !== "undefined" && navigator.share) { try { await navigator.share({ text: shareText, url: link }); return; } catch { /* user cancelled — fall through to nothing */ return; } }
      window.location.href = `sms:?&body=${encodeURIComponent(shareText)}`;
    };
    const doCopy = async () => {
      try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
      catch { setErr("Couldn't copy — long-press the link to copy it."); }
    };
    return (
      <div className={card} style={cardStyle}>
        <h2 className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Your chapter link is live ⚡</h2>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>Share it in the group chat — every member gets Exam 1 free.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(245,239,230,0.14)" }}>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold" style={{ color: "var(--accent)" }}>{full}</span>
          <button onClick={() => void doCopy()} className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-black" style={{ background: copied ? "#3BF5A0" : "var(--accent)", color: "#0B1220" }}>{copied ? "Copied ⚡" : "Copy"}</button>
        </div>
        <button onClick={() => void doShare()} className="mt-3 w-full rounded-xl py-3 text-[15px] font-black transition-transform hover:scale-[1.02]" style={{ background: "var(--accent)", color: "#0B1220" }}>Text it to the group chat →</button>
        <div className="mt-4 flex items-center gap-3">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${encodeURIComponent(link)}`} alt="Chapter link QR" width={110} height={110} className="shrink-0 rounded-lg" style={{ background: "#fff", padding: 5 }} />
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>Or let members scan this at your next meeting — same link.</p>
        </div>
        {err && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}
        <a href="/chapters/dashboard" className="mt-4 inline-block text-[12.5px] font-semibold" style={{ color: "var(--accent)" }}>Open your chapter dashboard →</a>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {linkSent === true ? `Sent a sign-in link to ${email} — use it any time to open your dashboard.`
            : linkSent === false ? "Couldn't email your sign-in link automatically — request one on the dashboard page."
            : `Sending a sign-in link to ${email}…`}
        </p>
      </div>
    );
  }

  if (step === "verify") {
    // SMS-TRUTH: expiry countdown + visible resend with a cooldown + a way back to fix the number.
    const msLeft = sentAt ? Math.max(0, CODE_TTL_MS - (now - sentAt)) : 0;
    const expired = sentAt !== null && msLeft <= 0;
    const cooldownLeft = sentAt ? Math.max(0, RESEND_COOLDOWN_MS - (now - sentAt)) : 0;
    const mmss = `${Math.floor(msLeft / 60_000)}:${String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, "0")}`;
    return (
      <div className={card} style={cardStyle}>
        <h2 className="text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Verify your phone</h2>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>Enter the 6-digit code I texted to {phone}.{!expired && sentAt !== null && <span> Expires in <span className="tabular-nums font-semibold" style={{ color: "var(--brand-cream)" }}>{mmss}</span>.</span>}</p>
        {expired && <p className="mt-1 text-[12.5px] font-semibold" style={{ color: "#F3C6CC" }}>That code expired — resend a fresh one below.</p>}
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" className={`${inputCls} mt-3 text-center tracking-[0.3em]`} style={inputStyle} />
        {err && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}
        <button onClick={submitCode} disabled={code.length < 4 || busy} className="mt-4 w-full rounded-xl py-3 text-[15px] font-black disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>{busy ? "Verifying…" : "Verify & get my link"}</button>
        <div className="mt-3 flex items-center justify-between text-[12.5px]">
          <button onClick={() => void resend()} disabled={busy || cooldownLeft > 0} className="font-semibold disabled:opacity-40" style={{ color: "var(--accent)" }}>
            {cooldownLeft > 0 ? `Resend code (${Math.ceil(cooldownLeft / 1000)}s)` : "Resend code"}
          </button>
          <button onClick={() => { setStep("form"); setErr(null); }} className="font-semibold" style={{ color: "var(--text-muted)" }}>Wrong number? ← Change it</button>
        </div>
      </div>
    );
  }

  return (
    <div className={card} style={cardStyle}>
      <h2 className="mb-4 text-[19px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Set up your chapter</h2>
      <label className="mb-1 block text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>School</label>
      <CampusSelector school={school} onPick={(s) => { setSchool(s); setOrg({ id: null, name: "" }); }} />

      <label className="mb-1 mt-4 block text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Chapter</label>
      <ChapterPicker campusId={school?.campusId ?? null} value={org} onChange={setOrg} />

      <label className="mb-1 mt-4 block text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>You</label>
      <input value={nameRole} onChange={(e) => setNameRole(e.target.value)} placeholder="Name & role, e.g. Jane Doe, Scholarship Chair" className={inputCls} style={inputStyle} />

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (.edu preferred)" className={inputCls} style={inputStyle} />
        <input value={phone} onChange={(e) => setPhone(fmtPhone(e.target.value))} inputMode="tel" placeholder="Mobile — (662) 555-0123" className={inputCls} style={inputStyle} />
      </div>

      {err && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}
      <button onClick={submitForm} disabled={!formOk || busy} className="mt-5 w-full rounded-xl py-3 text-[15px] font-black transition-opacity disabled:opacity-40" style={{ background: "var(--accent)", color: "#0B1220" }}>{busy ? "…" : chapterId ? "Text a new code →" : "Text me a code →"}</button>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>I'll text a 6-digit code to verify it's really you.</p>
    </div>
  );
}

// Chapter picker — GreekIntel orgs for the selected campus (searchable) + a free-text fallback.
function ChapterPicker({ campusId, value, onChange }: { campusId: string | null; value: { id: string | null; name: string }; onChange: (v: { id: string | null; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const orgsQ = useQuery({ queryKey: ["chapter-orgs", campusId, q], queryFn: () => searchChapterOrgs({ data: { campusId: campusId!, q } }), enabled: !!campusId && open, networkMode: "always", staleTime: 120_000 });
  useEffect(() => { if (!open) return; const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc); }, [open]);
  const results = orgsQ.data ?? [];
  const disabled = !campusId;
  return (
    <div ref={ref} className="relative">
      <input
        value={value.name || q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); onChange({ id: null, name: e.target.value }); setOpen(true); }}
        placeholder={disabled ? "Pick your school first" : "Search or type your chapter (e.g. Alpha Tau Omega)"}
        disabled={disabled}
        className="w-full rounded-xl px-4 py-3 text-[14px] outline-none disabled:opacity-50"
        style={{ background: "rgba(245,239,230,0.06)", border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)" }}
      />
      {open && !disabled && (results.length > 0 || value.name) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl" style={{ background: "#0B1220", border: "1px solid rgba(245,239,230,0.14)" }}>
          {results.map((o) => (
            <button key={o.id} onClick={() => { onChange({ id: o.id, name: o.name }); setQ(o.name); setOpen(false); }} className="block w-full px-4 py-2 text-left text-[13.5px] hover:bg-white/5" style={{ color: "var(--brand-cream)" }}>{o.name}</button>
          ))}
          {value.name.trim().length > 1 && !results.some((o) => o.name.toLowerCase() === value.name.trim().toLowerCase()) && (
            <button onClick={() => { onChange({ id: null, name: value.name.trim() }); setOpen(false); }} className="block w-full border-t px-4 py-2 text-left text-[13px] hover:bg-white/5" style={{ borderColor: "rgba(245,239,230,0.1)", color: "var(--accent)" }}>Use “{value.name.trim()}”</button>
          )}
        </div>
      )}
    </div>
  );
}
