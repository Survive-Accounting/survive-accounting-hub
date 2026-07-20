// List card — a reveal list (the 5 account types, the accounting cycle, …).
// Title + one-line definition + rows revealed via the stepper. P2 upgrades:
// a SETTINGS gear (replaces the edit pencil, JE-consistent) for numbered↔bulleted,
// DR/CR chips (default OFF — Foundations teaches the 5 types before debits/credits),
// and a LIVE COA BIND (pull a course's Assets/Liabilities/… set, auto-updating);
// plus a per-row INDENT that renders contra items in statement form ("Less: …").
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, IndentIncrease, Plus, Settings2, Trash2 } from "lucide-react";

import { fetchJeBrowserTree } from "@/lib/je-api";

import { BaseCard, IconBtn, useCardActions } from "../BaseCard";
import { CardPopover } from "../CardPopover";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { MemoAnchor, MemoLightbulb, memoAnchorId } from "../MemoLightbulb";
import { spotStyle, spotTargetProps, useSpotlight } from "../SpotlightContext";
import { EditableText, useEditSignal } from "../ui";
import { NEON, PAPER } from "../theme";
import { cardId, type ListCard, type ListRow } from "../types";

const COA_GROUPS = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"] as const;

export function ListCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ListCard;
  const { update, updateFn } = useCardActions(id);
  const ctx = useCanvasSettings();
  const sp = useSpotlight();
  const editing = !!d.editMode;
  useEditSignal((data as { _editSeq?: number })._editSeq, () => update({ editMode: true })); // F2 global edit (item 4) — opens row editors
  const [gear, setGear] = useState<HTMLElement | null>(null);

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

  // LIVE COA PULL (P2): a bound group's accounts precede the manual rows. Contra
  // accounts arrive indented + "Less:" (statement form). These are derived —
  // never stored — so editing the course's COA updates the card live.
  const pulled = d.coaGroup ? (ctx.coa.find((g) => g.label === d.coaGroup)?.accounts ?? []) : [];
  const pulledRowsRaw: { key: string; text: string; chip?: "DR" | "CR"; indent: boolean; pulled: true }[] = pulled.map((a) => ({
    key: `coa:${a.name}`,
    text: a.name,
    chip: a.normal === "debit" ? "DR" : "CR",
    indent: a.type.startsWith("contra"),
    pulled: true,
  }));
  // MANUAL REORDER (Lee): apply d.pullOrder (account names); unlisted accounts keep
  // their COA order after the ordered ones (stable sort).
  const pulledRows = (() => {
    if (!d.pullOrder?.length) return pulledRowsRaw;
    const idx = new Map(d.pullOrder.map((n, i) => [n, i]));
    return pulledRowsRaw.slice().sort((a, b) => (idx.get(a.text) ?? Infinity) - (idx.get(b.text) ?? Infinity));
  })();
  const movePulled = (i: number, dir: -1 | 1) => {
    const names = pulledRows.map((r) => r.text);
    const j = i + dir;
    if (j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    update({ pullOrder: names });
  };

  // COURSE OUTLINE BIND (Lee): auto-fill from the scene's course chapters, live.
  const tree = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 60_000, enabled: !!d.outlineBind });
  const outlineRows: { key: string; text: string }[] = d.outlineBind
    ? ((tree.data?.courses.find((c) => c.id === ctx.courseId)?.chapters ?? [])
        .filter((ch) => ch.id !== "__unassigned__" && (ch.status ?? "active") !== "archived")
        .slice()
        .sort((a, b) => (a.chapter_number ?? 9999) - (b.chapter_number ?? 9999))
        .map((ch) => ({ key: `ol:${ch.id}`, text: ch.chapter_name || `Lesson ${ch.chapter_number ?? ""}`.trim() })))
    : [];

  const bullet = (i: number) =>
    d.bulleted ? (
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PAPER.green }} />
    ) : (
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold" style={{ border: `1px solid ${PAPER.green}`, color: PAPER.green }}>
        {i + 1}
      </span>
    );

  const chipEl = (chip: "DR" | "CR" | undefined, onCycle?: () => void) =>
    d.showChips && (chip || editing) ? (
      <button
        className="nodrag shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
        style={{
          color: chip === "DR" ? PAPER.navy : chip === "CR" ? PAPER.red : PAPER.inkMuted,
          border: `1px solid ${chip === "DR" ? PAPER.navy : chip === "CR" ? PAPER.red : PAPER.line}`,
          opacity: chip ? 1 : 0.5,
        }}
        title={onCycle ? "Cycle DR → CR → none" : chip === "DR" ? "normal balance: debit" : "normal balance: credit"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onCycle?.(); }}
      >
        {chip ?? "—"}
      </button>
    ) : null;

  return (
    <BaseCard
      id={id}
      data={d}
      selected={selected}
      accent={NEON.green}
      noEditBtn
      clipX
      titleNode={<span className="min-w-0 flex-1" />}
      headerRight={
        <button
          title="List settings"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setGear(gear ? null : e.currentTarget); }}
          className="nodrag grid h-5 w-5 place-items-center rounded"
          style={{ color: gear ? NEON.yellow : NEON.muted }}
        >
          <Settings2 className="h-3 w-3" />
        </button>
      }
    >
      {gear && (
        <CardPopover anchor={gear} side="left" onClose={() => setGear(null)}>
          <ListSettings d={d} onUpdate={update} onClose={() => setGear(null)} />
        </CardPopover>
      )}

      {/* HEADER — the list title reads as a real heading: big, bold, and set off
          from the rows by a rule. Hidden via the "List title" setting (Lee) for a
          clean rows-only box. (The compact navy bar keeps only the controls.) */}
      {!d.hideTitle && (
        <div className="mb-2 border-b pb-1.5" style={{ borderColor: PAPER.line }}>
          <EditableText
            value={d.title ?? ""}
            onChange={(v) => update({ title: v })}
            editing={editing}
            className="block text-[19px] font-extrabold uppercase leading-tight tracking-wide"
            placeholder="List title"
          />
        </div>
      )}

      {/* Item 6: the one-line "definition" was a duplicate inline title — the
          title lives ONLY in the top bar now; the description sits directly
          under the bar. (d.definition kept in the type for old scenes; unused.) */}
      {/* DESCRIPTION (L4): a short paragraph, inline-editable, reveal-able as a step */}
      {(d.description || editing) && (
        d.descHidden ? (
          <div
            className="nodrag mb-2 grid h-9 cursor-pointer place-items-center rounded"
            style={{ background: "rgba(59,245,160,0.12)", border: `1px dashed ${PAPER.green}` }}
            title="Hidden — space (or click) reveals"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); update({ descHidden: false }); }}
          />
        ) : (
          <p className="mb-2 whitespace-pre-wrap text-[12.5px] leading-snug" style={{ color: PAPER.ink }}>
            <EditableText value={d.description ?? ""} onChange={(v) => update({ description: v })} editing={editing} placeholder="Description paragraph…" multiline />
          </p>
        )
      )}

      <ol className="space-y-1">
        {/* OUTLINE rows (live course chapters) — auto-filled; spotlightable (Lee) */}
        {outlineRows.map((r, i) => {
          const st = spotTargetProps(sp, id, r.key);
          return (
            <li key={r.key} {...st.props} className="flex items-center gap-1.5 text-[14px]" style={{ ...spotStyle(st.state) }}>
              {bullet(i)}
              <span className="min-w-0 flex-1 font-medium" style={{ color: PAPER.ink }}>{r.text}</span>
            </li>
          );
        })}
        {/* PULLED rows (live COA) — contra items in "Less:" form. Now spotlightable,
            memo-attachable, and manually reorderable (edit mode) — Lee's asks. */}
        {pulledRows.map((r, i) => {
          const st = spotTargetProps(sp, id, r.key);
          return (
          <li key={r.key} {...st.props} className="group/row relative flex items-center gap-1.5 text-[14px]" style={{ ...spotStyle(st.state), paddingLeft: r.indent ? 18 : 0 }}>
            <MemoAnchor subId={r.key} />
            {bullet(outlineRows.length + i)}
            <span className="min-w-0 flex-1 font-medium" style={{ color: PAPER.ink }}>
              {r.indent && <span style={{ color: PAPER.inkMuted }}>Less: </span>}
              {r.text}
            </span>
            <MemoLightbulb targetId={id} handleId={memoAnchorId(r.key)} title="Attach a memo to this account" className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100" style={{ color: PAPER.navy }} />
            {chipEl(r.chip)}
            {editing && (
              <span className="flex shrink-0">
                <IconBtn title="Move up" onClick={() => movePulled(i, -1)}><ArrowUp className="h-3 w-3" /></IconBtn>
                <IconBtn title="Move down" onClick={() => movePulled(i, 1)}><ArrowDown className="h-3 w-3" /></IconBtn>
              </span>
            )}
          </li>
          );
        })}
        {/* MANUAL rows */}
        {d.rows.map((r, i) => {
          const st = spotTargetProps(sp, id, r.id);
          return (
          <li key={r.id} {...st.props} className="group/row relative flex items-center gap-1.5 text-[14px]" style={{ ...spotStyle(st.state), opacity: r.hidden ? 0.15 : st.state === "dim" ? 0.85 : 1, paddingLeft: r.indent ? 18 : 0 }}>
            <MemoAnchor subId={r.id} />
            {bullet(outlineRows.length + pulledRows.length + i)}
            {/* No default "you are here" emphasis (Lee's call) — emphasis comes only
                from the user's spotlight/super-spotlight. */}
            <span className="min-w-0 flex-1 break-words" style={{ color: PAPER.ink, fontWeight: 500 }}>
              {r.indent && <span style={{ color: PAPER.inkMuted }}>Less: </span>}
              <EditableText value={r.text} onChange={(v) => patchRow(r.id, { text: v })} editing={editing} placeholder="Item" />
            </span>
            <MemoLightbulb targetId={id} handleId={memoAnchorId(r.id)} title="Attach a memo to this item" className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100" style={{ color: PAPER.navy }} />
            {chipEl(r.chip, editing ? () => cycleChip(r) : undefined)}
            {editing && (
              <span className="flex shrink-0">
                <IconBtn title={r.indent ? "Unindent" : 'Indent + "Less:" (contra form)'} active={r.indent} onClick={() => patchRow(r.id, { indent: !r.indent })}><IndentIncrease className="h-3 w-3" /></IconBtn>
                <IconBtn title="Up" onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></IconBtn>
                <IconBtn title="Down" onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></IconBtn>
                <IconBtn title="Remove" danger onClick={() => setRows(d.rows.filter((x) => x.id !== r.id))}><Trash2 className="h-3 w-3" /></IconBtn>
              </span>
            )}
          </li>
          );
        })}
      </ol>

      {editing && (
        <button
          className="nodrag mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ color: PAPER.navy, border: "1px solid rgba(20,33,61,0.35)" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setRows([...d.rows, { id: cardId("r"), text: "" }])}
        >
          <Plus className="h-3 w-3" /> row
        </button>
      )}
    </BaseCard>
  );
}

