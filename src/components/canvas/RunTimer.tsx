// RUN TIMER + READOUT (Lee) — a self-clock for whole-take cram filming. F9 starts
// a run; this shows the elapsed time BIG in a 2nd-monitor popout (invisible to
// Window Capture of the main window) with the current CEQ number and a soft
// colour shift past 3:00. The readout lists a finished run's events as mm:ss +
// label with copy-to-clipboard so Lee can paste them when cutting shorts.
import { useState } from "react";
import { Copy, Check } from "lucide-react";

import { NEON } from "./theme";
import type { FilmRun } from "./types";

/** mm:ss from milliseconds. */
export const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const OVER = 180_000; // 3:00 — soft colour shift past this

/** The popout body: elapsed time large, "X of Y", colour shift past 3:00. */
export function RunTimerBody({ elapsedMs, ceqN, ceqTotal }: { elapsedMs: number; ceqN: number; ceqTotal: number }) {
  const over = elapsedMs > OVER;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ background: "#05070d" }}>
      <div className="font-black tabular-nums" style={{ fontSize: "22vw", lineHeight: 1, color: over ? "#FFB000" : "#E9EDF5", letterSpacing: "-0.02em", transition: "color 600ms" }}>
        {mmss(elapsedMs)}
      </div>
      <div className="text-[4.5vw] font-bold uppercase tracking-widest" style={{ color: over ? "#FF8B4A" : NEON.cyan }}>
        {ceqTotal > 0 ? `${ceqN} of ${ceqTotal}` : `CEQ ${ceqN}`}
      </div>
    </div>
  );
}

/** A simple readout of a finished run — mm:ss + label per event, copy-to-clipboard. */
export function RunReadout({ run }: { run: FilmRun | null }) {
  const [copied, setCopied] = useState(false);
  if (!run) return <div className="p-3 text-[11px]" style={{ color: NEON.muted }}>No runs yet — press F9 to start one.</div>;
  const lines = run.events.map((e) => `${mmss(e.ms)}  ${e.label}`);
  const copy = () => {
    void navigator.clipboard?.writeText(lines.join("\n")).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); });
  };
  return (
    <div className="flex flex-col gap-2 p-2 text-[11px]" style={{ color: NEON.text }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Last run · {run.events.length} events</span>
        <button className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ color: copied ? "#3BF5A0" : NEON.cyan, border: `1px solid ${copied ? "#3BF5A0" : NEON.borderSoft}` }} onClick={copy} disabled={lines.length === 0}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "copied" : "copy"}
        </button>
      </div>
      {lines.length === 0 && <div style={{ color: NEON.muted }}>No events logged in this run.</div>}
      <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto font-mono text-[10.5px] leading-relaxed">
        {run.events.map((e, i) => (
          <div key={i} className="flex gap-2" style={{ color: e.kind === "resolve" ? (e.correct ? "#3BF5A0" : "#FF8B9E") : NEON.muted }}>
            <span className="tabular-nums" style={{ color: NEON.muted }}>{mmss(e.ms)}</span>
            <span className="min-w-0 flex-1 truncate">{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
