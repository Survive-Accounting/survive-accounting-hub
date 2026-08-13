// TELEPROMPTER (Phase 1) — the CURRENT frame's script floated near the camera
// eyeline. Author-only filming chrome (never any student view): works in
// authoring AND film mode, hidden by default in film — the `p` key toggles it.
// Compact + high-contrast so it reads from across the room; a corner picker
// (top-left / top-center / top-right) parks it under wherever the webcam sits.
// Follows frame navigation automatically (it renders whatever frame is current).
import { AlignCenter, AlignLeft, AlignRight, ExternalLink, X } from "lucide-react";
import { useNodes } from "@xyflow/react";

import { frameCellLabel } from "./frames";
import { hasScript } from "./script-doc";
import { estimateFrameSeconds, formatReadTime, frameScriptLines, isOverReadTime } from "./script-timing";
import type { FrameBox, FrameScript } from "./types";

export type PrompterCorner = "tl" | "tc" | "tr";

const CORNER_STYLE: Record<PrompterCorner, React.CSSProperties> = {
  tl: { top: 12, left: 12 },
  tc: { top: 12, left: "50%", transform: "translateX(-50%)" },
  tr: { top: 12, right: 12 },
};

const CORNERS: { k: PrompterCorner; icon: typeof AlignLeft; label: string }[] = [
  { k: "tl", icon: AlignLeft, label: "Top left" },
  { k: "tc", icon: AlignCenter, label: "Top center" },
  { k: "tr", icon: AlignRight, label: "Top right" },
];

/** Live wrapper — subscribes to the node store so script edits (and frame
 *  navigation) update the prompter in place. Renders nothing without a frame. */
export function TeleprompterOverlay({ frameId, corner, onCorner, onClose, onPopOut }: {
  frameId: string | null;
  corner: PrompterCorner;
  onCorner: (c: PrompterCorner) => void;
  onClose: () => void;
  onPopOut?: () => void;
}) {
  const nodes = useNodes();
  if (!frameId) return null;
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame) return null;
  const d = frame.data as unknown as FrameBox;
  const label = `${frameCellLabel(frame as never)}${d.title ? ` — ${d.title}` : ""}`;
  return <Teleprompter script={d.script} frameLabel={label} corner={corner} onCorner={onCorner} onClose={onClose} onPopOut={onPopOut} />;
}

export function Teleprompter({ script, frameLabel, corner, onCorner, onClose, onPopOut }: {
  script: FrameScript | undefined;
  frameLabel: string;
  corner: PrompterCorner;
  onCorner: (c: PrompterCorner) => void;
  onClose: () => void;
  onPopOut?: () => void;
}) {
  // TWO SCRIPT LAYERS (item 2): money lines (verbatim) bright/bold; talking
  // points dim. Entry/exit are money by default; a beats line starting with "!"
  // is money too.
  const rows = frameScriptLines(script);
  const secs = estimateFrameSeconds(script);
  const over = isOverReadTime(secs);

  return (
    <div
      className="fixed z-[60] w-[400px] max-w-[44vw] select-none rounded-xl"
      style={{
        ...CORNER_STYLE[corner],
        background: "rgba(6,9,18,0.94)",
        border: "1px solid rgba(252,163,17,0.45)",
        boxShadow: "0 18px 50px -18px rgba(0,0,0,0.9)",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* header — tiny; the controls live here so the script body stays clean */}
      <div className="flex items-center gap-1 px-2.5 pt-1.5">
        <span className="text-[8.5px] font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(252,163,17,0.85)" }}>Prompter</span>
        <span className="min-w-0 flex-1 truncate text-[8.5px]" style={{ color: "rgba(255,255,255,0.4)" }}>{frameLabel}</span>
        {secs > 0 && (
          <span className="shrink-0 rounded px-1 text-[8.5px] font-bold tabular-nums" title="Estimated spoken time" style={{ color: over ? "#FF8B9E" : "rgba(255,255,255,0.5)", border: `1px solid ${over ? "rgba(255,139,158,0.5)" : "rgba(255,255,255,0.15)"}` }}>{formatReadTime(secs)}</span>
        )}
        {CORNERS.map(({ k, icon: Icon, label }) => (
          <button
            key={k}
            className="grid h-4 w-4 place-items-center rounded"
            title={label}
            style={{ color: corner === k ? "#FCA311" : "rgba(255,255,255,0.35)" }}
            onClick={() => onCorner(k)}
          >
            <Icon className="h-2.5 w-2.5" />
          </button>
        ))}
        {onPopOut && (
          <button className="grid h-4 w-4 place-items-center rounded" title="Pop out to a second window (off-stage for OBS)" style={{ color: "rgba(255,255,255,0.35)" }} onClick={onPopOut}>
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        )}
        <button className="grid h-4 w-4 place-items-center rounded" title="Hide (p)" style={{ color: "rgba(255,255,255,0.35)" }} onClick={onClose}>
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      <div className="px-3 pb-2.5 pt-1">
        {!hasScript(script) ? (
          <p className="py-1 text-[12px] italic" style={{ color: "rgba(255,255,255,0.45)" }}>
            No script for this frame yet — write it in the Script editor.
          </p>
        ) : (
          <div className="space-y-0.5">
            {rows.map((r, i) => {
              const exitStart = r.section === "exit" && (i === 0 || rows[i - 1].section !== "exit");
              if (r.line.money) {
                // MONEY LINE — say verbatim: bright + bold. Exit gets the blue → treatment.
                return (
                  <p
                    key={i}
                    className={`text-[15px] font-bold leading-snug ${exitStart ? "mt-1.5 border-t pt-1" : i > 0 ? "mt-0.5" : ""}`}
                    style={{ color: r.section === "exit" ? "#8FD3FF" : "#FFD98A", borderColor: "rgba(255,255,255,0.12)" }}
                  >
                    {r.section === "exit" ? `→ ${r.line.text}` : r.line.text}
                  </p>
                );
              }
              // TALKING POINT — riff on it: dim + bulleted.
              return (
                <div key={i} className="mt-0.5 flex gap-1.5 text-[13px] leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: "rgba(255,255,255,0.3)" }} />
                  <span>{r.line.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
