// TELEPROMPTER (Phase 1) — the CURRENT frame's script floated near the camera
// eyeline. Author-only filming chrome (never any student view): works in
// authoring AND film mode, hidden by default in film — the `p` key toggles it.
// Compact + high-contrast so it reads from across the room; a corner picker
// (top-left / top-center / top-right) parks it under wherever the webcam sits.
// Follows frame navigation automatically (it renders whatever frame is current).
import { AlignCenter, AlignLeft, AlignRight, X } from "lucide-react";
import { useNodes } from "@xyflow/react";

import { frameCellLabel } from "./frames";
import { hasScript } from "./script-doc";
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
export function TeleprompterOverlay({ frameId, corner, onCorner, onClose }: {
  frameId: string | null;
  corner: PrompterCorner;
  onCorner: (c: PrompterCorner) => void;
  onClose: () => void;
}) {
  const nodes = useNodes();
  if (!frameId) return null;
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame) return null;
  const d = frame.data as unknown as FrameBox;
  const label = `${frameCellLabel(frame as never)}${d.title ? ` — ${d.title}` : ""}`;
  return <Teleprompter script={d.script} frameLabel={label} corner={corner} onCorner={onCorner} onClose={onClose} />;
}

export function Teleprompter({ script, frameLabel, corner, onCorner, onClose }: {
  script: FrameScript | undefined;
  frameLabel: string;
  corner: PrompterCorner;
  onCorner: (c: PrompterCorner) => void;
  onClose: () => void;
}) {
  const beats = (script?.beats ?? "")
    .split("\n")
    .map((b) => b.trim().replace(/^[-*•]\s+/, ""))
    .filter(Boolean);

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
          <>
            {(script?.entry ?? "").trim() && (
              <p className="text-[15px] font-bold leading-snug" style={{ color: "#FFD98A" }}>{script!.entry}</p>
            )}
            {beats.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {beats.map((b, i) => (
                  <li key={i} className="flex gap-1.5 text-[13px] font-medium leading-snug" style={{ color: "rgba(255,255,255,0.92)" }}>
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: "#FCA311" }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {(script?.exit ?? "").trim() && (
              <p className="mt-1.5 border-t pt-1 text-[13px] font-semibold italic leading-snug" style={{ borderColor: "rgba(255,255,255,0.12)", color: "#8FD3FF" }}>
                → {script!.exit}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
