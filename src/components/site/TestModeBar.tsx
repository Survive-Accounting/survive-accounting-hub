// TEST MODE — the tester's instrument panel: an unmissable banner and a step-by-step run sheet.
//
// WHY A SCRIPT AND NOT A CHECKLIST. "Try the chapter flow" produces a report that says "the
// chapter thing didn't work". A numbered lifecycle with, for each step, what to do and what
// should happen produces "step 4 said claimed but the dashboard still showed unclaimed" — which
// is a bug report. It also means a second tester runs the same path as the first.
//
// ALWAYS VISIBLE. The banner is fixed and cannot be dismissed while the session is live: a tester
// who forgets they are in test mode will report test behaviour as real behaviour, and worse, may
// believe a real purchase happened. It names the address every test email goes to, because that
// is the single most common "did it work?" question.
//
// TWO LOCKS. This renders only when the URL/session says test mode AND the server confirms
// TEST_MODE_ENABLED. Without the server's yes it renders nothing at all.
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import {
  GREEK_LIFECYCLE, TEST_CAMPUS_URL, TEST_CHAPTER_URL, parseTestParams, readTestSession,
  restartTestRun, startTestSession, writeTestSession, type TestSession,
} from "@/lib/test-mode";
import {
  getFixtureStatus, resetFixture, testApproveFixtureClaim, testModeStatus, type FixtureStatus,
} from "@/lib/test-mode.functions";

