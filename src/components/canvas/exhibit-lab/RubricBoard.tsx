// THE RUBRIC BOARD (v3) — the exhibit itself. THE RUBRIC IS THE SCREEN:
// no probe machinery, no scenario chips, no quiz flow lives in here.
//
// v3 is a TEACHING BOARD, not one picture: every piece — the (+/−) pair above
// each element, the one-word definition, the individual accounts, the mini
// T-account, the ↑/↓ movements, the statements layer — switches on and off
// independently, and a MODE is a named set of switches for the question being
// taught. Everything visible at once is just the "All" mode.
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
  BRIDGE_LABEL, BRIDGE_TITLE, CONTRA, DEFS, ELEMENT_FULL, ELEMENT_LABEL, ELEMENT_ORDER,
  MOVEMENT_GLYPH, STATEMENT_OF, coaGroups, coaNodes, isContra, signPair, tSides, visibleAt,
  type Movement, type RubricToggles,
} from "./rubric-view";

const GOLD = "#FCA311";
const INK = "#F4EFE6";
const MUTE = "rgba(230,236,255,0.42)";
const DIM = "rgba(230,236,255,0.62)";
const LINE = "rgba(230,236,255,0.55)";
/** Calm fades (§5) and a film-paced zoom (§3). Transform + opacity only. */
const FADE = "opacity 150ms ease, transform 150ms ease";
const ZOOM_T = "opacity 260ms cubic-bezier(0.4,0,0.2,1), transform 260ms cubic-bezier(0.4,0,0.2,1)";

/** A layer that is present but unpainted until its switch (or step) says so. */
const layer = (shown: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
  opacity: shown ? 1 : 0,
  transform: shown ? "translateY(0)" : "translateY(6px)",
  pointerEvents: shown ? "auto" : "none",
  transition: FADE,
  ...extra,
});

/** THE SIGN PAIR — (+/−) or (−/+), ABOVE the element. Left of the slash is the
 *  DEBIT side. Both glyphs share one colour by default: the pair is the lesson.
 *  Only when `normal` is on does the + light bolt-orange — that is the
 *  normal-balance lesson, and it should arrive on purpose, not by default. */
