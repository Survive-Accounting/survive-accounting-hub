// Formula card — TWO LENSES on the same chain:
//  • NUMBERS: [Beginning inv] + [Purchases] = [Goods available] − …  (values)
//  • ARROWS:  the A = L + E equation, each component showing ↑ ↓ ↑↓ — instead of
//    a value. Arrows are settable by click (↑→↓→↑↓→—) OR derived from a bound
//    library scenario (equation-derive). PRACTICE blanks the components; the
//    student sets arrows and Reveal grades each against the answer.
// Labels/values/operators inline-editable; per-segment reveal rides the stepper.
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { ArrowLeftRight, Check, Link2, Link2Off, Plus, Settings2, X } from "lucide-react";

import { BaseCard, useCardActions } from "../BaseCard";
import { CardPopover } from "../CardPopover";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { coaLookup, deriveEquationArrows, EQ_ARROW_GLYPH, EQ_DIR_CYCLE } from "../equation-derive";
import { MemoAnchor, MemoLightbulb, memoAnchorId } from "../MemoLightbulb";
import { spotStyle, spotTargetProps, useSpotlight } from "../SpotlightContext";
import { JeScenarioPicker } from "./JeScenarioPicker";
import type { LibraryItem } from "../library";
import { EditableText } from "../ui";
import { NEON, PAPER } from "../theme";
import { cardId, type EqComponent, type EqDir, type FormulaCard, type FormulaSegment, type JeCard } from "../types";

const OPERATORS = ["+", "−", "=", "×", "÷"] as const;
const ARROW_COLOR: Record<EqDir, string> = { up: "#1F9D57", down: PAPER.red, both: "#C77D0A", none: PAPER.inkMuted };
const COMPONENTS: { key: EqComponent; label: string }[] = [
  { key: "assets", label: "A" },
  { key: "liabilities", label: "L" },
  { key: "equity", label: "E" },
];
const nextDir = (cur: EqDir | undefined): EqDir =>
  cur === undefined ? "up" : EQ_DIR_CYCLE[(EQ_DIR_CYCLE.indexOf(cur) + 1) % EQ_DIR_CYCLE.length];

