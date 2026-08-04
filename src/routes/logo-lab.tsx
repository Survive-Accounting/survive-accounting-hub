// LOGO LAB — an interactive workshop for the Survive mark. Dial the bolt geometry,
// fonts, colours, backgrounds (incl. mono / grayscale / white / black), the slogan,
// and animation (incl. an upward-scrolling TikTok/Reels/Shorts cycler). Build the
// logo by hand here, then Copy the config / paths to bake into the brand module.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import { BOLT_PRESETS, SEC_SCHOOLS, boltColorById } from "@/components/canvas/brand";
import { BOLT_STYLE_PRESETS, DEFAULT_BOLT, forgeBolt, type BoltParams } from "@/lib/bolt-forge";
import { analyzeAngles, applyAssist, averageAxis, bounds, cleanupGeometry, DEFAULT_ASSIST, mirrorHalf, ptsToPath, symmetrize, toPt, toV, type GeometryAssist, type V } from "@/lib/bolt-geom-edit";

export const Route = createFileRoute("/logo-lab")({ component: LogoLab });

// ---- fonts available in the workshop -----------------------------------------
type FontDef = { n: string; w: number[]; raw?: string; cat: "sans" | "round" | "display" | "serif" };
const FONTS: FontDef[] = [
  { n: "Rubik", w: [400, 500, 700, 900], cat: "round" },
  { n: "Baloo 2", w: [400, 600, 700, 800], cat: "round" },
  { n: "Fredoka", w: [400, 500, 600, 700], cat: "round" },
  { n: "Nunito", w: [400, 600, 800, 900], cat: "round" },
  { n: "Quicksand", w: [400, 500, 600, 700], cat: "round" },
  { n: "Baloo Bhaijaan 2", w: [400, 600, 700, 800], cat: "round" },
  { n: "Poppins", w: [400, 500, 600, 700, 800, 900], cat: "sans" },
  { n: "Montserrat", w: [400, 600, 700, 800, 900], cat: "sans" },
  { n: "Archivo", w: [400, 600, 700, 800, 900], cat: "sans" },
  { n: "Onest", w: [400, 600, 700, 800], cat: "sans" },
  { n: "Hanken Grotesk", w: [400, 600, 700, 800], cat: "sans" },
  { n: "Space Grotesk", w: [400, 500, 600, 700], cat: "sans" },
  { n: "Sora", w: [400, 600, 700, 800], cat: "sans" },
  { n: "Inter", w: [400, 500, 600, 700, 800], cat: "sans" },
  { n: "Bricolage Grotesque", w: [400, 600, 700, 800], cat: "sans" },
  { n: "Anton", w: [400], cat: "display" },
  { n: "Bebas Neue", w: [400], cat: "display" },
  { n: "Lilita One", w: [400], cat: "display" },
  { n: "Paytone One", w: [400], cat: "display" },
  { n: "Passion One", w: [400, 700, 900], cat: "display" },
  { n: "Fraunces", w: [400, 600, 700, 900], raw: "Fraunces:opsz,wght@9..144,400..900", cat: "serif" },
  { n: "DM Serif Display", w: [400], cat: "serif" },
];
const fontsHref = () =>
  "https://fonts.googleapis.com/css2?" +
  FONTS.map((f) => "family=" + (f.raw ?? `${f.n.replace(/ /g, "+")}:wght@${f.w.join(";")}`)).join("&") +
  "&display=swap";
const FONT_BY = Object.fromEntries(FONTS.map((f) => [f.n, f]));
const ff = (name: string) => `'${name}', system-ui, sans-serif`;

// ---- workshop state ----------------------------------------------------------
type InkMode = "color" | "white" | "black" | "mono" | "grayscale";
type BgKind = "white" | "black" | "navy" | "transparent" | "custom";
type Entrance = "none" | "strike" | "pop" | "fadeup" | "wipe";

type State = {
  bg: BgKind; bgCustom: string;
  inkMode: InkMode; monoColor: string;
  bolt: BoltParams;
  colourway: string; c1: string; c2: string;
  keyline: "white" | "black" | "none" | "custom"; keylineCustom: string;
  glow: number;
  showWord: boolean; prefix: string; suffix: string;
  wordFont: string; wordWeight: number; wordSize: number; wordSpacing: number; wordCase: "lower" | "upper" | "none";
  textColor: string; boltScale: number; boltDrop: number; boltNudge: number;
  // bolt placement (composition)
  boltOffX: number; boltOffY: number; boltRotate: number; boltDepth: "back" | "mid" | "front";
  boltOverlapL: number; boltOverlapR: number; boltPivotX: number; boltPivotY: number;
  // effects (0 = off, else intensity)
  fxInner: number; fxShadow: number; fxEmboss: number; fxSticker: number; fxVintage: number; fxInk: number;
  zoom: number; // preview zoom
  showAcc: boolean; accText: string; accFont: string; accWeight: number; accTracking: number; accSize: number;
  rules: boolean; rulesFromBolt: boolean; ruleC1: string; ruleC2: string;
  showSlogan: boolean; sloganMode: "plain" | "scroller"; sloganFont: string; sloganWeight: number; sloganSize: number;
  plain: string; line1: string; pre: string; cycle: string; suf: string; cycleMs: number;
  entrance: Entrance; animMs: number;
  // GEOMETRY EDITOR — assist transforms + manual per-vertex offsets (keyed by outer
  // vertex index). baseFrozen = a "baked" outer ring that supersedes the procedural base.
  assist: GeometryAssist;
  manual: Record<number, [number, number]>;
  baseFrozen: [number, number][] | null;
  // EXPLICIT RINGS (Lee) — the vertex tool edits EITHER the border (outer) or the seam.
  // Once a ring is hand-edited it becomes an explicit point list here (supports add /
  // remove vertices → variable count); null = still derived from the procedural pipeline
  // (outer: assist + manual; seam: assist). editRing = which ring the tool is aimed at.
  editRing: "outer" | "seam";
  outerEdit: [number, number][] | null;
  seamEdit: [number, number][] | null;
  // reference overlay + distance test
  refImg: string; refOn: boolean; refOpacity: number; refScale: number; refX: number; refY: number; refSide: boolean; refOutline: boolean;
  dist: string; // "full" | "25" | "10" | "64" | "32" | "16"
};

const DEFAULTS: State = {
  bg: "black", bgCustom: "#0A0A0A",
  inkMode: "color", monoColor: "#F4EFE6",
  bolt: { ...DEFAULT_BOLT },
  colourway: "red-blue", c1: BOLT_PRESETS[0].c1, c2: BOLT_PRESETS[0].c2,
  keyline: "white", keylineCustom: "#FFFFFF",
  glow: 0,
  showWord: true, prefix: "surv", suffix: "ve",
  wordFont: "Rubik", wordWeight: 900, wordSize: 96, wordSpacing: -0.01, wordCase: "lower",
  textColor: "", boltScale: 1.12, boltDrop: 0.16, boltNudge: -0.01,
  boltOffX: 0, boltOffY: 0, boltRotate: 0, boltDepth: "mid", boltOverlapL: 0, boltOverlapR: 0, boltPivotX: 50, boltPivotY: 50,
  fxInner: 0, fxShadow: 0, fxEmboss: 0, fxSticker: 0, fxVintage: 0, fxInk: 0, zoom: 1,
  showAcc: true, accText: "Accounting", accFont: "Rubik", accWeight: 600, accTracking: 0.34, accSize: 0.15,
  rules: true, rulesFromBolt: true, ruleC1: "#C62828", ruleC2: "#1565C0",
  showSlogan: false, sloganMode: "scroller", sloganFont: "Rubik", sloganWeight: 600, sloganSize: 0.2,
  plain: "Cram videos by Lee Ingram", line1: "Not boring lecture videos.", pre: "More like ", cycle: "TikTok, Reels, Shorts", suf: " for cramming.", cycleMs: 1400,
  entrance: "none", animMs: 900,
  assist: { ...DEFAULT_ASSIST }, manual: {}, baseFrozen: null,
  editRing: "outer", outerEdit: null, seamEdit: null,
  refImg: "", refOn: false, refOpacity: 0.5, refScale: 1, refX: 0, refY: 0, refSide: false, refOutline: false,
  dist: "full",
};

const LS = "sa-logo-lab-v1";
const LS_PRESETS = "sa-logo-lab-presets-v1";

