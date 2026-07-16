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
import { coaLookup, deriveArrows, EQ_ARROW_GLYPH, EQ_DIR_CYCLE, rubricOf } from "../equation-derive";
import { MemoAnchor, MemoLightbulb, memoAnchorId } from "../MemoLightbulb";
import { spotStyle, spotTargetProps, useSpotlight } from "../SpotlightContext";
import { JeScenarioPicker } from "./JeScenarioPicker";
import type { LibraryItem } from "../library";
import { EditableText } from "../ui";
import { NEON, PAPER } from "../theme";
import { cardId, type EqComponent, type EqDir, type FormulaCard, type FormulaSegment, type JeCard } from "../types";

const OPERATORS = ["+", "−", "=", "×", "÷"] as const;
const ARROW_COLOR: Record<EqDir, string> = { up: "#1F9D57", down: PAPER.red, both: "#C77D0A", none: PAPER.inkMuted };
const ALE_COMPONENTS: { key: EqComponent; label: string }[] = [
  { key: "assets", label: "A" },
  { key: "liabilities", label: "L" },
  { key: "equity", label: "E" },
];
const RE_COMPONENTS: { key: EqComponent; label: string }[] = [
  { key: "revenues", label: "Rev" },
  { key: "expenses", label: "Exp" },
];
const componentsFor = (preset: "ale" | "re") => (preset === "re" ? RE_COMPONENTS : ALE_COMPONENTS);
const RUBRIC_COLOR: Record<"+" | "-", string> = { "+": "#1F9D57", "-": PAPER.red };
const nextDir = (cur: EqDir | undefined): EqDir =>
  cur === undefined ? "up" : EQ_DIR_CYCLE[(EQ_DIR_CYCLE.indexOf(cur) + 1) % EQ_DIR_CYCLE.length];

