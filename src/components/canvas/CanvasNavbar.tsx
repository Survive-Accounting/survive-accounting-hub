// CANVAS NAVBAR (v2 chrome) — the ONE top bar of the simplified study canvas.
// File (save / load / export / import / new tab / RESET), Hotkeys (read-only cheat
// sheet — the same "?" overlay, so it can never drift), CEQ Studio door, and a
// disabled "Student view" (coming soon). "View archive" switches back to the full
// Dashboard v1 chrome (old toolbar + drawer) — nothing was deleted, only gated.
// Authoring-only: the route renders it when `chrome && v2`; film mode never sees it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Archive, ChevronDown, Download, Eraser, Eye, FilePlus2, FolderOpen, Home as HomeIcon, Keyboard, ListOrdered, Plus, RotateCcw, Save, Sprout, Upload } from "lucide-react";

import { NEON } from "./theme";

function NavMenuRow({ icon, label, danger, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors"
      style={{ color: danger ? "#FF8B9E" : NEON.text }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "rgba(255,92,108,0.14)" : "rgba(252,163,17,0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onClick={onClick}
    >
      <span style={{ color: danger ? "#FF8B9E" : NEON.muted }}>{icon}</span> {label}
    </button>
  );
}

export function CanvasNavbar({ sceneName, setSceneName, savedNote, onSave, onSaveAs, onLoad, onExport, onImport, onNewTab, onReset, onSeedSets, onCleanNames, onHotkeys, onOpenStudio, onViewV1, onHome, homeActive }: {
  onHome: () => void; homeActive: boolean;
  sceneName: string;
  setSceneName: (v: string) => void;
  savedNote?: string | null;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: () => void;
  onNewTab: () => void;
  onReset: () => void;
  onSeedSets: () => void;
  onCleanNames: () => void;
  onHotkeys: () => void;
  onOpenStudio: () => void;
  onViewV1: () => void;
}) {
  const [fileOpen, setFileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Esc / click-away close for the File dropdown. CAPTURE-phase + stopPropagation so
  // the canvas's own Esc ladder (a bubble-phase window keydown in useKeymap) never
  // fires on the SAME press that closes this menu — Esc closes exactly one thing.
  useEffect(() => {
    if (!fileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setFileOpen(false); } };
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setFileOpen(false); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerdown", onDown); };
  }, [fileOpen]);
  const item = (icon: ReactNode, label: string, fn: () => void, danger?: boolean) => (
    <NavMenuRow icon={icon} label={label} danger={danger} onClick={() => { setFileOpen(false); fn(); }} />
  );

  return (
    <div className="relative z-[65] flex h-11 shrink-0 items-center gap-2 px-3" style={{ background: "rgba(9,14,26,0.97)", borderBottom: `1px solid ${NEON.borderSoft}` }}>
      {/* HOME — a BUTTON, not a brand mark (the wordmark/bolt lockup is gone; the home frame IS
          the brand now). Closes the current scene view back to the home state, with the same
          unsaved-changes guard as closing a tab. */}
      <button
        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold"
        style={homeActive ? { color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}` } : { color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
        onClick={onHome}
        title="Home — close the scene view (unsaved changes are guarded)"
      >
        <HomeIcon className="h-3.5 w-3.5" /> Home
      </button>

      {/* FILE */}
      <div className="relative" ref={ref}>
        <button
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold"
          style={{ color: fileOpen ? "#0B1322" : NEON.text, background: fileOpen ? NEON.yellow : "transparent", border: `1px solid ${fileOpen ? NEON.yellow : NEON.borderSoft}` }}
          onClick={() => setFileOpen((v) => !v)}
        >
          File <ChevronDown className="h-3 w-3" />
        </button>
        {fileOpen && (
          <div className="absolute left-0 top-9 z-[70] w-60 rounded-xl p-1.5" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 18px 40px -16px rgba(0,0,0,0.7)" }}>
            {/* Scene-dependent rows hide on the home state — there is no scene to save/export/reset. */}
            {!homeActive && item(<Save className="h-3.5 w-3.5" />, "Save", onSave)}
            {!homeActive && item(<FilePlus2 className="h-3.5 w-3.5" />, "Save as new", onSaveAs)}
            {item(<FolderOpen className="h-3.5 w-3.5" />, "Open… (scenes + folders)", onLoad)}
            <div className="my-1 h-px" style={{ background: NEON.borderSoft }} />
            {!homeActive && item(<Download className="h-3.5 w-3.5" />, "Export (.json + .md)", onExport)}
            {item(<Upload className="h-3.5 w-3.5" />, "Import from file", onImport)}
            {item(<Plus className="h-3.5 w-3.5" />, "New scene", onNewTab)}
            <div className="my-1 h-px" style={{ background: NEON.borderSoft }} />
            {/* Hotkeys + Studio moved in from the top bar (header consolidation) — the shortcuts
                keep working; the labels say so. */}
            {item(<Keyboard className="h-3.5 w-3.5" />, "Hotkeys — press ?", onHotkeys)}
            {item(<ListOrdered className="h-3.5 w-3.5" />, "Open Studio", onOpenStudio)}
            {!homeActive && <div className="my-1 h-px" style={{ background: NEON.borderSoft }} />}
            {!homeActive && item(<Sprout className="h-3.5 w-3.5" />, "Seed starter sets", onSeedSets)}
            {!homeActive && item(<Eraser className="h-3.5 w-3.5" />, "Clean set names", onCleanNames)}
            {!homeActive && <div className="my-1 h-px" style={{ background: NEON.borderSoft }} />}
            {!homeActive && item(<RotateCcw className="h-3.5 w-3.5" />, "Reset… (canvas · CEQs · both)", onReset, true)}
            <div className="my-1 h-px" style={{ background: NEON.borderSoft }} />
            {item(<Archive className="h-3.5 w-3.5" />, "View archive: Dashboard v1", onViewV1)}
          </div>
        )}
      </div>

      {/* Scene name — only when a scene is actually open; Home is an app state, never a scene. */}
      {!homeActive && (<>
        <span className="mx-1 h-4 w-px" style={{ background: NEON.borderSoft }} />
        <input
          className="w-48 bg-transparent text-[12.5px] font-semibold outline-none"
          value={sceneName}
          onChange={(e) => setSceneName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          title="Scene name"
        />
      </>)}

      <div className="min-w-0 flex-1" />
      {savedNote && <span className="truncate text-[10.5px]" style={{ color: NEON.muted }}>{savedNote}</span>}

      {/* STUDENT VIEW — coming soon (disabled on purpose) */}
      <button
        className="flex cursor-not-allowed items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold opacity-50"
        style={{ color: NEON.muted, border: `1px dashed ${NEON.borderSoft}` }}
        disabled
        title="Student view — coming soon (the gamified course map)"
      >
        <Eye className="h-3.5 w-3.5" /> Student view · soon
      </button>
    </div>
  );
}