function isLight(hex: string) {
  const h = hex.replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

function effColors(s: State) {
  const bgHex = s.bg === "white" ? "#ffffff" : s.bg === "navy" ? "#0A1128" : s.bg === "custom" ? s.bgCustom : "#0A0A0A";
  const lightBg = s.bg === "white" || (s.bg === "custom" && isLight(s.bgCustom));
  const autoInk = lightBg ? "#141414" : "#F4EFE6";
  if (s.inkMode === "white") return { c1: "#FFFFFF", c2: "#FFFFFF", ink: "#FFFFFF", key: "none", gray: false, bgHex };
  if (s.inkMode === "black") return { c1: "#111111", c2: "#111111", ink: "#111111", key: "none", gray: false, bgHex };
  if (s.inkMode === "mono") return { c1: s.monoColor, c2: s.monoColor, ink: s.monoColor, key: "none", gray: false, bgHex };
  const key = s.keyline === "custom" ? s.keylineCustom : s.keyline;
  return { c1: s.c1, c2: s.c2, ink: s.textColor || autoInk, key, gray: s.inkMode === "grayscale", bgHex };
}

// ---- little bolt renderer -----------------------------------------------------
function BoltSVG({ geom, c1, c2, keyline, outline, innerGlow = 0, style }: { geom: ReturnType<typeof forgeBolt>; c1: string; c2: string; keyline: string; outline: number; innerGlow?: number; style?: CSSProperties }) {
  const mono = c1.toLowerCase() === c2.toLowerCase();
  const stroke = keyline && keyline !== "none";
  const uid = useId().replace(/[:]/g, "");
  const fid = `ig-${uid}`;
  const paths = (
    <>
      <path d={geom.outer} fill={c1} stroke={stroke ? keyline : undefined} strokeWidth={stroke ? outline : undefined} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
      {!mono && <path d={geom.seam} fill={c2} />}
    </>
  );
  return (
    <svg viewBox={geom.viewBox} width="100%" height="100%" style={style} preserveAspectRatio="xMidYMid meet">
      {innerGlow > 0 && (
        <defs>
          {/* INNER GLOW — a soft light band along the inside edge (SourceAlpha minus a
              blurred copy → the inner rim), flooded white and merged over the bolt. */}
          <filter id={fid} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation={innerGlow} result="b" />
            <feComposite in="SourceAlpha" in2="b" operator="out" result="rim" />
            <feFlood floodColor="#ffffff" floodOpacity={Math.min(0.85, innerGlow * 0.16)} result="w" />
            <feComposite in="w" in2="rim" operator="in" result="glow" />
            <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="glow" /></feMerge>
          </filter>
        </defs>
      )}
      {innerGlow > 0 ? <g filter={`url(#${fid})`}>{paths}</g> : paths}
    </svg>
  );
}

/** Compose the CSS filter chain for the bolt from the effect knobs (glow, shadow,
 *  emboss bevel, sticker lift, vintage/ink print). Inner glow is an SVG filter. */
function boltFx(s: State, c1: string, c2: string): string | undefined {
  const f: string[] = [];
  if (s.glow > 0) f.push(`drop-shadow(0 0 ${s.glow}px ${c1}88)`, `drop-shadow(0 0 ${s.glow * 1.6}px ${c2}55)`);
  if (s.fxShadow > 0) f.push(`drop-shadow(${(s.fxShadow * 0.5).toFixed(1)}px ${s.fxShadow}px ${(s.fxShadow * 1.3).toFixed(1)}px rgba(0,0,0,${Math.min(0.6, s.fxShadow * 0.08).toFixed(2)}))`);
  if (s.fxEmboss > 0) f.push(`drop-shadow(${(s.fxEmboss * 0.5).toFixed(1)}px ${(s.fxEmboss * 0.5).toFixed(1)}px 0 rgba(255,255,255,${Math.min(0.6, s.fxEmboss * 0.14).toFixed(2)}))`, `drop-shadow(-${(s.fxEmboss * 0.5).toFixed(1)}px -${(s.fxEmboss * 0.5).toFixed(1)}px ${(s.fxEmboss * 0.4).toFixed(1)}px rgba(0,0,0,${Math.min(0.55, s.fxEmboss * 0.16).toFixed(2)}))`);
  if (s.fxSticker > 0) f.push(`drop-shadow(0 ${(s.fxSticker * 0.8).toFixed(1)}px ${(s.fxSticker * 1.4).toFixed(1)}px rgba(0,0,0,0.35))`);
  if (s.fxVintage > 0) f.push(`sepia(${Math.min(0.5, s.fxVintage * 0.11).toFixed(2)})`, `saturate(${(1 - s.fxVintage * 0.05).toFixed(2)})`, `contrast(${(1 + s.fxVintage * 0.03).toFixed(2)})`, `brightness(${(1 - s.fxVintage * 0.015).toFixed(3)})`);
  if (s.fxInk > 0) f.push(`contrast(${(1 + s.fxInk * 0.05).toFixed(2)})`, `brightness(${(1 - s.fxInk * 0.02).toFixed(2)})`, `blur(${(s.fxInk * 0.09).toFixed(2)}px)`);
  return f.length ? f.join(" ") : undefined;
}

// ---- upward-scrolling word cycler (TikTok → Reels → Shorts) --------------------
// Only ever renders the CURRENT + NEXT word with a bounded 0→1 offset, so the index
// can never run away (robust even if a transitionend is missed / motion reduced).
const LH = 1.18;
function WordCycler({ words, ms, style }: { words: string[]; ms: number; style?: CSSProperties }) {
  const [cur, setCur] = useState(0);
  const [offset, setOffset] = useState(0); // 0 = resting, 1 = scrolled up one line
  useEffect(() => { setCur(0); setOffset(0); }, [words.join("|")]);
  useEffect(() => {
    if (!ms || words.length < 2) return;
    const t = setInterval(() => setOffset(1), ms);
    return () => clearInterval(t);
  }, [ms, words.length]);
  if (words.length < 2) return <span style={style}>{words[0] ?? ""}</span>;
  const next = (cur + 1) % words.length;
  const cell: CSSProperties = { height: `${LH}em`, lineHeight: `${LH}em`, whiteSpace: "nowrap" };
  return (
    <span style={{ display: "inline-block", height: `${LH}em`, overflow: "hidden", verticalAlign: "bottom", ...style }}>
      <span onTransitionEnd={() => { setCur(next); setOffset(0); }} style={{ display: "flex", flexDirection: "column", transform: `translateY(-${offset * LH}em)`, transition: offset ? "transform .45s cubic-bezier(.6,0,.15,1)" : "none" }}>
        <span style={cell}>{words[cur]}</span>
        <span style={cell}>{words[next]}</span>
      </span>
    </span>
  );
}

// ---- the composed logo --------------------------------------------------------
function LogoComposition({ s, geom }: { s: State; geom: ReturnType<typeof forgeBolt> }) {
  const col = effColors(s);
  const size = s.wordSize;
  const boltH = Math.round(size * s.boltScale);
  const boltW = Math.round(boltH * geom.ratio);
  const casing = (t: string) => (s.wordCase === "upper" ? t.toUpperCase() : s.wordCase === "lower" ? t.toLowerCase() : t);
  const ruleC1 = s.rulesFromBolt ? col.c1 : s.ruleC1;
  const ruleC2 = s.rulesFromBolt ? col.c2 : s.ruleC2;
  // effects: CSS filter chain + (sticker → force a slightly thicker white keyline)
  const fx = boltFx(s, col.c1, col.c2);
  const stickerKey = s.fxSticker > 0 ? "#FFFFFF" : col.key;
  const stickerOutline = s.bolt.outline + (s.fxSticker > 0 ? s.fxSticker * 1.6 : 0);
  // placement: offset + rotate about a pivot, per-side overlap, and depth (z vs the
  // letters). `?? 0` guards keep an older saved state (missing these keys) from NaN.
  const depthZ = s.boltDepth === "front" ? 3 : s.boltDepth === "back" ? 1 : 2;
  const num = (v: number | undefined, d: number) => (typeof v === "number" && !Number.isNaN(v) ? v : d);
  const mL = Math.round(size * (num(s.boltNudge, 0) + num(s.boltOverlapL, 0)));
  const mR = Math.round(size * (num(s.boltNudge, 0) + num(s.boltOverlapR, 0)));

  const boltEl = (
    <span style={{ display: "inline-block", position: "relative", zIndex: depthZ, width: boltW, height: boltH, verticalAlign: "baseline",
      transform: `translate(${num(s.boltOffX, 0)}px, ${Math.round(size * num(s.boltDrop, 0)) + num(s.boltOffY, 0)}px) rotate(${num(s.boltRotate, 0)}deg)`,
      transformOrigin: `${num(s.boltPivotX, 50)}% ${num(s.boltPivotY, 50)}%`, marginLeft: mL, marginRight: mR, filter: fx }}>
      <BoltSVG geom={geom} c1={col.c1} c2={col.c2} keyline={stickerKey} outline={stickerOutline} innerGlow={s.fxInner} />
    </span>
  );

  const letterSpan = (t: string) => <span style={{ position: "relative", zIndex: 2 }}>{casing(t)}</span>;
  const word = s.showWord && (
    <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: ff(s.wordFont), fontWeight: s.wordWeight, fontSize: size, lineHeight: 1, letterSpacing: `${s.wordSpacing}em`, color: col.ink }}>
      {letterSpan(s.prefix)}{boltEl}{letterSpan(s.suffix)}
    </span>
  );

  const acc = s.showAcc && (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.12), padding: `0 ${Math.round(size * 0.04)}px`, marginTop: Math.round(size * 0.1) }}>
      {s.rules && <span style={{ flex: 1, height: Math.max(2, Math.round(size * 0.03)), borderRadius: 2, background: ruleC1 }} />}
      <span style={{ fontFamily: ff(s.accFont), fontWeight: s.accWeight, fontSize: Math.round(size * s.accSize), letterSpacing: `${s.accTracking}em`, textTransform: "uppercase", color: col.ink, whiteSpace: "nowrap", paddingLeft: `${s.accTracking}em` }}>{s.accText}</span>
      {s.rules && <span style={{ flex: 1, height: Math.max(2, Math.round(size * 0.03)), borderRadius: 2, background: ruleC2 }} />}
    </div>
  );

  const slogan = s.showSlogan && (
    <div style={{ marginTop: Math.round(size * 0.16), fontFamily: ff(s.sloganFont), fontWeight: s.sloganWeight, fontSize: Math.round(size * s.sloganSize), color: col.ink, textAlign: "center", lineHeight: 1.3 }}>
      {s.sloganMode === "plain" ? (
        <div style={{ whiteSpace: "pre-line" }}>{s.plain}</div>
      ) : (
        <>
          <div style={{ opacity: 0.9 }}>{s.line1}</div>
          <div>
            {s.pre}
            <WordCycler words={s.cycle.split(",").map((w) => w.trim()).filter(Boolean)} ms={s.cycleMs} style={{ fontWeight: 800, color: col.c1 }} />
            {s.suf}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", filter: col.gray ? "grayscale(1)" : undefined }}>
      {word}
      {acc}
      {slogan}
    </div>
  );
}

// ---- small controls -----------------------------------------------------------
const lbl: CSSProperties = { fontSize: 11.5, color: "#aab", minWidth: 96, flex: "0 0 auto" };
const inp: CSSProperties = { background: "#0e131b", color: "#e7ecf3", border: "1px solid #2a3342", borderRadius: 6, padding: "5px 7px", fontSize: 12, width: "100%" };
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "7px 0" }}><span style={lbl}>{label}</span><span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>{children}</span></label>;
}
function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return <Row label={label}><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1, accentColor: "#FCA311" }} /><span style={{ fontSize: 11, color: "#8b96a6", width: 42, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt ? fmt(value) : value}</span></Row>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <Row label={label}><button onClick={() => onChange(!value)} style={{ ...inp, cursor: "pointer", width: "auto", padding: "4px 12px", background: value ? "#FCA31122" : "#0e131b", borderColor: value ? "#FCA311" : "#2a3342", color: value ? "#FCA311" : "#8b96a6", fontWeight: 700 }}>{value ? "ON" : "OFF"}</button></Row>;
}
function Sel({ label, value, options, onChange }: { label: string; value: string; options: { v: string; t: string }[]; onChange: (v: string) => void }) {
  return <Row label={label}><select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, cursor: "pointer" }}>{options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</select></Row>;
}
function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Row label={label}><input value={value} onChange={(e) => onChange(e.target.value)} style={inp} /></Row>;
}
function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <Row label={label}><input type="number" value={value} onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} style={{ ...inp, width: 100 }} /></Row>;
}
function Col({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Row label={label}><input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 34, height: 26, background: "none", border: "1px solid #2a3342", borderRadius: 6, cursor: "pointer" }} /><input value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, width: 84 }} /></Row>;
}
function FontSel({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Row label={label}><select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, cursor: "pointer", fontFamily: ff(value) }}>{FONTS.map((f) => <option key={f.n} value={f.n} style={{ fontFamily: ff(f.n) }}>{f.n}</option>)}</select></Row>;
}
function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [o, setO] = useState(open);
  return (
    <div style={{ borderTop: "1px solid #1c2330" }}>
      <button onClick={() => setO(!o)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#FCA311", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "12px 2px 8px", cursor: "pointer", display: "flex", justifyContent: "space-between" }}><span>{title}</span><span style={{ color: "#556" }}>{o ? "–" : "+"}</span></button>
      {o && <div style={{ paddingBottom: 10 }}>{children}</div>}
    </div>
  );
}

