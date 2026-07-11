// Formula card — a THIN horizontal chain of segments and operators:
// [Beginning inventory] + [Purchases] = [Goods available] − [Ending inv] = [COGS]
// Labels, values, and operators all inline-editable; segments add/remove;
// per-segment reveal rides the stepper; empty values render the same muted
// "???" the JE card uses (revealed-but-unvalued ≠ hidden).
import type { NodeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";

import { BaseCard, useCardActions } from "../BaseCard";
import { EditableText } from "../ui";
import { NEON, PAPER } from "../theme";
import { cardId, type FormulaCard, type FormulaSegment } from "../types";

const OPERATORS = ["+", "−", "=", "×", "÷"] as const;

export function FormulaCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as FormulaCard;
  const { update, updateFn } = useCardActions(id);

  const patchSeg = (sid: string, p: Partial<FormulaSegment>) =>
    updateFn((prev) => ({ segments: ((prev.segments as FormulaSegment[]) ?? []).map((s) => (s.id === sid ? { ...s, ...p } : s)) }));

  const cycleOp = (i: number) =>
    updateFn((prev) => {
      const ops = [...((prev.operators as string[]) ?? [])];
      ops[i] = OPERATORS[(OPERATORS.indexOf((ops[i] ?? "+") as never) + 1) % OPERATORS.length];
      return { operators: ops };
    });

  const addSegment = () =>
    updateFn((prev) => ({
      segments: [...((prev.segments as FormulaSegment[]) ?? []), { id: cardId("fs"), label: "", value: "" }],
      operators: [...((prev.operators as string[]) ?? []), "+"],
    }));

  const removeSegment = (sid: string) =>
    updateFn((prev) => {
      const segs = (prev.segments as FormulaSegment[]) ?? [];
      const idx = segs.findIndex((s) => s.id === sid);
      if (idx === -1 || segs.length <= 1) return {};
      const ops = [...((prev.operators as string[]) ?? [])];
      ops.splice(Math.max(0, idx - 1), 1); // drop the operator left of the segment (or the first)
      return { segments: segs.filter((s) => s.id !== sid), operators: ops };
    });

  return (
    <BaseCard id={id} data={d} selected={selected} accent={NEON.yellow}>
      <div className="flex flex-wrap items-center gap-1.5">
        {d.segments.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <button
                className="nodrag grid h-6 w-6 shrink-0 place-items-center rounded-full text-[15px] font-black"
                style={{ color: PAPER.navy, border: `1px solid ${PAPER.line}` }}
                title="Click to cycle + − = × ÷"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); cycleOp(i - 1); }}
              >
                {d.operators[i - 1] ?? "+"}
              </button>
            )}
            {s.hidden ? (
              // covered until revealed (space) — same contract as JE line reveals
              <div
                className="nodrag grid h-11 w-24 cursor-pointer place-items-center rounded-md"
                style={{ background: "rgba(252,163,17,0.16)", border: "1px dashed rgba(138,90,0,0.45)" }}
                title="Hidden — space (or click) reveals"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); patchSeg(s.id, { hidden: false }); }}
              />
            ) : (
              <div
                className="group/seg relative rounded-md px-2 py-1 text-center"
                style={{ border: `1px solid ${PAPER.line}`, background: "rgba(20,33,61,0.03)", minWidth: 84 }}
              >
                {d.segments.length > 1 && (
                  <button
                    className="nodrag absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full opacity-0 transition-opacity group-hover/seg:opacity-100"
                    style={{ color: PAPER.red, background: "#FBF9F4", border: "1px solid rgba(194,24,50,0.35)" }}
                    title="Remove segment"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); removeSegment(s.id); }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
                <div className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: PAPER.inkMuted }}>
                  <EditableText value={s.label} onChange={(v) => patchSeg(s.id, { label: v })} placeholder={`Segment ${i + 1}`} />
                </div>
                <div
                  className="text-[14px] font-bold tabular-nums"
                  style={{ color: s.value ? PAPER.navy : PAPER.inkMuted, opacity: s.value ? 1 : 0.5 }}
                >
                  <EditableText value={s.value} onChange={(v) => patchSeg(s.id, { value: v })} placeholder="???" />
                </div>
              </div>
            )}
          </div>
        ))}
        <button
          className="nodrag grid h-6 w-6 shrink-0 place-items-center rounded-full opacity-40 transition-opacity hover:opacity-100"
          style={{ color: PAPER.navy, border: `1px dashed ${PAPER.line}` }}
          title="Add segment"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); addSegment(); }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </BaseCard>
  );
}
