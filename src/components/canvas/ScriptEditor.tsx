// SCRIPT EDITOR (Phase 1) — the course script in one popup: every frame in the
// outline hierarchy (lesson › beat › frame) with its entry line / beats / exit
// line inline-editable. Built for ONE SITTING: Enter advances out of the
// single-line fields, Ctrl+Enter advances out of the beats box (Enter there
// makes a new bullet line), Tab walks naturally, Esc closes. Writes go through
// the command bus (undoable, keystrokes coalesce per frame+field).
//
// PHASE 2 turns this same list into the TAKE BOARD: a film-status column
// (unfilmed | filmed | retake) + per-row upload, so it doubles as the shot list.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { Download, ScrollText, X } from "lucide-react";

import { bus, patchDataFnCmd, type RfLike } from "./commands";
import { downloadText } from "./export";
import { courseScriptMarkdown, hasScript, scriptTree } from "./script-doc";
import { NEON } from "./theme";
import type { FrameScript } from "./types";

const FIELD_BG = "rgba(255,255,255,0.05)";
const FIELD_BORDER = `1px solid ${NEON.borderSoft}`;

/** Focus the next scriptable field in document order (Enter / Ctrl+Enter flow). */
function focusNextField(cur: HTMLElement, dir: 1 | -1 = 1) {
  const all = [...document.querySelectorAll<HTMLElement>("[data-sefield]")];
  const i = all.indexOf(cur);
  const next = all[i + dir];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) next.select();
    next.scrollIntoView({ block: "nearest" });
  }
}

export function ScriptEditor({ courseName, onClose, statusCell }: {
  courseName: string;
  onClose: () => void;
  /** Phase 2 slot: the take-board cell rendered at the right of each frame row. */
  statusCell?: (frameId: string, status: import("./types").FilmStatus) => React.ReactNode;
}) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes();
  const tree = useMemo(() => scriptTree(nodes as never), [nodes]);
  const totals = tree.reduce((a, l) => ({ s: a.s + l.scripted, t: a.t + l.total }), { s: 0, t: 0 });
  const boxRef = useRef<HTMLDivElement>(null);

  // Esc closes (before the canvas's own Esc ladder — this listener is capture).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  /** Patch one script field on one frame (undoable; keystrokes coalesce). */
  const patchScript = useCallback((frameId: string, key: keyof FrameScript, value: string) => {
    const c = patchDataFnCmd(
      rfl,
      frameId,
      (prev) => ({ script: { ...((prev.script as FrameScript) ?? {}), [key]: value } }),
      "edit script",
      `d:${frameId}:script:${key}`,
    );
    if (c) bus.dispatch(c);
  }, [rfl]);

  const exportScript = () => {
    const stem = courseName.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "") || "course";
    downloadText(`${stem}.script.md`, courseScriptMarkdown(tree, courseName), "text/markdown");
  };

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.85)" }}
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: NEON.borderSoft }}>
          <ScrollText className="h-4 w-4" style={{ color: NEON.yellow }} />
          <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Course script</span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{ color: NEON.muted, border: FIELD_BORDER }}>
            {totals.s}/{totals.t} frames scripted
          </span>
          <span className="flex-1" />
          <button
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold"
            style={{ color: NEON.cyan, border: FIELD_BORDER }}
            title="Export the whole course script as one markdown doc"
            onClick={exportScript}
          >
            <Download className="h-3 w-3" /> Export course script
          </button>
          <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }} title="Close (Esc)" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* body — lesson › beat › frame rows */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {tree.length === 0 && (
            <div className="py-10 text-center text-[12px]" style={{ color: NEON.muted }}>
              No lessons yet — "Add region scaffold" builds the course structure first.
            </div>
          )}
          {tree.map((l) => (
            <section key={l.lessonId} className="mb-4">
              <div className="mb-1 flex items-baseline gap-2">
                <h3 className="text-[12.5px] font-black uppercase tracking-wide" style={{ color: NEON.text }}>{l.label}</h3>
                <span className="text-[9.5px] tabular-nums" style={{ color: NEON.muted }}>{l.scripted}/{l.total} scripted{statusCell ? ` · ${l.filmed}/${l.total} filmed` : ""}</span>
              </div>
              {l.beats.map((g) => (
                <div key={g.beat} className="mb-2">
                  <div className="mb-1 text-[9.5px] font-bold uppercase tracking-widest" style={{ color: NEON.cyan }}>{g.label}</div>
                  <div className="space-y-1.5">
                    {g.frames.map((f) => (
                      <div
                        key={f.frameId}
                        className="rounded-lg p-2"
                        style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${hasScript(f.script) ? "rgba(126,243,192,0.25)" : NEON.borderSoft}` }}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="rounded px-1 text-[9px] font-bold tabular-nums" style={{ color: NEON.yellow, border: FIELD_BORDER }}>F{f.n}</span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: NEON.text }}>{f.title || "untitled frame"}</span>
                          {statusCell?.(f.frameId, f.filmStatus)}
                        </div>
                        <div className="grid gap-1">
                          <input
                            data-sefield
                            className="w-full rounded px-1.5 py-1 text-[11.5px] outline-none focus:ring-1"
                            style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }}
                            placeholder="Entry line — how the frame opens"
                            defaultValue={f.script.entry ?? ""}
                            onChange={(e) => patchScript(f.frameId, "entry", e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNextField(e.currentTarget); } }}
                          />
                          <textarea
                            data-sefield
                            rows={2}
                            className="w-full resize-none rounded px-1.5 py-1 text-[11.5px] leading-snug outline-none focus:ring-1"
                            style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }}
                            placeholder={"Beats — one talking point per line\n(Enter = new line · Ctrl+Enter = next frame)"}
                            defaultValue={f.script.beats ?? ""}
                            onFocus={(e) => grow(e.currentTarget)}
                            onInput={(e) => grow(e.currentTarget)}
                            onChange={(e) => patchScript(f.frameId, "beats", e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); focusNextField(e.currentTarget); } }}
                          />
                          <input
                            data-sefield
                            className="w-full rounded px-1.5 py-1 text-[11.5px] outline-none focus:ring-1"
                            style={{ background: FIELD_BG, border: FIELD_BORDER, color: NEON.text }}
                            placeholder="Exit line — the handoff into the next frame"
                            defaultValue={f.script.exit ?? ""}
                            onChange={(e) => patchScript(f.frameId, "exit", e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNextField(e.currentTarget); } }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="border-t px-4 py-1.5 text-[9.5px]" style={{ borderColor: NEON.borderSoft, color: NEON.muted }}>
          Enter → next field · Ctrl+Enter leaves the beats box · Tab walks everything · Esc closes · edits are undoable on the canvas
        </div>
      </div>
    </div>
  );
}
