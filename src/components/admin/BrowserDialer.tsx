// BROWSER DIALER — the RE20 experience. Twilio's Voice JS SDK places the call from this tab; the
// TwiML App dials the person out as the main line. The SDK is imported on first click so it never
// loads for pages that do not need it (and never on the server).
import { useEffect, useRef, useState } from "react";

import { getVoiceToken } from "@/lib/action-card.functions";

type Phase = "idle" | "loading" | "ringing" | "live" | "ended" | "error";
type Call = { disconnect: () => void; on: (e: string, f: (...a: unknown[]) => void) => void; mute: (m: boolean) => void };
type Device = { connect: (o: { params: Record<string, string> }) => Promise<Call>; destroy: () => void; on: (e: string, f: (...a: unknown[]) => void) => void };

export function BrowserDialer({ to, label, enabled }: { to: string; label: string; enabled: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const device = useRef<Device | null>(null);
  const call = useRef<Call | null>(null);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => () => { try { call.current?.disconnect(); device.current?.destroy(); } catch { /* leaving the page */ } }, []);

  const start = async () => {
    setErr(null); setPhase("loading"); setSeconds(0);
    try {
      const t = await getVoiceToken();
      if (!t.ok || !t.token) { setErr(t.error ?? "No token."); setPhase("error"); return; }
      const sdk = await import("@twilio/voice-sdk");
      const dev = new sdk.Device(t.token, { logLevel: 1 }) as unknown as Device;
      device.current = dev;
      dev.on("error", (e: unknown) => { setErr((e as { message?: string })?.message ?? "Device error"); setPhase("error"); });
      const c = await dev.connect({ params: { To: to } });
      call.current = c;
      setPhase("ringing");
      c.on("accept", () => setPhase("live"));
      c.on("disconnect", () => { setPhase("ended"); call.current = null; });
      c.on("cancel", () => { setPhase("ended"); call.current = null; });
      c.on("error", (e: unknown) => { setErr((e as { message?: string })?.message ?? "Call error"); setPhase("error"); });
    } catch (e) {
      setErr((e as Error).message); setPhase("error");
    }
  };
  const hangup = () => { try { call.current?.disconnect(); } catch { /* already gone */ } setPhase("ended"); };
  const toggleMute = () => { const m = !muted; setMuted(m); try { call.current?.mute(m); } catch { /* not live */ } };

  const btn = "rounded-xl px-4 text-[14px] font-black disabled:opacity-40";
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  if (!enabled) {
    return (
      <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Browser calling is off until <code>TWILIO_API_KEY_SID</code>, <code>TWILIO_API_KEY_SECRET</code> and <code>TWILIO_TWIML_APP_SID</code> are set on the server.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(phase === "idle" || phase === "ended" || phase === "error") && (
        <button onClick={() => void start()} className={btn} style={{ minHeight: 42, background: "var(--accent)", color: "#0B1220" }}>
          Call from this computer
        </button>
      )}
      {phase === "loading" && <span className="text-[13px]">Getting a line…</span>}
      {phase === "ringing" && <span className="text-[13px]">Ringing {label}…</span>}
      {phase === "live" && <span className="text-[13px] font-bold" style={{ color: "#3BF5A0" }}>Live {mm}</span>}
      {(phase === "ringing" || phase === "live") && (
        <>
          <button onClick={toggleMute} className={btn} style={{ minHeight: 42, background: "rgba(245,239,230,0.1)", color: "var(--brand-cream)" }}>{muted ? "Unmute" : "Mute"}</button>
          <button onClick={hangup} className={btn} style={{ minHeight: 42, background: "#CE1126", color: "#fff" }}>Hang up</button>
        </>
      )}
      {phase === "ended" && <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Call ended{seconds ? ` after ${mm}` : ""}.</span>}
      {err && <span className="text-[12.5px]" style={{ color: "#FCA311" }}>{err}</span>}
    </div>
  );
}
