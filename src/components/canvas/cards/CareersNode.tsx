// "WHO DO YOU WORK FOR?" (careers) — accounting careers as a BRANCH MAP, the
// first outing of that interaction family. Three trunks, left to right, each
// answering WHO YOU WORK FOR in one anchor line; the leaves under them answer
// WHAT KIND OF WORK YOU DO, one line each, on click:
//
//     [ PUBLIC ]        [ PRIVATE / CORPORATE ]        [ GOVERNMENT & NONPROFIT ]
//
// SPOTLIGHT SEMANTICS (shared exhibit-highlight store, single-select):
//   · click a TRUNK → its whole branch illuminates, the other branches and the
//     doors strip mute;
//   · click a LEAF → the leaf renders brightest and its one-line description
//     reveals; Internal Audit additionally CROSSLIGHTS Audit under PUBLIC and
//     prints the external-vs-internal contrast (the most-tested trap here);
//   · click empty space / the lit element again / ` → clear.
//
// THE DOORS STRIP is deliberately outside every trunk: consulting, corporate
// finance, entrepreneurship and investing (VC/PE) are doors accounting OPENS,
// not branches of accounting practice. Dashed, muted, segregated — adjacency,
// never membership. careersTrunkOf() returns undefined for them, so a trunk
// spotlight mutes them like any other non-member.
//
// PROGRESSIVE REVEAL (film surfaces only — authoring + student always render
// full): trunks → PUBLIC leaves → PRIVATE leaves → GOV/NP → doors strip → CPA
// badge + Big Four caption, stepped by Tab/Shift+Tab via the shared
// exhibit-modes reveal intake; ` resets to tick 0 and closes the depth layer.
// PUBLIC vs PRIVATE day-to-day is the depth layer (D on camera) — a manual
// toggle, never part of the sequence.
//
// All content lives in careers-exhibit-config.ts (Bible law 8). Emphasis is
// opacity/filter/border/shadow only — nothing moves, nothing resizes (A3 law).
import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";

import { EXHIBIT_GLOW } from "../exhibit-highlights";
import { ExhibitShell, useExhibit, type ExhibitDeclaration } from "../exhibit-base";
import { setExhibitDepth, useExhibitReveal } from "../exhibit-modes";
import { CueTag } from "../exhibit-cues";
import { splitHighlights } from "../standards-exhibit-config";
import {
  CAREERS_CONTRAST, CAREERS_CPA, CAREERS_DOORS, CAREERS_DOORS_LABEL, CAREERS_DOORS_NOTE,
  CAREERS_REVEAL_MAX, CAREERS_TRUNKS, careersBandVisible, careersBranchIds, careersLeaf,
  careersLeafBand, careersNodeIds, careersTrunkOf,
  type CareerLeafDef, type CareersBand, type CareersTrunkDef, type CareersTrunkId,
} from "../careers-exhibit-config";
import { BIG_FONT, DISPLAY_FONT, NEON } from "../theme";
import { type CareersElement } from "../types";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const TRUNK_ACCENT: Record<CareersTrunkId, string> = { public: "#FCA311", private: "#60A5FA", govnp: "#3BF5A0" };
const T = "opacity 300ms ease, filter 300ms ease, box-shadow 200ms ease, border-color 200ms ease";

const pairId = (id: string, cell: "pub" | "priv") => `diff-${id}-${cell}`;

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

