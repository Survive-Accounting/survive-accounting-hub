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

  // IDLE, on a Blast Off page: a small, easy-to-ignore prompt — not yet top-right.
  if (phase === "idle") {
    if (!detected) return null;
    return (
      <button type="button" onClick={start} title={`Time the ${STEP_LABEL[detected.step]} step on this set`}
        style={{ position: "fixed", left: 16, bottom: 16, zIndex: 2147482900, font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "8px 14px", borderRadius: 999, border: `1px solid ${EDGE}`, background: INK, color: CREAM, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }}>
        ⏱ Start timer — {STEP_LABEL[detected.step]}
      </button>
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
