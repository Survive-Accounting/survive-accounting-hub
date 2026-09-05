// THE WRITING SURFACE — shared by the standalone scratchpad (Notepad.tsx) and the in-session
// panel the Recorder shows when Lee presses N mid-take. A contentEditable div driven by
// document.execCommand: bold/italic/underline and a font-size ladder (1–7, legacy but genuinely
// cross-browser). Lee, 2026-09-05: "This is NOT supposed to become Notion."
import { useEffect, useRef } from "react";

import { BRAND_FONT } from "@/components/blastoff/stage";
import { BoltWatermark } from "./BoltWatermark";
import { NOTEPAD_DEFAULT_SIZE, stepFontSize } from "./notepad-format";

const CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)", GOLD = "#FCA311";

export function NotepadSurface({ html, onChange, autoFocus, compact }: {
  html: string;
  onChange: (html: string) => void;
  autoFocus?: boolean;
  /** The in-recorder panel is shorter (it shares the screen with the control bar). */
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(NOTEPAD_DEFAULT_SIZE);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
  }, [html]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  const commit = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const cmd = (name: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, value);
    commit();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); cmd("bold"); return; }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); cmd("italic"); return; }
    if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); cmd("underline"); return; }
    if (e.shiftKey && (e.key === ">" || e.key === ".")) { e.preventDefault(); sizeRef.current = stepFontSize(sizeRef.current, 1); cmd("fontSize", String(sizeRef.current)); return; }
    if (e.shiftKey && (e.key === "<" || e.key === ",")) { e.preventDefault(); sizeRef.current = stepFontSize(sizeRef.current, -1); cmd("fontSize", String(sizeRef.current)); return; }
    // Every other key is plain typing. R and N stay the site's global shortcuts everywhere
    // else, but the global listeners check isTyping(e.target) and this div IS a typing
    // target (isContentEditable) — so typing the letter "r" or "n" here never opens anything.
  };

  const tool = (label: string, title: string, onClick: () => void) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      style={{ font: "inherit", fontSize: 13, fontWeight: 800, padding: "6px 11px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 640, height: compact ? "100%" : "60vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {tool("B", "Bold — ⌘/Ctrl B", () => cmd("bold"))}
        {tool("I", "Italic — ⌘/Ctrl I", () => cmd("italic"))}
        {tool("U", "Underline — ⌘/Ctrl U", () => cmd("underline"))}
        {tool("A−", "Smaller — Shift <", () => { sizeRef.current = stepFontSize(sizeRef.current, -1); cmd("fontSize", String(sizeRef.current)); })}
        {tool("A+", "Bigger — Shift >", () => { sizeRef.current = stepFontSize(sizeRef.current, 1); cmd("fontSize", String(sizeRef.current)); })}
      </div>
      <div style={{ position: "relative", flex: 1, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
        <BoltWatermark size={compact ? 220 : 340} opacity={0.05} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }} />
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={commit}
          onBlur={commit}
          onKeyDown={onKeyDown}
          style={{ position: "relative", height: "100%", overflowY: "auto", padding: 18, fontFamily: BRAND_FONT, fontSize: 16, lineHeight: 1.6, color: CREAM, outline: "none" }}
          data-placeholder="Write or sketch a thought…"
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: MUTED }}>
        Autosaves as you type. <span style={{ color: GOLD }}>⌘B</span> bold · <span style={{ color: GOLD }}>⌘I</span> italic · <span style={{ color: GOLD }}>⌘U</span> underline · <span style={{ color: GOLD }}>Shift &gt;/&lt;</span> size
      </div>
    </div>
  );
}
