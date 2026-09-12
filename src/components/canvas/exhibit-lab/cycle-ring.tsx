// THE ACCOUNTING CYCLE'S RING — the nine steps around the oval, with the arrows between them.
//
// Lifted out of CycleExhibit.tsx on 2026-09-12 so a second surface can draw it: Lee asked to "pull
// out the Accounting Cycle exhibit we have and maybe like, have it zoomed way out, but let me zoom
// up to it and drag around / swim around" on a Blast Off slide (blastoff/CycleFrame.tsx). The Lab
// keeps everything else — the probe runs, the step panel, the modes; this is only the picture, so
// the phone does not drag the Lab's machinery onto the render path.
//
// Geometry mirrors the canvas CycleNode's oval on purpose (same look on camera).
import { CYCLE_STEPS } from "./cycle-model";
import { DISPLAY_FONT } from "../theme";

const VB_W = 1000, VB_H = 600, CX = 500, CY = 300, RX = 392, RY = 236;
const T = "opacity 200ms ease, filter 200ms ease, box-shadow 200ms ease, border-color 200ms ease, transform 200ms ease";
const GOLD = "#FCA311", GOOD = "#3BF5A0", BAD = "#FF8B9E";

const place = (i: number, n: number) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n; return { ang, x: (CX + RX * Math.cos(ang)) / VB_W * 100, y: (CY + RY * Math.sin(ang)) / VB_H * 100 }; };
const arc = (a0: number, a1: number) => { const p = (a: number) => `${(CX + RX * Math.cos(a)).toFixed(1)} ${(CY + RY * Math.sin(a)).toFixed(1)}`; return `M ${p(a0)} A ${RX} ${RY} 0 0 1 ${p(a1)}`; };

export type PillState = "normal" | "lit" | "teased" | "good" | "bad" | "dim";

/** The ring. `states` and `labels` are per step, in CYCLE_STEPS order; `centre` is whatever sits
 *  in the middle (the title, or a definition card). */
export function CycleRing({ states, labels, onPill, centre }: { states: PillState[]; labels: (string | null)[]; onPill?: (i: number) => void; centre: React.ReactNode }) {
  const n = CYCLE_STEPS.length;
  const seg = (2 * Math.PI) / n;
  return (
    <div className="relative w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="lab-cyc-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FCA311" /><stop offset="100%" stopColor="#E0284A" /></linearGradient>
          <marker id="lab-cyc-arrow" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#FCA311" /></marker>
        </defs>
        {CYCLE_STEPS.map((s, i) => {
          const { ang } = place(i, n);
          const lit = states[i] === "lit" && states[(i + 1) % n] === "lit";
          return <path key={s.id} d={arc(ang + Math.min(seg * 0.16, 0.16), ang + seg - Math.min(seg * 0.42, 0.42))} fill="none" stroke={lit ? GOLD : "url(#lab-cyc-grad)"} strokeWidth={lit ? 4.2 : 3.2} strokeLinecap="round" markerEnd="url(#lab-cyc-arrow)" style={{ vectorEffect: "non-scaling-stroke", opacity: states.some((x) => x === "lit") && !lit ? 0.25 : 1, transition: T, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }} />;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[24%] text-center">{centre}</div>
      {CYCLE_STEPS.map((s, i) => {
        const { x, y } = place(i, n);
        const st = states[i];
        const label = labels[i];
        const border = st === "lit" ? GOLD : st === "good" ? GOOD : st === "bad" ? BAD : "rgba(252,163,17,0.55)";
        return (
          <div key={s.id} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) scale(${st === "lit" ? 1.06 : 1})`, opacity: st === "dim" ? 0.3 : 1, transition: T, zIndex: st === "lit" ? 3 : 1 }}>
            <div onClick={onPill ? () => onPill(i) : undefined} className="rounded-2xl px-3 py-1.5 text-center font-semibold" style={{ cursor: onPill ? "pointer" : "default", minWidth: 92, maxWidth: 200, whiteSpace: "pre-line", lineHeight: 1.18, fontFamily: DISPLAY_FONT, fontSize: 13, color: "#F4EFE6", background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))", border: `1.5px solid ${border}`, boxShadow: st === "lit" ? `0 0 22px rgba(252,163,17,0.6)` : st === "good" ? `0 0 18px rgba(59,245,160,0.5)` : "0 6px 16px -8px rgba(0,0,0,0.8), 0 0 0 3px rgba(9,13,26,0.9)", transition: T }}>
              {/* TEASE: the blur goes on the TEXT — crisp outline, unreadable label */}
              <span style={{ filter: st === "teased" ? "blur(6px)" : undefined, userSelect: st === "teased" ? "none" : undefined, transition: T }}>{label ?? (st === "teased" ? s.text : `${i + 1}`)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
