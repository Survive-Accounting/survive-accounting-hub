// TEST MODE UI (08-23) — the rust top bar + the right-side guided-run drawer. Mounted at
// __root, hidden unless test mode is armed. Everything student-facing keeps working exactly
// the same underneath; this is a scaffold, not a replacement.
//
// SHAPES:
//   • BAR — persistent, top of viewport, ~34px on desktop / ~40px on mobile. Left: TEST MODE
//     label + "nothing here is real. Emails go to <tester>." Right: "Student run · N/9" and a
//     Steps toggle. On mobile the label collapses to just "TEST MODE".
//   • DRAWER — right side, 360px wide desktop; full-width sheet on mobile (< sm). Header +
//     nine step cards + Start-over. Auto-detect uses shared step ids (test-mode.ts) so any
//     component can call markStep(id) without knowing about the drawer.
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Circle, Copy, X } from "lucide-react";

import { STEP_HINTS, STEP_IDS, STEP_TITLES, TEST_DRAWER_KEY, resetSteps, useTestMode, useTestSteps, type StepId } from "@/lib/test-mode";

const RUST = "#B23A17";
const RUST_DK = "#7A2610";
const CREAM = "#F5EFE6";

// STRIPE TEST CARDS — copy-paste, shown in step 8 and always visible in the "Test cards"
// footer of the drawer. Chosen from Stripe docs (test mode). The last is 3DS.
const CARDS: Array<{ label: string; num: string }> = [
  { label: "Success",       num: "4242 4242 4242 4242" },
  { label: "Declined",      num: "4000 0000 0000 0002" },
  { label: "3DS challenge", num: "4000 0025 0000 3155" },
];

// ──────────────────────────────────────────────────────────────────────────────────────────
// BAR
// ──────────────────────────────────────────────────────────────────────────────────────────
export function TestModeBar() {
  const tm = useTestMode();
  const steps = useTestSteps();
  const [drawerOpen, setDrawerOpen] = useState<boolean>(() => { try { return localStorage.getItem(TEST_DRAWER_KEY) !== "0"; } catch { return true; } });
  const toggle = () => { setDrawerOpen((v) => { const next = !v; try { localStorage.setItem(TEST_DRAWER_KEY, next ? "1" : "0"); } catch { /* ignore */ } return next; }); };
  if (!tm.enabled) return null;
  const email = tm.tester.email ?? "your inbox";
  const name = tm.tester.name;
  return (
    <>
      <div className="sticky top-0 z-[300] flex items-stretch" style={{ background: RUST, color: CREAM, fontFamily: "system-ui, -apple-system, sans-serif", borderBottom: `1px solid ${RUST_DK}` }}>
        <div className="flex flex-1 items-center gap-3 px-3 py-1.5 text-[12px] sm:text-[13px]">
          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]" style={{ background: "rgba(0,0,0,0.25)" }}>TEST MODE</span>
          <span className="hidden sm:inline">nothing here is real. Emails go to <b style={{ color: CREAM }}>{email}</b>{name ? ` · ${name}` : ""}.</span>
          <span className="sm:hidden truncate">emails → {email}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] sm:text-[13px]">
          <span className="tabular-nums" style={{ color: CREAM }}>Student run · <b>step {Math.min(steps.currentIndex + 1, steps.total)}/{steps.total}</b></span>
          <button type="button" onClick={toggle} className="rounded border px-2 text-[11px] font-black uppercase tracking-wide" style={{ minHeight: 26, borderColor: "rgba(0,0,0,0.35)", background: "rgba(0,0,0,0.15)", color: CREAM }} aria-label={drawerOpen ? "Hide steps" : "Show steps"} aria-expanded={drawerOpen}>
            {drawerOpen ? "Hide steps" : "Show steps"}
          </button>
        </div>
      </div>
      {drawerOpen && <TesterDrawer onClose={toggle} />}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// DRAWER
