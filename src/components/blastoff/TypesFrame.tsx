// THE TYPES OF ACCOUNTS SLIDE — Lee's old teaching slide, vertical (account-types.ts has the
// content and his words).
//
// "I picture it like the one in screenshot 2 [the Memorize This list], but clickable back and
// forth... I want it to work similar to this in our slide, but in a vertical format. If needed,
// due to space constraints, just let me scroll up and down through the slide … We can reuse some
// of the style of the current rubric."
//
// A column at the top of the safe column, in phone units (306-wide phone, times `k`):
//   · the kicker (frame.title, default "Types of accounts");
//   · the header — the type's letter huge, his one word and its sign beside it — kept left of the
//     corner camera;
//   · the tabs A · L · E · Rev · Exp · Contra, in the rubric's box skin with its hover lift;
//   · the list, in the Memorize This style, down to the bottom of the safe column — it scrolls
//     (wheel) when it's longer, with a fade at the edge that says there's more.
// No caption rail on this kind (layout.ts COLUMN_KINDS): the list takes that space.
//
// CLICKS. On the Review stage a tab click sets the tab the slide opens on (saved). On film a tab
// click and an account click (a gold highlight) are this viewing only — never saved. Divs with
// role="button", not buttons: a focused button would take the film's spacebar as a click.
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { renderInline } from "@/components/canvas/inline-md";

import { CONTRA_INFO, TYPE_INFO, TYPE_TABS, sectionsFor, typesView, wordOf, type TypeTab } from "./account-types";
import type { BlastFrame } from "./plan";
import { SlideEditContext } from "./slide-edit";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";

const GOLD = "#FCA311";
const SKY = "#7DD3FC";
const ORANGE = "#FF9F43";
const MUTED = "#8C9BBA";
const CELL_BG = "#0E1830";
const CELL_EDGE = "#2B3D66";
const CELL_ON_BG = "#122042";
const INK = "#111A32";

/** The column, in phone units. Its height runs to the bottom of the safe column (.78h) from the
 *  stage's top (.12h): 306 × 16/9 × .66 ≈ 359. */
export const TYPES_GEOM = { w: 241, h: 356, headerW: 196 } as const;

const TYPES_CSS = `
.sa-types-tab { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 200ms ease; }
.sa-types-tab:hover { transform: translateY(-2px) scale(1.04); border-color: ${GOLD} !important; box-shadow: 0 0 0 2px rgba(252,163,17,0.35), 0 6px 18px rgba(252,163,17,0.22); }
.sa-types-tab:active { transform: scale(0.97); }
.sa-types-list { scrollbar-width: none; }
.sa-types-list::-webkit-scrollbar { display: none; }
@keyframes sa-types-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sa-types-in { animation: sa-types-in 220ms ease-out both; }
.sa-types-item { cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .sa-types-in { animation: none; } .sa-types-tab:hover, .sa-types-tab:active { transform: none; } }`;

