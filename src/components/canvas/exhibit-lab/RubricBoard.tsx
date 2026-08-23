// THE RUBRIC BOARD (Rubric v2) — the exhibit itself. THE RUBRIC IS THE SCREEN:
// no probe machinery, no scenario chips, no quiz flow lives in here.
//
// SELF-CONTAINED + CONTROLLED (§6): every piece of state arrives as a prop, so
// the same component serves the filming wrapper today and a student build
// later. It imports no film-lock, no probe module, no canvas card — only the
// pure view model and one font constant.
//
// MOTION LAW (the spacewalk-flash rules): every layer stays MOUNTED and
// animates on opacity + transform only (GPU-composited, no reflow, no remount,
// no bounce). A hidden layer is opacity 0 with pointer-events off — invisible
// to OBS, present to the DOM, so nothing can flash as it arrives.
import { useEffect, useRef, useState } from "react";

import { BIG_FONT } from "../theme";
import type { AcctType } from "./rubric-model";
import {
  BRIDGE_LABEL, BRIDGE_TITLE, DEFS, ELEMENT_FULL, ELEMENT_LABEL, ELEMENT_ORDER,
  STATEMENT_OF, coaNodes, tSides, visibleAt,
} from "./rubric-view";

const GOLD = "#FCA311";
const INK = "#F4EFE6";
const MUTE = "rgba(230,236,255,0.42)";
const LINE = "rgba(230,236,255,0.55)";
/** Calm fades (§5) and a film-paced zoom (§3). Transform + opacity only. */
const FADE = "opacity 150ms ease, transform 150ms ease";
const ZOOM_T = "opacity 260ms cubic-bezier(0.4,0,0.2,1), transform 260ms cubic-bezier(0.4,0,0.2,1)";

/** A layer that is present but unpainted until its step arrives. */
const layer = (shown: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
  opacity: shown ? 1 : 0,
  transform: shown ? "translateY(0)" : "translateY(6px)",
  pointerEvents: shown ? "auto" : "none",
  transition: FADE,
  ...extra,
});

/** THE MINI T — a two-column T with the signs INSIDE it. The normal-balance
 *  (+) side is filled bolt-orange; the other is muted. No labels: the T teaches
 *  the sign and the normal balance silently. */
export function MiniT({ type, size = 1 }: { type: AcctType; size?: number }) {
  const t = tSides(type);
  const w = Math.round(96 * size);
  const h = Math.round(46 * size);
  const stem = Math.max(2, Math.round(2 * size));
  const sign = (which: "left" | "right") => {
    const glyph = which === "left" ? t.left : t.right;
    const normal = t.normal === which;
    return (
      <span style={{
        fontFamily: BIG_FONT, fontWeight: 900, lineHeight: 1,
        fontSize: Math.round((normal ? 30 : 26) * size),
        color: normal ? GOLD : MUTE,
        textShadow: normal ? `0 0 ${Math.round(18 * size)}px rgba(252,163,17,0.45)` : undefined,
      }}>{glyph}</span>
    );
  };
  return (
    <div style={{ width: w }} aria-hidden>
      <div style={{ height: stem, background: LINE, borderRadius: 2 }} />
      <div style={{ display: "grid", gridTemplateColumns: `1fr ${stem}px 1fr`, height: h }}>
        <div style={{ display: "grid", placeItems: "center" }}>{sign("left")}</div>
        <div style={{ background: LINE }} />
        <div style={{ display: "grid", placeItems: "center" }}>{sign("right")}</div>
      </div>
    </div>
  );
}

/** One element column: the glyph, its one-word definition, its T. */
function ElementCol({ type, glyphSize, show, onZoom }: {
  type: AcctType; glyphSize: number;
  show: { eq: boolean; defs: boolean; ts: boolean };
  onZoom: (t: AcctType) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button
        onClick={() => onZoom(type)}
        title={`${ELEMENT_FULL[type]} — click to zoom in`}
        style={{
          ...layer(show.eq),
          fontFamily: BIG_FONT, fontWeight: 900, fontSize: glyphSize, lineHeight: 1,
          color: INK, background: "transparent", border: "none", padding: "0 6px",
          cursor: "pointer", textShadow: "0 2px 18px rgba(0,0,0,0.55)",
        }}
      >{ELEMENT_LABEL[type]}</button>
      <span style={{ ...layer(show.defs), fontSize: Math.round(glyphSize * 0.22), fontWeight: 800, letterSpacing: "0.18em", color: MUTE }}>{DEFS[type]}</span>
      <div style={layer(show.ts)}><MiniT type={type} size={glyphSize / 64} /></div>
    </div>
  );
}

