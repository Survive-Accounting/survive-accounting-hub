// "WHEN IT COUNTS" (basis) — CASH VS. ACCRUAL. One economic event, two lenses,
// and the timing difference made visually unavoidable.
//
// The exhibit is a GRID and the grid is the argument: the months are COLUMNS,
// shared by the event strip and both basis rows, so each basis stamps its
// recognition marker in the column its own rule dictates. The two stamps
// landing in DIFFERENT columns is the lesson — no paragraph required. Because
// the month columns are shared, that misalignment survives every width; the
// narrow layout shrinks the gutter but never breaks the columns.
//
// CRAM: event strip + two rows + the punchline banner. Click a basis (its
// label or its stamp) to spotlight that lens — its stamp and its recognition
// principle light, the other row mutes. M / chips swap the EXPENSE and REVENUE
// examples. REVIEW: D opens THE FOUR TIMING GAPS, the on-ramp to adjusting
// entries — which is why this exhibit heads that topic.
//
// Content (months, pins, which month each basis stamps, gap strip) lives in
// cash-accrual-config.ts. The accrual-stamps-the-INCURRED-month correction is
// pinned by tests there.
import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";

import { EXHIBIT_GLOW } from "../exhibit-highlights";
import { ExhibitShell, useExhibit, type ExhibitDeclaration } from "../exhibit-base";
import { setExhibitDepth, useExhibitModes, useExhibitReveal, type ExhibitModeDef } from "../exhibit-modes";
import { CueTag } from "../exhibit-cues";
import {
  BASES, BASIS_APLUS_NOTE, BASIS_EXAMPLES, BASIS_REVEAL_MAX, GAPS_FOOTER, PUNCHLINE, TIMING_GAPS,
  basisBandVisible, basisExample, basisNodeIds, principleFor, type BasisBand, type BasisDef, type BasisId,
} from "../cash-accrual-config";
import { BIG_FONT, DISPLAY_FONT, NEON } from "../theme";
import { type BasisElement } from "../types";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const T = "opacity 300ms ease, filter 300ms ease, box-shadow 200ms ease, border-color 200ms ease";

const BASIS_MODES: readonly ExhibitModeDef[] = BASIS_EXAMPLES.map((e) => ({ id: e.id, label: e.label }));
const BASIS_C: Record<BasisId, string> = { accrual: "#FCA311", cash: "#60A5FA" };