export function TypesFrame({ frame, k, live = false }: { frame: BlastFrame; k: number; live?: boolean }) {
  const edit = useContext(SlideEditContext);
  const spec = frame.types;
  const v = typesView(spec);
  // This viewing's tab and highlights — reset when the slide changes under the same component.
  const [tabHere, setTabHere] = useState<TypeTab | null>(null);
  const [lit, setLit] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setTabHere(null); setLit(new Set()); }, [frame.id]);
  const tab = tabHere ?? v.tab;
  const pick = (t: TypeTab) => {
    // Review: the tab it opens on is the slide's. Film: this take only.
    if (!live && edit) edit({ types: { ...(spec ?? {}), tab: t } });
    else setTabHere(t);
  };
  const toggleLit = (id: string) => setLit((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // THE FADE AT THE EDGE when the list scrolls: at the top only the bottom fades, and so on.
  const listRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ up: boolean; down: boolean }>({ up: false, down: false });
  const readEdge = () => { const el = listRef.current; if (!el) return; const up = el.scrollTop > 2, down = el.scrollTop + el.clientHeight < el.scrollHeight - 2; setEdge((p) => (p.up === up && p.down === down ? p : { up, down })); };
  useLayoutEffect(() => { const el = listRef.current; if (el) el.scrollTop = 0; readEdge(); }, [tab, spec, k]);

  const contraTab = tab === "Contra";
  const info = contraTab ? null : TYPE_INFO[tab];
  const big = contraTab ? "Contra" : tab;
  const word = contraTab ? CONTRA_INFO.word : wordOf(spec, tab);
  const kicker = frame.title?.trim() || "Types of accounts";
  const sections = sectionsFor(spec, tab);
  const G = TYPES_GEOM;
  const headerH = 50;
  const tabsTop = 18 + headerH + 6, tabsH = 30;
  const listTop = tabsTop + tabsH + 8;
  const mask = edge.up || edge.down
    ? `linear-gradient(to bottom, ${edge.up ? "transparent 0, black 10%" : "black 0"}, ${edge.down ? "black 88%, transparent 100%" : "black 100%"})`
    : undefined;
  return (
    <div data-sa-types="" style={{ position: "relative", width: G.w * k, height: G.h * k, fontFamily: BRAND_FONT, color: BRAND_CREAM }}>
      <style>{TYPES_CSS}</style>
      {/* THE KICKER */}
      <div style={{ position: "absolute", left: 0, top: 0, width: G.headerW * k, fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 9.5 * k, lineHeight: 1, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kicker}</div>
      {/* THE HEADER — the letter, his word, the sign; left of the corner camera. */}
      <div key={`h-${tab}`} className="sa-types-in" style={{ position: "absolute", left: 0, top: 16 * k, width: G.headerW * k, height: headerH * k, display: "flex", alignItems: "center", gap: 10 * k }}>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: (contraTab ? 34 : 48) * k, lineHeight: 1, color: BRAND_CREAM, letterSpacing: "-0.01em" }}>{big}</div>
        {(v.def || (v.sign && info)) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 * k, minWidth: 0 }}>
            {v.def && <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 18 * k, lineHeight: 1, color: GOLD, whiteSpace: "nowrap" }}>“{word}”</div>}
            {v.sign && info && <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 14 * k, lineHeight: 1, color: SKY }}>({info.sign})</div>}
          </div>
        )}
      </div>
      {/* THE TABS */}
      <div style={{ position: "absolute", left: 0, top: tabsTop * k, width: G.w * k, height: tabsH * k, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.3fr 1.3fr 1.75fr", gap: 4 * k }}>
        {TYPE_TABS.map((t) => {
          const on = t === tab;
          return (
            <div key={t} role="button" data-types-tab={t} className="sa-types-tab" title={t === "Contra" ? CONTRA_INFO.name : TYPE_INFO[t].name}
              onClick={(e) => { e.stopPropagation(); pick(t); }}
              style={{ boxSizing: "border-box", display: "grid", placeItems: "center", userSelect: "none", borderRadius: 9 * k,
                background: on ? CELL_ON_BG : CELL_BG, border: `${Math.max(1, 1.5 * k)}px solid ${on ? GOLD : CELL_EDGE}`,
                boxShadow: on ? "0 0 0 2px rgba(252,163,17,0.25)" : "none",
                fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: (t.length > 1 ? 13 : 17) * k, lineHeight: 1, color: on ? GOLD : BRAND_CREAM }}>
              {t}
            </div>
          );
        })}
      </div>
      {/* THE LIST — scrolls when it's longer than the column. */}
      <div ref={listRef} className="sa-types-list" onScroll={readEdge}
        style={{ position: "absolute", left: 0, top: listTop * k, width: G.w * k, height: (G.h - listTop) * k, boxSizing: "border-box", overflowY: "auto",
          background: CELL_BG, border: `${Math.max(1, 1.5 * k)}px solid ${CELL_EDGE}`, borderRadius: 12 * k, padding: `${10 * k}px ${12 * k}px`,
          ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}) }}>
        <div key={`l-${tab}`} className="sa-types-in" style={{ display: "flex", flexDirection: "column", gap: 10 * k }}>
          {sections.map((s, si) => (
            <div key={si} style={{ display: "flex", flexDirection: "column", gap: 4 * k }}>
              {s.heading && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 * k, fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 9.5 * k, letterSpacing: "0.16em", textTransform: "uppercase", color: s.contra ? ORANGE : GOLD }}>
                  <span style={{ whiteSpace: "nowrap" }}>{s.heading}{s.sign && v.sign ? ` (${s.sign})` : ""}</span>
                  <span style={{ flex: 1, height: 1, background: s.contra ? "rgba(255,159,67,0.35)" : "rgba(252,163,17,0.3)" }} />
                </div>
              )}
              {s.items.map((it, ii) => {
                const id = `${tab}:${si}:${ii}`;
                return (
                  <div key={ii}>
                    <Item id={id} text={it.text} lit={lit.has(id)} onToggle={toggleLit} k={k} size={16} />
                    {it.sub && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 * k, marginTop: 3 * k, paddingLeft: 18 * k }}>
                        {it.sub.map((t, j) => <Item key={j} id={`${id}:${j}`} text={t} lit={lit.has(`${id}:${j}`)} onToggle={toggleLit} k={k} size={14} sub />)}
                      </div>
                    )}
                  </div>
                );
              })}
              {s.items.length === 0 && <div style={{ fontSize: 12 * k, color: MUTED }}>Nothing listed.</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One account on the list: the chevron and the name; a click lights it gold for this viewing. */
function Item({ id, text, lit, onToggle, k, size, sub = false }: { id: string; text: string; lit: boolean; onToggle: (id: string) => void; k: number; size: number; sub?: boolean }) {
  return (
    <div role="button" className="sa-types-item" onClick={(e) => { e.stopPropagation(); onToggle(id); }}
      style={{ display: "flex", alignItems: "baseline", gap: 7 * k, userSelect: "none", fontFamily: BRAND_FONT, fontWeight: sub ? 600 : 700, fontSize: size * k, lineHeight: 1.2 }}>
      <span style={{ flex: "0 0 auto", color: sub ? MUTED : SKY, fontWeight: 800 }}>{sub ? "◦" : "›"}</span>
      {/* THE TEASE (2026-09-12): *Land* films blurred until Lee clicks it — "I'm not teaching
          EVERY asset at first". Inline markers work here like anywhere else. */}
      <span style={{ minWidth: 0, borderRadius: 4 * k, padding: `0 ${3 * k}px`, margin: `0 ${-3 * k}px`, background: lit ? GOLD : "transparent", color: lit ? INK : sub ? "#DBE1EE" : BRAND_CREAM, transition: "background 160ms ease, color 160ms ease" }}>{renderInline(text)}</span>
    </div>
  );
}