/** An operator glyph (=, +, |, &) — the equation row only: no def, no T. */
function Op({ text, size, shown, faint }: { text: string; size: number; shown: boolean; faint?: boolean }) {
  return (
    <span style={{
      ...layer(shown), alignSelf: "flex-start",
      fontFamily: BIG_FONT, fontWeight: faint ? 300 : 900, fontSize: size, lineHeight: 1,
      color: faint ? MUTE : INK,
    }}>{text}</span>
  );
}

/** The R/E bridge at the divider: an icon carries the concept, four characters
 *  carry the label, the full name lives in the tooltip only (text diet, §4). */
function Bridge({ shown, size }: { shown: boolean; size: number }) {
  return (
    <span title={BRIDGE_TITLE} style={{ ...layer(shown), display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "help" }}>
      <svg width={size} height={size * 0.5} viewBox="0 0 32 16" fill="none" aria-hidden>
        <path d="M2 13 C 8 2, 24 2, 30 13" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M2 13 h28" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
        <path d="M9 13 V7.5 M16 13 V5.6 M23 13 V7.5" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      </svg>
      <span style={{ fontSize: Math.round(size * 0.34), fontWeight: 900, letterSpacing: "0.12em", color: GOLD }}>{BRIDGE_LABEL}</span>
    </span>
  );
}

/** A small-caps statement tag (BALANCE SHEET / INCOME STATEMENT). */
function StatementTag({ text, shown, size }: { text: string; shown: boolean; size: number }) {
  return <span style={{ ...layer(shown), fontSize: size, fontWeight: 900, letterSpacing: "0.24em", color: MUTE }}>{text}</span>;
}

export interface RubricBoardProps {
  /** Reveal step 1–7, or null for FREE MODE (the navigable exhibit). */
  reveal: number | null;
  /** Which element is zoomed, or null for the top-level rubric. */
  zoom: AcctType | null;
  /** Is the statements layer switched on? (AND-ed with the reveal gate.) */
  statements: boolean;
  onZoom: (t: AcctType | null) => void;
}