// ---- main --------------------------------------------------------------------
function LogoLab() {
  // Start from DEFAULTS (matches SSR), then load any saved state on the client to
  // avoid a hydration mismatch.
  const [s, setS] = useState<State>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const set = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }));
  const setBolt = (patch: Partial<BoltParams>) => setS((p) => ({ ...p, bolt: { ...p.bolt, ...patch } }));
  const setAssist = (patch: Partial<GeometryAssist>) => setS((p) => ({ ...p, assist: { ...p.assist, ...patch } }));
  const [playKey, setPlayKey] = useState(0);
  const [toast, setToast] = useState("");

  // ---- GEOMETRY EDITOR state (undo/redo + vertex editing) ---------------------
  type GSnap = { bolt: BoltParams; assist: GeometryAssist; manual: Record<number, [number, number]>; baseFrozen: [number, number][] | null; outerEdit: [number, number][] | null; seamEdit: [number, number][] | null };
  const [undoStack, setUndoStack] = useState<GSnap[]>([]);
  const [redoStack, setRedoStack] = useState<GSnap[]>([]);
  const takeSnap = (): GSnap => ({ bolt: s.bolt, assist: s.assist, manual: s.manual, baseFrozen: s.baseFrozen, outerEdit: s.outerEdit, seamEdit: s.seamEdit });
  const pushUndo = () => { setUndoStack((u) => [...u.slice(-49), takeSnap()]); setRedoStack([]); };
  const undo = () => { if (!undoStack.length) return; const prev = undoStack[undoStack.length - 1]; setRedoStack((r) => [...r, takeSnap()]); setUndoStack((u) => u.slice(0, -1)); setS((st) => ({ ...st, ...prev })); };
  const redo = () => { if (!redoStack.length) return; const nxt = redoStack[redoStack.length - 1]; setUndoStack((u) => [...u, takeSnap()]); setRedoStack((r) => r.slice(0, -1)); setS((st) => ({ ...st, ...nxt })); };
  const [editMode, setEditMode] = useState(false);
  const [selVert, setSelVert] = useState<number | null>(null);
  const [refEdge, setRefEdge] = useState<number | null>(null);
  const [cleanupStr, setCleanupStr] = useState(0.5);
  const [angleFams, setAngleFams] = useState<{ angle: number; count: number }[] | null>(null);
  const editSvgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ i: number; raf: number } | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(LS); if (raw) { const j = JSON.parse(raw); setS({ ...DEFAULTS, ...j, bolt: { ...DEFAULT_BOLT, ...(j.bolt ?? {}) } }); } } catch { /* noop */ }
    setLoaded(true);
  }, []);

  // load fonts once
  useEffect(() => {
    const id = "logo-lab-fonts";
    if (!document.getElementById(id)) {
      const l = document.createElement("link"); l.id = id; l.rel = "stylesheet"; l.href = fontsHref(); document.head.appendChild(l);
    }
    if (!document.getElementById("logo-lab-anim")) {
      const st = document.createElement("style"); st.id = "logo-lab-anim";
      st.textContent = `@keyframes ll-strike{0%{opacity:0;transform:scale(1.35) rotate(-7deg)}45%{opacity:1}60%{transform:scale(.97) rotate(1deg)}100%{opacity:1;transform:none}}@keyframes ll-pop{0%{opacity:0;transform:scale(.6)}70%{transform:scale(1.06)}100%{opacity:1;transform:none}}@keyframes ll-fadeup{0%{opacity:0;transform:translateY(26px)}100%{opacity:1;transform:none}}@keyframes ll-wipe{0%{clip-path:inset(0 0 100% 0)}100%{clip-path:inset(0 0 0 0)}}`;
      document.head.appendChild(st);
    }
  }, []);

  // AUTOSAVE — debounced so a vertex drag (setS ~60/s) coalesces into one write, and
  // quota-safe: if a large trace-reference dataURL overflows localStorage, retry WITHOUT
  // refImg so geometry edits still persist (the image is just re-loaded next session).
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      try { localStorage.setItem(LS, JSON.stringify(s)); }
      catch { try { localStorage.setItem(LS, JSON.stringify({ ...s, refImg: "" })); } catch { /* noop */ } }
    }, 150);
    return () => clearTimeout(id);
  }, [s, loaded]);

  // GEOMETRY PIPELINE (Lee's editor). Each ring is either PROCEDURAL (base → assist,
  // plus legacy manual offsets for the outer) or EXPLICIT (a hand-edited point list in
  // outerEdit / seamEdit that wins outright — this is what add / remove vertices and free
  // seam editing write to). null override ⇒ the procedural path, so saved logos + the
  // default bolt are byte-identical (outerEdit / seamEdit both null).
  const base = useMemo(() => forgeBolt(s.bolt), [s.bolt]);
  const baseOuter = useMemo(() => (s.baseFrozen ?? base.outerPts).map(toV), [s.baseFrozen, base]);
  const assistedOuter = useMemo(() => applyAssist(baseOuter, s.assist), [baseOuter, s.assist]);
  const assistedSeam = useMemo(() => applyAssist(base.seamPts.map(toV), s.assist), [base, s.assist]);
  const geom = useMemo(() => {
    const finalOuter = s.outerEdit ? s.outerEdit.map(toV) : assistedOuter.map((v, i) => { const m = s.manual[i]; return m ? { x: v.x + m[0], y: v.y + m[1] } : v; });
    const finalSeam = s.seamEdit ? s.seamEdit.map(toV) : assistedSeam;
    const b = bounds([...finalOuter, ...finalSeam]);
    const pad = s.bolt.outline / 2 + 2;
    const vx = b.minX - pad, vy = b.minY - pad, w = b.maxX - b.minX + 2 * pad, h = b.maxY - b.minY + 2 * pad;
    return { outer: ptsToPath(finalOuter), seam: ptsToPath(finalSeam), viewBox: `${vx.toFixed(2)} ${vy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`, ratio: w / h, outerPts: finalOuter.map(toPt) as [number, number][], seamPts: finalSeam.map(toPt) as [number, number][], finalOuter, finalSeam };
  }, [assistedOuter, assistedSeam, s.outerEdit, s.seamEdit, s.manual, s.bolt.outline]);
  const col = effColors(s);

  // ---- geometry operations (undoable). All edits act on the ACTIVE ring (border/outer
  //      OR seam) as an EXPLICIT point list: reading the current ring, writing the whole
  //      list back to outerEdit / seamEdit. Touching a still-procedural ring materialises
  //      it (its current computed points become the explicit list — nothing is lost). ----
  const activeRingPts = (): V[] => (s.editRing === "seam" ? geom.finalSeam : geom.finalOuter);
  const writeActive = (pts: V[], record = true) => {
    if (record) pushUndo();
    const arr = pts.map((v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100] as [number, number]);
    setS((st) => (st.editRing === "seam" ? { ...st, seamEdit: arr } : { ...st, outerEdit: arr }));
  };
  const setEditRing = (r: "outer" | "seam") => { setS((st) => ({ ...st, editRing: r })); setSelVert(null); setRefEdge(null); };
  // symmetry / cleanup ops now run on whichever ring is active (so the seam can be
  // squared up independently of the border).
  const applyGeomOp = (fn: (pts: V[]) => V[]) => { pushUndo(); writeActive(fn(activeRingPts()), false); };
  // resets: clear hand-edits on the ACTIVE ring back to generated, or wipe everything.
  const resetRing = () => { pushUndo(); setS((st) => (st.editRing === "seam" ? { ...st, seamEdit: null } : { ...st, outerEdit: null, manual: {} })); setSelVert(null); setRefEdge(null); };
  const resetManual = () => { pushUndo(); setS((st) => ({ ...st, manual: {}, outerEdit: null, seamEdit: null, baseFrozen: null })); setSelVert(null); setRefEdge(null); };
  // BAKE — freeze the CURRENT appearance of BOTH rings and neutralise assist, so the
  // frozen (already-assist-transformed) points aren't re-assisted on the next render
  // (which used to double-apply a non-neutral assist and distort the shape).
  const bakeManual = () => { pushUndo(); setS((st) => ({ ...st, baseFrozen: geom.outerPts, seamEdit: geom.seamPts, manual: {}, outerEdit: null, assist: { ...DEFAULT_ASSIST } })); setToast("Baked current shape"); setTimeout(() => setToast(""), 1400); };
  const unbake = () => { pushUndo(); setS((st) => ({ ...st, baseFrozen: null })); };
  // move vertex i of the active ring to absolute (x,y).
  const setVertexAbs = (i: number, x: number, y: number, record = true) => { const pts = activeRingPts().slice(); if (i < 0 || i >= pts.length) return; pts[i] = { x, y }; writeActive(pts, record); };
  const nudgeVert = (i: number, dx: number, dy: number) => { const v = activeRingPts()[i]; if (v) setVertexAbs(i, v.x + dx, v.y + dy); };
  const nn = () => activeRingPts().length;
  // ADD / REMOVE (Lee) — insert a vertex on an edge (splice) or delete the selected one.
  const insertVertexOnEdge = (i: number, at?: V) => {
    const pts = activeRingPts(); const n = pts.length; if (i < 0 || i >= n) return; const a = pts[i], b = pts[(i + 1) % n];
    let p: V;
    if (at) { const dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (dx * dx + dy * dy || 1))); p = { x: a.x + dx * t, y: a.y + dy * t }; }
    else p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const next = pts.slice(); next.splice(i + 1, 0, p); writeActive(next); setSelVert(i + 1); setRefEdge(null);
  };
  const addVertex = () => { const i = selVert != null ? selVert : refEdge != null ? refEdge : 0; insertVertexOnEdge(i); };
  const removeVertex = (i: number) => { const pts = activeRingPts(); if (pts.length <= 3) { setToast("Need at least 3 points"); setTimeout(() => setToast(""), 1200); return; } writeActive(pts.filter((_, k) => k !== i)); setSelVert(null); setRefEdge(null); };
  const alignVert = (i: number, mode: "hp" | "hn" | "vp" | "vn") => {
    const p = activeRingPts(); const n = p.length, v = p[i], prev = p[(i - 1 + n) % n], next = p[(i + 1) % n];
    if (mode === "hp") setVertexAbs(i, v.x, prev.y); else if (mode === "hn") setVertexAbs(i, v.x, next.y);
    else if (mode === "vp") setVertexAbs(i, prev.x, v.y); else setVertexAbs(i, next.x, v.y);
  };
  const makeParallel = (i: number, which: "in" | "out") => {
    if (refEdge == null) return; const p = activeRingPts(); const n = p.length; if (refEdge >= n || i >= n) return;
    const ra = p[refEdge], rb = p[(refEdge + 1) % n];
    const ang = Math.atan2(rb.y - ra.y, rb.x - ra.x), v = p[i];
    if (which === "out") { const b = p[(i + 1) % n]; const len = Math.hypot(b.x - v.x, b.y - v.y); setVertexAbs((i + 1) % n, v.x + Math.cos(ang) * len, v.y + Math.sin(ang) * len); }
    else { const a = p[(i - 1 + n) % n]; const len = Math.hypot(v.x - a.x, v.y - a.y); setVertexAbs(i, a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len); }
  };
  const mirrorVert = (i: number, mode: "v" | "h") => { const p = activeRingPts(); const b = bounds(p), v = p[i]; setVertexAbs(i, mode === "h" ? 2 * b.cx - v.x : v.x, mode === "v" ? 2 * b.cy - v.y : v.y); };
  // numeric edge angle/length editing — rotate/scale the connected edge around vertex i.
  const setEdge = (i: number, which: "in" | "out", kind: "angle" | "len", val: number) => {
    pushUndo(); const p = activeRingPts(); const n = p.length, v = p[i];
    if (which === "out") {
      const b = p[(i + 1) % n]; const cur = Math.hypot(b.x - v.x, b.y - v.y), curA = Math.atan2(b.y - v.y, b.x - v.x);
      const ang = kind === "angle" ? val * Math.PI / 180 : curA, len = kind === "len" ? val : cur;
      setVertexAbs((i + 1) % n, v.x + Math.cos(ang) * len, v.y + Math.sin(ang) * len, false);
    } else {
      const a = p[(i - 1 + n) % n]; const cur = Math.hypot(v.x - a.x, v.y - a.y), curA = Math.atan2(v.y - a.y, v.x - a.x);
      const ang = kind === "angle" ? val * Math.PI / 180 : curA, len = kind === "len" ? val : cur;
      setVertexAbs(i, a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len, false);
    }
  };
  // client → SVG coords for the edit overlay.
  const clientToSvg = (cx: number, cy: number): V | null => {
    const svg = editSvgRef.current; if (!svg) return null;
    const m = svg.getScreenCTM(); if (!m) return null;
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy; const l = p.matrixTransform(m.inverse());
    return { x: l.x, y: l.y };
  };
  const startVertexDrag = (i: number, ev: React.PointerEvent) => {
    ev.stopPropagation(); ev.preventDefault();
    setSelVert(i);
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    let pushed = false; // a pure select-click (no move) must NOT push an undo / wipe the redo stack
    const move = (e: PointerEvent) => {
      if (!pushed) { pushUndo(); pushed = true; }
      if (dragRef.current?.raf) cancelAnimationFrame(dragRef.current.raf);
      const raf = requestAnimationFrame(() => { const loc = clientToSvg(e.clientX, e.clientY); if (loc) setVertexAbs(i, loc.x, loc.y, false); });
      dragRef.current = { i, raf };
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (dragRef.current?.raf) cancelAnimationFrame(dragRef.current.raf); dragRef.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  // Keep the selection VALID: after an undo (or any op that shrinks the active ring), a
  // stale-high selVert / refEdge would crash add-vertex / make-parallel — clamp both.
  const activeLen = s.editRing === "seam" ? geom.finalSeam.length : geom.finalOuter.length;
  useEffect(() => {
    setSelVert((v) => (v != null && v >= activeLen ? null : v));
    setRefEdge((e) => (e != null && e >= activeLen ? null : e));
  }, [activeLen]);
  // keyboard nudging of the selected vertex while editing.
  useEffect(() => {
    if (!editMode || selVert == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (dragRef.current) return; // a vertex drag is in progress — don't mutate the ring from the keyboard
      if (e.key === "Escape") { setSelVert(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeVertex(selVert); return; } // remove the selected vertex
      const step = e.shiftKey ? 5 : e.altKey ? 0.25 : 1;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) { e.preventDefault(); nudgeVert(selVert, d[e.key][0], d[e.key][1]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selVert, s.editRing, geom.finalOuter, geom.finalSeam]);

  const copy = (text: string, msg: string) => { navigator.clipboard?.writeText(text).then(() => { setToast(msg); setTimeout(() => setToast(""), 1600); }); };
  const boltSvg = `<svg viewBox="${geom.viewBox}" xmlns="http://www.w3.org/2000/svg"><path d="${geom.outer}" fill="${col.c1}"${col.key !== "none" ? ` stroke="${col.key}" stroke-width="${s.bolt.outline}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"` : ""}/>${col.c1.toLowerCase() !== col.c2.toLowerCase() ? `<path d="${geom.seam}" fill="${col.c2}"/>` : ""}</svg>`;
  const brandPaths = `// paste into brand.tsx forgeBolt call, or as static paths:\nexport const BOLT_PARAMS = ${JSON.stringify(s.bolt)};\n// BOLT_OUTER:\n"${geom.outer}"\n// BOLT_RIGHT (seam):\n"${geom.seam}"\n// BOLT_VIEWBOX: "${geom.viewBox}"  ratio ${geom.ratio.toFixed(4)}`;

  const anim: CSSProperties = s.entrance === "none" ? {} : { animation: `ll-${s.entrance} ${s.animMs}ms cubic-bezier(.5,.1,.2,1) both` };

  const colourways = [...BOLT_PRESETS, ...SEC_SCHOOLS];
  const stageBg = s.bg === "transparent"
    ? { backgroundImage: "linear-gradient(45deg,#20262f 25%,transparent 25%),linear-gradient(-45deg,#20262f 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#20262f 75%),linear-gradient(-45deg,transparent 75%,#20262f 75%)", backgroundSize: "24px 24px", backgroundPosition: "0 0,0 12px,12px -12px,-12px 0", backgroundColor: "#171b22" }
    : { background: col.bgHex };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#0b0e14", color: "#e7ecf3", fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* control panel */}
      <div style={{ width: 360, flex: "0 0 360px", height: "100vh", overflowY: "auto", borderRight: "1px solid #1c2330", padding: "16px 16px 60px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Logo Lab <span style={{ color: "#FCA311" }}>workshop</span></h1>
          <button onClick={() => { if (confirm("Reset all controls to defaults?")) setS(DEFAULTS); }} style={{ ...inp, width: "auto", cursor: "pointer", color: "#8b96a6" }}>Reset</button>
        </div>
        <p style={{ fontSize: 11, color: "#67707e", margin: "6px 0 4px" }}>Dial the bolt, fonts, colours, slogan & animation. Auto-saves.</p>

        <Section title="Bolt geometry">
          <Row label="Style"><select onChange={(e) => { const pr = BOLT_STYLE_PRESETS.find((x) => x.id === e.target.value); if (pr) setBolt(pr.params); }} value="" style={{ ...inp, cursor: "pointer" }}><option value="">Presets…</option>{BOLT_STYLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Row>
          <Slider label="Teeth / side" value={s.bolt.teeth} min={3} max={8} step={1} onChange={(v) => setBolt({ teeth: v })} />
          <Slider label="Lean" value={s.bolt.lean} min={0} max={0.6} step={0.01} onChange={(v) => setBolt({ lean: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Core width" value={s.bolt.coreWidth} min={6} max={22} step={0.5} onChange={(v) => setBolt({ coreWidth: v })} />
          <Slider label="Tooth length" value={s.bolt.toothLen} min={4} max={26} step={0.5} onChange={(v) => setBolt({ toothLen: v })} />
          <Slider label="Taper" value={s.bolt.taper} min={0} max={1} step={0.02} onChange={(v) => setBolt({ taper: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Shoulder" value={s.bolt.shoulder} min={0} max={20} step={0.5} onChange={(v) => setBolt({ shoulder: v })} />
          <Slider label="Notch depth" value={s.bolt.notch} min={0} max={16} step={0.5} onChange={(v) => setBolt({ notch: v })} />
          <Slider label="Barb drop" value={s.bolt.drop} min={0.4} max={0.95} step={0.01} onChange={(v) => setBolt({ drop: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Tail" value={s.bolt.tail} min={0} max={30} step={1} onChange={(v) => setBolt({ tail: v })} />
          <Slider label="Jitter (hand-drawn)" value={s.bolt.jitter} min={0} max={0.9} step={0.02} onChange={(v) => setBolt({ jitter: v })} fmt={(v) => v.toFixed(2)} />
          <Row label="Seed"><input type="range" min={1} max={40} step={1} value={s.bolt.seed} onChange={(e) => setBolt({ seed: parseFloat(e.target.value) })} style={{ flex: 1, accentColor: "#FCA311" }} /><button onClick={() => setBolt({ seed: (s.bolt.seed % 40) + 1 })} style={{ ...inp, width: "auto", cursor: "pointer" }}>Reshuffle</button></Row>
          <Slider label="Seam zigzag" value={s.bolt.seamAmp} min={0} max={16} step={0.5} onChange={(v) => setBolt({ seamAmp: v })} />
          <Slider label="Outline" value={s.bolt.outline} min={0} max={16} step={0.5} onChange={(v) => setBolt({ outline: v })} />
        </Section>

        <Section title="Bolt profile" open={false}>
          <Slider label="Width" value={s.bolt.width} min={0.5} max={1.8} step={0.02} onChange={(v) => setBolt({ width: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Height" value={s.bolt.height} min={0.5} max={1.8} step={0.02} onChange={(v) => setBolt({ height: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Spine curve" value={s.bolt.spineCurve} min={-24} max={24} step={1} onChange={(v) => setBolt({ spineCurve: v })} />
          <Slider label="Top taper" value={s.bolt.topTaper} min={0} max={0.8} step={0.02} onChange={(v) => setBolt({ topTaper: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Bottom taper" value={s.bolt.botTaper} min={0} max={0.8} step={0.02} onChange={(v) => setBolt({ botTaper: v })} fmt={(v) => v.toFixed(2)} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#5c6675", margin: "8px 0 2px" }}>LEFT FLANK</div>
          <Slider label="Length ×" value={s.bolt.lenL} min={0.3} max={1.8} step={0.02} onChange={(v) => setBolt({ lenL: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Taper" value={s.bolt.taperL ?? s.bolt.taper} min={0} max={1} step={0.02} onChange={(v) => setBolt({ taperL: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Jaggedness" value={s.bolt.jagL} min={0} max={2} step={0.05} onChange={(v) => setBolt({ jagL: v })} fmt={(v) => v.toFixed(2)} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#5c6675", margin: "8px 0 2px" }}>RIGHT FLANK</div>
          <Slider label="Length ×" value={s.bolt.lenR} min={0.3} max={1.8} step={0.02} onChange={(v) => setBolt({ lenR: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Taper" value={s.bolt.taperR ?? s.bolt.taper} min={0} max={1} step={0.02} onChange={(v) => setBolt({ taperR: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Jaggedness" value={s.bolt.jagR} min={0} max={2} step={0.05} onChange={(v) => setBolt({ jagR: v })} fmt={(v) => v.toFixed(2)} />
        </Section>

        <Section title="Per-tooth sizing" open={false}>
          <div style={{ fontSize: 10.5, color: "#67707e", margin: "2px 0 6px" }}>Length of each tooth (top → bottom).</div>
          {Array.from({ length: s.bolt.teeth }, (_, k) => (
            <Slider key={k} label={`Tooth ${k + 1}`} value={s.bolt.toothProfile?.[k] ?? 1} min={0.2} max={1.8} step={0.05} onChange={(v) => setBolt({ toothProfile: Array.from({ length: s.bolt.teeth }, (_, i) => (i === k ? v : (s.bolt.toothProfile?.[i] ?? 1))) })} fmt={(x) => x.toFixed(2)} />
          ))}
          <Row label=""><button onClick={() => setBolt({ toothProfile: undefined })} style={{ ...inp, cursor: "pointer" }}>Reset all teeth</button></Row>
        </Section>

        <Section title="Organic randomness" open={false}>
          <div style={{ fontSize: 10.5, color: "#67707e", margin: "2px 0 6px" }}>Length var + seed live under Bolt geometry.</div>
          <Slider label="Angle var" value={s.bolt.jitAngle} min={0} max={0.8} step={0.02} onChange={(v) => setBolt({ jitAngle: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Width var" value={s.bolt.jitWidth} min={0} max={0.8} step={0.02} onChange={(v) => setBolt({ jitWidth: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Hand-drawn" value={s.bolt.handDrawn} min={0} max={0.8} step={0.02} onChange={(v) => setBolt({ handDrawn: v })} fmt={(v) => v.toFixed(2)} />
        </Section>

        <Section title="Geometry assist" open={false}>
          <div style={{ fontSize: 10.5, color: "#67707e", margin: "2px 0 6px" }}>Refine the shape — all neutral at 0%, so the current bolt is unchanged.</div>
          <Slider label="Vertical sym" value={s.assist.vSym} min={0} max={1} step={0.02} onChange={(v) => setAssist({ vSym: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle label="Reverse mirror" value={s.assist.vSymReverse} onChange={(v) => setAssist({ vSymReverse: v })} />
          <Slider label="Horizontal sym" value={s.assist.hSym} min={0} max={1} step={0.02} onChange={(v) => setAssist({ hSym: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Parallelism" value={s.assist.parallel} min={0} max={1} step={0.02} onChange={(v) => setAssist({ parallel: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Angle consistency" value={s.assist.angleConsist} min={0} max={1} step={0.02} onChange={(v) => setAssist({ angleConsist: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Edge straightness" value={s.assist.straighten} min={0} max={1} step={0.02} onChange={(v) => setAssist({ straighten: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Tooth rhythm" value={s.assist.rhythm} min={0} max={1} step={0.02} onChange={(v) => setAssist({ rhythm: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Optical balance" value={s.assist.optical} min={0} max={1} step={0.02} onChange={(v) => setAssist({ optical: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Section>

        <Section title="Angle snap" open={false}>
          <Sel label="Snap" value={s.assist.snap} options={[{ v: "off", t: "Off" }, { v: "5", t: "5°" }, { v: "7.5", t: "7.5°" }, { v: "10", t: "10°" }, { v: "15", t: "15°" }, { v: "22.5", t: "22.5°" }, { v: "30", t: "30°" }, { v: "custom", t: "Custom" }]} onChange={(v) => setAssist({ snap: v })} />
          <Slider label="Strength" value={s.assist.snapStrength} min={0} max={1} step={0.02} onChange={(v) => setAssist({ snapStrength: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
          {s.assist.snap === "custom" && <Text label="Families°" value={s.assist.customFamilies.join(", ")} onChange={(v) => setAssist({ customFamilies: v.split(",").map((x) => parseFloat(x.trim())).filter((x) => !Number.isNaN(x)) })} />}
          <Row label=""><button onClick={() => setAngleFams(analyzeAngles(activeRingPts()))} style={{ ...inp, cursor: "pointer" }}>Analyze current angles</button></Row>
          {angleFams && <div style={{ fontSize: 11, color: "#8b96a6", margin: "4px 0", lineHeight: 1.5 }}>{angleFams.slice(0, 8).map((f) => `${f.angle}°×${f.count}`).join("  ")}<button onClick={() => setAssist({ snap: "custom", customFamilies: angleFams.map((f) => f.angle) })} style={{ ...inp, width: "auto", cursor: "pointer", marginLeft: 8, color: "#FCA311" }}>Adopt</button></div>}
        </Section>

        <Section title="Vertex edit" open={false}>
          <Toggle label="Edit vertices" value={editMode} onChange={(v) => { setEditMode(v); if (!v) { setSelVert(null); setRefEdge(null); } }} />
          {editMode && (<>
            {/* WHICH RING the vertex tool edits — border (red outer) or seam (blue). Each
                is independently editable so the seam stops drifting out of the border. */}
            <Row label="Editing">
              <div style={{ display: "flex", gap: 5, width: "100%" }}>
                {(["outer", "seam"] as const).map((r) => (
                  <button key={r} onClick={() => setEditRing(r)} style={{ ...inp, cursor: "pointer", flex: 1, background: s.editRing === r ? "#FCA31122" : "#0e131b", borderColor: s.editRing === r ? "#FCA311" : "#2a3342", color: s.editRing === r ? "#FCA311" : "#8b96a6", fontWeight: 700 }}>{r === "outer" ? "Border" : "Seam"}</button>
                ))}
              </div>
            </Row>
            <div style={{ fontSize: 10.5, color: "#67707e", margin: "2px 0 6px" }}>Editing the <b style={{ color: s.editRing === "outer" ? "#E0284A" : "#4FA3E3" }}>{s.editRing === "outer" ? "red border" : "blue seam"}</b> ({nn()} pts). Click a vertex to select · drag to move · arrows nudge (Shift 5 · Alt .25) · double-click an edge to add a point · Delete removes · Esc deselects. Click an edge to set the parallel reference.</div>
            <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
              <button onClick={addVertex} style={{ ...inp, cursor: "pointer", flex: 1 }}>＋ Add vertex</button>
              <button onClick={() => selVert != null && removeVertex(selVert)} disabled={selVert == null} style={{ ...inp, cursor: "pointer", flex: 1, opacity: selVert == null ? 0.4 : 1 }}>－ Remove</button>
              <button onClick={resetRing} style={{ ...inp, cursor: "pointer", flex: 1 }}>Reset ring</button>
            </div>
            {selVert != null && (() => {
              const p = activeRingPts(); const n = p.length; if (selVert >= n) return null;
              const v = p[selVert], prev = p[(selVert - 1 + n) % n], next = p[(selVert + 1) % n];
              const r1n = (x: number) => Math.round(x * 10) / 10;
              const inA = r1n(Math.atan2(v.y - prev.y, v.x - prev.x) * 180 / Math.PI), outA = r1n(Math.atan2(next.y - v.y, next.x - v.x) * 180 / Math.PI);
              const inL = r1n(Math.hypot(v.x - prev.x, v.y - prev.y)), outL = r1n(Math.hypot(next.x - v.x, next.y - v.y));
              return (<>
                <Row label={`Vertex ${selVert + 1}/${n}`}><span style={{ fontSize: 11, color: refEdge != null ? "#3BF5A0" : "#8b96a6" }}>{refEdge != null ? `ref edge ${refEdge + 1}` : "no ref edge"}</span></Row>
                <Num label="X" value={r1n(v.x)} onChange={(x) => setVertexAbs(selVert, x, v.y)} />
                <Num label="Y" value={r1n(v.y)} onChange={(y) => setVertexAbs(selVert, v.x, y)} />
                <Num label="In angle°" value={inA} onChange={(a) => setEdge(selVert, "in", "angle", a)} />
                <Num label="Out angle°" value={outA} onChange={(a) => setEdge(selVert, "out", "angle", a)} />
                <Num label="In length" value={inL} onChange={(l) => setEdge(selVert, "in", "len", l)} />
                <Num label="Out length" value={outL} onChange={(l) => setEdge(selVert, "out", "len", l)} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 6 }}>
                  <button onClick={() => alignVert(selVert, "hp")} style={{ ...inp, cursor: "pointer" }}>Align H ‹prev</button>
                  <button onClick={() => alignVert(selVert, "hn")} style={{ ...inp, cursor: "pointer" }}>Align H next›</button>
                  <button onClick={() => alignVert(selVert, "vp")} style={{ ...inp, cursor: "pointer" }}>Align V ‹prev</button>
                  <button onClick={() => alignVert(selVert, "vn")} style={{ ...inp, cursor: "pointer" }}>Align V next›</button>
                  <button onClick={() => makeParallel(selVert, "in")} disabled={refEdge == null} style={{ ...inp, cursor: "pointer", opacity: refEdge == null ? 0.4 : 1 }}>‖ in edge</button>
                  <button onClick={() => makeParallel(selVert, "out")} disabled={refEdge == null} style={{ ...inp, cursor: "pointer", opacity: refEdge == null ? 0.4 : 1 }}>‖ out edge</button>
                  <button onClick={() => mirrorVert(selVert, "v")} style={{ ...inp, cursor: "pointer" }}>Mirror V</button>
                  <button onClick={() => mirrorVert(selVert, "h")} style={{ ...inp, cursor: "pointer" }}>Mirror H</button>
                </div>
              </>);
            })()}
          </>)}
        </Section>

        <Section title="Geometry ops" open={false}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={undo} disabled={!undoStack.length} style={{ ...inp, cursor: "pointer", flex: 1, opacity: undoStack.length ? 1 : 0.4 }}>↶ Undo</button>
            <button onClick={redo} disabled={!redoStack.length} style={{ ...inp, cursor: "pointer", flex: 1, opacity: redoStack.length ? 1 : 0.4 }}>↷ Redo</button>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#5c6675", margin: "8px 0 3px" }}>SYMMETRY</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <button onClick={() => applyGeomOp((p) => mirrorHalf(p, "v", true))} style={{ ...inp, cursor: "pointer" }}>Mirror top→bot</button>
            <button onClick={() => applyGeomOp((p) => mirrorHalf(p, "v", false))} style={{ ...inp, cursor: "pointer" }}>Mirror bot→top</button>
            <button onClick={() => applyGeomOp((p) => mirrorHalf(p, "h", true))} style={{ ...inp, cursor: "pointer" }}>Mirror left→right</button>
            <button onClick={() => applyGeomOp((p) => mirrorHalf(p, "h", false))} style={{ ...inp, cursor: "pointer" }}>Mirror right→left</button>
            <button onClick={() => applyGeomOp((p) => averageAxis(p, "v"))} style={{ ...inp, cursor: "pointer" }}>Avg top/bot</button>
            <button onClick={() => applyGeomOp((p) => averageAxis(p, "h"))} style={{ ...inp, cursor: "pointer" }}>Avg left/right</button>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#5c6675", margin: "8px 0 3px" }}>CLEANUP</div>
          <Slider label="Strength" value={cleanupStr} min={0} max={1} step={0.05} onChange={setCleanupStr} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Row label=""><button onClick={() => applyGeomOp((p) => cleanupGeometry(p, cleanupStr))} style={{ ...inp, cursor: "pointer", background: "#FCA31122", borderColor: "#FCA311", color: "#FCA311", fontWeight: 800 }}>Clean up geometry</button></Row>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={resetManual} style={{ ...inp, cursor: "pointer", flex: 1 }}>Reset all edits</button>
            {s.baseFrozen ? <button onClick={unbake} style={{ ...inp, cursor: "pointer", flex: 1 }}>Unbake</button> : <button onClick={bakeManual} style={{ ...inp, cursor: "pointer", flex: 1 }}>Bake border</button>}
          </div>
        </Section>

        <Section title="Reference & distance" open={false}>
          <Row label="Reference"><input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => set({ refImg: String(r.result), refOn: true }); r.readAsDataURL(f); } }} style={{ ...inp, cursor: "pointer" }} /></Row>
          {s.refImg && <>
            <Toggle label="Overlay" value={s.refOn} onChange={(v) => set({ refOn: v })} />
            <Slider label="Opacity" value={s.refOpacity} min={0} max={1} step={0.05} onChange={(v) => set({ refOpacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Scale" value={s.refScale} min={0.2} max={3} step={0.05} onChange={(v) => set({ refScale: v })} fmt={(v) => v.toFixed(2)} />
            <Slider label="Ref X" value={s.refX} min={-400} max={400} step={2} onChange={(v) => set({ refX: v })} />
            <Slider label="Ref Y" value={s.refY} min={-400} max={400} step={2} onChange={(v) => set({ refY: v })} />
            <Toggle label="Side by side" value={s.refSide} onChange={(v) => set({ refSide: v })} />
            <Toggle label="Outline compare" value={s.refOutline} onChange={(v) => set({ refOutline: v })} />
          </>}
          <div style={{ fontSize: 10.5, color: "#67707e", margin: "6px 0 2px" }}>Reference is a visual guide only — never traced or imported.</div>
          <Sel label="Distance test" value={s.dist} options={[{ v: "full", t: "Full" }, { v: "25", t: "25%" }, { v: "10", t: "10%" }, { v: "64", t: "64 px" }, { v: "32", t: "32 px" }, { v: "16", t: "16 px favicon" }]} onChange={(v) => set({ dist: v })} />
        </Section>

        <Section title="Effects" open={false}>
          <div style={{ fontSize: 10.5, color: "#67707e", margin: "2px 0 6px" }}>Subtle; 0 = off. (Glow lives under Colours &amp; finish.)</div>
          <Slider label="Inner glow" value={s.fxInner} min={0} max={8} step={0.5} onChange={(v) => set({ fxInner: v })} />
          <Slider label="Shadow" value={s.fxShadow} min={0} max={12} step={0.5} onChange={(v) => set({ fxShadow: v })} />
          <Slider label="Emboss" value={s.fxEmboss} min={0} max={6} step={0.5} onChange={(v) => set({ fxEmboss: v })} />
          <Slider label="Sticker outline" value={s.fxSticker} min={0} max={8} step={0.5} onChange={(v) => set({ fxSticker: v })} />
          <Slider label="Vintage print" value={s.fxVintage} min={0} max={6} step={0.5} onChange={(v) => set({ fxVintage: v })} />
          <Slider label="Ink print" value={s.fxInk} min={0} max={6} step={0.5} onChange={(v) => set({ fxInk: v })} />
        </Section>

        <Section title="Colours & finish">
          <Sel label="Mode" value={s.inkMode} options={[{ v: "color", t: "Colour" }, { v: "mono", t: "Monochrome" }, { v: "grayscale", t: "Grayscale" }, { v: "white", t: "All white" }, { v: "black", t: "All black" }]} onChange={(v) => set({ inkMode: v as InkMode })} />
          {s.inkMode === "mono" && <Col label="Mono colour" value={s.monoColor} onChange={(v) => set({ monoColor: v })} />}
          {(s.inkMode === "color" || s.inkMode === "grayscale") && <>
            <Sel label="Colourway" value={s.colourway} options={[...colourways.map((o) => ({ v: o.id, t: o.name })), { v: "custom", t: "Custom" }]} onChange={(v) => { if (v === "custom") { set({ colourway: v }); } else { const o = boltColorById(v); set({ colourway: v, c1: o.c1, c2: o.c2 }); } }} />
            <Col label="Bolt left (c1)" value={s.c1} onChange={(v) => set({ c1: v, colourway: "custom" })} />
            <Col label="Bolt right (c2)" value={s.c2} onChange={(v) => set({ c2: v, colourway: "custom" })} />
            <Sel label="Keyline" value={s.keyline} options={[{ v: "white", t: "White" }, { v: "black", t: "Black" }, { v: "none", t: "None" }, { v: "custom", t: "Custom" }]} onChange={(v) => set({ keyline: v as State["keyline"] })} />
            {s.keyline === "custom" && <Col label="Keyline colour" value={s.keylineCustom} onChange={(v) => set({ keylineCustom: v })} />}
            <Col label="Text colour" value={s.textColor || "#F4EFE6"} onChange={(v) => set({ textColor: v })} />
          </>}
          <Slider label="Glow" value={s.glow} min={0} max={40} step={1} onChange={(v) => set({ glow: v })} />
        </Section>

        <Section title="Background">
          <Sel label="Backdrop" value={s.bg} options={[{ v: "black", t: "Black" }, { v: "white", t: "White" }, { v: "navy", t: "Navy" }, { v: "transparent", t: "Transparent" }, { v: "custom", t: "Custom" }]} onChange={(v) => set({ bg: v as BgKind })} />
          {s.bg === "custom" && <Col label="Colour" value={s.bgCustom} onChange={(v) => set({ bgCustom: v })} />}
        </Section>

        <Section title="Wordmark">
          <Toggle label="Show" value={s.showWord} onChange={(v) => set({ showWord: v })} />
          <FontSel label="Font" value={s.wordFont} onChange={(v) => set({ wordFont: v, wordWeight: (FONT_BY[v]?.w.slice(-1)[0]) ?? 700 })} />
          <Sel label="Weight" value={String(s.wordWeight)} options={(FONT_BY[s.wordFont]?.w ?? [400, 700]).map((w) => ({ v: String(w), t: String(w) }))} onChange={(v) => set({ wordWeight: parseInt(v) })} />
          <Sel label="Case" value={s.wordCase} options={[{ v: "lower", t: "lowercase" }, { v: "upper", t: "UPPERCASE" }, { v: "none", t: "As typed" }]} onChange={(v) => set({ wordCase: v as State["wordCase"] })} />
          <Text label="Before bolt" value={s.prefix} onChange={(v) => set({ prefix: v })} />
          <Text label="After bolt" value={s.suffix} onChange={(v) => set({ suffix: v })} />
          <Slider label="Size" value={s.wordSize} min={40} max={180} step={2} onChange={(v) => set({ wordSize: v })} />
          <Slider label="Tracking" value={s.wordSpacing} min={-0.06} max={0.1} step={0.005} onChange={(v) => set({ wordSpacing: v })} fmt={(v) => v.toFixed(3)} />
          <Slider label="Bolt size" value={s.boltScale} min={0.8} max={1.6} step={0.02} onChange={(v) => set({ boltScale: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Bolt baseline" value={s.boltDrop} min={-0.1} max={0.35} step={0.01} onChange={(v) => set({ boltDrop: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Bolt kerning" value={s.boltNudge} min={-0.08} max={0.06} step={0.005} onChange={(v) => set({ boltNudge: v })} fmt={(v) => v.toFixed(3)} />
        </Section>

        <Section title="Bolt placement" open={false}>
          <Slider label="Offset X" value={s.boltOffX} min={-60} max={60} step={1} onChange={(v) => set({ boltOffX: v })} fmt={(v) => `${v}px`} />
          <Slider label="Offset Y" value={s.boltOffY} min={-60} max={60} step={1} onChange={(v) => set({ boltOffY: v })} fmt={(v) => `${v}px`} />
          <Slider label="Rotation" value={s.boltRotate} min={-45} max={45} step={1} onChange={(v) => set({ boltRotate: v })} fmt={(v) => `${v}°`} />
          <Sel label="Depth" value={s.boltDepth} options={[{ v: "back", t: "Behind letters" }, { v: "mid", t: "Between letters" }, { v: "front", t: "In front" }]} onChange={(v) => set({ boltDepth: v as State["boltDepth"] })} />
          <Slider label="Overlap left" value={s.boltOverlapL} min={-0.2} max={0.1} step={0.005} onChange={(v) => set({ boltOverlapL: v })} fmt={(v) => v.toFixed(3)} />
          <Slider label="Overlap right" value={s.boltOverlapR} min={-0.2} max={0.1} step={0.005} onChange={(v) => set({ boltOverlapR: v })} fmt={(v) => v.toFixed(3)} />
          <Slider label="Pivot X" value={s.boltPivotX} min={0} max={100} step={1} onChange={(v) => set({ boltPivotX: v })} fmt={(v) => `${v}%`} />
          <Slider label="Pivot Y" value={s.boltPivotY} min={0} max={100} step={1} onChange={(v) => set({ boltPivotY: v })} fmt={(v) => `${v}%`} />
        </Section>

        <Section title="Accounting line" open={false}>
          <Toggle label="Show" value={s.showAcc} onChange={(v) => set({ showAcc: v })} />
          <Text label="Text" value={s.accText} onChange={(v) => set({ accText: v })} />
          <FontSel label="Font" value={s.accFont} onChange={(v) => set({ accFont: v, accWeight: (FONT_BY[v]?.w.find((w) => w >= 600)) ?? 600 })} />
          <Sel label="Weight" value={String(s.accWeight)} options={(FONT_BY[s.accFont]?.w ?? [400, 600]).map((w) => ({ v: String(w), t: String(w) }))} onChange={(v) => set({ accWeight: parseInt(v) })} />
          <Slider label="Size" value={s.accSize} min={0.08} max={0.3} step={0.005} onChange={(v) => set({ accSize: v })} fmt={(v) => v.toFixed(2)} />
          <Slider label="Tracking" value={s.accTracking} min={0} max={0.6} step={0.01} onChange={(v) => set({ accTracking: v })} fmt={(v) => v.toFixed(2)} />
          <Toggle label="Flanking rules" value={s.rules} onChange={(v) => set({ rules: v })} />
          <Toggle label="Rules = bolt colours" value={s.rulesFromBolt} onChange={(v) => set({ rulesFromBolt: v })} />
          {!s.rulesFromBolt && <><Col label="Rule left" value={s.ruleC1} onChange={(v) => set({ ruleC1: v })} /><Col label="Rule right" value={s.ruleC2} onChange={(v) => set({ ruleC2: v })} /></>}
        </Section>

        <Section title="Slogan" open={false}>
          <Toggle label="Show" value={s.showSlogan} onChange={(v) => set({ showSlogan: v })} />
          <Sel label="Mode" value={s.sloganMode} options={[{ v: "scroller", t: "TikTok scroller" }, { v: "plain", t: "Plain text" }]} onChange={(v) => set({ sloganMode: v as State["sloganMode"] })} />
          <FontSel label="Font" value={s.sloganFont} onChange={(v) => set({ sloganFont: v })} />
          <Slider label="Size" value={s.sloganSize} min={0.1} max={0.4} step={0.01} onChange={(v) => set({ sloganSize: v })} fmt={(v) => v.toFixed(2)} />
          {s.sloganMode === "plain"
            ? <Text label="Text" value={s.plain} onChange={(v) => set({ plain: v })} />
            : <>
              <Text label="Line 1" value={s.line1} onChange={(v) => set({ line1: v })} />
              <Text label="Before" value={s.pre} onChange={(v) => set({ pre: v })} />
              <Text label="Scroll words" value={s.cycle} onChange={(v) => set({ cycle: v })} />
              <Text label="After" value={s.suf} onChange={(v) => set({ suf: v })} />
              <Slider label="Scroll speed" value={s.cycleMs} min={500} max={3000} step={100} onChange={(v) => set({ cycleMs: v })} fmt={(v) => `${(v / 1000).toFixed(1)}s`} />
            </>}
        </Section>

        <Section title="Animation" open={false}>
          <Sel label="Entrance" value={s.entrance} options={[{ v: "none", t: "None" }, { v: "strike", t: "Lightning strike" }, { v: "pop", t: "Pop" }, { v: "fadeup", t: "Fade up" }, { v: "wipe", t: "Wipe reveal" }]} onChange={(v) => set({ entrance: v as Entrance })} />
          <Slider label="Duration" value={s.animMs} min={300} max={2500} step={50} onChange={(v) => set({ animMs: v })} fmt={(v) => `${v}ms`} />
          <Row label=""><button onClick={() => setPlayKey((k) => k + 1)} style={{ ...inp, cursor: "pointer", background: "#FCA31122", borderColor: "#FCA311", color: "#FCA311", fontWeight: 800 }}>▶ Play</button></Row>
        </Section>

        <Section title="Export">
          <Row label=""><button onClick={() => copy(boltSvg, "Bolt SVG copied")} style={{ ...inp, cursor: "pointer" }}>Copy bolt SVG</button></Row>
          <Row label=""><button onClick={() => copy(brandPaths, "Brand paths copied")} style={{ ...inp, cursor: "pointer" }}>Copy brand paths + params</button></Row>
          <Row label=""><button onClick={() => copy(JSON.stringify(s, null, 2), "Full config copied")} style={{ ...inp, cursor: "pointer" }}>Copy full config JSON</button></Row>
          <PresetBar s={s} onLoad={(st) => setS(st)} notify={(m) => { setToast(m); setTimeout(() => setToast(""), 1600); }} />
        </Section>
      </div>

      {/* stage */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #1c2330", fontSize: 12, color: "#8b96a6" }}>
          <span>Live preview</span>
          <div style={{ display: "flex", gap: 4 }}>
            {([["Fit", 1], ["150%", 1.5], ["50%", 0.5], ["Distance", 0.22]] as [string, number][]).map(([t, z]) => (
              <button key={t} onClick={() => set({ zoom: z })} title={t === "Distance" ? "Distance test — how it reads far away / tiny" : undefined} style={{ ...inp, width: "auto", cursor: "pointer", padding: "3px 8px", background: s.zoom === z ? "#FCA31122" : "#0e131b", borderColor: s.zoom === z ? "#FCA311" : "#2a3342", color: s.zoom === z ? "#FCA311" : "#8b96a6" }}>{t}</button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", color: "#5c6675" }}>ratio {geom.ratio.toFixed(3)} · viewBox {geom.viewBox}</span>
        </div>
        <div style={{ flex: 1, display: "grid", placeItems: "center", overflow: "auto", position: "relative", ...stageBg }}>
          {/* REFERENCE overlay (visual guide only) — positioned over the preview. */}
          {s.refOn && s.refImg && !s.refSide && (
            <img src={s.refImg} alt="reference" style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%,-50%) translate(${s.refX}px,${s.refY}px) scale(${s.refScale})`, opacity: s.refOpacity, pointerEvents: "none", zIndex: 3, maxWidth: "none", filter: s.refOutline ? "grayscale(1) contrast(2.6) brightness(1.4)" : undefined }} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <div style={{ transform: `scale(${s.dist === "full" ? s.zoom : s.dist === "25" ? 0.25 : s.dist === "10" ? 0.1 : parseFloat(s.dist) / s.wordSize})`, transition: "transform 200ms ease" }}>
              <div key={playKey} style={{ ...anim, padding: 40 }}>
                <LogoComposition s={s} geom={geom} />
              </div>
            </div>
            {s.refOn && s.refImg && s.refSide && <img src={s.refImg} alt="reference" style={{ maxHeight: "56vh", opacity: s.refOpacity, transform: `scale(${s.refScale})`, filter: s.refOutline ? "grayscale(1) contrast(2.6) brightness(1.4)" : undefined }} />}
          </div>
          {/* VERTEX EDIT — a dedicated large canvas. The ACTIVE ring (border OR seam) is
              editable: draggable handles, click an edge to set the parallel reference,
              double-click an edge to ADD a point, Delete removes. The INACTIVE ring shows
              faint (path + dots) so the seam can be aligned to the border by eye. */}
          {editMode && (() => {
            const activePts = s.editRing === "seam" ? geom.finalSeam : geom.finalOuter;
            const inactivePts = s.editRing === "seam" ? geom.finalOuter : geom.finalSeam;
            const activeColor = s.editRing === "seam" ? "#4FA3E3" : "#E0284A";
            const inactiveColor = s.editRing === "seam" ? "#E0284A" : "#4FA3E3";
            const an = activePts.length;
            return (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(8,11,17,0.9)", zIndex: 8 }} onClick={() => setSelVert(null)}>
              <div style={{ position: "relative", width: "min(72vh,60vw)", height: "72vh", background: "#0e131b", borderRadius: 12, padding: 22, boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
                {/* TRACE REFERENCE (Lee) — the reference image, shown behind the vertices so
                    they can be traced over it. Toggle on/off here; position / scale / opacity
                    live in the left "Reference & distance" panel (reachable while editing). */}
                {s.refOn && s.refImg && <img src={s.refImg} alt="trace reference" style={{ position: "absolute", left: 22, top: 22, right: 22, bottom: 22, margin: "auto", maxWidth: "calc(100% - 44px)", maxHeight: "calc(100% - 44px)", objectFit: "contain", transform: `translate(${s.refX}px,${s.refY}px) scale(${s.refScale})`, opacity: s.refOpacity, pointerEvents: "none", zIndex: 0, filter: s.refOutline ? "grayscale(1) contrast(2.6) brightness(1.4)" : undefined }} />}
                {/* ring switch + reference toggle, in-canvas for reach */}
                <div style={{ position: "absolute", top: 8, left: 14, display: "flex", gap: 5, zIndex: 2 }}>
                  {(["outer", "seam"] as const).map((r) => (
                    <button key={r} onClick={() => setEditRing(r)} style={{ ...inp, width: "auto", cursor: "pointer", padding: "3px 10px", background: s.editRing === r ? "#FCA31122" : "#0e131b", borderColor: s.editRing === r ? "#FCA311" : "#2a3342", color: s.editRing === r ? "#FCA311" : "#8b96a6", fontWeight: 700 }}>{r === "outer" ? "Border" : "Seam"}</button>
                  ))}
                  {s.refImg && <button onClick={() => set({ refOn: !s.refOn })} title="Show the reference image behind the vertices to trace it (position / opacity in the left Reference panel)" style={{ ...inp, width: "auto", cursor: "pointer", padding: "3px 10px", background: s.refOn ? "#FCA31122" : "#0e131b", borderColor: s.refOn ? "#FCA311" : "#2a3342", color: s.refOn ? "#FCA311" : "#8b96a6", fontWeight: 700 }}>Ref</button>}
                </div>
                <svg ref={editSvgRef} viewBox={geom.viewBox} width="100%" height="100%" style={{ overflow: "visible", position: "relative", zIndex: 1 }}>
                  {/* both rings for context; active brighter, inactive faint */}
                  <path d={geom.outer} fill={s.editRing === "outer" ? "rgba(224,40,74,0.07)" : "none"} stroke="#E0284A" strokeWidth={s.editRing === "outer" ? 1.1 : 0.7} opacity={s.editRing === "outer" ? 0.7 : 0.3} />
                  <path d={geom.seam} fill={s.editRing === "seam" ? "rgba(79,163,227,0.09)" : "none"} stroke="#4FA3E3" strokeWidth={s.editRing === "seam" ? 1.1 : 0.7} opacity={s.editRing === "seam" ? 0.8 : 0.35} />
                  {/* selected vertex's two edges (incoming amber, outgoing blue) */}
                  {selVert != null && selVert < an && (() => { const v = activePts[selVert], p = activePts[(selVert - 1 + an) % an], q = activePts[(selVert + 1) % an]; return (<><line x1={p.x} y1={p.y} x2={v.x} y2={v.y} stroke="#FCA311" strokeWidth={2.5} /><line x1={v.x} y1={v.y} x2={q.x} y2={q.y} stroke="#4FA3E3" strokeWidth={2.5} /></>); })()}
                  {refEdge != null && refEdge < an && (() => { const a = activePts[refEdge], b = activePts[(refEdge + 1) % an]; return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3BF5A0" strokeWidth={2} strokeDasharray="4 3" />; })()}
                  {/* invisible edge hit-targets → click sets the reference edge, double-click adds a point */}
                  {activePts.map((v, i) => { const b = activePts[(i + 1) % an]; return <line key={"e" + i} x1={v.x} y1={v.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={8} style={{ cursor: "copy" }} onClick={(e) => { e.stopPropagation(); setRefEdge((r) => (r === i ? null : i)); }} onDoubleClick={(e) => { e.stopPropagation(); const loc = clientToSvg(e.clientX, e.clientY); insertVertexOnEdge(i, loc ?? undefined); }} />; })}
                  {/* inactive ring vertices — faint reference dots (non-interactive) */}
                  {inactivePts.map((v, i) => <circle key={"iv" + i} cx={v.x} cy={v.y} r={1.6} fill={inactiveColor} opacity={0.4} style={{ pointerEvents: "none" }} />)}
                  {/* active ring draggable vertex handles */}
                  {activePts.map((v, i) => (
                    <circle key={i} cx={v.x} cy={v.y} r={selVert === i ? 4.2 : 3} fill={selVert === i ? "#FCA311" : "#fff"} stroke={activeColor} strokeWidth={1.2} style={{ cursor: "grab" }} onPointerDown={(e) => startVertexDrag(i, e)} onClick={(e) => { e.stopPropagation(); setSelVert(i); }} />
                  ))}
                </svg>
                <div style={{ position: "absolute", bottom: 10, left: 14, fontSize: 11, color: "#67707e" }}>Editing <b style={{ color: activeColor }}>{s.editRing === "outer" ? "border" : "seam"}</b> — {selVert != null ? `vertex ${selVert + 1}/${an}` : `${an} pts · click one`}{refEdge != null ? ` · ref edge ${refEdge + 1}` : ""} · double-click an edge to add</div>
                <button onClick={() => { setEditMode(false); setSelVert(null); }} style={{ position: "absolute", top: 8, right: 10, ...inp, width: "auto", cursor: "pointer" }}>Done</button>
              </div>
            </div>
            );
          })()}
        </div>
        {/* PREVIEW EXTRAS (Lee) — favicon sizes + small logo cards to judge legibility. */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "10px 16px", borderTop: "1px solid #1c2330", background: "#0b0e14", overflowX: "auto", flex: "0 0 auto" }}>
          <span style={{ fontSize: 11, color: "#67707e", flex: "0 0 auto" }}>Favicon</span>
          {[16, 32, 64].map((px) => (
            <div key={px} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: "0 0 auto" }}>
              <div style={{ width: px, height: px, display: "grid", placeItems: "center", background: "#15304a", borderRadius: px >= 32 ? 6 : 3 }}>
                <span style={{ display: "block", width: Math.round(px * 0.8), height: Math.round(px * 0.8) }}><BoltSVG geom={geom} c1={col.c1} c2={col.c2} keyline={col.key} outline={s.bolt.outline} innerGlow={s.fxInner} /></span>
              </div>
              <span style={{ fontSize: 9, color: "#5c6675" }}>{px}px</span>
            </div>
          ))}
          <span style={{ width: 1, alignSelf: "stretch", background: "#1c2330", flex: "0 0 auto" }} />
          <span style={{ fontSize: 11, color: "#67707e", flex: "0 0 auto" }}>Small logo</span>
          <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", flex: "0 0 auto" }}><LogoComposition s={{ ...s, wordSize: 32, showSlogan: false, bg: "white" }} geom={geom} /></div>
          <div style={{ background: "#0A0A0A", borderRadius: 8, padding: "10px 14px", flex: "0 0 auto" }}><LogoComposition s={{ ...s, wordSize: 32, showSlogan: false, bg: "black" }} geom={geom} /></div>
        </div>
        {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#FCA311", color: "#111", fontWeight: 700, fontSize: 12, padding: "8px 16px", borderRadius: 8 }}>{toast}</div>}
      </div>
    </div>
  );
}

function PresetBar({ s, onLoad, notify }: { s: State; onLoad: (s: State) => void; notify: (m: string) => void }) {
  const [presets, setPresets] = useState<{ name: string; state: State }[]>([]);
  const [name, setName] = useState("");
  useEffect(() => { try { setPresets(JSON.parse(localStorage.getItem(LS_PRESETS) ?? "[]")); } catch { /* noop */ } }, []);
  const save = () => {
    const nm = name.trim() || `logo ${presets.length + 1}`;
    const next = [...presets.filter((p) => p.name !== nm), { name: nm, state: s }];
    setPresets(next); localStorage.setItem(LS_PRESETS, JSON.stringify(next)); setName(""); notify(`Saved "${nm}"`);
  };
  const del = (nm: string) => { const next = presets.filter((p) => p.name !== nm); setPresets(next); localStorage.setItem(LS_PRESETS, JSON.stringify(next)); };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="preset name" style={inp} />
        <button onClick={save} style={{ ...inp, width: "auto", cursor: "pointer", color: "#FCA311", borderColor: "#FCA311" }}>Save</button>
      </div>
      {presets.map((p) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <button onClick={() => onLoad({ ...DEFAULTS, ...p.state, bolt: { ...DEFAULT_BOLT, ...p.state.bolt } })} style={{ ...inp, cursor: "pointer", textAlign: "left", flex: 1 }}>{p.name}</button>
          <button onClick={() => del(p.name)} style={{ ...inp, width: "auto", cursor: "pointer", color: "#a55" }}>✕</button>
        </div>
      ))}
    </div>
  );
}