// ──────────────────────────────────────────────────────────────────────────────────────────
function TesterDrawer({ onClose }: { onClose: () => void }) {
  const tm = useTestMode();
  const steps = useTestSteps();
  useEffect(() => {
    // Land: as soon as the drawer mounts, the tester is on a page → step 1 auto-completes.
    if (!steps.steps.land?.done) steps.markStep("land", { path: typeof window !== "undefined" ? window.location.pathname : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startOver = () => {
    resetSteps();
    tm.resetRun();
    try {
      // NEVER touches real data. Only wipes local session bits the guided run cares about.
      ["sa-two-set-ask", "sa-practice-coverage", "sa-practice-session", "sa-resume", "sa-cram-auto"].forEach((k) => localStorage.removeItem(k));
      // Practice per-session id gets a fresh one on the next attempt.
    } catch { /* ignore */ }
  };
  return (
    <aside role="complementary" aria-label="Test Mode guided run" className="fixed right-0 top-[34px] z-[290] flex h-[calc(100vh-34px)] w-full flex-col sm:w-[380px]" style={{ background: "#0b1020", color: CREAM, borderLeft: `1px solid ${RUST_DK}`, boxShadow: "-18px 0 30px -20px rgba(0,0,0,0.6)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <span className="text-[13px] font-black uppercase tracking-wide" style={{ color: RUST }}>Student test run</span>
        <span className="ml-auto text-[11px]" style={{ color: "rgba(245,239,230,0.7)" }} title="Session id (this run)">#{tm.session.slice(0, 6)}</span>
        <button type="button" onClick={onClose} aria-label="Hide steps" className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-2">
        {STEP_IDS.map((id, i) => <StepCard key={id} id={id} index={i} state={steps.steps[id]} isCurrent={steps.currentIndex === i} />)}
        <details className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2 text-[12px]">
          <summary className="cursor-pointer font-bold" style={{ color: RUST }}>Test cards (Stripe)</summary>
          <div className="mt-2 space-y-1.5">
            {CARDS.map((c) => (
              <div key={c.num} className="flex items-center gap-2 rounded bg-black/30 px-2 py-1.5">
                <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide" style={{ color: "rgba(245,239,230,0.7)" }}>{c.label}</span>
                <code className="flex-1 tabular-nums text-[12.5px]">{c.num}</code>
                <button type="button" onClick={() => { void navigator.clipboard.writeText(c.num); }} className="grid h-7 w-7 place-items-center rounded hover:bg-white/10" title="Copy" aria-label={`Copy ${c.label} card`}><Copy className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <p className="mt-1 text-[11px]" style={{ color: "rgba(245,239,230,0.6)" }}>Any future date, any CVC, any postcode.</p>
          </div>
        </details>
      </div>
      <footer className="border-t px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="mb-2 text-[11px]" style={{ color: "rgba(245,239,230,0.7)" }}>Real test data — nothing counted in real analytics.</div>
        <div className="flex gap-2">
          <button type="button" onClick={startOver} className="flex-1 rounded-lg px-3 text-[12px] font-black uppercase tracking-wide" style={{ minHeight: 40, background: "rgba(178,58,23,0.18)", border: `1px solid ${RUST_DK}`, color: RUST }}>Start student test over</button>
          <button type="button" onClick={() => { tm.deactivate(); }} className="rounded-lg px-3 text-[12px] font-black uppercase tracking-wide" style={{ minHeight: 40, border: "1px solid rgba(255,255,255,0.15)", color: CREAM }}>Exit Test Mode</button>
        </div>
      </footer>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// STEP CARD
// ──────────────────────────────────────────────────────────────────────────────────────────
function StepCard({ id, index, state, isCurrent }: { id: StepId; index: number; state: { done: boolean } | undefined; isCurrent: boolean }) {
  const done = !!state?.done;
  return (
    <div className={`rounded-lg border p-2 ${done ? "opacity-70" : ""}`} style={{ borderColor: isCurrent ? RUST : "rgba(255,255,255,0.08)", background: isCurrent ? "rgba(178,58,23,0.06)" : "rgba(255,255,255,0.02)" }}>
      <div className="flex items-start gap-2">
        {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#3BF5A0" }} /> : <Circle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: isCurrent ? RUST : "rgba(245,239,230,0.4)" }} />}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-black">
            <span className="tabular-nums" style={{ color: "rgba(245,239,230,0.65)" }}>{index + 1} · </span>
            {STEP_TITLES[id]}
          </div>
          <div className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "rgba(245,239,230,0.72)" }}>{STEP_HINTS[id]}</div>
        </div>
        {isCurrent && !done && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: RUST }} />}
      </div>
    </div>
  );
}
