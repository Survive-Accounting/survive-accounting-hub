// A = L + E — THE EQUATION NODE (polish: Lee films this today, 2026-09-07).
//
// Lee: "A = L + E effects, where I'd like to have things like A = L + E ↑↓ or A = L + E ↑ ↑ ↓ ↓
// etc. I think we've already built this, where I can click around each A = L + E and move the
// arrows how I want. This helps when teaching it. Occasionally, I'll also show a side connection
// for Revs and Exps… Rev ↑, so does equity ↑, etc." The Formula card's ARROWS lens
// (canvas/cards/FormulaCardNode.tsx: click → ↑ → ↓ → ↑↓ → —), drawn huge for the phone: the
// three terms in the display face, each arrow beneath in gold, the extras (Rev ↑, Exp ↓) hung
// off E with a short link line, the caption under everything. When `live`, a click on a term
// cycles its arrow (EQ_DIR_CYCLE, the canvas's order) — a plain click, never Space or Enter, so
// the spacebar still walks shots. The arrow pops on change.
import { EQ_DIR_CYCLE } from "@/components/canvas/equation-derive";

import { EQ_DIR_GLYPH, type EqDir } from "../cluster-spec";
import type { EqTerm, ResolvedView } from "../cluster-models";
import { DISPLAY_FONT, BRAND_FONT, INK } from "./theme";

type View = Extract<ResolvedView, { kind: "equation" }>;

const TERMS: { key: EqTerm; glyph: string }[] = [{ key: "assets", glyph: "A" }, { key: "liabilities", glyph: "L" }, { key: "equity", glyph: "E" }];

/** The next arrow in the Formula card's cycle. */
export function nextEqDir(cur: EqDir): EqDir {
  const i = EQ_DIR_CYCLE.indexOf(cur);
  return EQ_DIR_CYCLE[(i + 1) % EQ_DIR_CYCLE.length];
}

export function EquationNode({ w, h, view, live, onCycle }: { w: number; h: number; view: View; live: boolean; onCycle?: (term: EqTerm) => void }) {
  // Sized from the width: the reference is a 900-wide node — "A = L + E" at 180, arrows at 120.
  const k = w / 900;
  const term = Math.round(180 * k), arrow = Math.round(120 * k), op = Math.round(150 * k);
  const extras = view.extras;
  const hasExtras = extras.length > 0;
  const click = (t: EqTerm) => (e: React.MouseEvent) => {
    if (!live || !onCycle) return;
    // Alt / ctrl / shift belong to the film's other tools (the field pan, the spotlight, the
    // highlighter); a plain click is the only one that cycles.
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault(); e.stopPropagation();
    onCycle(t);
  };
  return (
    <div style={{ width: w, height: h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: INK.cream, fontFamily: DISPLAY_FONT, userSelect: "none", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: Math.round(34 * k) }}>
        {TERMS.map((t, i) => (
          <div key={t.key} style={{ display: "flex", alignItems: "flex-start" }}>
            {i > 0 && <div style={{ fontSize: op, fontWeight: 800, lineHeight: 1, color: INK.creamMuted, marginRight: Math.round(34 * k), paddingTop: Math.round((term - op) / 2) }}>{i === 1 ? "=" : "+"}</div>}
            <div className="sa-map-term" data-live={live && onCycle ? "1" : "0"} data-term={t.key} onClick={click(t.key)} onPointerDown={(e) => { if (live && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) e.stopPropagation(); }}
              title={live ? "click: ↑ → ↓ → ↑↓ → —" : undefined}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: Math.round(term * 0.9) }}>
              <div style={{ fontSize: term, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>{t.glyph}</div>
              {/* The arrow re-keys on change so the pop replays; "—" is the muted rest state. */}
              <div key={view.arrows[t.key]} className="sa-map-pop" style={{ fontSize: arrow, fontWeight: 800, lineHeight: 1, marginTop: Math.round(14 * k), color: view.arrows[t.key] === "none" ? INK.creamFaint : INK.gold, fontFamily: BRAND_FONT, letterSpacing: view.arrows[t.key] === "both" ? "-0.08em" : undefined }}>
                {EQ_DIR_GLYPH[view.arrows[t.key]]}
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasExtras && (
        // THE SIDE CONNECTION: "Rev ↑, so does equity ↑" — hung under the term it links (E by
        // default), a short gold line down from the arrow into the list.
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: Math.round(10 * k), alignSelf: "stretch" }}>
          <div style={{ width: Math.max(2, Math.round(4 * k)), height: Math.round(36 * k), background: INK.gold, opacity: 0.8, borderRadius: 2 }} />
          <div style={{ display: "flex", gap: Math.round(40 * k), marginTop: Math.round(8 * k), fontFamily: BRAND_FONT }}>
            {extras.map((x, i) => (
              <div key={`${x.label}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: Math.round(12 * k) }}>
                <span style={{ fontSize: Math.round(54 * k), fontWeight: 700, color: INK.cream }}>{x.label}</span>
                <span style={{ fontSize: Math.round(60 * k), fontWeight: 800, color: x.dir === "none" ? INK.creamFaint : INK.gold, letterSpacing: x.dir === "both" ? "-0.08em" : undefined }}>{EQ_DIR_GLYPH[x.dir]}</span>
                {x.links && x.links !== "equity" && <span style={{ fontSize: Math.round(30 * k), color: INK.creamMuted, fontWeight: 600 }}>→ {x.links === "assets" ? "A" : "L"}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {view.caption && (
        <div style={{ marginTop: Math.round(28 * k), fontFamily: BRAND_FONT, fontSize: Math.round(44 * k), fontWeight: 500, color: INK.creamMuted, textAlign: "center", maxWidth: w * 0.92, lineHeight: 1.2 }}>{view.caption}</div>
      )}
    </div>
  );
}
