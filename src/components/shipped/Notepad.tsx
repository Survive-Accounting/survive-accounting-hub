// THE STANDALONE NOTEPAD — pressing N with no SHIPPED session active. "A temporary admin
// scratchpad for now" (Lee, 2026-09-05): it autosaves to this browser only (localStorage), not
// to the database — nothing here is a SHIPPED entry until a recording session claims it.
import { useEffect } from "react";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_FONT } from "@/components/blastoff/stage";

import { NotepadSurface } from "./NotepadSurface";

const CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.16)";

export function Notepad({ html, onChange, onClose }: { html: string; onChange: (html: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(3,5,10,0.96)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", padding: "26px 16px", color: CREAM, fontFamily: BRAND_FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <SurviveWordmark size={22} />
        <span style={{ fontSize: 12, color: MUTED }}>Scratchpad — this browser only, for now</span>
        <button type="button" onClick={onClose} title="Close (Escape)"
          style={{ marginLeft: 10, font: "inherit", fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 8, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" }}>
          Close
        </button>
      </div>
      <NotepadSurface html={html} onChange={onChange} autoFocus />
    </div>
  );
}
