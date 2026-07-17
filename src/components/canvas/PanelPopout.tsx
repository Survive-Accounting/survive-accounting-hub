// PANEL POPOUTS — the director's monitor. A panel's existing React subtree is
// portaled into a SEPARATE browser window (window.open, opened from the click
// gesture in the route and handed here). Same React tree ⇒ the command bus,
// frame-nav context, deck state and selection all keep working with NO
// cross-window sync layer. The popout window lives on Lee's second monitor,
// invisible to OBS Window Capture on the canvas window while staying fully live.
//
// Styling: the app's <style>/<link> nodes are cloned into the popout document
// head (prod ships a <link>, so it re-fetches the same CSS; dev's injected
// <style> is copied — re-open the popout after a big HMR change if it drifts).
// Cleanup: closing the popout window returns the panel to the canvas; closing
// the main window closes every popout.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlignJustify, ExternalLink, Minus, Plus, SunMedium } from "lucide-react";
import { useNodes } from "@xyflow/react";

import { frameCellLabel } from "./frames";
import { hasScript } from "./script-doc";
import { NEON } from "./theme";
import type { FrameBox } from "./types";

function cloneDocStyles(target: Document) {
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => {
    try { target.head.appendChild(n.cloneNode(true)); } catch { /* ignore */ }
  });
}

/** Opens a blank popout window. MUST be called from a user gesture (a click),
 *  so the route calls this in the pop-out button handler, not in an effect. */
export function openPopoutWindow(name: string, width = 640, height = 900): Window | null {
  return window.open("", `sa-pop-${name}`, `popup=yes,width=${width},height=${height}`);
}

export function PanelPopout({ win, title, onReturn, children }: {
  win: Window;
  title: string;
  onReturn: () => void;
  children: ReactNode;
}) {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    win.document.title = `${title} · Survive Canvas`;
    win.document.body.style.cssText = `margin:0;background:${NEON.bg};color:${NEON.text};overflow:hidden;font-family:Inter,system-ui,sans-serif`;
    cloneDocStyles(win.document);
    const el = win.document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column";
    win.document.body.appendChild(el);
    setMount(el);
    const onHide = () => onReturn();                    // closing the popout returns the panel
    const closeChild = () => { try { win.close(); } catch { /* ignore */ } }; // main window closes → close popout
    win.addEventListener("pagehide", onHide);
    window.addEventListener("pagehide", closeChild);
    return () => {
      win.removeEventListener("pagehide", onHide);
      window.removeEventListener("pagehide", closeChild);
      try { win.close(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win]);
  if (!mount) return null;
  return createPortal(
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${NEON.borderSoft}`, background: NEON.bg2, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: NEON.yellow }}>{title}</span>
        <span style={{ flex: 1 }} />
        <button onClick={onReturn} style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 6, padding: "5px 11px", fontSize: 11.5, fontWeight: 600, color: NEON.text, border: `1px solid ${NEON.borderSoft}`, background: "transparent", cursor: "pointer" }}>
          <ExternalLink style={{ width: 13, height: 13, transform: "scaleX(-1)" }} /> return to canvas
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>{children}</div>
    </>,
    mount,
  );
}

/** In-canvas chip shown where a panel was while it's popped out (click to bring
 *  it back). Absolute — the caller positions it. */
export function PopoutPlaceholder({ title, onReturn, style }: { title: string; onReturn: () => void; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onReturn}
      className="absolute z-40 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
      style={{ background: NEON.panel, border: `1px dashed ${NEON.border}`, color: NEON.muted, backdropFilter: "blur(6px)", ...style }}
      title={`${title} is popped out to a second window — click to bring it back`}
    >
      <ExternalLink className="h-3 w-3" /> {title} · popped out
    </button>
  );
}

const TP_LS = "sa-canvas-teleprompter";
function loadTp(): { size: number; hc: boolean } {
  try { const r = JSON.parse(localStorage.getItem(TP_LS) || "{}"); return { size: typeof r.size === "number" ? r.size : 28, hc: !!r.hc }; } catch { return { size: 28, hc: false }; }
}

/** TELEPROMPTER popout — the reason this exists. Fills its window, follows frame
 *  navigation live (subscribes to the node store), big type for reading at 2–3ft
 *  off the lens, with a font-size stepper + high-contrast mode. */
export function TeleprompterPopout({ frameId }: { frameId: string | null }) {
  const nodes = useNodes();
  const [{ size, hc }, setCfg] = useState(loadTp);
  const set = (patch: Partial<{ size: number; hc: boolean }>) => setCfg((p) => { const n = { ...p, ...patch }; try { localStorage.setItem(TP_LS, JSON.stringify(n)); } catch { /* ignore */ } return n; });

  const frame = frameId ? nodes.find((n) => n.id === frameId) : null;
  const d = frame ? (frame.data as unknown as FrameBox) : undefined;
  const script = d?.script;
  const label = frame ? `${frameCellLabel(frame as never)}${d?.title ? ` — ${d.title}` : ""}` : "";
  const beats = (script?.beats ?? "").split("\n").map((b) => b.trim().replace(/^[-*•]\s+/, "")).filter(Boolean);

  const fg = hc ? "#FFFFFF" : "rgba(255,255,255,0.92)";
  const entryC = hc ? "#FFE07A" : "#FFD98A";
  const exitC = hc ? "#BFE6FF" : "#8FD3FF";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: hc ? "#000" : NEON.bg }}>
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}`, flexShrink: 0 }}>
        <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: NEON.muted }}>{frame ? label : "Enter a frame to prompt"}</span>
        <button className="grid h-6 w-6 place-items-center rounded" title="Smaller" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => set({ size: Math.max(16, size - 3) })}><Minus className="h-3 w-3" /></button>
        <span className="text-[10px] tabular-nums" style={{ color: NEON.muted }}>{size}px</span>
        <button className="grid h-6 w-6 place-items-center rounded" title="Larger" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => set({ size: Math.min(72, size + 3) })}><Plus className="h-3 w-3" /></button>
        <button className="grid h-6 w-6 place-items-center rounded" title="High contrast" style={{ color: hc ? "#0B1322" : NEON.text, background: hc ? NEON.yellow : "transparent", border: `1px solid ${hc ? NEON.yellow : NEON.borderSoft}` }} onClick={() => set({ hc: !hc })}><SunMedium className="h-3 w-3" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {!frame || !hasScript(script) ? (
          <p className="italic" style={{ fontSize: size * 0.6, color: NEON.muted }}>
            {frame ? "No script for this frame yet — write it in the Script editor." : "Enter a frame — the prompter reads its script."}
          </p>
        ) : (
          <>
            {(script?.entry ?? "").trim() && <p style={{ fontSize: size, fontWeight: 800, lineHeight: 1.25, color: entryC }}>{script!.entry}</p>}
            {beats.length > 0 && (
              <ul className="mt-3 space-y-2">
                {beats.map((b, i) => (
                  <li key={i} className="flex gap-3" style={{ fontSize: size * 0.82, fontWeight: 600, lineHeight: 1.3, color: fg }}>
                    <AlignJustify className="mt-1 shrink-0" style={{ width: size * 0.4, height: size * 0.4, color: NEON.yellow }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {(script?.exit ?? "").trim() && (
              <p className="mt-4 border-t pt-3 italic" style={{ borderColor: "rgba(255,255,255,0.15)", fontSize: size * 0.82, fontWeight: 700, lineHeight: 1.3, color: exitC }}>→ {script!.exit}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
