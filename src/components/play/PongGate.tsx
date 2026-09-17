// THE WORKSHOP GATE (Lee, 2026-09-16: "push to a route on main … 1000students as
// password to page"). A shared word so testers can get in and nobody else
// stumbles on it — not security, just a door. Remembered on the device.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

const WORD = "1000students";
const KEY = "sa.pong.gate";

export function PongGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [typed, setTyped] = useState("");
  const [wrong, setWrong] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(KEY) === WORD); } catch { setOpen(false); }
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim().toLowerCase() === WORD) {
      try { localStorage.setItem(KEY, WORD); } catch { /* private window */ }
      setOpen(true);
    } else {
      setWrong(true);
    }
  };
  if (open === null) return null;
  if (open) return <>{children}</>;
  return (
    <form onSubmit={submit} style={{ maxWidth: 360, margin: "40px auto", padding: "22px 20px", borderRadius: 16, background: "#162443", border: "1px solid #34486D", color: "#F7F0E6", fontFamily: BRAND_SANS, textAlign: "center" }}>
      <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 22 }}>Accounting Pong</div>
      <p style={{ margin: "8px 0 14px", fontSize: 13.5, color: "#AAB4C8" }}>This one is still in the workshop. Enter the word Lee gave you.</p>
      <input value={typed} onChange={(e) => { setTyped(e.target.value); setWrong(false); }} autoFocus autoComplete="off" aria-label="Password" placeholder="Password"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${wrong ? "#FF5C6C" : "#34486D"}`, background: "#0D1730", color: "#F7F0E6", fontSize: 15, fontFamily: BRAND_SANS }} />
      {wrong && <div style={{ marginTop: 6, fontSize: 12.5, color: "#FF5C6C" }}>That’s not it.</div>}
      <button type="submit" style={{ marginTop: 12, width: "100%", padding: "11px 16px", borderRadius: 999, border: 0, background: "#E63B2D", color: "#F7F0E6", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: BRAND_SANS }}>Let me in</button>
    </form>
  );
}
