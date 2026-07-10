// JE card — caption + entry lines, live balance chip, per-line distractor flip,
// reveal toggles (accounts only / amounts / labels). All edits scene-local.
import { useMemo, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Plus, ArrowUp, ArrowDown, Trash2, Repeat } from "lucide-react";

import { BaseCard, IconBtn, useCardActions } from "../BaseCard";
import { EditableNumber, EditableText, fmtNum } from "../ui";
import { NEON, PAPER } from "../theme";
import { cardId, type JeCard, type JeLine } from "../types";

export function JeCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as JeCard;
  const { update, updateFn } = useCardActions(id);
  const editing = !!d.editMode;
  const [flipFeedback, setFlipFeedback] = useState<string | null>(null);

  // Functional updates: derive from the LATEST lines so rapid commits never clobber each other.
  const setLines = (lines: JeLine[]) => update({ lines });
  const patchLine = (lid: string, patch: Partial<JeLine>) =>
    updateFn((prev) => ({ lines: ((prev.lines as JeLine[]) ?? []).map((l) => (l.id === lid ? { ...l, ...patch } : l)) }));

  // Effective (displayed) values honor the flip state.
  const eff = (l: JeLine) =>
    l.flipped && l.trap
      ? { account: l.trap.account ?? l.account, dr: l.trap.dr !== undefined ? l.trap.dr : l.dr, cr: l.trap.cr !== undefined ? l.trap.cr : l.cr }
      : { account: l.account, dr: l.dr, cr: l.cr };

  const { sumDr, sumCr } = useMemo(() => {
    let sumDr = 0, sumCr = 0;
    for (const l of d.lines) {
      if (l.hidden) continue;
      const e = eff(l);
      sumDr += e.dr ?? 0;
      sumCr += e.cr ?? 0;
    }
    return { sumDr, sumCr };
  }, [d.lines]);
  const balanced = Math.abs(sumDr - sumCr) < 0.005 && (sumDr > 0 || sumCr > 0);
  const diff = sumDr - sumCr;

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...d.lines];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setLines(next);
  };

  const bank = d.accountBank ?? [];
  const listId = `bank-${id}`;

  return (
    <BaseCard
      id={id}
      data={d}
      selected={selected}
      accent={NEON.pink}
      headerRight={
        <>
          {/* Reveal toggles */}
          <ToggleChip label="$" title="Show amounts" on={d.showAmounts} onClick={() => update({ showAmounts: !d.showAmounts })} />
          <ToggleChip label="ab" title="Show labels" on={d.showLabels} onClick={() => update({ showLabels: !d.showLabels })} />
        </>
      }
    >
      {bank.length > 0 && (
        <datalist id={listId}>{bank.map((a) => <option key={a} value={a} />)}</datalist>
      )}
      <div className="mb-1.5 text-[13px] font-medium" style={{ color: PAPER.ink }}>
        <EditableText value={d.caption} onChange={(v) => update({ caption: v })} editing={editing} placeholder="Caption" />
      </div>

      <table className="w-full text-[13px]">
        <tbody>
          {d.lines.map((l, i) => {
            const e = eff(l);
            const isCr = (e.cr ?? 0) > 0 || ((e.dr ?? 0) === 0 && l.cr !== null);
            const trapOn = !!l.flipped && !!l.trap;
            return (
              <tr key={l.id} style={{ opacity: l.hidden ? 0.18 : 1 }}>
                <td className={`py-0.5 pr-1 ${isCr && !editing ? "pl-6" : ""}`} style={{ color: trapOn ? PAPER.red : PAPER.ink, minWidth: 120 }}>
                  {editing ? (
                    <input
                      className="nodrag w-full rounded bg-black/5 px-1.5 py-0.5 outline-none ring-1 ring-[rgba(20,33,61,0.30)]"
                      value={l.account}
                      list={bank.length > 0 ? listId : undefined}
                      placeholder="Account"
                      onChange={(ev) => patchLine(l.id, { account: ev.target.value })}
                      onKeyDown={(ev) => ev.stopPropagation()}
                    />
                  ) : (
                    <EditableText value={e.account} onChange={(v) => patchLine(l.id, { account: v })} placeholder="Account" />
                  )}
                </td>
                <td className="w-20 py-0.5 text-right" style={{ color: trapOn ? PAPER.red : PAPER.ink }}>
                  {d.showAmounts ? (
                    <EditableNumber value={e.dr} onChange={(v) => patchLine(l.id, { dr: v, cr: v != null ? null : l.cr })} editing={editing} />
                  ) : (
                    <Blank />
                  )}
                </td>
                <td className="w-20 py-0.5 text-right" style={{ color: trapOn ? PAPER.red : PAPER.ink }}>
                  {d.showAmounts ? (
                    <EditableNumber value={e.cr} onChange={(v) => patchLine(l.id, { cr: v, dr: v != null ? null : l.dr })} editing={editing} />
                  ) : (
                    <Blank />
                  )}
                </td>
                {d.showLabels && (
                  <td className="max-w-[110px] truncate py-0.5 pl-1.5 text-[11px]" style={{ color: PAPER.inkMuted }}>
                    <EditableText value={l.label ?? ""} onChange={(v) => patchLine(l.id, { label: v })} editing={editing} placeholder="" />
                  </td>
                )}
                <td className="w-auto whitespace-nowrap pl-1 text-right">
                  {l.trap && (
                    <IconBtn
                      title={trapOn ? "Flip back to the correct version" : "Flip to the trap version"}
                      active={trapOn}
                      onClick={() => {
                        const next = !l.flipped;
                        patchLine(l.id, { flipped: next });
                        setFlipFeedback(next ? l.trap!.feedback : null);
                      }}
                    >
                      <Repeat className="h-3 w-3" />
                    </IconBtn>
                  )}
                  {editing && (
                    <>
                      <IconBtn title="Move up" onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></IconBtn>
                      <IconBtn title="Move down" onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></IconBtn>
                      <IconBtn title="Remove line" danger onClick={() => setLines(d.lines.filter((x) => x.id !== l.id))}><Trash2 className="h-3 w-3" /></IconBtn>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {flipFeedback && (
        <div className="mt-1.5 rounded px-2 py-1 text-[11.5px]" style={{ background: "rgba(194,24,50,0.07)", color: PAPER.red, border: `1px solid rgba(194,24,50,0.3)` }}>
          {flipFeedback}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {editing && (
          <button
            className="nodrag inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ color: PAPER.navy, border: `1px solid rgba(20,33,61,0.35)` }}
            onClick={() => setLines([...d.lines, { id: cardId("l"), account: "", dr: null, cr: null, label: "" }])}
          >
            <Plus className="h-3 w-3" /> line
          </button>
        )}
        {d.showAmounts && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-all"
            style={
              balanced
                ? { color: PAPER.green, border: `1px solid ${PAPER.green}`, background: "rgba(30,127,79,0.08)" }
                : { color: PAPER.red, border: `1px solid rgba(194,24,50,0.4)` }
            }
          >
            {balanced ? "✓ balanced" : `Δ ${fmtNum(Math.abs(diff))} ${diff > 0 ? "DR" : "CR"}`}
          </span>
        )}
      </div>
    </BaseCard>
  );
}

function Blank() {
  return <span className="inline-block h-3 w-12 rounded-sm align-middle" style={{ background: "rgba(20,33,61,0.12)" }} />;
}

function ToggleChip({ label, title, on, onClick }: { label: string; title: string; on: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="nodrag rounded px-1 text-[10px] font-bold"
      style={{ color: on ? NEON.yellow : NEON.muted, border: `1px solid ${on ? "rgba(252,163,17,0.5)" : "transparent"}` }}
    >
      {label}
    </button>
  );
}
