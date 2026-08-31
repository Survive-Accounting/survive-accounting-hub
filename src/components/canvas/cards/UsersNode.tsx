// "WHO'S IT FOR?" (users) — internal/external users + financial/managerial
// accounting as ONE mirrored exhibit. Two symmetric columns separated by the
// WALL — inside vs outside the building IS the mental model, said silently.
//
// SPOTLIGHT SEMANTICS (shared exhibit-highlight store, single-select):
//   · click any element on a side → the whole side illuminates, the other
//     side mutes, the clicked element renders brightest;
//   · a USER CHIP additionally reveals its one-line want (config-driven);
//   · a DIFFERENCES cell lights its opposing pair, everything else mutes;
//   · click again / click empty space / ` → clear.
//
// PROGRESSIVE REVEAL (film surfaces only — authoring + student always render
// full): tick 0 wall+headers → +chips → +serves/plates → +mnemonics, stepped
// by Tab/Shift+Tab via the shared exhibit-modes reveal intake; ` resets to
// tick 0 and closes the depth layer. The HOW THEY DIFFER strip is a manual
// toggle (D on film, a quiet button elsewhere) — never part of the sequence.
//
// All content lives in users-exhibit-config.ts (Bible law 8). Emphasis is
// opacity/border/shadow only — nothing moves, nothing resizes (A3 law).
import { type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";

import { EXHIBIT_GLOW } from "../exhibit-highlights";
import { ExhibitShell, useExhibit, type ExhibitDeclaration } from "../exhibit-base";
import { setExhibitDepth, useExhibitReveal } from "../exhibit-modes";
import { CueTag } from "../exhibit-cues";
import {
  USERS_DIFFERENCES, USERS_REVEAL_MAX, USERS_SIDES, usersBandVisible, usersNodeIds, usersSideOf,
  type UserChipDef, type UsersSideDef,
} from "../users-exhibit-config";
import { BIG_FONT, DISPLAY_FONT, NEON } from "../theme";
import { type UsersElement } from "../types";

const CREAM = "#F4EFE6";
const SIDE_ACCENT = { inside: "#FCA311", outside: "#60A5FA" } as const;
const T = "opacity 300ms ease, filter 300ms ease, box-shadow 200ms ease, border-color 200ms ease";

const diffId = (pairId: string, cell: "m" | "f") => `diff-${pairId}-${cell}`;

export function UsersNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as UsersElement;
  const w = d.w ?? 960;
  const h = d.h ?? 560;
  const stacked = w < 560; // mobile degradation: columns stack, wall goes horizontal

  const decl: ExhibitDeclaration = {
    minWidth: 360,
    minHeight: 320,
    nodes: [...usersNodeIds(), ...USERS_DIFFERENCES.flatMap((p) => [diffId(p.id, "m"), diffId(p.id, "f")])],
  };
  const ex = useExhibit(decl);
  const film = ex.film;
  const hl = ex.hl;
  const { revealTick, depthOn } = useExhibitReveal(USERS_REVEAL_MAX);

  // Film renders the authored sequence; every other surface is always full.
  const vis = (band: "wall" | "chips" | "plates" | "mnemonics"): boolean => !film || usersBandVisible(band, revealTick);

  // ---- selection (single-select over the shared store, so ` clears it) ----
  const litIds = [...hl.lit];
  const pairMode = litIds.some((x) => x.startsWith("diff-"));
  const activeSide = !pairMode && litIds.length > 0 ? usersSideOf(litIds[0]) : undefined;
  const brightest = litIds.length === 1 ? litIds[0] : undefined;

  const select = (nodeId: string) => (e: React.MouseEvent) => {
    if (e.altKey) return;
    e.stopPropagation();
    if (hl.isLit(nodeId)) { hl.clear(); return; }
    hl.clear();
    hl.cycle(nodeId); // normal → lit on a cleared store
  };
  const selectPair = (pairId: string) => (e: React.MouseEvent) => {
    if (e.altKey) return;
    e.stopPropagation();
    const m = diffId(pairId, "m"), f = diffId(pairId, "f");
    if (hl.isLit(m)) { hl.clear(); return; }
    hl.clear();
    hl.cycle(m);
    hl.cycle(f);
  };

  /** Emphasis for a side-column element: full on the active side, muted on the
   *  other; the clicked element carries the glow. Position never changes. */
  const emphasis = (nodeId: string): React.CSSProperties => {
    const muted = (pairMode && !nodeId.startsWith("diff-"))
      || (!!activeSide && usersSideOf(nodeId) !== activeSide)
      || (nodeId.startsWith("diff-") && pairMode && !hl.isLit(nodeId));
    return {
      opacity: muted ? 0.32 : 1,
      filter: muted ? "saturate(0.45)" : undefined,
      transition: T,
    };
  };
  // Shorthand `border`, never `borderColor` — the base styles set the border
  // shorthand, and React warns when the two mix across rerenders.
  const glow = (nodeId: string): React.CSSProperties =>
    hl.isLit(nodeId) && (brightest === nodeId || nodeId.startsWith("diff-"))
      ? { border: `1.5px solid ${EXHIBIT_GLOW.border}`, boxShadow: EXHIBIT_GLOW.shadow }
      : {};

  // ---- the wall ----------------------------------------------------------
  const wall = (
    <div
      aria-hidden
      style={{
        opacity: vis("wall") ? 1 : 0,
        transition: T,
        ...(stacked
          ? { height: 8, width: "82%", margin: "14px auto" }
          : { width: 8, alignSelf: "stretch", margin: "0 4px" }),
        borderRadius: 4,
        background: "repeating-linear-gradient(" + (stacked ? "90deg" : "180deg") + ", rgba(244,239,230,0.28) 0 18px, rgba(244,239,230,0.10) 18px 22px)",
        boxShadow: "0 0 14px rgba(0,0,0,0.5)",
      }}
    />
  );

  const sideCol = (s: UsersSideDef) => {
    const accent = SIDE_ACCENT[s.side];
    const hdrId = `hdr-${s.side}`;
    return (
      <div key={s.side} className="flex min-w-0 flex-1 flex-col items-center gap-3" style={{ padding: "8px 6px" }}>
        {/* header — part of the wall band */}
        <div className="relative text-center" style={{ opacity: vis("wall") ? 1 : 0, transition: T }}>
          <div
            className="nodrag relative cursor-pointer rounded-xl px-4 py-1.5"
            style={{ border: "1.5px solid rgba(244,239,230,0.0)", ...emphasis(hdrId), ...glow(hdrId) }}
            onClick={select(hdrId)}
          >
            {s.headerCue && <CueTag cueId={`users-${hdrId}`} level={s.headerCue} />}
            <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 26, letterSpacing: "0.04em", color: CREAM, textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>{s.header}</div>
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 11, color: NEON.muted, marginTop: -2 }}>{s.sub}</div>
          </div>
        </div>

        {/* user chips — same band height both sides so the symmetry holds */}
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-2" style={{ opacity: vis("chips") ? 1 : 0, transition: T, pointerEvents: vis("chips") ? undefined : "none" }}>
          {s.chips.map((c) => chip(c, accent))}
        </div>

        {/* serves connector + branch plate */}
        <div className="flex flex-col items-center gap-1.5" style={{ opacity: vis("plates") ? 1 : 0, transition: T, pointerEvents: vis("plates") ? undefined : "none" }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontSize: 10.5, letterSpacing: "0.24em", color: NEON.muted, textTransform: "uppercase" }}>↓ serves ↓</div>
          <div
            className="nodrag relative cursor-pointer rounded-2xl px-6 py-2.5 text-center"
            style={{
              whiteSpace: "pre-line", lineHeight: 1.12, fontFamily: BIG_FONT, fontWeight: 800, fontSize: 19, letterSpacing: "0.02em", color: CREAM,
              background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
              border: `1.5px solid ${accent}88`,
              boxShadow: "0 6px 16px -8px rgba(0,0,0,0.8), 0 0 0 3px rgba(9,13,26,0.9)",
              ...emphasis(s.plate.id), ...glow(s.plate.id),
            }}
            onClick={select(s.plate.id)}
          >
            {s.plate.cue && <CueTag cueId={`users-${s.plate.id}`} level={s.plate.cue} />}
            {s.plate.name}
          </div>
          {/* mnemonic — small, muted, permanent (the memory hook) */}
          <div style={{ opacity: vis("mnemonics") ? 1 : 0, transition: T, fontFamily: DISPLAY_FONT, fontSize: 11.5, fontStyle: "italic", color: accent, ...emphasis(s.plate.id) }}>
            {s.plate.mnemonic}
          </div>
        </div>
      </div>
    );
  };

  const chip = (c: UserChipDef, accent: string) => {
    const wanted = hl.isLit(c.id);
    return (
      <div key={c.id} className="relative" style={emphasis(c.id)}>
        <div
          className="nodrag cursor-pointer rounded-2xl px-3 py-1.5 text-center font-semibold"
          style={{
            minWidth: 150, maxWidth: 230, fontFamily: DISPLAY_FONT, fontSize: 13, lineHeight: 1.15, color: CREAM,
            background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
            border: `1.5px solid ${wanted ? EXHIBIT_GLOW.border : "rgba(244,239,230,0.25)"}`,
            boxShadow: wanted ? EXHIBIT_GLOW.shadow : "0 4px 12px -6px rgba(0,0,0,0.7)",
            transition: T,
          }}
          onClick={select(c.id)}
        >
          {c.cue && <CueTag cueId={`users-${c.id}`} level={c.cue} />}
          {c.label}
        </div>
        {/* the want — one line, revealed only while this chip is selected */}
        {wanted && (
          <div
            className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 rounded-lg px-2.5 py-1 text-center"
            style={{ minWidth: 170, maxWidth: 250, background: "rgba(9,13,26,0.95)", border: `1px solid ${accent}99`, animation: "sa-users-pop 160ms ease" }}
          >
            <div style={{ fontFamily: DISPLAY_FONT, fontSize: 11.5, fontStyle: "italic", color: CREAM }}>“{usersWant(c)}”</div>
            {c.wantExtra && <div style={{ fontFamily: DISPLAY_FONT, fontSize: 9.5, color: NEON.muted, marginTop: 2, lineHeight: 1.3 }}>{c.wantExtra}</div>}
          </div>
        )}
      </div>
    );
  };

  const diffCell = (pairId: string, cell: "m" | "f", text: string, accent: string) => {
    const nid = diffId(pairId, cell);
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
        onClick={selectPair(pairId)}
      >
        {text}
      </div>
    );
  };

  return (
    <ExhibitShell id={id} kind="users" decl={decl} posLock={d.posLock} selected={selected} width={w} minHeight={h}>
      {!film && (
        <div className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`} title="Drag to move" style={{ color: NEON.muted }}>
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <style>{`@keyframes sa-users-pop { from { opacity: 0; } }`}</style>
      <div
        className="relative flex flex-col rounded-3xl"
        style={{ width: "100%", minHeight: h, background: "transparent", border: film ? "none" : "1.5px dashed rgba(252,163,17,0.22)", padding: "10px 8px" }}
        onClick={() => hl.clear()}
      >
        {/* the two mirrored sides + the wall */}
        <div className={`flex flex-1 ${stacked ? "flex-col" : "flex-row"}`}>
          {sideCol(USERS_SIDES[0])}
          {wall}
          {sideCol(USERS_SIDES[1])}
        </div>

        {/* HOW THEY DIFFER — depth layer, OFF by default, manual toggle only */}
        {!film && (
          <button
            className="nodrag mx-auto mt-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: depthOn ? "#0B1322" : NEON.muted, background: depthOn ? "#FCA311" : "rgba(11,19,34,0.85)", border: `1px solid ${depthOn ? "#FCA311" : NEON.borderSoft}` }}
            title="Toggle the depth layer · on camera: D"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setExhibitDepth(!depthOn); }}
          >
            How they differ
          </button>
        )}
        {depthOn && (
          <div className="mx-auto mt-2 w-full" style={{ maxWidth: 760, animation: "sa-users-pop 200ms ease" }}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5" style={{ padding: "0 8px" }}>
              {USERS_DIFFERENCES.map((p) => (
                <div key={p.id} className="contents">
                  {diffCell(p.id, "m", p.managerial, SIDE_ACCENT.inside)}
                  {diffCell(p.id, "f", p.financial, SIDE_ACCENT.outside)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ExhibitShell>
  );
}

/** The want line (kept out of JSX so tests can pin one-line-ness cheaply). */
function usersWant(c: UserChipDef): string { return c.want; }
