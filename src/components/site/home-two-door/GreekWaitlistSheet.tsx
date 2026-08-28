// GREEK WAITLIST (HOMEPAGE FINAL MILE H4, 2026-08-28).
//
// "Find your chapter →" is now a real capture while the front door stays mostly shut:
//   Step 1 · school (flagship campus only for now, from HOME_CAMPUS config)
//   Step 2 · fraternity/sorority (national org list + free-text fallback)
//   Step 3 · email
//
// Submission goes through the SAME store every landing capture uses — submitNotify → unified
// intake → campus_waitlist. That path has no `source` column, so the tag rides in topic
// ("Greek waitlist · ΑΤΩ") and note ("source:greek_waitlist · org:…"), exactly how the demo
// page's claim tags work. Deliberately NOT a parallel table.
//
// Resubmit guard: the same email+org from this browser doesn't insert twice — the confirmation
// simply shows again (localStorage key below).
//
// Sheet chrome copied from the existing finder sheet (bottom sheet on mobile, centered card on
// desktop, Escape + scrim close). Mobile-first.
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { GREEK_PORTAL_ORGS } from "@/components/site/portal-home/greek-portal-orgs";
import { HOME_CAMPUS } from "@/lib/launch";
import { schoolById } from "@/lib/schools";
import { submitNotify } from "@/lib/syllabus.functions";
import { readTestSession } from "@/lib/test-mode";

const DONE_KEY = "sa-greek-waitlist";

export function GreekWaitlistSheet({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"school" | "org" | "email" | "done">("school");
  const [org, setOrg] = useState<string | null>(null);
  const [orgFree, setOrgFree] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    if (!emailOk || !org || busy) return;
    setBusy(true); setErr(null);
    try {
      const dupeKey = `${email.trim().toLowerCase()}|${org}`;
      let already = false;
      try { already = localStorage.getItem(DONE_KEY) === dupeKey; } catch { /* private mode */ }
      if (!already) {
        // campusId resolves through the canonical school table — the config carries display
        // strings only, never ids.
        const campusId = schoolById(HOME_CAMPUS.id)?.campusId ?? null;
        await submitNotify({ data: {
          contact: email.trim(),
          topic: `Greek waitlist · ${org}`,
          campusId,
          campusName: HOME_CAMPUS.name,
          professorName: null,
          want: null,
          examNum: null,
          courseCode: null,
          note: `source:greek_waitlist · org:${org} · campus:${HOME_CAMPUS.id}`,
          isTest: !!readTestSession(),
        } });
        try { localStorage.setItem(DONE_KEY, dupeKey); } catch { /* ignore */ }
      }
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't send — try again?");
    } finally {
      setBusy(false);
    }
  };

  const STEP_LABEL: React.CSSProperties = { color: "var(--text-muted)", fontSize: 11.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" };
  const ROW = "mt-1.5 flex w-full items-center justify-between rounded-xl px-3 text-left text-[14px] font-black";
  const rowStyle: React.CSSProperties = { minHeight: 48, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", cursor: "pointer" };

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Find your chapter"
        className="w-full max-w-[420px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Find your chapter</h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }} aria-label="Close">×</button>
        </div>

        {step === "school" && (
          <>
            <p style={STEP_LABEL}>Step 1 · Your school</p>
            <button type="button" className={ROW} style={rowStyle} onClick={() => setStep("org")}>
              <span>{HOME_CAMPUS.name}</span>
              <span aria-hidden style={{ color: "var(--accent)" }}>→</span>
            </button>
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>More campuses are coming — {HOME_CAMPUS.name} is first.</p>
          </>
        )}

        {step === "org" && (
          <>
            <p style={STEP_LABEL}>Step 2 · Your fraternity or sorority</p>
            <div className="mt-1 max-h-[42vh] overflow-y-auto pr-1">
              {GREEK_PORTAL_ORGS.map((o) => (
                <button key={o.letters} type="button" className={ROW} style={rowStyle} onClick={() => { setOrg(o.letters); setStep("email"); }}>
                  <span><span style={{ letterSpacing: "0.08em" }}>{o.letters}</span><span className="ml-2 text-[12.5px] font-bold" style={{ color: "var(--text-muted)" }}>{o.name}</span></span>
                  <span aria-hidden style={{ color: "var(--accent)" }}>→</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={orgFree}
                onChange={(e) => setOrgFree(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && orgFree.trim()) { setOrg(orgFree.trim()); setStep("email"); } }}
                placeholder="My org isn't listed — type it"
                aria-label="Your organization, if not listed"
                className="min-w-0 flex-1 rounded-xl px-3 outline-none"
                style={{ fontSize: 16, minHeight: 46, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
              />
              <button
                type="button"
                disabled={!orgFree.trim()}
                onClick={() => { setOrg(orgFree.trim()); setStep("email"); }}
                className="shrink-0 rounded-xl px-3 text-[13.5px] font-black disabled:opacity-45"
                style={{ minHeight: 46, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", cursor: "pointer" }}
              >
                Next →
              </button>
            </div>
            <BackLink onClick={() => setStep("school")} />
          </>
        )}

        {step === "email" && org && (
          <>
            <p style={STEP_LABEL}>Step 3 · Where to reach you</p>
            <p className="mt-2 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
              {HOME_CAMPUS.name} · <b style={{ color: "var(--brand-cream)" }}>{org}</b>
            </p>
            <input
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              type="email" inputMode="email" autoComplete="email" placeholder="you@school.edu"
              aria-label="Email for the chapter waitlist"
              className="mt-2 w-full rounded-xl px-3 outline-none"
              style={{ fontSize: 16, minHeight: 48, background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}
            />
            {err && <p className="mt-2 text-[12.5px]" style={{ color: "#F3C6CC" }}>{err}</p>}
            <button
              type="button"
              onClick={() => void send()}
              disabled={!emailOk || busy}
              className="mt-3 w-full rounded-xl text-[14.5px] font-black disabled:opacity-45"
              style={{ minHeight: 50, background: "var(--accent)", color: "#0B1220", border: 0, cursor: "pointer" }}
            >
              {busy ? "Sending…" : "Join the waitlist →"}
            </button>
            <BackLink onClick={() => setStep("org")} />
          </>
        )}

        {step === "done" && org && (
          <p className="py-4 text-center text-[15px] font-bold leading-relaxed" style={{ color: "var(--brand-cream)" }}>
            You&apos;re on the list. When {org}&apos;s chapter opens, you&apos;re first to know.
          </p>
        )}
      </div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 text-[13px] font-bold" style={{ color: "var(--text-muted)", minHeight: 40, background: "none", border: 0, cursor: "pointer" }}>
      ← Back
    </button>
  );
}