export function BasisNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as BasisElement;
  const w = d.w ?? 960;
  const h = d.h ?? 560;
  const narrow = w < 620;

  const decl: ExhibitDeclaration = { minWidth: 360, minHeight: 320, nodes: basisNodeIds() };
  const ex = useExhibit(decl);
  const film = ex.film;
  const hl = ex.hl;
  const { revealTick, depthOn } = useExhibitReveal(BASIS_REVEAL_MAX);
  const { mode } = useExhibitModes(BASIS_MODES);

  // The shared mode store is global, so another moded exhibit on the same frame
  // could leave `mode` set to one of ITS ids. Fall back to our first example
  // rather than rendering an empty exhibit.
  const example = basisExample(mode) ?? BASIS_EXAMPLES[0];
  const vis = (band: BasisBand): boolean => !film || basisBandVisible(band, revealTick);

  const [primarySel, setPrimarySel] = useState<string | null>(null);
  const primary = hl.any ? primarySel : null;
  const selectBasis = (b: BasisId) => (e: React.MouseEvent) => {
    if (e.altKey) return;
    e.stopPropagation();
    if (primary === b) { hl.clear(); return; }
    hl.clear();
    hl.cycle(b);
    hl.cycle(`stamp-${b}`);
    setPrimarySel(b);
  };

  const muted = (nodeId: string): boolean => hl.any && !hl.isLit(nodeId);
  const emph = (nodeId: string): React.CSSProperties => ({
    opacity: muted(nodeId) ? 0.28 : 1,
    filter: muted(nodeId) ? "saturate(0.4)" : undefined,
    transition: T,
  });

  // The shared column geometry — months are columns; everything aligns to them.
  // The label gutter must fit the longest basis word at its own font size
  // ("ACCRUAL" + padding + the CueTag's overhang), or the narrow layout clips
  // it. Month columns keep the rest and still hold a stamp comfortably.
  const cols = narrow ? "96px 1fr 1fr" : "168px 1fr 1fr";
  const row = (children: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: narrow ? 6 : 10 }}>{children}</div>
  );

  const monthCell = (m: string) => (
    <div key={m} className="text-center" style={{ fontFamily: DISPLAY_FONT, fontSize: narrow ? 11 : 13, fontWeight: 900, letterSpacing: "0.2em", color: NEON.muted, paddingBottom: 4, borderBottom: "1px solid rgba(244,239,230,0.22)" }}>
      {m}
    </div>
  );

  const pin = (key: string, glyph: string, text: string, month: string) =>
    example.months.map((m) => (
      <div key={`${key}-${m}`} className="flex justify-center">
        {m === month ? (
          <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-center" style={{ background: "rgba(37,52,88,0.6)", border: "1px solid rgba(244,239,230,0.22)", maxWidth: 210 }}>
            <span style={{ fontSize: narrow ? 13 : 15 }}>{glyph}</span>
            <span style={{ fontFamily: DISPLAY_FONT, fontSize: narrow ? 9.5 : 11, lineHeight: 1.25, color: CREAM }}>{text}</span>
          </div>
        ) : null}
      </div>
    ));

  const stamp = (b: BasisDef) =>
    example.months.map((m) => {
      const hit = example.stamps[b.id] === m;
      const nodeId = `stamp-${b.id}`;
      return (
        <div key={`${b.id}-${m}`} className="flex justify-center" style={emph(nodeId)}>
          {hit ? (
            <div
              className="nodrag cursor-pointer rounded-xl px-3 py-1.5 text-center"
              style={{
                fontFamily: BIG_FONT, fontWeight: 800, fontSize: narrow ? 11 : 13, letterSpacing: "0.08em", color: CREAM,
                background: `linear-gradient(180deg, ${BASIS_C[b.id]}33, rgba(16,24,44,0.95))`,
                border: `2px solid ${hl.isLit(nodeId) ? EXHIBIT_GLOW.border : BASIS_C[b.id]}`,
                boxShadow: hl.isLit(nodeId) ? EXHIBIT_GLOW.shadow : `0 4px 14px -6px ${BASIS_C[b.id]}88`,
                transition: T,
              }}
              onClick={selectBasis(b.id)}
            >
              RECORD IT HERE
            </div>
          ) : (
            <div style={{ height: narrow ? 26 : 30 }} />
          )}
        </div>
      );
    });

  const basisLabel = (b: BasisDef) => (
    // marginRight keeps the CueTag's deliberate 6px overhang INSIDE the label
    // gutter — without it the tag nicks the first month column on camera.
    <div className="relative" style={{ ...emph(b.id), marginRight: 10 }}>
      <div
        className="nodrag cursor-pointer rounded-xl px-2.5 py-1.5"
        style={{
          border: `1.5px solid ${hl.isLit(b.id) ? EXHIBIT_GLOW.border : "transparent"}`,
          boxShadow: hl.isLit(b.id) ? EXHIBIT_GLOW.shadow : undefined,
          transition: T,
        }}
        onClick={selectBasis(b.id)}
      >
        {b.cue && <CueTag cueId={`basis-${b.id}`} level={b.cue} />}
        <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: narrow ? 13 : 18, letterSpacing: "0.04em", color: BASIS_C[b.id] }}>{b.label}</div>
        {!narrow && (
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 9.5, lineHeight: 1.25, color: NEON.muted, marginTop: 1 }}>{b.rule}</div>
        )}
      </div>
    </div>
  );

  return (
    <ExhibitShell id={id} decl={decl} posLock={d.posLock} selected={selected} width={w} minHeight={h}>
      {!film && (
        <div className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`} title="Drag to move" style={{ color: NEON.muted }}>
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <style>{`@keyframes sa-basis-pop { from { opacity: 0; } }`}</style>
      <div
        className="relative flex flex-col rounded-3xl"
        style={{ width: "100%", minHeight: h, background: "transparent", border: film ? "none" : "1.5px dashed rgba(252,163,17,0.22)", padding: narrow ? "14px 10px" : "18px 16px", gap: narrow ? 8 : 12 }}
        onClick={() => hl.clear()}
      >
        {/* EVENT STRIP — the shared month columns */}
        <div style={{ opacity: vis("pins") ? 1 : 0, transition: T }}>
          {row(
            <>
              <div />
              {example.months.map(monthCell)}
            </>,
          )}
          <div style={{ height: 8 }} />
          {row(
            <>
              <div style={{ fontFamily: DISPLAY_FONT, fontSize: narrow ? 8.5 : 10, fontWeight: 900, letterSpacing: "0.18em", color: NEON.muted, textAlign: "right" }}>THE EVENT</div>
              {pin("pin-action", "⚡", example.action.text, example.action.month)}
            </>,
          )}
          <div style={{ height: 6 }} />
          {row(
            <>
              <div />
              {pin("pin-cash", "💵", example.cash.text, example.cash.month)}
            </>,
          )}
        </div>

        {/* THE TWO LENSES — each stamps the month its own rule dictates */}
        <div style={{ display: "flex", flexDirection: "column", gap: narrow ? 8 : 12, marginTop: narrow ? 4 : 8 }}>
          {BASES.map((b) => (
            <div key={b.id} style={{ opacity: vis(b.id as BasisBand) ? 1 : 0, transition: T, pointerEvents: vis(b.id as BasisBand) ? undefined : "none" }}>
              {row(
                <>
                  {basisLabel(b)}
                  {stamp(b)}
                </>,
              )}
              {/* the recognition principle — only while this lens is spotlighted */}
              {primary === b.id && (
                <div className="mt-1.5 rounded-lg px-3 py-1.5" style={{ background: "rgba(9,13,26,0.95)", border: `1px solid ${BASIS_C[b.id]}88`, animation: "sa-basis-pop 160ms ease" }}>
                  <span style={{ fontFamily: DISPLAY_FONT, fontSize: narrow ? 10 : 11.5, lineHeight: 1.35, color: CREAM }}>{principleFor(b.id, example)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* THE PUNCHLINE — the thesis, last beat, callout treatment */}
        <div
          className="mx-auto mt-1 rounded-xl px-4 py-2 text-center"
          style={{
            opacity: vis("punchline") ? 1 : 0,
            transition: T,
            background: "linear-gradient(180deg, rgba(252,163,17,0.16), rgba(16,24,44,0.9))",
            border: `1.5px solid ${GOLD}`,
            boxShadow: "0 0 26px -8px rgba(252,163,17,0.6)",
            fontFamily: BIG_FONT, fontWeight: 800, fontSize: narrow ? 13 : 19, letterSpacing: "0.03em", color: CREAM,
          }}
        >
          {PUNCHLINE}
        </div>

        {/* DEPTH LAYER — the four timing gaps: why adjusting entries exist */}
        {!film && (
          <button
            className="nodrag mx-auto rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: depthOn ? "#0B1322" : NEON.muted, background: depthOn ? GOLD : "rgba(11,19,34,0.85)", border: `1px solid ${depthOn ? GOLD : NEON.borderSoft}` }}
            title="Toggle the timing-gap layer · on camera: D"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setExhibitDepth(!depthOn); }}
          >
            The four timing gaps
          </button>
        )}
        {depthOn && (
          <div className="mx-auto w-full" style={{ maxWidth: 760, animation: "sa-basis-pop 200ms ease" }}>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: narrow ? "1fr" : "1fr 1fr" }}>
              {TIMING_GAPS.map((g) => (
                <div key={g.id} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: "rgba(16,24,44,0.85)", border: "1px solid rgba(244,239,230,0.16)" }}>
                  <span style={{ fontFamily: DISPLAY_FONT, fontSize: 10.5, color: CREAM }}>{g.gap}</span>
                  <span style={{ color: NEON.muted, fontSize: 10 }}>→</span>
                  <span style={{ fontFamily: DISPLAY_FONT, fontSize: 10.5, fontWeight: 800, color: GOLD }}>{g.becomes}</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 text-center" style={{ fontFamily: DISPLAY_FONT, fontSize: 11, fontWeight: 800, color: CREAM }}>{GAPS_FOOTER}</div>
            <div className="relative mx-auto mt-1 max-w-[620px] text-center">
              <CueTag cueId="basis-aplus-note" level="aplus" />
              <span style={{ fontFamily: DISPLAY_FONT, fontSize: 9.5, lineHeight: 1.35, color: NEON.muted }}>{BASIS_APLUS_NOTE}</span>
            </div>
          </div>
        )}
      </div>
    </ExhibitShell>
  );
}
