// SET FILMSTRIP (frames rename §2) — the linear board: a vertical strip of the open
// set's FRAMES, frame 1 at top. This is the DEFAULT (and only) nav beside the editor;
// the free-pan whiteboard is parked behind File ▾ → "Open canvas view — experimental".
// The selected frame renders large in the work area (the existing editor) — the strip
// is the rail. Hovering the gap between two frames reveals a slim [+] (frames rename
// §3) that opens the CEQ-frame / Note-frame chooser.
//
// POLISH B lands here later (where-am-i ring, density steps, run map rail) — tonight
// the strip itself, with run letters + type glyphs already on the mini-cards.
import { useState } from "react";
import { FileText, HelpCircle, Plus, Star } from "lucide-react";

import { NEON } from "./theme";

export interface StripItem {
  id: string;
  stem: string;
  shorthand?: string;
  run?: string;
  noteOnly: boolean;
  free: boolean;
  clips: number;
  starred: boolean;
}

/** The slim [+] that lives in the gap between two frames (and above/below the ends). */
function InsertGap({ at, onInsert }: { at: number; onInsert: (at: number, kind: "ceq" | "note") => void }) {
  const [chooser, setChooser] = useState(false);
  return (
    <div className="group relative flex h-2 shrink-0 items-center justify-center" onMouseLeave={() => setChooser(false)}>
      {!chooser ? (
        <button
          className="pointer-events-auto grid h-4 w-4 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}`, zIndex: 5 }}
          onClick={() => setChooser(true)}
          title="Insert a frame here"
        >
          <Plus className="h-3 w-3" />
        </button>
      ) : (
        <div className="absolute z-10 flex items-center gap-1 rounded-lg px-1.5 py-1" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.7)" }}>
          <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setChooser(false); onInsert(at, "ceq"); }} title="A question card — counts, practices, films">
            <HelpCircle className="h-3 w-3" /> CEQ frame
          </button>
          <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { setChooser(false); onInsert(at, "note"); }} title="Text/memo-only: tips, trigger words, headspace. Films like a frame, never counts as a question">
            <FileText className="h-3 w-3" /> Note frame
          </button>
        </div>
      )}
    </div>
  );
}

export function SetFilmstrip({ items, qId, onSelect, onInsert }: {
  items: StripItem[];
  qId: string | null;
  onSelect: (id: string) => void;
  onInsert: (at: number, kind: "ceq" | "note") => void;
}) {
  // student-facing numbering: CEQ frames only — notes are breath, not questions
  let ceqN = 0;
  return (
    <div className="flex w-44 shrink-0 flex-col overflow-y-auto border-r px-1.5 py-1" style={{ borderColor: NEON.borderSoft, background: "rgba(0,0,0,0.18)" }}>
      <InsertGap at={0} onInsert={onInsert} />
      {items.map((it, i) => {
        if (!it.noteOnly) ceqN += 1;
        const active = it.id === qId;
        const label = (it.shorthand || it.stem || (it.noteOnly ? "Note" : "Question")).trim();
        return (
          <div key={it.id} className="flex shrink-0 flex-col" data-strip-frame={it.id}>
            <button
              className="flex w-full flex-col gap-0.5 rounded-lg px-1.5 py-1.5 text-left transition-colors"
              style={{
                border: `1px solid ${active ? "rgba(252,163,17,0.65)" : NEON.borderSoft}`,
                background: active ? "rgba(252,163,17,0.12)" : "rgba(9,14,26,0.5)",
              }}
              onClick={() => onSelect(it.id)}
              title={it.stem || label}
            >
              <div className="flex items-center gap-1">
                {it.noteOnly
                  ? <FileText className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} />
                  : <HelpCircle className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} />}
                <span className="text-[9px] font-bold tabular-nums" style={{ color: active ? NEON.yellow : NEON.muted }}>
                  {it.noteOnly ? "note" : `Q${ceqN}`}
                </span>
                {it.run && <span className="rounded px-1 text-[8.5px] font-black uppercase" style={{ color: "#0B1322", background: NEON.cyan }} title={`Run ${it.run} — filmed in one take`}>{it.run}</span>}
                <span className="ml-auto flex items-center gap-0.5">
                  {it.starred && <Star className="h-2.5 w-2.5" style={{ color: "#FFD23F", fill: "#FFD23F" }} />}
                  {it.clips > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3BF5A0" }} title={`${it.clips} clip${it.clips === 1 ? "" : "s"}`} />}
                  {it.free && !it.noteOnly && <span className="text-[8px] font-black" style={{ color: "#3BF5A0" }} title="Free question">🆓</span>}
                </span>
              </div>
              <span className="line-clamp-2 text-[10px] leading-tight" style={{ color: active ? NEON.text : "rgba(230,236,255,0.75)" }}>{label}</span>
            </button>
            <InsertGap at={i + 1} onInsert={onInsert} />
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="px-2 py-6 text-center text-[10px] italic" style={{ color: NEON.muted }}>
          Empty set — hover above and click [+] to add the first frame.
        </div>
      )}
    </div>
  );
}
