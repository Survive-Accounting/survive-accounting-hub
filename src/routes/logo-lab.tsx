// LOGO LAB — an interactive workshop for the Survive mark. Dial the bolt geometry,
// fonts, colours, backgrounds (incl. mono / grayscale / white / black), the slogan,
// and animation (incl. an upward-scrolling TikTok/Reels/Shorts cycler). Build the
// logo by hand here, then Copy the config / paths to bake into the brand module.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";

import { BOLT_PRESETS, SEC_SCHOOLS, boltColorById } from "@/components/canvas/brand";
import { BOLT_STYLE_PRESETS, DEFAULT_BOLT, forgeBolt, type BoltParams } from "@/lib/bolt-forge";

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
  const [playKey, setPlayKey] = useState(0);
  const [toast, setToast] = useState("");

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

  useEffect(() => { if (loaded) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* noop */ } } }, [s, loaded]);

  const geom = useMemo(() => forgeBolt(s.bolt), [s.bolt]);
  const col = effColors(s);

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
        <div style={{ flex: 1, display: "grid", placeItems: "center", overflow: "auto", ...stageBg }}>
          <div style={{ transform: `scale(${s.zoom})`, transition: "transform 200ms ease" }}>
            <div key={playKey} style={{ ...anim, padding: 40 }}>
              <LogoComposition s={s} geom={geom} />
            </div>
          </div>
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
