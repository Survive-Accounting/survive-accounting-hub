// IMPORTANCE CUES (Bible law 7) — shared exhibit infrastructure, first used by
// the users exhibit. Three levels, three tiny corner tags, deliberately muted:
//
//     MUST KNOW · EASY POINT · A+ DETAIL
//
// A+ DETAIL doubles as the professor-variance flag ("check your professor's
// slides"). Tags are dismissible FOR THE SESSION (module store, same realm-
// shared pattern as the highlight buses, so dismissing in the studio also
// dismisses on the film popout). Deliberately NOT wired to the ` clear bus —
// dismissal is a session preference, not temporary emphasis, and ` must never
// resurrect chrome mid-take.
import { useSyncExternalStore } from "react";

import type { CueLevel } from "./users-exhibit-config";

const dismissed = new Set<string>();
const listeners = new Set<() => void>();
let rev = 0;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function dismissCue(cueId: string): void {
  if (dismissed.has(cueId)) return;
  dismissed.add(cueId);
  rev++;
  listeners.forEach((fn) => fn());
}

export function useDismissedCues(): number {
  return useSyncExternalStore(subscribe, () => rev, () => rev);
}
export const isCueDismissed = (cueId: string): boolean => dismissed.has(cueId);

const CUE_STYLE: Record<CueLevel, { label: string; color: string; border: string }> = {
  must: { label: "Must know", color: "#FCA311", border: "rgba(252,163,17,0.45)" },
  easy: { label: "Easy point", color: "#3BF5A0", border: "rgba(59,245,160,0.4)" },
  aplus: { label: "A+ detail", color: "#7DD3FC", border: "rgba(125,211,252,0.4)" },
};

/** The tag itself. Absolutely positioned by the PARENT (consistent corner —
 *  house rule: top-right, translated slightly outside the element's box).
 *  Click dismisses for the session. Renders nothing once dismissed. */
export function CueTag({ cueId, level }: { cueId: string; level: CueLevel }) {
  useDismissedCues();
  if (isCueDismissed(cueId)) return null;
  const s = CUE_STYLE[level];
  return (
    <button
      className="nodrag absolute -right-1.5 -top-2 rounded-full px-1.5 py-[1px] text-[7.5px] font-black uppercase tracking-[0.14em]"
      style={{ background: "rgba(9,13,26,0.92)", color: s.color, border: `1px solid ${s.border}`, zIndex: 20, cursor: "pointer" }}
      title={`${s.label} — click to dismiss for this session`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); dismissCue(cueId); }}
    >
      {s.label}
    </button>
  );
}
