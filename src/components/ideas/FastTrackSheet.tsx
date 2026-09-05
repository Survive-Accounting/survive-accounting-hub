// FAST TRACK — Ctrl+F on any internal page. A request in a sentence or two, the page captured,
// the guidelines beside it, and the day's allowance. Sends to the build queue; nothing else.
import { useEffect, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { FAST_TRACK_GUIDELINES } from "@/lib/fast-track";
import { fastTrackAllowanceFn, submitFastTrack } from "@/lib/fast-track.functions";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.14)", INK = "#0B0F1E";

export function FastTrackSheet({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const who = getAdminWho() ?? "lee";
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    setSent(null); setErr(null);
    fastTrackAllowanceFn({ data: { who } }).then((a) => setLeft(a.left)).catch(() => setLeft(undefined));
  }, [open, who]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await submitFastTrack({ data: { who, text, path: pathname, pageTitle: typeof document !== "undefined" ? document.title : "" } });
      if (!r.ok) { setErr(r.error); setLeft(r.left); return; }
      setLeft(r.left); setText("");
      setSent(`Sent. It's in the queue — the build machine picks it up on its next pass, and Lee gets the preview by email. Track it at /buildqueue.`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Fast track a small change" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147483001, background: "rgba(5,8,16,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: INK, color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 16, padding: 18, fontFamily: "'Rubik', system-ui, sans-serif", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>⚡ Fast track</div>
          <div style={{ fontSize: 12, color: MUTED }}>a small change, built tonight</div>
          <span style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: left === 0 ? "#FF9F43" : MUTED }}>
            {left === undefined ? "" : left === null ? "no daily limit" : `${left} of 10 left today`}
          </div>
        </div>
        {sent ? (
          <div style={{ marginTop: 14, padding: "12px 14px", border: `1px solid ${GOLD}66`, borderRadius: 10, fontSize: 13.5, lineHeight: 1.5 }}>
            {sent}
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setSent(null)} style={{ ...btn, background: GOLD, color: INK }}>Send another</button>
              <button type="button" onClick={onClose} style={btn}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4}
              placeholder={`What should change on this page, and what should it look like after?`}
              style={{ marginTop: 12, width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(255,255,255,0.04)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.45, fontFamily: "inherit" }} />
            <div style={{ marginTop: 6, fontSize: 11.5, color: MUTED }}>Page: <code style={{ color: CREAM }}>{pathname}</code> · captured automatically</div>
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: GOLD, fontWeight: 600 }}>What fits on the fast track</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: CREAM, lineHeight: 1.5, opacity: 0.9 }}>
                {FAST_TRACK_GUIDELINES.map((g, i) => <li key={i} style={{ margin: "3px 0" }}>{g}</li>)}
              </ul>
            </details>
            {err && <div style={{ marginTop: 10, fontSize: 12.5, color: "#FF9F43" }}>{err}</div>}
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" disabled={busy || text.trim().length < 8 || left === 0} onClick={() => void send()}
                style={{ ...btn, background: GOLD, color: INK, opacity: busy || text.trim().length < 8 || left === 0 ? 0.5 : 1 }}>
                {busy ? "Sending…" : "Send to fast track"}
              </button>
              <button type="button" onClick={onClose} style={btn}>Cancel</button>
              <span style={{ flex: 1 }} />
              <a href="/buildqueue" style={{ fontSize: 12, color: MUTED, textDecoration: "underline", textUnderlineOffset: 3 }}>the queue</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" };
