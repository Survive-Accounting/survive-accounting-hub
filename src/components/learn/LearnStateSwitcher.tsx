// ADMIN STATE SWITCHER (learn-share-flow §9) — a small control, admin-only, that cycles the CTA
// through every state on the LIVE page, so Lee can check them on his phone in thirty seconds.
//
// It only ever sets the ?test= param (client-side, no DB, no writes), so gating VISIBILITY on the
// localStorage admin deterrent (isAdminUnlocked) is enough — there is no privileged action to
// protect, just a preview control a normal visitor shouldn't see. Reads localStorage in an effect
// so it never causes a hydration mismatch.
import { useEffect, useState } from "react";

import { NEON } from "@/components/canvas/theme";
import { BRAND_SANS } from "@/components/canvas/brand";
import { isAdminUnlocked } from "@/components/AdminGate";

const STATES: Array<{ key: string; label: string }> = [
  { key: "", label: "Live" },
  { key: "A", label: "A" },
  { key: "B", label: "B" },
  { key: "C", label: "C" },
  { key: "D", label: "D" },
  { key: "F", label: "F" },
  { key: "banner", label: "Banner" },
];

export function LearnStateSwitcher({ current, onSelect }: { current?: string; onSelect: (test: string | undefined) => void }) {
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setAdmin(isAdminUnlocked()); }, []);
  if (!admin) return null;

  return (
    <div className="fixed bottom-3 left-3 z-[98]" style={{ fontFamily: BRAND_SANS }}>
      {open ? (
        <div className="flex flex-wrap items-center gap-1 rounded-xl p-1.5 shadow-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, maxWidth: 220 }}>
          <span className="px-1 text-[9px] font-black uppercase tracking-wider" style={{ color: NEON.muted }}>CTA</span>
          {STATES.map((s) => {
            const active = (current ?? "") === s.key;
            return (
              <button
                key={s.key || "live"}
                onClick={() => onSelect(s.key || undefined)}
                className="rounded-lg px-2 py-1 text-[11px] font-black"
                style={{ background: active ? NEON.yellow : "rgba(255,255,255,0.06)", color: active ? "#0B1220" : NEON.text }}
              >
                {s.label}
              </button>
            );
          })}
          <button onClick={() => setOpen(false)} className="rounded-lg px-1.5 py-1 text-[11px] font-bold" style={{ color: NEON.muted }}>✕</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-full px-3 py-2 text-[11px] font-black shadow-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }}>
          CTA states{current ? ` · ${current.toUpperCase()}` : ""}
        </button>
      )}
    </div>
  );
}
