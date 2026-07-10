// List card — a THIN reveal list (5 account types, accounting cycle steps, …).
// Title (BaseCard header) + one-line definition + rows revealed via the stepper.
// Optional per-row DR/CR chip (off by default — same cards power the debit/credit
// rubric video later). Deliberately not a tree, not a chart-of-accounts explorer.
import type { NodeProps } from "@xyflow/react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { BaseCard, IconBtn, useCardActions } from "../BaseCard";
import { EditableText } from "../ui";
import { NEON } from "../theme";
import { cardId, type ListCard, type ListRow } from "../types";

export function ListCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ListCard;
  const { update, updateFn } = useCardActions(id);
  const editing = !!d.editMode;

  const patchRow = (rid: string, p: Partial<ListRow>) =>
    updateFn((prev) => ({ rows: ((prev.rows as ListRow[]) ?? []).map((r) => (r.id === rid ? { ...r, ...p } : r)) }));
  const setRows = (rows: ListRow[]) => update({ rows });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...d.rows];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const cycleChip = (r: ListRow) => patchRow(r.id, { chip: r.chip === "DR" ? "CR" : r.chip === "CR" ? undefined : "DR" });

  return (
    <BaseCard
      id={id}
      data={d}
      selected={selected}
      accent={NEON.green}
      headerRight={
        <button
          title="Toggle DR/CR chips"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update({ showChips: !d.showChips }); }}
          className="nodrag rounded px-1 text-[10px] font-bold"
          style={{ color: d.showChips ? NEON.yellow : NEON.muted, border: `1px solid ${d.showChips ? "rgba(255,210,63,0.5)" : "transparent"}` }}
        >
          DR
        </button>
      }
    >
      {(d.definition || editing) && (
        <p className="mb-1.5 text-[12px] italic" style={{ color: NEON.muted }}>
          <EditableText value={d.definition ?? ""} onChange={(v) => update({ definition: v })} editing={editing} placeholder="One-line definition" />
        </p>
      )}
      <ol className="space-y-1">
        {d.rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-1.5 text-[14px]" style={{ opacity: r.hidden ? 0.15 : 1 }}>
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold" style={{ border: `1px solid ${NEON.green}`, color: NEON.green }}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 font-medium" style={{ color: NEON.text }}>
              <EditableText value={r.text} onChange={(v) => patchRow(r.id, { text: v })} editing={editing} placeholder="Item" />
            </span>
            {d.showChips && (r.chip || editing) && (
              <button
                className="nodrag shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{
                  color: r.chip === "DR" ? NEON.cyan : r.chip === "CR" ? NEON.pink : NEON.muted,
                  border: `1px solid ${r.chip === "DR" ? NEON.cyan : r.chip === "CR" ? NEON.pink : NEON.borderSoft}`,
                  opacity: r.chip ? 1 : 0.5,
                }}
                title={editing ? "Cycle DR → CR → none" : r.chip === "DR" ? "normal balance: debit" : "normal balance: credit"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (editing) cycleChip(r); }}
              >
                {r.chip ?? "—"}
              </button>
            )}
            {editing && (
              <span className="flex shrink-0">
                <IconBtn title="Up" onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></IconBtn>
                <IconBtn title="Down" onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></IconBtn>
                <IconBtn title="Remove" danger onClick={() => setRows(d.rows.filter((x) => x.id !== r.id))}><Trash2 className="h-3 w-3" /></IconBtn>
              </span>
            )}
          </li>
        ))}
      </ol>
      {editing && (
        <button
          className="nodrag mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ color: NEON.cyan, border: "1px solid rgba(34,224,214,0.4)" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setRows([...d.rows, { id: cardId("r"), text: "" }])}
        >
          <Plus className="h-3 w-3" /> row
        </button>
      )}
    </BaseCard>
  );
}
