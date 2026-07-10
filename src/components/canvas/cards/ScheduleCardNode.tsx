// Schedule card — one generic table engine (editable headers, add/remove rows/cols,
// per-cell fill-in + reveal, optional running totals + footer check) with presets.
// AMORTIZATION preset: "Check" validates hand-filled cells against the EXISTING
// lib amortization engine (buildAmortSchedule) — mismatches get a subtle underline,
// never auto-corrected. Auto-fill exists but manual is the default: the math IS the video.
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Plus, Trash2, Eye, EyeOff, Wand2, BadgeCheck, ChevronDown, ChevronRight } from "lucide-react";

import { buildAmortSchedule } from "@/lib/je/amortization";
import { BaseCard, IconBtn, useCardActions } from "../BaseCard";
import { EditableText, fmtNum, parseNum } from "../ui";
import { NEON, PAPER } from "../theme";
import type { ScheduleCard, ScheduleCell } from "../types";

const cell = (v = ""): ScheduleCell => ({ v });

export function ScheduleCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ScheduleCard;
  const { update, updateFn } = useCardActions(id);
  const editing = !!d.editMode;
  const [paramsOpen, setParamsOpen] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  const setRows = (rows: ScheduleCell[][]) => update({ rows });
  // Functional: rapid per-cell commits must never clobber each other.
  const patchCell = (r: number, c: number, patch: Partial<ScheduleCell>) =>
    updateFn((prev) => ({
      rows: ((prev.rows as ScheduleCell[][]) ?? []).map((row, ri) => (ri === r ? row.map((cl, ci) => (ci === c ? { ...cl, ...patch } : cl)) : row)),
    }));

  const addRow = () => setRows([...d.rows, d.headers.map(() => cell())]);
  const removeRow = (r: number) => setRows(d.rows.filter((_, i) => i !== r));
  const addCol = () => {
    update({
      headers: [...d.headers, `Col ${d.headers.length + 1}`],
      rows: d.rows.map((row) => [...row, cell()]),
      numericCols: [...(d.numericCols ?? d.headers.map(() => false)), true],
    });
  };
  const removeCol = (c: number) => {
    update({
      headers: d.headers.filter((_, i) => i !== c),
      rows: d.rows.map((row) => row.filter((_, i) => i !== c)),
      numericCols: (d.numericCols ?? []).filter((_, i) => i !== c),
    });
  };

  const isNum = (c: number) => (d.numericCols ?? [])[c] ?? false;

  // ---- Amortization Check: expected grid from the lib engine ----
  const expectedGrid = (): string[][] | null => {
    if (d.preset !== "amortization" || !d.bond) return null;
    const sched = buildAmortSchedule(
      {
        face: d.bond.face,
        statedRateAnnual: d.bond.statedRateAnnual,
        marketRateAnnual: d.bond.marketRateAnnual,
        termYears: d.bond.termYears,
        paymentsPerYear: d.bond.paymentsPerYear,
        issueDate: "2026-01-01",
      },
      d.bond.method,
    );
    return sched.rows.map((r, i) => [String(i + 1), String(r.cashPayment), String(r.interestExpense), String(r.amortization), String(r.carryingValueAfter)]);
  };

  const runCheck = () => {
    const exp = expectedGrid();
    if (!exp) { setCheckMsg("Check needs the amortization preset + bond params."); return; }
    let checked = 0, bad = 0;
    const rows = d.rows.map((row, ri) =>
      row.map((cl, ci) => {
        const val = parseNum(cl.v);
        if (val == null || !exp[ri] || ci === 0) return { ...cl, bad: false };
        checked++;
        const ok = Math.abs(val - Number(exp[ri][ci])) < 1.5; // ±$1 rounding tolerance
        if (!ok) bad++;
        return { ...cl, bad: !ok };
      }),
    );
    setRows(rows);
    setCheckMsg(checked === 0 ? "Nothing filled in yet — type some numbers first." : bad === 0 ? `✓ all ${checked} filled cells match the engine` : `${bad} of ${checked} cells don't match (underlined)`);
  };

  const autoFill = () => {
    const exp = expectedGrid();
    if (!exp) return;
    setRows(exp.map((row) => row.map((v) => ({ v }))));
    setCheckMsg(null);
  };

  // Running totals + footer check
  const totals = d.headers.map((_, c) =>
    d.rows.reduce((s, row) => s + (isNum(c) ? (parseNum(row[c]?.v ?? "") ?? 0) : 0), 0),
  );

  return (
    <BaseCard id={id} data={d} selected={selected} accent={NEON.yellow}>
      {/* Amortization param row (collapsible) */}
      {d.preset === "amortization" && d.bond && (
        <div className="mb-2 rounded border px-2 py-1 text-[11px]" style={{ borderColor: PAPER.line, color: PAPER.inkMuted }}>
          <button className="nodrag inline-flex items-center gap-1 font-semibold" onClick={() => setParamsOpen((o) => !o)} onPointerDown={(e) => e.stopPropagation()}>
            {paramsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} bond params
          </button>
          {paramsOpen && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {([
                ["face", "face"], ["statedRateAnnual", "stated"], ["marketRateAnnual", "market"], ["termYears", "yrs"], ["paymentsPerYear", "per yr"],
              ] as const).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-1">
                  {label}
                  <input
                    className="nodrag w-20 rounded bg-black/5 px-1 py-0.5 text-right tabular-nums outline-none ring-1 ring-[rgba(20,33,61,0.30)]"
                    defaultValue={String(d.bond![key])}
                    onBlur={(e) => update({ bond: { ...d.bond!, [key]: parseNum(e.target.value) ?? d.bond![key] } })}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </label>
              ))}
              <select
                className="nodrag rounded bg-black/5 px-1 py-0.5 outline-none ring-1 ring-[rgba(20,33,61,0.30)]"
                value={d.bond.method}
                onChange={(e) => update({ bond: { ...d.bond!, method: e.target.value as "effective" | "straight" } })}
              >
                <option value="effective">effective</option>
                <option value="straight">straight-line</option>
              </select>
            </div>
          )}
        </div>
      )}

      <table className="w-full text-[12.5px]">
        <thead>
          <tr>
            {d.headers.map((h, c) => (
              <th key={c} className="px-1.5 py-1 text-left text-[10.5px] font-bold uppercase tracking-wide" style={{ color: PAPER.navy, borderBottom: `2px solid ${PAPER.navy}` }}>
                <div className="flex items-center gap-1">
                  <EditableText value={h} onChange={(v) => update({ headers: d.headers.map((x, i) => (i === c ? v : x)) })} editing={editing} />
                  {editing && d.headers.length > 1 && (
                    <IconBtn title="Remove column" danger onClick={() => removeCol(c)}><Trash2 className="h-2.5 w-2.5" /></IconBtn>
                  )}
                </div>
              </th>
            ))}
            {editing && <th className="w-6" />}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cl, c) => (
                <td
                  key={c}
                  className={`px-1.5 py-0.5 ${isNum(c) ? "text-right tabular-nums" : ""}`}
                  style={{ borderBottom: `1px solid ${PAPER.line}`, textDecoration: cl.bad ? "underline wavy" : undefined, textDecorationColor: cl.bad ? PAPER.red : undefined }}
                >
                  {cl.hidden && !editing ? (
                    <span
                      className="nodrag inline-block h-3.5 w-full min-w-8 cursor-pointer rounded-sm"
                      style={{ background: "rgba(252,163,17,0.16)", border: "1px dashed rgba(138,90,0,0.45)" }}
                      title="Click to reveal"
                      onClick={(e) => { e.stopPropagation(); patchCell(r, c, { hidden: false }); }}
                    />
                  ) : (
                    <CellEditor
                      value={cl.v}
                      numeric={isNum(c)}
                      editing={editing}
                      onChange={(v) => patchCell(r, c, { v, bad: false })}
                      onToggleHide={() => patchCell(r, c, { hidden: !cl.hidden })}
                      hidden={!!cl.hidden}
                    />
                  )}
                </td>
              ))}
              {editing && (
                <td className="text-right">
                  <IconBtn title="Remove row" danger onClick={() => removeRow(r)}><Trash2 className="h-3 w-3" /></IconBtn>
                </td>
              )}
            </tr>
          ))}
          {(d.runningTotals || d.footerCheck) && (
            <tr>
              {d.headers.map((_, c) => (
                <td key={c} className={`px-1.5 py-1 font-bold tabular-nums ${isNum(c) ? "text-right" : ""}`} style={{ color: PAPER.navy, borderTop: `2px solid ${PAPER.navy}` }}>
                  {isNum(c) ? fmtNum(totals[c]) : c === 0 ? "Σ" : ""}
                </td>
              ))}
              {editing && <td />}
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {editing && (
          <>
            <MiniBtn onClick={addRow}><Plus className="h-3 w-3" /> row</MiniBtn>
            <MiniBtn onClick={addCol}><Plus className="h-3 w-3" /> col</MiniBtn>
            <MiniBtn onClick={() => update({ runningTotals: !d.runningTotals })}>Σ {d.runningTotals ? "on" : "off"}</MiniBtn>
          </>
        )}
        {d.preset === "amortization" && (
          <>
            <MiniBtn onClick={runCheck} color={PAPER.green}><BadgeCheck className="h-3 w-3" /> Check</MiniBtn>
            <MiniBtn onClick={autoFill} color={PAPER.inkMuted}><Wand2 className="h-3 w-3" /> auto-fill</MiniBtn>
          </>
        )}
        {checkMsg && <span className="text-[11px]" style={{ color: checkMsg.startsWith("✓") ? PAPER.green : PAPER.inkMuted }}>{checkMsg}</span>}
      </div>
    </BaseCard>
  );
}

function CellEditor({ value, numeric, editing, hidden, onChange, onToggleHide }: {
  value: string; numeric: boolean; editing: boolean; hidden: boolean;
  onChange: (v: string) => void; onToggleHide: () => void;
}) {
  const display = numeric && value !== "" ? fmtNum(parseNum(value)) : value;
  return (
    <span className="group/cell inline-flex w-full items-center gap-0.5">
      <span className="min-w-0 flex-1">
        <EditableText value={editing ? value : display ?? value} onChange={onChange} editing={editing} placeholder="" className={numeric ? "text-right tabular-nums block" : "block"} />
      </span>
      <button
        className="nodrag opacity-0 transition-opacity group-hover/cell:opacity-60"
        title={hidden ? "Shown while editing (hidden on card)" : "Hide cell (reveal later)"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
        style={{ color: PAPER.gold }}
      >
        {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      </button>
    </span>
  );
}

function MiniBtn({ children, onClick, color = PAPER.navy }: { children: React.ReactNode; onClick: () => void; color?: string }) {
  return (
    <button
      className="nodrag inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ color, border: `1px solid ${color}55` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
  );
}