function SignPair({ type, contra, normal, size, shown }: { type: AcctType; contra?: boolean; normal: boolean; size: number; shown: boolean }) {
  const p = signPair(type, contra);
  const glyph = (g: "+" | "−") => (
    <span style={{
      color: normal && g === "+" ? GOLD : DIM,
      textShadow: normal && g === "+" ? `0 0 ${Math.round(size * 0.7)}px rgba(252,163,17,0.5)` : undefined,
      transition: "color 180ms ease, text-shadow 180ms ease",
    }}>{g}</span>
  );
  return (
    <span style={{ ...layer(shown), fontFamily: BIG_FONT, fontWeight: 900, fontSize: size, lineHeight: 1, color: DIM, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
      ({glyph(p.left)}/{glyph(p.right)})
    </span>
  );
}

/** THE MINI T — the debit column | credit column, with the signs inside it.
 *  Optional now (the pair above carries the sign); this is the Dr/Cr lesson. */
export function MiniT({ type, size = 1 }: { type: AcctType; size?: number }) {
  const t = tSides(type);
  const w = Math.round(96 * size);
  const h = Math.round(40 * size);
  const stem = Math.max(2, Math.round(2 * size));
  const sign = (which: "left" | "right") => {
    const g = which === "left" ? t.left : t.right;
    return <span style={{ fontFamily: BIG_FONT, fontWeight: 900, lineHeight: 1, fontSize: Math.round(24 * size), color: DIM }}>{g}</span>;
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

/** The individual accounts under a type — grouped (Assets split CURRENT /
 *  LONG TERM), contra accounts flagged with their flipped pair. */
function AccountList({ element, shown, size }: { element: AcctType; shown: boolean; size: number }) {
  return (
    <div style={{ ...layer(shown), display: "inline-flex", flexDirection: "column", gap: 7, textAlign: "left", maxWidth: "100%" }}>
      {coaGroups(element).map((g, gi) => (
        <div key={gi}>
          {g.label && <div style={{ fontSize: Math.round(size * 0.78), fontWeight: 900, letterSpacing: "0.16em", color: MUTE, marginBottom: 3 }}>{g.label}</div>}
          {g.nodes.map((n) => {
            const contra = isContra(n.id);
            const p = signPair(element, true);
            return (
              <div key={n.id} data-node-id={n.id} data-element={n.element}
                style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: size, lineHeight: 1.45, color: contra ? INK : DIM, fontWeight: contra ? 800 : 600 }}>
                <span style={{ color: MUTE, fontSize: Math.round(size * 0.7) }}>•</span>
                <span>{n.label}</span>
                {contra && (
                  <span style={{ fontSize: Math.round(size * 0.74), fontWeight: 900, color: GOLD, whiteSpace: "nowrap" }}
                    title={`${CONTRA[n.id].label} — it carries the opposite pair`}>({p.left}/{p.right})</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
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

function StatementTag({ text, shown, size }: { text: string; shown: boolean; size: number }) {
  return <span style={{ ...layer(shown), fontSize: size, fontWeight: 900, letterSpacing: "0.24em", color: MUTE }}>{text}</span>;
}

/** ONE ELEMENT COLUMN, top to bottom:
 *      (+/−)          ← the pair, Lee's preferred spot
 *      ↑ / ↓ / ↑↓     ← the movement, click-cycled
 *      A              ← click to open this element's full picture
 *      "OWN"
 *      • Cash …       ← CURRENT / LONG TERM for assets
 */
function ElementCol({ type, glyphSize, wide, on, show, movement, onToggleOpen, onCycleMovement }: {
  type: AcctType;
  glyphSize: number;
  /** Accounts visible anywhere ⇒ columns claim equal width. */
  wide: boolean;
  /** THE SWITCHES, already resolved for this element. A switch that is OFF
   *  renders NOTHING — reserving space for it would push the frame off-centre
   *  for a piece this lesson never shows. */
  on: { signs: boolean; normal: boolean; defs: boolean; accounts: boolean; tAccounts: boolean; arrows: boolean };
  /** THE REVEAL GATES. A piece that is switched ON but not yet revealed keeps
   *  its space at opacity 0, so a Tab build adds ink without moving anything. */
  show: { eq: boolean; defs: boolean; ts: boolean };
  movement: Movement;
  onToggleOpen: (t: AcctType) => void;
  onCycleMovement: (t: AcctType) => void;
}) {
  const acctSize = Math.max(11, Math.round(glyphSize * 0.16));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, ...(wide ? { flex: 1, minWidth: 132, maxWidth: 300 } : {}) }}>
      {on.signs && <SignPair type={type} normal={on.normal} size={Math.round(glyphSize * 0.38)} shown={show.ts} />}
      {/* the movement slot keeps its height whether or not a glyph is in it, so
          clicking through ↑ ↓ ↑↓ never nudges the layout under the camera */}
      {on.arrows && (
        <button
          onClick={() => onCycleMovement(type)}
          title={`${ELEMENT_FULL[type]} — click through ↑ · ↓ · ↑↓ · none`}
          style={{
            ...layer(show.eq), height: Math.round(glyphSize * 0.42), minWidth: Math.round(glyphSize * 0.6),
            display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer",
            fontFamily: BIG_FONT, fontWeight: 900, fontSize: Math.round(glyphSize * 0.36), lineHeight: 1,
            color: movement ? GOLD : "rgba(230,236,255,0.14)",
          }}
        >{movement ? MOVEMENT_GLYPH[movement] : "·"}</button>
      )}
      <button
        onClick={() => onToggleOpen(type)}
        title={`${ELEMENT_FULL[type]} — click to open its definition + accounts`}
        style={{
          ...layer(show.eq),
          fontFamily: BIG_FONT, fontWeight: 900, fontSize: glyphSize, lineHeight: 1,
          color: INK, background: "transparent", border: "none", padding: "0 6px",
          cursor: "pointer", textShadow: "0 2px 18px rgba(0,0,0,0.55)",
        }}
      >{ELEMENT_LABEL[type]}</button>
      {on.defs && <span style={{ ...layer(show.defs), fontSize: Math.round(glyphSize * 0.21), fontWeight: 800, letterSpacing: "0.16em", color: MUTE, whiteSpace: "nowrap" }}>{DEFS[type]}</span>}
      {on.tAccounts && <div style={layer(show.ts)}><MiniT type={type} size={glyphSize / 78} /></div>}
      {wide && on.accounts && (
        <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
          <AccountList element={type} shown={show.eq} size={acctSize} />
        </div>
      )}
    </div>
  );
}

/** An operator glyph (=, +, |, &) — the equation row only. It sits on the
 *  letters' baseline, so it is padded down past the sign + movement rows. */
function Op({ text, size, shown, faint }: { text: string; size: number; shown: boolean; faint?: boolean }) {
  return (
    <span style={{
      ...layer(shown), alignSelf: "flex-start", marginTop: Math.round(size * 0.85),
      fontFamily: BIG_FONT, fontWeight: faint ? 300 : 900, fontSize: size, lineHeight: 1,
      color: faint ? MUTE : INK,
    }}>{text}</span>
  );
}

export interface RubricBoardProps {
  /** Reveal step 1–7, or null for FREE MODE (the navigable exhibit). */
  reveal: number | null;
  /** Which element is zoomed, or null for the top-level rubric. */
  zoom: AcctType | null;
  /** The switches — what this board is teaching right now. */
  toggles: RubricToggles;
  /** Elements opened IN PLACE by clicking their letter (def + accounts). */
  open: ReadonlySet<AcctType>;
  /** ↑/↓ per element, for working a transaction on camera. */
  movements: Readonly<Partial<Record<AcctType, Movement>>>;
  onZoom: (t: AcctType | null) => void;
  onToggleOpen: (t: AcctType) => void;
  onCycleMovement: (t: AcctType) => void;
}

export function RubricBoard({ reveal, zoom, toggles, open, movements, onZoom, onToggleOpen, onCycleMovement }: RubricBoardProps) {
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

  const v = visibleAt(reveal);
  const zoomed = zoom != null;
  const [shownEl, setShownEl] = useState<AcctType>("A");
  useEffect(() => { if (zoom) setShownEl(zoom); }, [zoom]);

  // An element is "open" when its own click opened it OR a switch opened them
  // all. Whether ANY column shows accounts decides the whole layout, so the
  // equation never re-flows halfway through a reveal.
  const accountsFor = (t: AcctType) => toggles.accounts || open.has(t);
  const defsFor = (t: AcctType) => toggles.defs || open.has(t);
  const wide = ELEMENT_ORDER.some(accountsFor);
  // The caps sit ABOVE what a real capture asks for so the glyphs stay
  // proportional at film resolution; the full picture needs room for five
  // account columns, so it runs a size down.
  const glyph = stacked
    ? Math.max(34, Math.min(wide ? 96 : 150, box.w / (wide ? 9.5 : 7.4)))
    : Math.max(30, Math.min(wide ? 104 : 132, box.w / (wide ? 19 : 15)));
  const tagSize = Math.max(8, Math.round(glyph * 0.15));
  const showStatements = toggles.statements && v.statements;

  const colFor = (t: AcctType, eq: boolean, defs: boolean, ts: boolean) => (
    <ElementCol
      key={t}
      type={t}
      glyphSize={glyph}
      wide={wide}
      movement={movements[t] ?? null}
      onToggleOpen={onToggleOpen}
      onCycleMovement={onCycleMovement}
      on={{ signs: toggles.signs, normal: toggles.normal, defs: defsFor(t), accounts: accountsFor(t), tAccounts: toggles.tAccounts, arrows: toggles.arrows }}
      show={{ eq, defs, ts }}
    />
  );

  const group = (types: AcctType[], ops: string[], eq: boolean, defs: boolean, ts: boolean) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: Math.round(glyph * (wide ? 0.1 : 0.18)), ...(wide ? { flex: types.length } : {}) }}>
      {types.map((t, i) => (
        <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: Math.round(glyph * (wide ? 0.1 : 0.18)), ...(wide ? { flex: 1 } : {}) }}>
          {i > 0 && <Op text={ops[i - 1]} size={glyph} shown={eq} />}
          {colFor(t, eq, defs, ts)}
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
        gap: stacked ? Math.round(glyph * 0.4) : Math.round(glyph * 0.3),
        padding: wide ? "2% 3%" : 0, overflow: "hidden",
        opacity: zoomed ? 0 : 1, transform: zoomed ? "scale(1.18)" : "scale(1)",
        pointerEvents: zoomed ? "none" : "auto", transition: ZOOM_T, willChange: "opacity, transform",
      }}>
        {stacked ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", width: wide ? "100%" : undefined, justifyContent: "center" }}>{group(["A", "L", "E"], ["=", "+"], v.bsEq, v.bsDefs, v.bsTs)}</div>
            <StatementTag text="BALANCE SHEET" shown={showStatements} size={tagSize} />
            <div style={{ ...layer(v.isEq), display: "flex", alignItems: "center", gap: 14, width: "62%" }}>
              <span style={{ flex: 1, height: 1, background: LINE, opacity: 0.5 }} />
              <Bridge shown={showStatements} size={Math.round(glyph * 0.5)} />
              <span style={{ flex: 1, height: 1, background: LINE, opacity: 0.5 }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", width: wide ? "100%" : undefined, justifyContent: "center" }}>{group(["R", "X"], ["&"], v.isEq, v.isDefs, v.isTs)}</div>
            <StatementTag text="INCOME STATEMENT" shown={showStatements} size={tagSize} />
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: Math.round(glyph * (wide ? 0.1 : 0.18)), width: wide ? "100%" : undefined, justifyContent: "center" }}>
              {group(["A", "L", "E"], ["=", "+"], v.bsEq, v.bsDefs, v.bsTs)}
              <Op text="|" size={glyph} shown={v.isEq} faint />
              {group(["R", "X"], ["&"], v.isEq, v.isDefs, v.isTs)}
            </div>
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
                color: shownEl === t ? "#0B1322" : INK, background: shownEl === t ? GOLD : "transparent",
                transition: "background 160ms ease, color 160ms ease",
              }}
            >{ELEMENT_LABEL[t]}</button>
          </span>
        ))}
      </div>

      {/* LAYER 3 · THE ZOOMED ELEMENT — one type, filling the frame. */}
      <div style={{
        position: "absolute", inset: 0, paddingTop: 52,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
        opacity: zoomed ? 1 : 0, transform: zoomed ? "scale(1)" : "scale(0.93)",
        pointerEvents: zoomed ? "auto" : "none", transition: ZOOM_T, willChange: "opacity, transform",
      }}>
        <SignPair type={shownEl} normal={toggles.normal} size={Math.max(22, Math.min(46, box.w / 26))} shown={toggles.signs} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontFamily: BIG_FONT, fontWeight: 900, fontSize: Math.max(30, Math.min(58, box.w / 18)), color: INK, letterSpacing: "0.02em" }}>{ELEMENT_FULL[shownEl]}</span>
          <span style={{ fontSize: Math.max(13, Math.min(24, box.w / 46)), fontWeight: 800, letterSpacing: "0.2em", color: MUTE }}>{DEFS[shownEl]}</span>
        </div>
        <StatementTag text={STATEMENT_OF[shownEl]} shown={showStatements} size={tagSize} />
        {toggles.tAccounts && <MiniT type={shownEl} size={1.5} />}
        {/* THE ACCOUNT LIST — COA order, grouped. Each row is a NODE (id ·
            element · label); drag into a journal entry is parked (§6). */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: "min(860px, 90%)" }}>
          {coaNodes(shownEl).map((n) => (
            <span key={n.id} data-node-id={n.id} data-element={n.element}
              style={{
                padding: "7px 13px", borderRadius: 10, fontSize: 14, fontWeight: 700, color: INK,
                background: "rgba(255,255,255,0.045)", border: `1px solid ${isContra(n.id) ? "rgba(252,163,17,0.5)" : "rgba(230,236,255,0.16)"}`,
                whiteSpace: "nowrap",
              }}
            >{n.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