export function RubricBoard({ reveal, zoom, statements, onZoom }: RubricBoardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 16:9 vs 9:16 (§5) — the vertical frame STACKS the two universes instead of
  // shrinking one line of glyphs into illegibility.
  const [box, setBox] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setBox({ w: r.width, h: r.height }); };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const stacked = box.h > box.w;
  // The caps sit ABOVE what a real capture asks for (1080/7.4 = 146 stacked,
  // 1920/15 = 128 wide) so the glyphs stay proportional at film resolution —
  // a cap that clamps would shrink the rubric inside a 1080p frame.
  const glyph = stacked ? Math.max(38, Math.min(150, box.w / 7.4)) : Math.max(34, Math.min(132, box.w / 15));
  const tagSize = Math.max(8, Math.round(glyph * 0.15));

  const v = visibleAt(reveal);
  const zoomed = zoom != null;
  // Keep the LAST zoomed element painted through the fade-out so the panel
  // never blanks mid-transition (that blink is the flash bug in miniature).
  const [shown, setShown] = useState<AcctType>("A");
  useEffect(() => { if (zoom) setShown(zoom); }, [zoom]);

  const bs = { eq: v.bsEq, defs: v.bsDefs, ts: v.bsTs };
  const is = { eq: v.isEq, defs: v.isDefs, ts: v.isTs };
  const showStatements = statements && v.statements;

  const group = (types: AcctType[], ops: string[], show: { eq: boolean; defs: boolean; ts: boolean }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: Math.round(glyph * 0.18) }}>
      {types.map((t, i) => (
        <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: Math.round(glyph * 0.18) }}>
          {i > 0 && <Op text={ops[i - 1]} size={glyph} shown={show.eq} />}
          <ElementCol type={t} glyphSize={glyph} show={show} onZoom={onZoom} />
        </div>
      ))}
    </div>
  );

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>

      {/* LAYER 1 · THE FULL RUBRIC — always mounted; zooming pushes it back. */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: stacked ? Math.round(glyph * 0.5) : Math.round(glyph * 0.34),
        opacity: zoomed ? 0 : 1, transform: zoomed ? "scale(1.18)" : "scale(1)",
        pointerEvents: zoomed ? "none" : "auto", transition: ZOOM_T, willChange: "opacity, transform",
      }}>
        {stacked ? (
          <>
            {group(["A", "L", "E"], ["=", "+"], bs)}
            <StatementTag text="BALANCE SHEET" shown={showStatements} size={tagSize} />
            <div style={{ ...layer(is.eq), display: "flex", alignItems: "center", gap: 14, width: "62%" }}>
              <span style={{ flex: 1, height: 1, background: LINE, opacity: 0.5 }} />
              <Bridge shown={showStatements} size={Math.round(glyph * 0.5)} />
              <span style={{ flex: 1, height: 1, background: LINE, opacity: 0.5 }} />
            </div>
            {group(["R", "X"], ["&"], is)}
            <StatementTag text="INCOME STATEMENT" shown={showStatements} size={tagSize} />
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: Math.round(glyph * 0.18) }}>
              {group(["A", "L", "E"], ["=", "+"], bs)}
              <Op text="|" size={glyph} shown={is.eq} faint />
              {group(["R", "X"], ["&"], is)}
            </div>
            {/* the statements row: a tag under each universe, the bridge between */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", width: "86%", columnGap: Math.round(glyph * 0.3) }}>
              <div style={{ display: "grid", placeItems: "center" }}><StatementTag text="BALANCE SHEET" shown={showStatements} size={tagSize} /></div>
              <Bridge shown={showStatements} size={Math.round(glyph * 0.5)} />
              <div style={{ display: "grid", placeItems: "center" }}><StatementTag text="INCOME STATEMENT" shown={showStatements} size={tagSize} /></div>
            </div>
          </>
        )}
      </div>

      {/* LAYER 2 · BREADCRUMB RAIL — the whole rubric, tiny, pinned top. Click
          an element to jump LATERALLY; click the rail itself to zoom back out. */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onZoom(null); }}
        title="Click an element to jump · click the rail to zoom out"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 52,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          background: "linear-gradient(180deg, rgba(8,13,24,0.92), rgba(8,13,24,0))",
          opacity: zoomed ? 1 : 0, transform: zoomed ? "translateY(0)" : "translateY(-10px)",
          pointerEvents: zoomed ? "auto" : "none", transition: ZOOM_T, cursor: "zoom-out",
        }}
      >
        {ELEMENT_ORDER.map((t, i) => (
          <span key={t} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {i === 3 && <span style={{ fontSize: 17, fontWeight: 300, color: MUTE }}>|</span>}
            <button
              onClick={(e) => { e.stopPropagation(); onZoom(t); }}
              title={ELEMENT_FULL[t]}
              style={{
                fontFamily: BIG_FONT, fontWeight: 900, fontSize: 17, lineHeight: 1, cursor: "pointer",
                padding: "3px 8px", borderRadius: 7, border: "none",
                color: shown === t ? "#0B1322" : INK, background: shown === t ? GOLD : "transparent",
                transition: "background 160ms ease, color 160ms ease",
              }}
            >{ELEMENT_LABEL[t]}</button>
          </span>
        ))}
      </div>

      {/* LAYER 3 · THE ZOOMED ELEMENT. */}
      <div style={{
        position: "absolute", inset: 0, paddingTop: 52,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
        opacity: zoomed ? 1 : 0, transform: zoomed ? "scale(1)" : "scale(0.93)",
        pointerEvents: zoomed ? "auto" : "none", transition: ZOOM_T, willChange: "opacity, transform",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: Math.max(30, Math.min(58, box.w / 18)), color: INK, letterSpacing: "0.02em" }}>{ELEMENT_FULL[shown]}</span>
          <span style={{ fontSize: Math.max(13, Math.min(24, box.w / 46)), fontWeight: 800, letterSpacing: "0.2em", color: MUTE }}>{DEFS[shown]}</span>
        </div>
        <StatementTag text={STATEMENT_OF[shown]} shown={showStatements} size={tagSize} />
        <MiniT type={shown} size={1.5} />
        {/* THE ACCOUNT LIST — COA order. Each chip is a NODE (id · element ·
            label); drag into a journal entry is parked (§6), the shape is not. */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: "min(760px, 88%)" }}>
          {coaNodes(shown).map((n) => (
            <span
              key={n.id}
              data-node-id={n.id}
              data-element={n.element}
              style={{
                padding: "7px 13px", borderRadius: 10, fontSize: 14, fontWeight: 700, color: INK,
                background: "rgba(255,255,255,0.045)", border: "1px solid rgba(230,236,255,0.16)",
                whiteSpace: "nowrap",
              }}
            >{n.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
