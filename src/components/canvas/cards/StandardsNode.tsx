// "THE RULEBOOK & THE COPS" (standards) — standards & regulation as a
// relationship cheat sheet. The testable content is who-does-what, so the
// exhibit is a CHAIN with labeled arrows, not a list:
//
//     [ FASB ] ──writes──▶ [ GAAP ] ◀──enforces── [ SEC ]
//
// CRAM LAYER (default): the chain + role captions, all a cram viewer sees.
// Click a tile → it spotlights brightest, its arrows light, the rest mutes,
// and its two audited micro-lines reveal (WHAT / DOES) with the 【exam-answer
// phrase】 in the house highlight treatment. A+ LAYER (manual toggle, D on
// camera; never in the reveal sequence): GASB · IASB/IFRS mini-chain · PCAOB ·
// AICPA · FAF (spotlighting FAF draws its two connector arcs to FASB and
// GASB) · the SEC→FASB delegation line · the two WHY beats.
//
// REVEAL (film surfaces only): blank → GAAP → +FASB+arrow → +SEC+arrow →
// +captions, on Tab/Shift+Tab via the shared exhibit-modes reveal intake;
// ` resets to blank and closes the A+ layer. Content lives in
// standards-exhibit-config.ts (Bible law 8) — copy is accuracy-audited there.
import { useLayoutEffect, useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";

import { EXHIBIT_GLOW } from "../exhibit-highlights";
import { ExhibitShell, useExhibit, type ExhibitDeclaration } from "../exhibit-base";
import { setExhibitDepth, useExhibitReveal } from "../exhibit-modes";
import { CueTag } from "../exhibit-cues";
import {
  STANDARDS_APLUS, STANDARDS_CHAIN, STANDARDS_DELEGATION, STANDARDS_REVEAL_MAX, STANDARDS_WHY,
  splitHighlights, standardsBandVisible, standardsNodeIds, standardsTile, type StandardsBand, type StandardsTileDef,
} from "../standards-exhibit-config";
import { BIG_FONT, DISPLAY_FONT, NEON } from "../theme";
import { type StandardsElement } from "../types";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const T = "opacity 300ms ease, filter 300ms ease, box-shadow 200ms ease, border-color 200ms ease";

/** The house highlight treatment for the 【exam-answer phrase】 (Bible law 2). */
function Hl({ text }: { text: string }) {
  return (
    <>
      {splitHighlights(text).map((seg, i) =>
        seg.hl
          ? <span key={i} style={{ color: GOLD, fontWeight: 800, textShadow: "0 0 12px rgba(252,163,17,0.55)" }}>{seg.text}</span>
          : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

export function StandardsNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as StandardsElement;
  const w = d.w ?? 960;
  const h = d.h ?? 540;
  const stacked = w < 560; // mobile: vertical chain, arrows rotate, A+ below

  const decl: ExhibitDeclaration = { minWidth: 360, minHeight: 300, nodes: standardsNodeIds() };
  const ex = useExhibit(decl);
  const film = ex.film;
  const hl = ex.hl;
  const { revealTick, depthOn } = useExhibitReveal(STANDARDS_REVEAL_MAX);
  const vis = (band: StandardsBand): boolean => !film || standardsBandVisible(band, revealTick);

  // Single-select with relationship co-lighting. `primary` = the clicked tile
  // (renders brightest); it means nothing once the store is cleared.
  const [primarySel, setPrimarySel] = useState<string | null>(null);
  const primary = hl.any ? primarySel : null;
  const select = (tileId: string, colight: string[] = []) => (e: React.MouseEvent) => {
    if (e.altKey) return;
    e.stopPropagation();
    if (hl.isLit(tileId) && primary === tileId) { hl.clear(); return; }
    hl.clear();
    hl.cycle(tileId);
    colight.forEach((c) => hl.cycle(c));
    setPrimarySel(tileId);
  };

  const muted = (nodeId: string): boolean => hl.any && !hl.isLit(nodeId);
  const emphasis = (nodeId: string): React.CSSProperties => ({
    opacity: muted(nodeId) ? 0.3 : 1,
    filter: muted(nodeId) ? "saturate(0.45)" : undefined,
    transition: T,
  });

  // FAF CONNECTOR ARCS — measured from the live tile boxes only while FAF is
  // spotlighted; static SVG overlay, opacity-faded, pointer-events none.
  const boxRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const [arcs, setArcs] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (primary !== "faf" || !boxRef.current) { setArcs([]); return; }
    const root = boxRef.current.getBoundingClientRect();
    const centre = (tid: string) => {
      const r = tileRefs.current.get(tid)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2 - root.left, y: r.top + r.height / 2 - root.top } : null;
    };
    const faf = centre("faf");
    setArcs(["fasb", "gasb"].flatMap((tid) => {
      const to = centre(tid);
      if (!faf || !to) return [];
      const mx = (faf.x + to.x) / 2, my = Math.min(faf.y, to.y) - 36;
      return [`M ${faf.x} ${faf.y} Q ${mx} ${my} ${to.x} ${to.y}`];
    }));
  }, [primary, depthOn, stacked]);

  const setTileRef = (tid: string) => (el: HTMLDivElement | null) => {
    if (el) tileRefs.current.set(tid, el); else tileRefs.current.delete(tid);
  };

  // Micro-lines panel for whichever tile is spotlighted (WHAT / DOES).
  const micro = (t: StandardsTileDef) => (
    <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 rounded-lg px-3 py-2 text-left" style={{ width: 280, background: "rgba(9,13,26,0.96)", border: `1px solid ${GOLD}88`, animation: "sa-std-pop 160ms ease" }}>
      {([["WHAT", t.what], ["DOES", t.does]] as const).map(([k, line]) => (
        <div key={k} className="flex gap-2 py-0.5">
          <span style={{ fontFamily: DISPLAY_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: "0.18em", color: NEON.muted, paddingTop: 2 }}>{k}</span>
          <span style={{ fontFamily: DISPLAY_FONT, fontSize: 11.5, lineHeight: 1.35, color: CREAM }}><Hl text={line} /></span>
        </div>
      ))}
    </div>
  );

  const tile = (t: StandardsTileDef, big: boolean, band?: StandardsBand) => (
    <div key={t.id} className="relative flex flex-col items-center" style={{ opacity: band && !vis(band) ? 0 : 1, transition: T, pointerEvents: band && !vis(band) ? "none" : undefined }}>
      <div style={emphasis(t.id)}>
        <div
          ref={setTileRef(t.id)}
          className="nodrag relative cursor-pointer rounded-2xl text-center"
          style={{
            padding: big ? "18px 26px" : "8px 14px",
            fontFamily: BIG_FONT, fontWeight: 800, fontSize: big ? 30 : 15, letterSpacing: "0.02em", color: CREAM,
            background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
            border: `1.5px solid ${hl.isLit(t.id) ? EXHIBIT_GLOW.border : "rgba(244,239,230,0.28)"}`,
            boxShadow: hl.isLit(t.id) ? EXHIBIT_GLOW.shadow : "0 6px 16px -8px rgba(0,0,0,0.8)",
            transition: T,
          }}
          onClick={select(t.id, t.colight)}
        >
          {t.cue && <CueTag cueId={`std-${t.id}`} level={t.cue} />}
          {t.id === "iasb" ? (
            // the mirrored mini-chain — the visual rhyme IS the lesson
            <span className="flex items-center gap-1.5" style={{ fontSize: big ? 22 : 14 }}>
              IASB <span style={{ fontFamily: DISPLAY_FONT, fontSize: 9, color: NEON.muted, letterSpacing: "0.12em" }}>─writes→</span> IFRS
            </span>
          ) : t.label}
        </div>
        {t.caption && (
          <div className="mt-1.5 text-center" style={{ opacity: vis("captions") ? 1 : 0, transition: T, fontFamily: DISPLAY_FONT, fontSize: 10, fontWeight: 900, letterSpacing: "0.22em", color: NEON.muted }}>
            {t.caption}
          </div>
        )}
      </div>
      {primary === t.id && micro(t)}
    </div>
  );

  // Chain arrow: lit when either endpoint is lit; direction fixed by config
  // (head always points at GAAP). Rotates 90° when stacked.
  const arrow = (arrowId: "writes" | "enforces", band: StandardsBand, headAtStart: boolean) => {
    const ends = arrowId === "writes" ? ["fasb", "gaap"] : ["sec", "gaap"];
    const lit = ends.some((n) => hl.isLit(n));
    const dim = hl.any && !lit;
    const line = (
      <svg width={stacked ? 22 : 92} height={stacked ? 44 : 22} viewBox="0 0 92 22" preserveAspectRatio="none" style={{ overflow: "visible", transform: stacked ? "rotate(90deg)" : undefined }}>
        <defs>
          <marker id={`std-arr-${id}-${arrowId}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill={lit ? GOLD : "rgba(244,239,230,0.55)"} /></marker>
        </defs>
        <line x1={headAtStart ? 88 : 4} y1="11" x2={headAtStart ? 4 : 88} y2="11" stroke={lit ? GOLD : "rgba(244,239,230,0.55)"} strokeWidth={lit ? 3 : 2} markerEnd={`url(#std-arr-${id}-${arrowId})`} style={{ transition: "stroke 200ms ease", filter: lit ? "drop-shadow(0 0 6px rgba(252,163,17,0.8))" : undefined }} />
      </svg>
    );
    return (
      <div className="flex flex-col items-center justify-center" style={{ opacity: !vis(band) ? 0 : dim ? 0.3 : 1, transition: T, gap: 2, padding: stacked ? "2px 0" : "0 2px", marginTop: stacked ? 0 : -14 }}>
        {line}
        <span style={{ fontFamily: DISPLAY_FONT, fontSize: 10, fontStyle: "italic", color: lit ? GOLD : NEON.muted, transition: "color 200ms ease" }}>{arrowId}</span>
      </div>
    );
  };

  const whyLine = (row: { id: string; cue: "must" | "easy" | "aplus"; text: string }) => (
    <div key={row.id} className="relative mx-auto rounded-lg px-3 py-1" style={{ maxWidth: 640 }}>
      <CueTag cueId={`std-${row.id}`} level={row.cue} />
      <span style={{ fontFamily: DISPLAY_FONT, fontSize: 10.5, lineHeight: 1.4, color: NEON.muted }}><Hl text={row.text} /></span>
    </div>
  );

  return (
    <ExhibitShell id={id} kind="standards" decl={decl} posLock={d.posLock} selected={selected} width={w} minHeight={h}>
      {!film && (
        <div className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`} title="Drag to move" style={{ color: NEON.muted }}>
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <style>{`@keyframes sa-std-pop { from { opacity: 0; } }`}</style>
      <div
        ref={boxRef}
        className="relative flex flex-col rounded-3xl"
        style={{ width: "100%", minHeight: h, background: "transparent", border: film ? "none" : "1.5px dashed rgba(252,163,17,0.22)", padding: "16px 12px" }}
        onClick={() => hl.clear()}
      >
        {/* CRAM LAYER — the chain */}
        <div className={`flex flex-1 items-center justify-center ${stacked ? "flex-col" : "flex-row"}`} style={{ gap: stacked ? 2 : 4 }}>
          {tile(STANDARDS_CHAIN[0], true, "fasb")}
          {arrow("writes", "fasb", false)}
          {tile(STANDARDS_CHAIN[1], true, "gaap")}
          {arrow("enforces", "sec", true)}
          {tile(STANDARDS_CHAIN[2], true, "sec")}
        </div>

        {/* A+ LAYER — manual toggle only (D on camera) */}
        {!film && (
          <button
            className="nodrag mx-auto mt-3 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: depthOn ? "#0B1322" : NEON.muted, background: depthOn ? GOLD : "rgba(11,19,34,0.85)", border: `1px solid ${depthOn ? GOLD : NEON.borderSoft}` }}
            title="Toggle the A+ layer · on camera: D"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setExhibitDepth(!depthOn); }}
          >
            A+ layer
          </button>
        )}
        {depthOn && (
          <div className="mt-3 flex flex-col gap-2.5" style={{ animation: "sa-std-pop 200ms ease" }}>
            <div className={`flex flex-wrap items-start justify-center ${stacked ? "flex-col items-center" : ""}`} style={{ gap: 14, rowGap: 26 }}>
              {STANDARDS_APLUS.map((t) => tile(t, false))}
            </div>
            {/* SEC → FASB delegation — a line item, not a tile */}
            <div
              className="nodrag relative mx-auto cursor-pointer rounded-lg px-3 py-1 text-center"
              style={{ maxWidth: 640, border: `1px solid ${hl.isLit("delegation") ? EXHIBIT_GLOW.border : "transparent"}`, ...emphasis("delegation") }}
              onClick={select(STANDARDS_DELEGATION.id, STANDARDS_DELEGATION.colight)}
            >
              <CueTag cueId="std-delegation" level={STANDARDS_DELEGATION.cue} />
              <span style={{ fontFamily: DISPLAY_FONT, fontSize: 11, color: CREAM }}>{STANDARDS_DELEGATION.text}</span>
            </div>
            {/* WHY THIS EXISTS — two cause→effect beats, not a timeline */}
            <div className="flex flex-col items-center gap-0.5">{STANDARDS_WHY.map(whyLine)}</div>
          </div>
        )}

        {/* FAF's connector arcs — drawn only while FAF is spotlighted */}
        {arcs.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ overflow: "visible", zIndex: 25, animation: "sa-std-pop 200ms ease" }}>
            {arcs.map((p, i) => <path key={i} d={p} fill="none" stroke={GOLD} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgba(252,163,17,0.7))" }} />)}
          </svg>
        )}
      </div>
    </ExhibitShell>
  );
}