export function FormulaCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as FormulaCard;
  const { update, updateFn } = useCardActions(id);
  const ctx = useCanvasSettings();
  const sp = useSpotlight();
  const [gear, setGear] = useState<HTMLElement | null>(null);
  const [picker, setPicker] = useState<HTMLElement | null>(null);

  const arrows = d.display === "arrows";
  const practice = d.arrowMode === "practice";
  const editing = !!d.editMode;

  // LIVE derivation from the bound scenario (if any) — powers auto-arrows on bind
  // and the derived/overridden indicator for the author.
  const boundItem = d.scenarioId ? ctx.jeLibrary.find((it) => it.scenarioId === d.scenarioId) : undefined;
  const derived = boundItem
    ? deriveEquationArrows(((boundItem.make() as JeCard).solution ?? (boundItem.make() as JeCard).lines) ?? [], coaLookup(ctx.coa))
    : null;

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
      ops.splice(Math.max(0, idx - 1), 1);
      return { segments: segs.filter((s) => s.id !== sid), operators: ops };
    });

  /** Stamp the canonical A = L + E: three component segments + = / + operators. */
  const setupEquation = () =>
    update({
      segments: [
        { id: cardId("fs"), label: "Assets", value: "", component: "assets" },
        { id: cardId("fs"), label: "Liabilities", value: "", component: "liabilities" },
        { id: cardId("fs"), label: "Equity", value: "", component: "equity" },
      ],
      operators: ["=", "+"],
      display: "arrows",
    });

  /** Bind a library scenario → auto-derive each component's arrow (override clears). */
  const bind = (it: LibraryItem) => {
    const made = it.make() as JeCard;
    const arr = deriveEquationArrows((made.solution ?? made.lines) ?? [], coaLookup(ctx.coa));
    updateFn((prev) => ({
      scenarioId: it.scenarioId,
      segments: ((prev.segments as FormulaSegment[]) ?? []).map((s) => (s.component ? { ...s, arrow: arr[s.component], overridden: false } : s)),
    }));
    setPicker(null);
  };

  const hasComponents = d.segments.some((s) => s.component);
  const canReveal = practice && d.segments.filter((s) => s.component).every((s) => s.attempt !== undefined);

  // ---- ARROW component cell -------------------------------------------------
  const arrowCell = (s: FormulaSegment) => {
    const comp = s.component;
    const answer = s.arrow ?? "none";
    const shown = practice ? s.attempt : s.arrow;
    const graded = practice && d.graded;
    const correct = graded && s.attempt === answer;
    const derivedDir = comp && derived ? derived[comp] : undefined;
    const overridden = !!derivedDir && s.arrow !== derivedDir;

    const onClick = () => {
      if (practice) { if (!d.graded) patchSeg(s.id, { attempt: nextDir(s.attempt) }); }
      else patchSeg(s.id, { arrow: nextDir(s.arrow), overridden: !!derivedDir && nextDir(s.arrow) !== derivedDir });
    };

    const stp = spotTargetProps(sp, id, s.id);
    return (
      <div {...stp.props} className="relative flex flex-col items-center gap-0.5" style={{ minWidth: 72, ...spotStyle(stp.state), ...(stp.state === "dim" ? { opacity: 0.85 } : {}) }}>
        <MemoAnchor subId={s.id} />
        <MemoLightbulb targetId={id} handleId={memoAnchorId(s.id)} title="Attach a memo to this component" className="absolute -left-1 -top-1 z-[2] h-4 w-4 opacity-0 transition-opacity group-hover/seg:opacity-100" style={{ color: PAPER.navy, background: "#FBF9F4", border: `1px solid ${PAPER.line}` }} />
        <div className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: PAPER.inkMuted }}>
          <EditableText value={s.label} onChange={(v) => patchSeg(s.id, { label: v })} editing={editing} placeholder={comp ?? "label"} />
        </div>
        <button
          className="nodrag grid h-14 w-[72px] place-items-center rounded-lg text-[34px] font-black leading-none"
          style={{
            color: shown ? ARROW_COLOR[shown] : PAPER.inkFaint,
            background: graded ? (correct ? "rgba(31,157,87,0.12)" : "rgba(194,24,50,0.10)") : "rgba(20,33,61,0.03)",
            border: `1.5px solid ${graded ? (correct ? "#1F9D57" : PAPER.red) : PAPER.line}`,
          }}
          title={practice ? (d.graded ? "" : "Set the arrow (↑ ↓ ↑↓ —)") : "Cycle ↑ → ↓ → ↑↓ → —"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          {shown ? EQ_ARROW_GLYPH[shown] : "·"}
        </button>
        {/* practice grade badge: right/wrong + the correct arrow when wrong */}
        {graded && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color: correct ? "#1F9D57" : PAPER.red }}>
            {correct ? <Check className="h-3 w-3" /> : <>✗ {EQ_ARROW_GLYPH[answer]}</>}
          </span>
        )}
        {/* author-only derived/overridden indicator (edit or selected) */}
        {(editing || selected) && !practice && derivedDir && (
          <span className="rounded px-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: overridden ? "#C77D0A" : "#1F9D57", border: `1px solid ${overridden ? "#C77D0A" : "#1F9D57"}66` }}>
            {overridden ? "override" : "derived"}
          </span>
        )}
        {/* component role picker (edit) */}
        {editing && (
          <div className="flex gap-0.5">
            {COMPONENTS.map((c) => (
              <button
                key={c.key}
                className="grid h-4 w-4 place-items-center rounded text-[9px] font-bold"
                style={{ color: comp === c.key ? "#0B1322" : PAPER.inkMuted, background: comp === c.key ? NEON.yellow : "transparent", border: `1px solid ${PAPER.line}` }}
                title={`Mark as ${c.key}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); patchSeg(s.id, { component: comp === c.key ? undefined : c.key }); }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <BaseCard
      id={id}
      data={d}
      selected={selected}
      accent={NEON.yellow}
      noEditBtn
      headerRight={
        <>
          <button
            title={arrows ? "Show numbers" : "Show A = L + E arrows"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); update({ display: arrows ? "numbers" : "arrows" }); }}
            className="nodrag grid h-5 w-5 place-items-center rounded"
            style={{ color: arrows ? NEON.yellow : NEON.muted }}
          >
            <ArrowLeftRight className="h-3 w-3" />
          </button>
          <button
            title="Formula settings"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setGear(gear ? null : e.currentTarget); }}
            className="nodrag grid h-5 w-5 place-items-center rounded"
            style={{ color: gear ? NEON.yellow : NEON.muted }}
          >
            <Settings2 className="h-3 w-3" />
          </button>
        </>
      }
    >
      {gear && (
        <CardPopover anchor={gear} side="left" onClose={() => setGear(null)}>
          <FormulaSettings d={d} onUpdate={update} onSetup={setupEquation} onBind={() => { setPicker(gear); setGear(null); }} onUnbind={() => update({ scenarioId: undefined })} boundLabel={boundItem?.label ?? null} onClose={() => setGear(null)} />
        </CardPopover>
      )}
      {picker && (
        <CardPopover anchor={picker} side="left" onClose={() => setPicker(null)}>
          <JeScenarioPicker
            items={ctx.jeLibrary}
            courseId={ctx.courseId}
            courseName={ctx.courseName}
            contentResetMissing={ctx.contentResetMissing}
            onPick={bind}
            onCustom={() => setPicker(null)}
            onClose={() => setPicker(null)}
          />
        </CardPopover>
      )}

      {arrows && !hasComponents && (
        <button
          className="nodrag mb-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold"
          style={{ color: PAPER.navy, border: `1px dashed ${PAPER.line}` }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={setupEquation}
        >
          <Plus className="h-3 w-3" /> Set up A = L + E
        </button>
      )}

      {arrows && practice && hasComponents && (
        <div className="mb-1.5 flex items-center gap-2 text-[10px]">
          <span style={{ color: PAPER.inkMuted }}>{d.graded ? "Graded — reset to try again" : "Set each arrow, then Reveal"}</span>
          {d.graded ? (
            <button className="nodrag rounded px-1.5 py-0.5 font-bold uppercase" style={{ color: PAPER.navy, border: `1px solid ${PAPER.line}` }} onPointerDown={(e) => e.stopPropagation()} onClick={() => updateFn((prev) => ({ graded: false, segments: (prev.segments as FormulaSegment[]).map((s) => ({ ...s, attempt: undefined })) }))}>reset</button>
          ) : (
            <button className="nodrag rounded px-1.5 py-0.5 font-bold uppercase disabled:opacity-40" style={{ color: "#0B1322", background: canReveal ? NEON.yellow : "transparent", border: `1px solid ${PAPER.line}` }} disabled={!canReveal} onPointerDown={(e) => e.stopPropagation()} onClick={() => update({ graded: true })}>reveal</button>
          )}
        </div>
      )}

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
              <div
                className="nodrag grid h-11 w-24 cursor-pointer place-items-center rounded-md"
                style={{ background: "rgba(252,163,17,0.16)", border: "1px dashed rgba(138,90,0,0.45)" }}
                title="Hidden — space (or click) reveals"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); patchSeg(s.id, { hidden: false }); }}
              />
            ) : arrows ? (
              <div className="group/seg relative">
                {d.segments.length > 1 && editing && (
                  <button
                    className="nodrag absolute -right-1.5 -top-1.5 z-[2] grid h-4 w-4 place-items-center rounded-full opacity-0 transition-opacity group-hover/seg:opacity-100"
                    style={{ color: PAPER.red, background: "#FBF9F4", border: "1px solid rgba(194,24,50,0.35)" }}
                    title="Remove segment"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); removeSegment(s.id); }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
                {arrowCell(s)}
              </div>
            ) : (
              <div
                {...spotTargetProps(sp, id, s.id).props}
                className="group/seg relative rounded-md px-2 py-1 text-center"
                style={{ border: `1px solid ${PAPER.line}`, background: "rgba(20,33,61,0.03)", minWidth: 84, ...spotStyle(spotTargetProps(sp, id, s.id).state) }}
              >
                <MemoAnchor subId={s.id} />
                <MemoLightbulb targetId={id} handleId={memoAnchorId(s.id)} title="Attach a memo to this segment" className="absolute -left-1.5 -top-1.5 z-[2] h-4 w-4 opacity-0 transition-opacity group-hover/seg:opacity-100" style={{ color: PAPER.navy, background: "#FBF9F4", border: `1px solid ${PAPER.line}` }} />
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
                <div className="text-[14px] font-bold tabular-nums" style={{ color: s.value ? PAPER.navy : PAPER.inkMuted, opacity: s.value ? 1 : 0.5 }}>
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

/** FORMULA SETTINGS popover — lens, arrows mode, scenario bind. */
function FormulaSettings({ d, onUpdate, onSetup, onBind, onUnbind, boundLabel, onClose }: {
  d: FormulaCard;
  onUpdate: (p: Partial<FormulaCard>) => void;
  onSetup: () => void;
  onBind: () => void;
  onUnbind: () => void;
  boundLabel: string | null;
  onClose: () => void;
}) {
  const row = "flex items-center justify-between gap-2 py-0.5 text-[11.5px]";
  const toggle = (on: boolean) => ({ color: on ? NEON.yellow : NEON.muted, background: on ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${on ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` });
  const arrows = d.display === "arrows";
  return (
    <div className="nodrag w-60 rounded-lg p-2 shadow-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Formula settings</div>
      <div className={row}>
        <span>Lens</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(arrows)} onClick={() => onUpdate({ display: arrows ? "numbers" : "arrows" })}>{arrows ? "arrows" : "numbers"}</button>
      </div>
      <div className={row}>
        <span>Edit</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!!d.editMode)} onClick={() => onUpdate({ editMode: !d.editMode })}>{d.editMode ? "on" : "off"}</button>
      </div>
      {arrows && (
        <>
          <div className={row}>
            <span>Arrows mode</span>
            <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(d.arrowMode === "practice")} onClick={() => onUpdate({ arrowMode: d.arrowMode === "practice" ? "guided" : "practice", graded: false })}>{d.arrowMode === "practice" ? "practice" : "guided"}</button>
          </div>
          <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: NEON.borderSoft }}>
            <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.cyan }}>Bind to scenario</div>
            {boundLabel ? (
              <div className="flex items-center justify-between gap-1">
                <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: NEON.text }}>{boundLabel}</span>
                <button className="grid h-5 w-5 place-items-center rounded" style={{ color: NEON.red }} title="Unlink scenario" onClick={onUnbind}><Link2Off className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={onBind}><Link2 className="h-3 w-3" /> Pick a scenario…</button>
            )}
            <p className="mt-1 text-[9.5px] leading-snug" style={{ color: NEON.muted }}>Auto-derives A/L/E arrows. Manual clicks override (badge shows which).</p>
          </div>
        </>
      )}
      {arrows && !d.segments.some((s) => s.component) && (
        <button className="mt-1.5 flex w-full items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { onSetup(); onClose(); }}><Plus className="h-3 w-3" /> Set up A = L + E</button>
      )}
      <div className="mt-1.5 flex justify-end">
        <button className="rounded px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}>done</button>
      </div>
    </div>
  );
}
