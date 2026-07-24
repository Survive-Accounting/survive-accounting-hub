// SCRIPT-IN-PLACE (Lee) — the current frame's script docked beside its visual so
// you can write what you'll SAY next to what they'll SEE. Edits the SAME
// `frame.script` the modal + teleprompter use (one source), so everything stays
// in sync. Money lines ("!" prefix) are flagged and the read-time estimate shows
// live. Can pop to a 2nd-monitor window like the teleprompter.
import { useNodes, useReactFlow } from "@xyflow/react";
import { PanelRightClose, ScrollText, SquareArrowOutUpRight } from "lucide-react";

import { bus, patchDataFnCmd, type RfLike } from "./commands";
import { estimateFrameSeconds, formatReadTime, isOverReadTime, parseScriptLines, DEFAULT_READTIME_THRESHOLD_S } from "./script-timing";
import { NEON } from "./theme";
import type { FrameScript } from "./types";

/** The editable body — shared by the docked panel and the pop-out window. */
export function FrameScriptDockBody({ frameId, cramMode }: { frameId: string | null; cramMode?: boolean }) {
  const rf = useReactFlow();
  const rfl = rf as unknown as RfLike;
  const nodes = useNodes(); // reactive — reflects edits from anywhere
  const node = frameId ? nodes.find((n) => n.id === frameId) : undefined;
  const script = (node?.data as { script?: FrameScript } | undefined)?.script;
  const title = (node?.data as { title?: string } | undefined)?.title?.trim();

  const patch = (key: "entry" | "beats" | "exit", value: string) => {
    if (!frameId) return;
    const c = patchDataFnCmd(rfl, frameId, (prev) => ({ script: { ...((prev.script as FrameScript) ?? {}), [key]: value } }), "edit script", `d:${frameId}:script:${key}`);
    if (c) bus.dispatch(c);
  };

  if (!frameId) return <div className="p-3 text-[12px]" style={{ color: NEON.muted }}>Enter a frame to script it.</div>;

  const secs = estimateFrameSeconds(script);
  const over = isOverReadTime(secs, DEFAULT_READTIME_THRESHOLD_S);
  const beatLines = parseScriptLines(script?.beats);
  const FIELD = "nodrag nowheel w-full resize-none rounded px-2 py-1.5 text-[12.5px] leading-snug outline-none focus:ring-1";
  const fieldStyle = { background: "rgba(0,0,0,0.28)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text } as const;

  // CRAM MODE (Lee, item 4) — jot a line PER QUESTION instead of the frame script.
  // Notes live on each CEQ card (data.note); the frame's own script is untouched.
  if (cramMode) {
    const ceqs = nodes
      .filter((n) => n.parentId === frameId && n.type === "ceq")
      .sort((a, b) => (((a.data as { stageOrder?: number }).stageOrder ?? 0) - ((b.data as { stageOrder?: number }).stageOrder ?? 0)));
    const setNote = (id: string, value: string) => { const c = patchDataFnCmd(rfl, id, () => ({ note: value }), "edit CEQ note", `d:${id}:note`); if (c) bus.dispatch(c); };
    return (
      <div className="flex flex-col gap-2 p-2.5 text-[12px]">
        <div className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Per-question notes · {title || "cram"}</div>
        {ceqs.length === 0 && <div className="text-[11.5px]" style={{ color: NEON.muted }}>No CEQ cards in this frame yet — deal a set into it.</div>}
        {ceqs.map((c, i) => {
          const cd = c.data as { prompt?: string; note?: string };
          return (
            <div key={c.id} className="flex flex-col gap-1">
              <label className="truncate text-[10.5px] font-semibold" style={{ color: NEON.text }} title={cd.prompt}>{i + 1}. {cd.prompt || "Question"}</label>
              <textarea rows={2} className={FIELD} style={fieldStyle} placeholder="A line to say for this question…" value={cd.note ?? ""} onChange={(e) => setNote(c.id, e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2.5 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="truncate font-semibold" style={{ color: NEON.text }}>{title || "Untitled frame"}</span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums"
          style={{ color: over ? "#FF6B6B" : NEON.yellow, border: `1px solid ${over ? "rgba(255,107,107,0.5)" : "rgba(252,163,17,0.45)"}` }}
          title="Estimated read-time (money lines @150wpm + talking points × riff)"
        >
          ~{formatReadTime(secs)}
        </span>
      </div>

      <label className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Entry line</label>
      <textarea rows={2} className={FIELD} style={fieldStyle} placeholder="How you walk into this frame…" value={script?.entry ?? ""} onChange={(e) => patch("entry", e.target.value)} onKeyDown={(e) => e.stopPropagation()} />

      <label className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
        Beats <span className="font-normal normal-case opacity-70">— prefix a line with “!” for a money line</span>
      </label>
      <textarea rows={6} className={FIELD} style={fieldStyle} placeholder={"• point one\n• point two\n! the line that must land"} value={script?.beats ?? ""} onChange={(e) => patch("beats", e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      {beatLines.some((l) => l.text.trim()) && (
        <div className="rounded p-1.5" style={{ background: "rgba(0,0,0,0.18)", border: `1px solid ${NEON.borderSoft}` }}>
          {beatLines.filter((l) => l.text.trim()).map((l, i) => (
            <div key={i} className="flex items-start gap-1.5 py-0.5 text-[11.5px]" style={{ color: l.money ? "#FCD34D" : NEON.muted }}>
              <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.money ? "#FCA311" : "rgba(147,160,180,0.5)" }} />
              <span style={{ fontWeight: l.money ? 700 : 400 }}>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      <label className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Exit line</label>
      <textarea rows={2} className={FIELD} style={fieldStyle} placeholder="How you hand off to the next frame…" value={script?.exit ?? ""} onChange={(e) => patch("exit", e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
}

/** The docked panel — sits on the right so the frame's visual stays in view. */
export function FrameScriptDock({ frameId, onClose, onPopOut, cramMode }: { frameId: string | null; onClose: () => void; onPopOut: () => void; cramMode?: boolean }) {
  return (
    <div
      className="fixed right-3 top-16 bottom-16 z-[70] flex w-[338px] flex-col overflow-hidden rounded-xl shadow-2xl"
      style={{ background: "rgba(11,19,34,0.92)", border: `1px solid ${NEON.border}`, backdropFilter: "blur(6px)" }}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1.5" style={{ borderColor: NEON.borderSoft }}>
        <ScrollText className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: NEON.text }}>Script</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button title="Pop out to a window (2nd monitor)" onClick={onPopOut} className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }}>
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </button>
          <button title="Close (Esc) — back to the frame" onClick={onClose} className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }}>
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FrameScriptDockBody frameId={frameId} cramMode={cramMode} />
      </div>
    </div>
  );
}