export function FormulaCardNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as FormulaCard;
  const { update, updateFn } = useCardActions(id);
  const ctx = useCanvasSettings();
  const sp = useSpotlight();
  const [gear, setGear] = useState<HTMLElement | null>(null);
  const [picker, setPicker] = useState<HTMLElement | null>(null);

  const lens = d.display ?? "numbers"; // numbers | arrows | rubric
  const arrows = lens === "arrows";
  const rubric = lens === "rubric";
  const preset = d.preset ?? "ale"; // ale (A=L+E) | re (Revenues/Expenses)
  const practice = d.arrowMode === "practice";
  const editing = !!d.editMode;

  // LIVE derivation from the bound scenario (if any), PRESET-AWARE (ER4) — powers
  // auto-arrows on bind + the derived/overridden indicator. The rubric lens is
  // NOT scenario-bound (static per account type), so it ignores this.
  const boundItem = d.scenarioId ? ctx.jeLibrary.find((it) => it.scenarioId === d.scenarioId) : undefined;
  const boundCaption = boundItem ? (boundItem.make() as JeCard).caption : null; // ER3: the scenario stem
  const derived = boundItem
    ? deriveArrows(((boundItem.make() as JeCard).solution ?? (boundItem.make() as JeCard).lines) ?? [], coaLookup(ctx.coa), preset)
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
      preset: "ale",
    });

  /** ER4 — the Revenues / Expenses preset: two components, NO equation operators
   *  (income-statement lens, kept separate from A=L+E in the student's mind). */
  const setupRevExp = () =>
    update({
      segments: [
        { id: cardId("fs"), label: "Revenues", value: "", component: "revenues" },
        { id: cardId("fs"), label: "Expenses", value: "", component: "expenses" },
      ],
      operators: [],
      display: "arrows",
      preset: "re",
    });

  /** Bind a library scenario → auto-derive each component's arrow (override clears),
   *  PRESET-AWARE so the R/E card derives Revenues↑ where A=L+E derives E↑. */
  const bind = (it: LibraryItem) => {
    const made = it.make() as JeCard;
    const arr = deriveArrows((made.solution ?? made.lines) ?? [], coaLookup(ctx.coa), preset);
    updateFn((prev) => ({
      scenarioId: it.scenarioId,
      segments: ((prev.segments as FormulaSegment[]) ?? []).map((s) => (s.component ? { ...s, arrow: arr[s.component], overridden: false } : s)),
    }));
    setPicker(null);
  };

  const hasComponents = d.segments.some((s) => s.component);
  const canReveal = practice && d.segments.filter((s) => s.component).every((s) => (rubric ? s.drAttempt !== undefined && s.crAttempt !== undefined : s.attempt !== undefined));

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
          <span className="sa-chrome rounded px-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: overridden ? "#C77D0A" : "#1F9D57", border: `1px solid ${overridden ? "#C77D0A" : "#1F9D57"}66` }}>
            {overridden ? "override" : "derived"}
          </span>
        )}
        {/* component role picker (edit) — preset-aware set (A/L/E or Rev/Exp) */}
        {editing && (
          <div className="sa-chrome flex gap-0.5">
            {componentsFor(preset).map((c) => (
              <button
                key={c.key}
                className="grid h-4 w-7 place-items-center rounded text-[9px] font-bold"
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

  // ---- RUBRIC component cell (ER5): what a DEBIT / a CREDIT does to this
  //      component, STATIC from its account type. Practice → the student sets
  //      each side (+/-), reveal grades. Not scenario-bound. -------------------
  const rubricCell = (s: FormulaSegment) => {
    const comp = s.component;
    const key = rubricOf(comp ?? "assets"); // {dr,cr}
    const graded = practice && d.graded;
    const sideCell = (side: "dr" | "cr") => {
      const answer = key[side];
      const attempt = side === "dr" ? s.drAttempt : s.crAttempt;
      const shown = practice ? attempt : answer;
      const ok = graded && attempt === answer;
      const cycle = (): "+" | "-" => (attempt === "+" ? "-" : "+"); // blank → +
      return (
        <button
          key={side}
          className="nodrag grid h-11 w-9 place-items-center rounded-md text-[24px] font-black leading-none"
          style={{
            color: shown ? RUBRIC_COLOR[shown] : PAPER.inkFaint,
            background: graded ? (ok ? "rgba(31,157,87,0.12)" : "rgba(194,24,50,0.10)") : "rgba(20,33,61,0.03)",
            border: `1.5px solid ${graded ? (ok ? "#1F9D57" : PAPER.red) : PAPER.line}`,
          }}
          title={`${side.toUpperCase()} side`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (!practice || d.graded) return; patchSeg(s.id, side === "dr" ? { drAttempt: cycle() } : { crAttempt: cycle() }); }}
        >
          {shown ?? "·"}
        </button>
      );
    };
    const stp = spotTargetProps(sp, id, s.id);
    return (
      <div {...stp.props} className="relative flex flex-col items-center gap-0.5" style={{ minWidth: 84, ...spotStyle(stp.state), ...(stp.state === "dim" ? { opacity: 0.85 } : {}) }}>
        <MemoAnchor subId={s.id} />
        <MemoLightbulb targetId={id} handleId={memoAnchorId(s.id)} title="Attach a memo to this component" className="absolute -left-1 -top-1 z-[2] h-4 w-4 opacity-0 transition-opacity group-hover/seg:opacity-100" style={{ color: PAPER.navy, background: "#FBF9F4", border: `1px solid ${PAPER.line}` }} />
        <div className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: PAPER.inkMuted }}>
          <EditableText value={s.label} onChange={(v) => patchSeg(s.id, { label: v })} editing={editing} placeholder={comp ?? "label"} />
        </div>
        <div className="flex items-center gap-1">
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: PAPER.inkMuted }}>DR</span>
            {sideCell("dr")}
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: PAPER.inkMuted }}>CR</span>
            {sideCell("cr")}
          </div>
        </div>
        {graded && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color: (s.drAttempt === key.dr && s.crAttempt === key.cr) ? "#1F9D57" : PAPER.red }}>
            {(s.drAttempt === key.dr && s.crAttempt === key.cr) ? <Check className="h-3 w-3" /> : <>✗ {key.dr}/{key.cr}</>}
          </span>
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
            title={`Lens: ${lens} — click to cycle Numbers → Arrows → Rubric`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); update({ display: lens === "numbers" ? "arrows" : lens === "arrows" ? "rubric" : "numbers" }); }}
            className="nodrag grid h-5 w-auto place-items-center rounded px-1 text-[9px] font-bold uppercase"
            style={{ color: lens !== "numbers" ? NEON.yellow : NEON.muted }}
          >
            {lens === "rubric" ? "+/−" : <ArrowLeftRight className="h-3 w-3" />}
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
          <FormulaSettings d={d} onUpdate={update} onSetup={setupEquation} onSetupRE={setupRevExp} onBind={() => { setPicker(gear); setGear(null); }} onUnbind={() => update({ scenarioId: undefined })} boundLabel={boundItem?.label ?? null} onClose={() => setGear(null)} />
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

      {/* ER3 — the bound scenario's caption (the stem students read), film-legible */}
      {boundCaption && (
        <div className="-mt-1 mb-1.5 text-[12px] font-semibold leading-snug" style={{ color: PAPER.navy }}>
          {boundCaption}
        </div>
      )}

      {(arrows || rubric) && !hasComponents && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            className="nodrag inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold"
            style={{ color: PAPER.navy, border: `1px dashed ${PAPER.line}` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={setupEquation}
          >
            <Plus className="h-3 w-3" /> A = L + E
          </button>
          <button
            className="nodrag inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold"
            style={{ color: PAPER.navy, border: `1px dashed ${PAPER.line}` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={setupRevExp}
          >
            <Plus className="h-3 w-3" /> Revenues / Expenses
          </button>
        </div>
      )}

      {(arrows || rubric) && practice && hasComponents && (
        <div className="mb-1.5 flex items-center gap-2 text-[10px]">
          <span style={{ color: PAPER.inkMuted }}>{d.graded ? "Graded — reset to try again" : rubric ? "Set +/- per side, then Reveal" : "Set each arrow, then Reveal"}</span>
          {d.graded ? (
            <button className="nodrag rounded px-1.5 py-0.5 font-bold uppercase" style={{ color: PAPER.navy, border: `1px solid ${PAPER.line}` }} onPointerDown={(e) => e.stopPropagation()} onClick={() => updateFn((prev) => ({ graded: false, segments: (prev.segments as FormulaSegment[]).map((s) => ({ ...s, attempt: undefined, drAttempt: undefined, crAttempt: undefined })) }))}>reset</button>
          ) : (
            <button className="nodrag rounded px-1.5 py-0.5 font-bold uppercase disabled:opacity-40" style={{ color: "#0B1322", background: canReveal ? NEON.yellow : "transparent", border: `1px solid ${PAPER.line}` }} disabled={!canReveal} onPointerDown={(e) => e.stopPropagation()} onClick={() => update({ graded: true })}>reveal</button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {d.segments.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            {/* R/E preset carries NO equation operators (income lens, ER4) */}
            {i > 0 && preset !== "re" && (
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
              // ER1 state 1 — HIDDEN = a WAITING slot (empty, no glyph): a soft
              // pulsing amber placeholder that reads "coming", never "no effect".
              <div
                className="nodrag relative flex flex-col items-center gap-0.5"
                style={{ minWidth: (arrows || rubric) ? 72 : 84 }}
                title="Waiting — space (or click) reveals the effect"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); patchSeg(s.id, { hidden: false }); }}
              >
                {(arrows || rubric) && (
                  <div className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: PAPER.inkMuted }}>{s.label || s.component}</div>
                )}
                <div
                  className="grid h-11 w-full cursor-pointer place-items-center rounded-md"
                  style={{ background: "rgba(252,163,17,0.14)", border: "1.5px dashed rgba(138,90,0,0.5)", animation: "eq-wait 1.6s ease-in-out infinite" }}
                />
                <style>{`@keyframes eq-wait { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }`}</style>
              </div>
            ) : rubric ? (
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
                {rubricCell(s)}
              </div>
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

/** FORMULA SETTINGS popover — lens (Numbers/Arrows/Rubric), preset, practice
 *  mode, scenario bind. */
function FormulaSettings({ d, onUpdate, onSetup, onSetupRE, onBind, onUnbind, boundLabel, onClose }: {
  d: FormulaCard;
  onUpdate: (p: Partial<FormulaCard>) => void;
  onSetup: () => void;
  onSetupRE: () => void;
  onBind: () => void;
  onUnbind: () => void;
  boundLabel: string | null;
  onClose: () => void;
}) {
  const row = "flex items-center justify-between gap-2 py-0.5 text-[11.5px]";
  const toggle = (on: boolean) => ({ color: on ? NEON.yellow : NEON.muted, background: on ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${on ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` });
  const lens = d.display ?? "numbers";
  const derivable = lens === "arrows"; // rubric is static (account-type), not scenario-derived
  const gradeable = lens === "arrows" || lens === "rubric";
  const hasComp = d.segments.some((s) => s.component);
  return (
    <div className="nodrag w-60 rounded-lg p-2 shadow-xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Effect card settings</div>
      {/* ER5 — lens picker: Numbers | Arrows | Rubric */}
      <div className={row}>
        <span>Lens</span>
        <div className="flex gap-0.5">
          {(["numbers", "arrows", "rubric"] as const).map((l) => (
            <button key={l} className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={toggle(lens === l)} onClick={() => onUpdate({ display: l })}>{l === "rubric" ? "+/−" : l}</button>
          ))}
        </div>
      </div>
      <div className={row}>
        <span>Edit</span>
        <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(!!d.editMode)} onClick={() => onUpdate({ editMode: !d.editMode })}>{d.editMode ? "on" : "off"}</button>
      </div>
      {gradeable && (
        <div className={row}>
          <span>Mode</span>
          <button className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={toggle(d.arrowMode === "practice")} onClick={() => onUpdate({ arrowMode: d.arrowMode === "practice" ? "guided" : "practice", graded: false })}>{d.arrowMode === "practice" ? "practice" : "guided"}</button>
        </div>
      )}
      {derivable && (
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
          <p className="mt-1 text-[9.5px] leading-snug" style={{ color: NEON.muted }}>Auto-derives each component's arrow (preset-aware). Manual clicks override.</p>
        </div>
      )}
      {!hasComp && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <button className="flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[10.5px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { onSetup(); onClose(); }}><Plus className="h-3 w-3" /> A = L + E</button>
          <button className="flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[10.5px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => { onSetupRE(); onClose(); }}><Plus className="h-3 w-3" /> Rev / Exp</button>
        </div>
      )}
      <div className="mt-1.5 flex justify-end">
        <button className="rounded px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}>done</button>
      </div>
    </div>
  );
}
