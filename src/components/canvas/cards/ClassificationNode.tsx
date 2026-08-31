// "THE 5 TYPES OF ACCOUNTS" (classification) — the CLASSIFIER family. Five
// tiles carrying Lee's one-word anchors, the balance sheet left of the divider
// and the income statement right — the same geography as the Rubric board, so
// the two exhibits rhyme:
//
//     ASSETS   LIABILITIES   EQUITY  ‖  REVENUES   EXPENSES
//      OWN         OWE        VALUE  ‖    EARN       COST
//
// SPOTLIGHT SEMANTICS (shared exhibit-highlight store, single-select):
//   · click a TILE → the tile and its example chips light, everything else mutes;
//   · click an ACCOUNT CHIP → its category tile lights with it and the chip's
//     why-line reads out;
//   · click a TRAP CHIP → its TRUE category tile lights and the trap line reads
//     out with the destination (this is the teaching moment — Unearned Revenue
//     is the one to click on camera);
//   · click empty space / the lit element again / ` → clear.
//
// THE READOUT is one fixed strip under the tiles rather than a popover per chip.
// With five columns a floating panel would spill outside the card at the edges,
// and a strip gives every answer ONE place to appear on camera. Its height is
// reserved whether or not anything is selected, so nothing on the card ever
// moves (A3 law).
//
// PROGRESSIVE REVEAL (film surfaces only — authoring + student render full):
// tiles → anchors → example chips → traps band, stepped by Tab/Shift+Tab;
// ` resets and closes the depth layer. CURRENT / LONG-TERM is the depth layer
// (D on camera): a manual toggle, never a reveal step, and it regroups the FULL
// registry for ASSETS and LIABILITIES only — intangibles surface there and
// nowhere else.
//
// Account data lives in account-registry.ts (SHARED — Equation Effects and
// journal-entry teaching consume it next); exhibit-specific content lives in
// classification-exhibit-config.ts. No account copy is written in this file.
import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";

import { EXHIBIT_GLOW } from "../exhibit-highlights";
import { ExhibitShell, useExhibit, type ExhibitDeclaration } from "../exhibit-base";
import { setExhibitDepth, useExhibitReveal } from "../exhibit-modes";
import { CueTag } from "../exhibit-cues";
import { account, type AccountCategory, type AccountDef } from "../account-registry";
import {
  CLASS_REVEAL_MAX, CLASS_TERM_LABELS, CLASS_TERM_TILES, CLASS_TILES, CLASS_TRAPS,
  acctNodeId, classBandVisible, classNodeIds, classTile, termGroups, trapDestination, trapNote, trapTag,
  type ClassBand, type ClassTileDef, type TrapChipDef,
} from "../classification-exhibit-config";
import { BIG_FONT, DISPLAY_FONT, NEON } from "../theme";
import { type ClassificationElement } from "../types";

const CREAM = "#F4EFE6";
const GOLD = "#FCA311";
const TILE_ACCENT: Record<AccountCategory, string> = {
  asset: "#FCA311",
  liability: "#F87171",
  equity: "#A78BFA",
  revenue: "#3BF5A0",
  expense: "#60A5FA",
};
const T = "opacity 300ms ease, filter 300ms ease, box-shadow 200ms ease, border-color 200ms ease";