export function CareersNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CareersElement;
  const w = d.w ?? 1000;
  const h = d.h ?? 600;
  const stacked = w < 620; // mobile degradation: trunks stack vertically

  const decl: ExhibitDeclaration = {
    minWidth: 360,
    minHeight: 340,
    nodes: [...careersNodeIds(), ...CAREERS_CONTRAST.flatMap((p) => [pairId(p.id, "pub"), pairId(p.id, "priv")])],
  };
  const ex = useExhibit(decl);
  const film = ex.film;
  const hl = ex.hl;
  const { revealTick, depthOn } = useExhibitReveal(CAREERS_REVEAL_MAX);

  // Film renders the authored sequence; every other surface is always full.
  const vis = (band: CareersBand): boolean => !film || careersBandVisible(band, revealTick);

  // ---- selection (single-select over the shared store, so ` clears it) ----
  // `primary` = the clicked element; it renders brightest. Co-lit nodes (a
  // whole branch, or the Audit crosslight) are lit but not primary.
  const [primarySel, setPrimarySel] = useState<string | null>(null);
  const primary = hl.any ? primarySel : null;
  const openLeaf = primary ? careersLeaf(primary) : undefined;

  const light = (ids: string[], head: string) => {
    hl.clear();
    ids.forEach((n) => hl.cycle(n)); // cycle on a cleared store = normal → lit
    setPrimarySel(head);
  };
  const selectTrunk = (t: CareersTrunkId) => (e: React.MouseEvent) => {
    if (e.altKey) return;
    e.stopPropagation();
    if (primary === t) { hl.clear(); return; }
    light(careersBranchIds(t), t);
  };
  const selectLeaf = (l: CareerLeafDef) => (e: React.MouseEvent) => {
    if (e.altKey) return;
    e.stopPropagation();
    if (primary === l.id) { hl.clear(); return; }
    light([l.id, ...(l.colight ?? [])], l.id);
  };
  const selectPair = (id: string) => (e: React.MouseEvent) => {
    if (e.altKey) return;
    e.stopPropagation();
    if (primary === id) { hl.clear(); return; }
    light([pairId(id, "pub"), pairId(id, "priv")], id);
  };

  /** Everything unlit recedes while anything is lit. Opacity/filter only —
   *  position and size never change (A3 law; a test pins this). */
  const muted = (nodeId: string): boolean => hl.any && !hl.isLit(nodeId);
  const emphasis = (nodeId: string): React.CSSProperties => ({
    opacity: muted(nodeId) ? 0.3 : 1,
    filter: muted(nodeId) ? "saturate(0.45)" : undefined,
    transition: T,
  });
  /** Emphasis for an element that ALSO belongs to a reveal band: hidden wins
   *  over muted, so a spotlight can never resurrect an unrevealed element. */
  const emphasisIn = (band: CareersBand, nodeId: string): React.CSSProperties => ({
    ...emphasis(nodeId),
    ...(vis(band) ? {} : { opacity: 0, pointerEvents: "none" as const }),
  });
  /** The full glow belongs to the clicked element only; co-lit nodes keep their
   *  own accent so a crosslight reads as "related", not "also clicked".
   *  Shorthand `border`, never `borderColor` — mixing the two warns in React. */
  const ring = (nodeId: string, accent: string): React.CSSProperties =>
    primary === nodeId
      ? { border: `1.5px solid ${EXHIBIT_GLOW.border}`, boxShadow: EXHIBIT_GLOW.shadow }
      : hl.isLit(nodeId)
        ? { border: `1.5px solid ${accent}`, boxShadow: `0 0 14px ${accent}55` }
        : {};

  // ---- leaves ------------------------------------------------------------
  const leaf = (l: CareerLeafDef, accent: string) => (
    <div key={l.id} className="relative w-full" style={emphasis(l.id)}>
      <div
        className="nodrag relative cursor-pointer rounded-2xl px-3 py-1.5 text-center font-semibold"
        style={{
          fontFamily: DISPLAY_FONT, fontSize: 12.5, lineHeight: 1.15, color: CREAM,
          background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
          border: "1.5px solid rgba(244,239,230,0.25)",
          boxShadow: "0 4px 12px -6px rgba(0,0,0,0.7)",
          transition: T,
          ...ring(l.id, accent),
        }}
        onClick={selectLeaf(l)}
      >
        {l.cue && <CueTag cueId={`careers-${l.id}`} level={l.cue} />}
        {l.label}
      </div>
      {/* the one-line description — revealed only while this leaf is primary */}
      {openLeaf?.id === l.id && (
        <div
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-center"
          style={{ width: 250, background: "rgba(9,13,26,0.96)", border: `1px solid ${accent}99`, animation: "sa-careers-pop 160ms ease" }}
        >
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 11.5, lineHeight: 1.35, color: CREAM }}><Hl text={l.desc} /></div>
          {l.contrast && (
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 9.5, lineHeight: 1.35, color: NEON.muted, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${accent}44` }}>
              {l.contrast}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- one trunk column --------------------------------------------------
  const trunkCol = (t: CareersTrunkDef) => {
    const accent = TRUNK_ACCENT[t.id];
    const leavesVis = vis(careersLeafBand(t.id));
    return (
      <div key={t.id} className="flex min-w-0 flex-1 flex-col items-center gap-2.5" style={{ padding: "6px 6px" }}>
        {/* the trunk head — name + the WHO anchor */}
        <div
          className="nodrag relative w-full cursor-pointer rounded-2xl px-3 py-2 text-center"
          style={{
            background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
            border: `1.5px solid ${accent}88`,
            boxShadow: "0 6px 16px -8px rgba(0,0,0,0.8), 0 0 0 3px rgba(9,13,26,0.9)",
            ...emphasisIn("trunks", t.id), ...ring(t.id, accent),
          }}
          onClick={selectTrunk(t.id)}
        >
          {t.cue && <CueTag cueId={`careers-${t.id}`} level={t.cue} />}
          <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 20, letterSpacing: "0.03em", color: CREAM, textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>{t.label}</div>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 10.5, lineHeight: 1.3, color: NEON.muted, marginTop: 2 }}><Hl text={t.anchor} /></div>
        </div>

        {/* the CPA badge — pinned to the PUBLIC trunk, contextual, one line */}
        {t.id === "public" && (
          <div
            className="relative w-full rounded-xl px-2.5 py-1.5 text-center"
            style={{
              background: "rgba(9,13,26,0.55)", border: `1px dashed ${GOLD}66`,
              fontFamily: DISPLAY_FONT, fontSize: 10, lineHeight: 1.35, color: NEON.muted,
              ...emphasisIn("extras", CAREERS_CPA.id),
            }}
          >
            <CueTag cueId={`careers-${CAREERS_CPA.id}`} level={CAREERS_CPA.cue} />
            <Hl text={CAREERS_CPA.text} />
          </div>
        )}

        {/* the leaves — WHAT kind of work you do */}
        <div
          className="flex w-full flex-1 flex-col items-center gap-2"
          style={{ opacity: leavesVis ? 1 : 0, transition: T, pointerEvents: leavesVis ? undefined : "none" }}
        >
          {t.leaves.map((l) => leaf(l, accent))}
        </div>

        {/* the muted caption row under the trunk (the Big Four) */}
        {t.caption && (
          <div
            className="relative w-full text-center"
            style={{
              fontFamily: DISPLAY_FONT, fontSize: 10, color: NEON.muted, paddingTop: 2,
              ...emphasisIn("extras", t.caption.id),
            }}
          >
            {t.caption.cue && <CueTag cueId={`careers-${t.caption.id}`} level={t.caption.cue} />}
            {t.caption.text}
          </div>
        )}
      </div>
    );
  };

  // ---- the depth layer: public vs private, day to day --------------------
  const contrastCell = (id: string, cell: "pub" | "priv", text: string, accent: string) => {
    const nid = pairId(id, cell);
    return (
      <div
        className="nodrag cursor-pointer rounded-xl px-3 py-1.5 text-center"
        style={{
          fontFamily: DISPLAY_FONT, fontSize: 11.5, color: CREAM, lineHeight: 1.2,
          background: "rgba(16,24,44,0.85)",
          border: `1px solid ${hl.isLit(nid) ? EXHIBIT_GLOW.border : `${accent}44`}`,
          boxShadow: hl.isLit(nid) ? EXHIBIT_GLOW.shadow : undefined,
          ...emphasis(nid),
        }}
        onClick={selectPair(id)}
      >
        {text}
      </div>
    );
  };

  return (
    <ExhibitShell id={id} decl={decl} posLock={d.posLock} selected={selected} width={w} minHeight={h}>
      {!film && (
        <div className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`} title="Drag to move" style={{ color: NEON.muted }}>
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <style>{`@keyframes sa-careers-pop { from { opacity: 0; } }`}</style>
      <div
        className="relative flex flex-col rounded-3xl"
        style={{ width: "100%", minHeight: h, background: "transparent", border: film ? "none" : "1.5px dashed rgba(252,163,17,0.22)", padding: "10px 10px" }}
        onClick={() => hl.clear()}
      >
        {/* the banner — the two questions, said once, quietly */}
        <div
          className="text-center"
          style={{
            opacity: vis("trunks") ? 1 : 0, transition: T,
            fontFamily: DISPLAY_FONT, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.26em",
            textTransform: "uppercase", color: NEON.muted, paddingBottom: 8,
          }}
        >
          Who do you work for · What do you do
        </div>

        {/* the three trunks */}
        <div className={`flex flex-1 ${stacked ? "flex-col" : "flex-row"} items-stretch`}>
          {CAREERS_TRUNKS.map(trunkCol)}
        </div>

        {/* DOORS IT OPENS — segregated strip, NOT part of the tree */}
        <div
          className="mt-3 rounded-2xl px-3 py-2"
          style={{
            opacity: vis("doors") ? undefined : 0, pointerEvents: vis("doors") ? undefined : "none",
            border: "1px dashed rgba(244,239,230,0.3)", background: "rgba(9,13,26,0.35)", transition: T,
          }}
        >
          <div className="text-center" style={{ fontFamily: DISPLAY_FONT, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: NEON.muted }}>
            {CAREERS_DOORS_LABEL} <span style={{ fontWeight: 500, letterSpacing: "0.06em", textTransform: "none" }}>— {CAREERS_DOORS_NOTE}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            {CAREERS_DOORS.map((dr) => (
              <div
                key={dr.id}
                className="rounded-full px-2.5 py-1"
                style={{
                  fontFamily: DISPLAY_FONT, fontSize: 10.5, color: NEON.muted,
                  border: "1px dashed rgba(244,239,230,0.28)", background: "rgba(16,24,44,0.55)",
                  ...emphasis(dr.id),
                }}
              >
                {dr.label}
              </div>
            ))}
          </div>
        </div>

        {/* PUBLIC vs PRIVATE, day to day — depth layer, OFF by default */}
        {!film && (
          <button
            className="nodrag mx-auto mt-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: depthOn ? "#0B1322" : NEON.muted, background: depthOn ? GOLD : "rgba(11,19,34,0.85)", border: `1px solid ${depthOn ? GOLD : NEON.borderSoft}` }}
            title="Toggle the depth layer · on camera: D"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setExhibitDepth(!depthOn); }}
          >
            Day to day
          </button>
        )}
        {depthOn && (
          <div className="mx-auto mt-2 w-full" style={{ maxWidth: 760, animation: "sa-careers-pop 200ms ease" }}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5" style={{ padding: "0 8px" }}>
              {CAREERS_CONTRAST.map((p) => (
                <div key={p.id} className="contents">
                  {contrastCell(p.id, "pub", p.pub, TRUNK_ACCENT.public)}
                  {contrastCell(p.id, "priv", p.priv, TRUNK_ACCENT.private)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ExhibitShell>
  );
}