export function TestModeBar() {
  const [session, setSession] = useState<TestSession | null>(null);
  const [serverOn, setServerOn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  // THE PANEL. The fixture's live state, so the shortcuts can say what they will do rather than
  // offering a button that cannot apply.
  const [fx, setFx] = useState<FixtureStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const loadFixture = () => { void getFixtureStatus().then(setFx).catch(() => setFx(null)); };

  // Adopt the URL params once, then live off the session so a tester can navigate the real site
  // without carrying ?testmode=1 on every link.
  useEffect(() => {
    const fromUrl = parseTestParams(window.location.search);
    const existing = readTestSession();
    if (fromUrl) setSession(startTestSession(fromUrl.name, fromUrl.email));
    else if (existing) setSession(existing);
  }, []);

  // The server lock. Asked once per mount; a "no" hides everything.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    void testModeStatus()
      .then((r) => { if (alive) setServerOn(r.enabled); })
      .catch(() => { if (alive) setServerOn(false); });
    return () => { alive = false; };
  }, [session]);

  // Only when the panel is open: a closed panel has no reason to poll the database.
  useEffect(() => { if (open && serverOn) loadFixture(); }, [open, serverOn]);

  if (!session || serverOn !== true) return null;

  const step = Math.min(session.step, GREEK_LIFECYCLE.length - 1);
  const cur = GREEK_LIFECYCLE[step];
  const setStep = (n: number) => {
    const next = { ...session, step: Math.max(0, Math.min(n, GREEK_LIFECYCLE.length - 1)) };
    writeTestSession(next); setSession(next);
  };

  return (
    <>
      {/* THE BANNER. Fixed, top, above everything including the sticky navbar. */}
      <div
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 500,
          background: "#7A2E12", borderBottom: "1px solid #C2571F", color: "#FFE9D6",
          fontFamily: BRAND_SANS, paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
          <span className="text-[12px] font-black uppercase" style={{ letterSpacing: "0.12em" }}>Test mode</span>
          <span className="text-[13px]">nothing here is real. Emails go to <b>{session.email}</b>.</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[12px]" style={{ opacity: 0.8 }}>Run {session.run} · step {step + 1}/{GREEK_LIFECYCLE.length}</span>
            <button
              type="button" onClick={() => setOpen((v) => !v)}
              className="rounded-lg px-2.5 text-[12.5px] font-black"
              style={{ minHeight: 32, background: "#FFE9D6", color: "#7A2E12" }}
            >
              {open ? "Hide steps" : "Show steps"}
            </button>
          </span>
        </div>
      </div>
      {/* The page starts below the banner rather than under it. */}
      <div aria-hidden style={{ height: 34 }} />

      {open && (
        <div
          className="fixed right-3 z-[501] w-[min(420px,calc(100vw-24px))] rounded-2xl p-4"
          style={{ top: 46, background: "var(--bg-overlay, #1A2948)", border: "1px solid var(--border-default, #34486D)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", fontFamily: BRAND_SANS, maxHeight: "calc(100vh - 70px)", overflowY: "auto" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream, #F7F0E6)" }}>Greek chapter lifecycle</p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-secondary, #AAB4C8)" }}>{session.name} · run {session.run}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-secondary, #AAB4C8)" }}>
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
            </button>
          </div>

          {/* THE CURRENT STEP, in full. Everything else is a list you can jump around. */}
          <div className="mt-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(0,107,166,0.22)", border: "1px solid var(--accent-info, #006BA6)" }}>
            <p className="text-[11px] font-black uppercase" style={{ color: "var(--accent-info-text, #62B6EA)", letterSpacing: "0.12em" }}>
              Step {step + 1} · {cur.role}
            </p>
            <p className="mt-1 text-[15px] font-black" style={{ color: "var(--brand-cream, #F7F0E6)" }}>{cur.title}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--brand-cream, #F7F0E6)", opacity: 0.9 }}>{cur.todo}</p>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary, #AAB4C8)" }}>
              <b style={{ color: "var(--brand-cream, #F7F0E6)" }}>Should happen:</b> {cur.expect}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {cur.href && (
                <a href={cur.href} className="rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", background: "var(--accent, #FFA611)", color: "#0B1220" }}>
                  Go there →
                </a>
              )}
              <button type="button" onClick={() => setStep(step - 1)} disabled={step === 0} className="rounded-lg px-3 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 40, background: "var(--bg-surface, #162443)", border: "1px solid var(--border-default, #34486D)", color: "var(--brand-cream, #F7F0E6)" }}>
                Back
              </button>
              <button type="button" onClick={() => setStep(step + 1)} disabled={step >= GREEK_LIFECYCLE.length - 1} className="rounded-lg px-3 text-[13px] font-black disabled:opacity-40" style={{ minHeight: 40, background: "var(--bg-surface, #162443)", border: "1px solid var(--border-default, #34486D)", color: "var(--brand-cream, #F7F0E6)" }}>
                Done · next
              </button>
            </div>
          </div>

          {/* The whole run, so a tester can see where they are and jump. */}
          <ol className="mt-3 grid gap-1">
            {GREEK_LIFECYCLE.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button" onClick={() => setStep(i)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                  style={{ background: i === step ? "rgba(0,107,166,0.18)" : "transparent", color: i < step ? "var(--text-secondary, #AAB4C8)" : "var(--brand-cream, #F7F0E6)" }}
                >
                  <span className="w-5 shrink-0 text-[12px] tabular-nums" style={{ color: "var(--text-secondary, #AAB4C8)" }}>{i < step ? "✓" : i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{s.title}</span>
                  <span className="shrink-0 text-[11px]" style={{ color: "var(--text-secondary, #AAB4C8)" }}>{s.role}</span>
                </button>
              </li>
            ))}
          </ol>

          {/* ── TEST PANEL ───────────────────────────────────────────────────────────────────
              The shortcuts that keep a run moving: approve the claim without a trip to outreach,
              and reset the fixture to walk it again. Both are hard-scoped to the test chapter on
              the server — they cannot touch a real one — and both are dead unless
              TEST_MODE_ENABLED is set. */}
          <div className="mt-3 rounded-xl px-3 py-3" style={{ background: "rgba(122,46,18,0.18)", border: "1px solid #C2571F" }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase" style={{ color: "#FFC9A3", letterSpacing: "0.12em" }}>Test panel</p>
              <button type="button" onClick={loadFixture} className="text-[12px] font-bold underline underline-offset-4" style={{ color: "#FFC9A3" }}>Refresh</button>
            </div>

            <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-secondary, #AAB4C8)" }}>
              {fx?.ready
                ? `Test Chapter · ${fx.claimStatus ?? "unclaimed"}${fx.pendingClaimId ? " · claim pending" : ""} · ${fx.members} member${fx.members === 1 ? "" : "s"}${fx.seatPools ? ` · ${fx.seatPools} seat pool${fx.seatPools === 1 ? "" : "s"}` : ""}`
                : (fx?.note || "Reading the fixture…")}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {/* Approve — offered only when there IS a pending claim to approve. */}
              <button
                type="button"
                disabled={busy !== null || !fx?.pendingClaimId}
                title={fx?.pendingClaimId ? `Approve the claim from ${fx.claimantEmail ?? "the exec"}` : "Submit a claim at step 3 first"}
                onClick={async () => {
                  setBusy("approve"); setMsg(null);
                  try {
                    const r = await testApproveFixtureClaim();
                    setMsg(r.ok ? "Claim approved — the dashboard is now reachable." : (r.error ?? "Couldn't approve that."));
                    loadFixture();
                  } catch { setMsg("Couldn't reach the server."); }
                  finally { setBusy(null); }
                }}
                className="rounded-lg px-3 text-[13px] font-black disabled:opacity-40"
                style={{ minHeight: 40, background: "var(--accent, #FFA611)", color: "#0B1220" }}
              >
                {busy === "approve" ? "…" : "Approve claim"}
              </button>

              {/* Reset — the destructive one, so it says what it removes before it runs. */}
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  if (!window.confirm("Reset the test chapter? This deletes its members, claims and seat pools. Nothing outside the fixture is touched.")) return;
                  setBusy("reset"); setMsg(null);
                  try {
                    const r = await resetFixture();
                    const gone = Object.entries(r.removed ?? {}).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(", ");
                    setMsg(r.ok ? `Fixture reset${gone ? ` — removed ${gone}` : ""}.` : (r.error ?? "Reset failed."));
                    loadFixture();
                  } catch { setMsg("Couldn't reach the server."); }
                  finally { setBusy(null); }
                }}
                className="rounded-lg px-3 text-[13px] font-black disabled:opacity-40"
                style={{ minHeight: 40, background: "var(--bg-surface, #162443)", border: "1px solid var(--border-default, #34486D)", color: "var(--brand-cream, #F7F0E6)" }}
              >
                {busy === "reset" ? "…" : "Reset fixture"}
              </button>

              <a
                href="/chapters/dashboard"
                className="inline-flex items-center rounded-lg px-3 text-[13px] font-black"
                style={{ minHeight: 40, background: "var(--bg-surface, #162443)", border: "1px solid var(--border-default, #34486D)", color: "var(--brand-cream, #F7F0E6)" }}
              >
                Dashboard →
              </a>
            </div>

            {msg && <p className="mt-2 text-[12.5px]" style={{ color: "#FFC9A3" }}>{msg}</p>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--border-subtle, rgba(52,72,109,0.55))" }}>
            <a href={TEST_CHAPTER_URL} className="text-[12.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-secondary, #AAB4C8)" }}>Test chapter</a>
            <a href={TEST_CAMPUS_URL} className="text-[12.5px] font-bold underline underline-offset-4" style={{ color: "var(--text-secondary, #AAB4C8)" }}>Test campus</a>
            <button
              type="button"
              onClick={() => { const n = restartTestRun(); if (n) setSession(n); }}
              className="ml-auto rounded-lg px-3 text-[12.5px] font-black"
              style={{ minHeight: 36, background: "var(--bg-surface, #162443)", border: "1px solid var(--border-default, #34486D)", color: "var(--brand-cream, #F7F0E6)" }}
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </>
  );
}
