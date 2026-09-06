// THE PRODUCTION TIMER — Lee, 2026-09-05: "I want to time how long it takes for each step for
// blast offs, talkthrough, review, film... a popup that says start timer, it moves to the top
// right and runs, then I can stop it when I'm done. Pause it, etc. It can keep a log of
// everything done." Mounted once, globally (next to ShippedDock, IdeasDock — __root.tsx),
// admin-gated the same way: nothing runs, not even the bank fetch, until unlocked.
//
// The step and the set are AUTO-DETECTED from the URL (production-time.ts) the moment Lee is on
// a Blast Off page — no picker, no setup, matching "starting with the next CEQ set" being a
// single click. Once started, the session is frozen (captured at the click) so navigating away
// mid-timer never loses or silently reassigns it.
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { isAdminUnlocked, getAdminWho } from "@/components/AdminGate";
import { findSet, findTopic, useBank } from "@/components/v3/use-bank";
import { logProductionTime } from "@/lib/production-time.functions";
import { blastOffStepFromPath, fmtElapsed, STEP_LABEL, type ProductionStep } from "@/lib/production-time";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", INK = "#0B0F1E", MINT = "#3BF5A0", ORANGE = "#FF9F43";

export function ProductionTimer() {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => { setUnlocked(isAdminUnlocked()); }, []);
  if (!unlocked) return null;
  return <ProductionTimerInner />;
}

interface Session { step: ProductionStep; topicSlug: string; setSlug: string; startedAt: string }

function ProductionTimerInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const detected = blastOffStepFromPath(pathname);
  const { topics } = useBank();

  const [phase, setPhase] = useState<"idle" | "running" | "paused">("idle");
  const [seconds, setSeconds] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // DISMISS (2026-09-06, Lee: "it's blocking stuff on bottom menu... make sure it's dismissable")
  // — keyed to the detected step+set, not a blanket "never show again": dismissing the prompt on
  // this page hides THIS one, but a different set or step is a fresh prompt.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const detectedKey = detected ? `${detected.topicSlug}/${detected.setSlug}/${detected.step}` : null;

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);
  const startTicking = () => { tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); };
  const stopTicking = () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };

  const start = () => {
    if (!detected) return;
    setSession({ ...detected, startedAt: new Date().toISOString() });
    setSeconds(0); setErr(null); setPhase("running");
    startTicking();
  };
  const pause = () => { stopTicking(); setPhase("paused"); };
  const resume = () => { startTicking(); setPhase("running"); };
  const stop = async () => {
    stopTicking();
    const s = session;
    const finalSeconds = seconds;
    setPhase("idle"); setSession(null); setSeconds(0);
    if (!s) return;
    // Resolved names + the CANONICAL set id (same identifier illustration_library uses —
    // findSet's own id, not necessarily the URL slug) — falls back to the raw slugs if the
    // bank hasn't loaded, so stopping never waits on a network call.
    const topic = topics ? findTopic(topics, s.topicSlug) : undefined;
    const set = topic ? findSet(topic, s.setSlug) : undefined;
    try {
      const r = await logProductionTime({ data: {
        setId: set?.id ?? s.setSlug, setName: set?.name ?? null, topicSlug: s.topicSlug, topicName: topic?.name ?? null,
        step: s.step, seconds: finalSeconds, startedAt: s.startedAt, endedAt: new Date().toISOString(), who: getAdminWho(),
      } });
      if (!r.ok) setErr(r.error ?? "Couldn't save the time log.");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  // NEVER ON FILM (2026-09-06, Lee: "start time has to be out of the capture window for sure").
  // BlastOffCapture's OWN chrome can be hidden with H before a take, but this widget is mounted
  // globally and has no way to know that toggle — the only guarantee that actually holds "for
  // sure" is never rendering here at all, in EITHER phase, whether or not the session was
  // started elsewhere. The timer keeps running in the background regardless (this component
  // never unmounts on navigation) — it just draws nothing while Lee is on the page OBS is
  // capturing, and reappears the moment he's back on any other Blast Off screen.
  if (detected?.step === "film") return null;

  // IDLE, on a Blast Off page: a small, easy-to-ignore prompt. Top-left (2026-09-06, Lee: "it's
  // blocking stuff on bottom menu") — capture's own chrome, the Rehearsal chip and the prompter
  // panel all live at the bottom or the right; top-left is clear on every Blast Off screen.
  if (phase === "idle") {
    if (!detected || dismissedKey === detectedKey) return null;
    return (
      <div style={{ position: "fixed", left: 16, top: 16, zIndex: 2147482900, display: "flex", alignItems: "center", gap: 4 }}>
        <button type="button" onClick={start} title={`Time the ${STEP_LABEL[detected.step]} step on this set`}
          style={{ font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "8px 14px", borderRadius: 999, border: `1px solid ${EDGE}`, background: INK, color: CREAM, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }}>
          ⏱ Start timer — {STEP_LABEL[detected.step]}
        </button>
        <button type="button" onClick={() => setDismissedKey(detectedKey)} title="Dismiss — reappears on a different set or step"
          style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${EDGE}`, background: INK, color: MUTED, cursor: "pointer", fontSize: 12, lineHeight: 1, boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }}>
          ×
        </button>
      </div>
    );
  }

  // RUNNING / PAUSED — moved to the top right, stays there regardless of what page Lee is on.
  const step = session?.step ?? detected?.step ?? "review";
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2147482900, background: INK, border: `1px solid ${phase === "running" ? MINT : ORANGE}66`, borderRadius: 12, padding: "8px 12px", boxShadow: "0 12px 28px rgba(0,0,0,0.45)", fontFamily: "'Rubik', system-ui, sans-serif", minWidth: 168 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: phase === "running" ? MINT : ORANGE, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: MUTED }}>{STEP_LABEL[step]}</span>
        <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: CREAM, fontVariantNumeric: "tabular-nums" }}>{fmtElapsed(seconds)}</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {phase === "running"
          ? <button type="button" onClick={pause} style={btn()}>⏸ Pause</button>
          : <button type="button" onClick={resume} style={btn(MINT)}>▶ Resume</button>}
        <button type="button" onClick={() => void stop()} style={btn(GOLD)}>■ Stop</button>
      </div>
      {err && <div style={{ marginTop: 6, fontSize: 10.5, color: ORANGE, lineHeight: 1.4 }}>Not saved: {err}</div>}
    </div>
  );
}

function btn(color = CREAM): React.CSSProperties {
  return { flex: 1, font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 8px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "transparent", color, cursor: "pointer" };
}