export function ClassificationNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ClassificationElement;
  const w = d.w ?? 1100;
  const h = d.h ?? 620;
  const stacked = w < 700; // mobile: A/L/E stack, then the divider, then R/E

  const decl: ExhibitDeclaration = { minWidth: 380, minHeight: 360, nodes: classNodeIds() };
  const ex = useExhibit(decl);
  const film = ex.film;
  const hl = ex.hl;
  const { revealTick, depthOn } = useExhibitReveal(CLASS_REVEAL_MAX);
  const vis = (band: ClassBand): boolean => !film || classBandVisible(band, revealTick);

  // ---- selection: single-select, the clicked node is `primary` ------------
  const [primarySel, setPrimarySel] = useState<string | null>(null);
  const primary = hl.any ? primarySel : null;

  const light = (ids: string[], head: string) => {
    hl.clear();
    ids.forEach((n) => hl.cycle(n)); // cycle on a cleared store = normal → lit
    setPrimarySel(head);
  };
  const guard = (e: React.MouseEvent): boolean => {
    if (e.altKey) return true;
    e.stopPropagation();
    return false;
  };
  /** A tile lights with every chip it is currently showing. */
  const selectTile = (t: ClassTileDef) => (e: React.MouseEvent) => {
    if (guard(e)) return;
    if (primary === t.id) { hl.clear(); return; }
    light([t.id, ...chipsFor(t).map((a) => acctNodeId(a.id))], t.id);
  };
  const selectAccount = (a: AccountDef) => (e: React.MouseEvent) => {
    if (guard(e)) return;
    const nid = acctNodeId(a.id);
    if (primary === nid) { hl.clear(); return; }
    light([nid, a.category], nid); // the chip AND its category tile
  };
  const selectTrap = (t: TrapChipDef) => (e: React.MouseEvent) => {
    if (guard(e)) return;
    if (primary === t.id) { hl.clear(); return; }
    light([t.id, trapCategoryOf(t)], t.id); // the chip AND its TRUE tile
  };

  const muted = (nodeId: string): boolean => hl.any && !hl.isLit(nodeId);
  const emphasis = (nodeId: string): React.CSSProperties => ({
    opacity: muted(nodeId) ? 0.3 : 1,
    filter: muted(nodeId) ? "saturate(0.45)" : undefined,
    transition: T,
  });
  /** Hidden (unrevealed) always beats muted, so a spotlight can never resurrect
   *  something the reveal has not reached yet. */
  const emphasisIn = (band: ClassBand, nodeId: string): React.CSSProperties => ({
    ...emphasis(nodeId),
    ...(vis(band) ? {} : { opacity: 0, pointerEvents: "none" as const }),
  });
  /** Full bloom for the clicked node; a soft accent halo for co-lit relations.
   *  Shorthand `border` only — mixing it with borderColor warns in React. */
  const ring = (nodeId: string, accent: string): React.CSSProperties =>
    primary === nodeId
      ? { border: `1.5px solid ${EXHIBIT_GLOW.border}`, boxShadow: EXHIBIT_GLOW.shadow }
      : hl.isLit(nodeId)
        ? { border: `1.5px solid ${accent}`, boxShadow: `0 0 14px ${accent}55` }
        : {};

  // ---- what each tile is showing right now -------------------------------
  /** Cram set by default; the depth layer swaps A and L to the full registry. */
  const chipsFor = (t: ClassTileDef): AccountDef[] =>
    depthOn && CLASS_TERM_TILES.includes(t.id)
      ? termGroups(t.id).flatMap((g) => g.accounts)
      : t.cram.map((cid) => account(cid)!).filter(Boolean);

  // ---- the readout -------------------------------------------------------
  const readout = (): { title: string; dest?: string; line: string } | null => {
    if (!primary) return null;
    const trap = CLASS_TRAPS.find((t) => t.id === primary);
    if (trap) return { title: trap.label, dest: trapDestination(trap), line: trapNote(trap) };
    if (primary.startsWith("acct-")) {
      const a = account(primary.slice(5));
      if (!a) return null;
      return { title: a.label, dest: a.contra ? `CONTRA-${a.category.toUpperCase()}` : a.category.toUpperCase(), line: a.whyLine };
    }
    const tile = classTile(primary);
    return tile ? { title: tile.label, dest: tile.anchor, line: "" } : null;
  };
  const ro = readout();

  // ---- one account chip --------------------------------------------------
  const chip = (a: AccountDef, accent: string) => {
    const nid = acctNodeId(a.id);
    return (
      <div
        key={a.id}
        className="nodrag relative w-full cursor-pointer rounded-xl px-2 py-1 text-center"
        style={{
          fontFamily: DISPLAY_FONT, fontSize: 11, lineHeight: 1.2, color: CREAM, fontWeight: 600,
          background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
          border: "1px solid rgba(244,239,230,0.22)",
          transition: T,
          ...emphasis(nid), ...ring(nid, accent),
        }}
        onClick={selectAccount(a)}
      >
        {a.label}
        {a.contra && (
          <span style={{ display: "block", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.16em", color: accent, marginTop: 1 }}>
            CONTRA
          </span>
        )}
      </div>
    );
  };

  // ---- one category column ------------------------------------------------
  const tileCol = (t: ClassTileDef) => {
    const accent = TILE_ACCENT[t.id];
    const grouped = depthOn && CLASS_TERM_TILES.includes(t.id);
    return (
      <div key={t.id} className="flex min-w-0 flex-1 flex-col items-center gap-2" style={{ padding: "0 4px" }}>
        {/* the tile */}
        <div
          className="nodrag relative w-full cursor-pointer rounded-2xl px-2 py-2 text-center"
          style={{
            background: "linear-gradient(180deg, rgba(37,52,88,0.96), rgba(16,24,44,0.96))",
            border: `1.5px solid ${accent}88`,
            boxShadow: "0 6px 16px -8px rgba(0,0,0,0.8), 0 0 0 3px rgba(9,13,26,0.9)",
            ...emphasisIn("tiles", t.id), ...ring(t.id, accent),
          }}
          onClick={selectTile(t)}
        >
          <CueTag cueId={`class-${t.id}`} level={t.cue} />
          <div style={{ fontFamily: BIG_FONT, fontWeight: 800, fontSize: 15, letterSpacing: "0.04em", color: CREAM, textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>
            {t.label}
          </div>
          {/* the one-word anchor — its own reveal band */}
          <div style={{ opacity: vis("anchors") ? 1 : 0, transition: T, fontFamily: BIG_FONT, fontWeight: 900, fontSize: 19, letterSpacing: "0.08em", color: accent, marginTop: 1 }}>
            {t.anchor}
          </div>
        </div>

        {/* the example chips */}
        <div
          className="flex w-full flex-col items-center gap-1"
          style={{ opacity: vis("chips") ? 1 : 0, transition: T, pointerEvents: vis("chips") ? undefined : "none" }}
        >
          {grouped
            ? termGroups(t.id).map((g) => (
                <div key={g.key} className="flex w-full flex-col items-center gap-1">
                  <div className="w-full" style={{ borderTop: `1px solid ${accent}44`, marginTop: 3, paddingTop: 3 }}>
                    <div style={{ fontFamily: DISPLAY_FONT, fontSize: 7.5, fontWeight: 900, letterSpacing: "0.16em", color: accent, textAlign: "center" }}>
                      {CLASS_TERM_LABELS[g.key].label}
                    </div>
                    <div style={{ fontFamily: DISPLAY_FONT, fontSize: 7.5, color: NEON.muted, textAlign: "center", marginBottom: 2 }}>
                      {CLASS_TERM_LABELS[g.key].note}
                    </div>
                  </div>
                  {g.accounts.map((a) => chip(a, accent))}
                </div>
              ))
            : chipsFor(t).map((a) => chip(a, accent))}
        </div>
      </div>
    );
  };

  const divider = (
    <div
      aria-hidden
      style={{
        opacity: vis("tiles") ? 1 : 0, transition: T,
        ...(stacked
          ? { height: 6, width: "70%", margin: "8px auto" }
          : { width: 6, alignSelf: "stretch", margin: "0 6px" }),
        borderRadius: 3,
        background: "repeating-linear-gradient(" + (stacked ? "90deg" : "180deg") + ", rgba(244,239,230,0.26) 0 14px, rgba(244,239,230,0.08) 14px 18px)",
      }}
    />
  );

  const bs = CLASS_TILES.filter((t) => t.side === "BS");
  const is = CLASS_TILES.filter((t) => t.side === "IS");

  return (
    <ExhibitShell id={id} kind="classification" decl={decl} posLock={d.posLock} selected={selected} width={w} minHeight={h}>
      {!film && (
        <div className={`absolute -left-5 top-1/2 flex -translate-y-1/2 cursor-move items-center transition-opacity ${selected || d.posLock ? "opacity-70" : "opacity-0 group-hover/el:opacity-70"}`} title="Drag to move" style={{ color: NEON.muted }}>
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <style>{`@keyframes sa-class-pop { from { opacity: 0; } }`}</style>
      <div
        className="relative flex flex-col rounded-3xl"
        style={{ width: "100%", minHeight: h, background: "transparent", border: film ? "none" : "1.5px dashed rgba(252,163,17,0.22)", padding: "10px 10px" }}
        onClick={() => hl.clear()}
      >
        {/* the five tiles: balance sheet ‖ income statement */}
        <div className={`flex ${stacked ? "flex-col" : "flex-row"} items-start`}>
          {stacked ? (
            <>
              <div className="flex w-full flex-col">{bs.map(tileCol)}</div>
              {divider}
              <div className="flex w-full flex-col">{is.map(tileCol)}</div>
            </>
          ) : (
            <>
              {bs.map(tileCol)}
              {divider}
              {is.map(tileCol)}
            </>
          )}
        </div>

        {/* THE READOUT — one fixed place, height reserved so nothing moves */}
        <div
          className="mx-auto mt-3 w-full rounded-xl px-3 py-1.5 text-center"
          style={{
            maxWidth: 720, minHeight: 46,
            background: ro ? "rgba(9,13,26,0.9)" : "transparent",
            border: `1px solid ${ro ? `${GOLD}66` : "transparent"}`,
            transition: T,
          }}
        >
          {ro && (
            <div style={{ animation: "sa-class-pop 160ms ease" }}>
              <div style={{ fontFamily: DISPLAY_FONT, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: CREAM }}>
                {ro.title}
                {ro.dest && <span style={{ color: GOLD }}>{"  →  "}{ro.dest}</span>}
              </div>
              {ro.line && (
                <div style={{ fontFamily: DISPLAY_FONT, fontSize: 11.5, lineHeight: 1.35, color: NEON.muted, marginTop: 2 }}>{ro.line}</div>
              )}
            </div>
          )}
        </div>

        {/* TRAP ACCOUNTS — the wrong answers in plain sight (Bible law 3) */}
        <div
          className="mt-2 rounded-2xl px-3 py-2"
          style={{
            opacity: vis("traps") ? undefined : 0, pointerEvents: vis("traps") ? undefined : "none",
            border: "1px dashed rgba(244,239,230,0.3)", background: "rgba(9,13,26,0.35)", transition: T,
          }}
        >
          <div className="text-center" style={{ fontFamily: DISPLAY_FONT, fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: NEON.muted }}>
            Trap accounts
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            {CLASS_TRAPS.map((t) => {
              const accent = TILE_ACCENT[trapCategoryOf(t)];
              return (
                <div
                  key={t.id}
                  className="nodrag relative cursor-pointer rounded-full px-2.5 py-1"
                  style={{
                    fontFamily: DISPLAY_FONT, fontSize: 10.5, color: CREAM,
                    border: "1px solid rgba(244,239,230,0.28)", background: "rgba(16,24,44,0.7)",
                    transition: T,
                    ...emphasis(t.id), ...ring(t.id, accent),
                  }}
                  onClick={selectTrap(t)}
                >
                  <CueTag cueId={`class-${t.id}`} level={trapTag(t)} />
                  {t.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* CURRENT / LONG-TERM — depth layer, OFF by default */}
        {!film && (
          <button
            className="nodrag mx-auto mt-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: depthOn ? "#0B1322" : NEON.muted, background: depthOn ? GOLD : "rgba(11,19,34,0.85)", border: `1px solid ${depthOn ? GOLD : NEON.borderSoft}` }}
            title="Toggle Current / Long-term · on camera: D"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setExhibitDepth(!depthOn); }}
          >
            Current / Long-term
          </button>
        )}
      </div>
    </ExhibitShell>
  );
}

/** Kept out of the component so the trap→tile mapping reads as data, not flow. */
function trapCategoryOf(t: TrapChipDef): AccountCategory {
  return t.accountId ? account(t.accountId)!.category : t.category!;
}
