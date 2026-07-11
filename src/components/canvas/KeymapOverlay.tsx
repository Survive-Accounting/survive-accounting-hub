// "?" overlay — the cheat sheet, rendered FROM the keymap registry so it can't
// go stale. Esc or click-away closes.
import { NEON } from "./theme";
import { groupedBindings, type KeyBinding } from "./keymap";

const COMBO_LABEL: Record<string, string> = { space: "Space", escape: "Esc" };

function comboChip(combo: string): string {
  return combo
    .split("+")
    .map((p) => COMBO_LABEL[p] ?? (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join(" + ");
}

export function KeymapOverlay({ bindings, onClose }: { bindings: KeyBinding[]; onClose: () => void }) {
  const groups = groupedBindings(bindings);
  return (
    <div className="absolute inset-0 z-[90] grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="max-h-[80vh] w-[560px] overflow-y-auto rounded-xl p-4"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.yellow }}>Keyboard</span>
          <span className="text-[11px]" style={{ color: NEON.muted }}>press ? to toggle</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>{g.group}</div>
              <div className="space-y-1">
                {g.items.map((b) => (
                  <div key={b.combo} className="flex items-center gap-2 text-[12px]">
                    <kbd
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums"
                      style={{ border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.35)", color: NEON.yellow, minWidth: 44, textAlign: "center" }}
                    >
                      {comboChip(b.combo)}
                    </kbd>
                    <span style={{ color: NEON.text }}>{b.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