/** LIST SETTINGS popover (P2) — replaces the edit pencil (JE-consistent gear):
 *  edit rows, numbered↔bulleted, DR/CR chips, and the live COA bind. */
function ListSettings({ d, onUpdate, onClose }: { d: ListCard; onUpdate: (p: Partial<ListCard>) => void; onClose: () => void }) {
  const row = "flex items-center justify-between gap-2 py-0.5 text-[11.5px]";
  const toggle = (on: boolean) => ({
    color: on ? NEON.yellow : NEON.muted,
    background: on ? "rgba(252,163,17,0.12)" : "transparent",
    border: `1px solid ${on ? "rgba(252,163,17,0.5)" : NEON.borderSoft}`,
  });
  return (
    <div
      className="nodrag w-56 rounded-lg p-2 shadow-xl"
      style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>List settings</div>
      <div className={row}>
        <span>Edit rows</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!!d.editMode)} onClick={() => onUpdate({ editMode: !d.editMode })}>{d.editMode ? "on" : "off"}</button>
      </div>
      <div className={row}>
        <span>Markers</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!d.bulleted)} onClick={() => onUpdate({ bulleted: !d.bulleted })}>{d.bulleted ? "bulleted" : "numbered"}</button>
      </div>
      <div className={row}>
        <span>DR/CR chips</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!!d.showChips)} onClick={() => onUpdate({ showChips: !d.showChips })}>{d.showChips ? "on" : "off"}</button>
      </div>
      <div className={row}>
        <span>Course outline</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!!d.outlineBind)} onClick={() => onUpdate({ outlineBind: !d.outlineBind })}>{d.outlineBind ? "on" : "off"}</button>
      </div>
      <div className={row}>
        <span>List title</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!d.hideTitle)} onClick={() => onUpdate({ hideTitle: !d.hideTitle })}>{d.hideTitle ? "off" : "on"}</button>
      </div>
      <div className={row}>
        <span>Header bar <span className="opacity-60">(Alt+click too)</span></span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!d.hideChrome)} onClick={() => onUpdate({ hideChrome: !d.hideChrome })}>{d.hideChrome ? "off" : "on"}</button>
      </div>
      <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: NEON.borderSoft }}>
        <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Bind to COA</div>
        <select
          value={d.coaGroup ?? ""}
          onChange={(e) => onUpdate({ coaGroup: e.target.value || null })}
          className="w-full rounded bg-black/40 px-1 py-0.5 text-[11px] outline-none"
          style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
        >
          <option value="">Manual only</option>
          {COA_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <p className="mt-1 text-[9.5px] leading-snug" style={{ color: NEON.muted }}>
          Pulls this course's accounts of that type, live. Manual rows still allowed below.
        </p>
      </div>
      <div className="mt-1.5 flex justify-end">
        <button className="rounded px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}>done</button>
      </div>
    </div>
  );
}
