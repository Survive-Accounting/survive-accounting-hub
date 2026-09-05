// MOUNTAIN BACKDROP — the textured Mt Cook (public/brand/mt-cook.svg) rising BEHIND a section,
// recoloured to the selected campus exactly the way the bolt is: the lit faces take
// --bolt-primary, the shaded faces --bolt-secondary, through mountainPalette().
//
// Layout: the wrapper adds head-room above the children equal to PEAK_RISE of their height, the
// art is pinned to the wrapper's top edge, so the summit pokes out above the card by that much
// and the base runs on behind and below it until the wrapper clips it (with a soft fade).
//
// Motion is SCROLL-DRIVEN, both directions, restrained: as the section travels through the
// viewport (progress 0 → 1) a soft shadow band sweeps the mountain left → right (right → left on
// the way back up), and a warm glow on the summit peaks at progress 0.5 — the sun at midday.
// Progress is ONE custom property, --mtn-progress: a CSS view() timeline drives it where
// scroll-driven animations exist, a requestAnimationFrame scroll listener writes it elsewhere,
// and the two overlays read it through a second registered property with a short transition,
// which is what turns each scroll step into a few hundred ms of eased motion instead of a
// jitter. prefers-reduced-motion pins progress at the midday state and drops the transition.
//
// The 400 KB SVG never enters the bundle: it is fetched after mount, in an idle callback, and
// injected inline so its var(--mtn-*) fills resolve against the wrapper. The overlays are
// clipped to the mountain's silhouette with the same file as a CSS mask image.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { hexToRgb, rgbToHex } from "./bolt/bolt-palette";
import { MOUNTAIN_GEOMETRY, mountainPalette } from "./mountain-palette";

export const MOUNTAIN_SVG_URL = "/brand/mt-cook.svg";

/** How far the summit pokes above the children, as a fraction of their height (spec: 35–45 %). */
export const PEAK_RISE = 0.4;
/** Head-room used for the server render and the first client paint, before the children are
 *  measured — close to a typical card so hydration barely moves anything. */
const PEAK_RISE_FALLBACK_PX = 130;
/** The art is never narrower than this — on a phone the whole mountain would otherwise fit
 *  inside the section and the base would show instead of disappearing below it. */
const MIN_ART_WIDTH_PX = 760;
/** Eased motion per scroll step. */
const STEP_EASE_MS = 320;

type Props = {
  children: ReactNode;
  /** Lit-face colour. A hex, or a CSS var() the component resolves after mount. */
  c1?: string;
  /** Shaded-face colour. Same rules. */
  c2?: string;
  className?: string;
};

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const STYLE_CSS = `
@property --mtn-progress { syntax: "<number>"; inherits: true; initial-value: 0.5; }
@property --mtn-p { syntax: "<number>"; inherits: false; initial-value: 0.5; }
@keyframes sa-mtn-travel { from { --mtn-progress: 0; } to { --mtn-progress: 1; } }
/* overflow: clip, NOT hidden — hidden makes the wrapper a scroll container, and view() would
   then measure the wrapper against itself and never move. hidden is only the old-engine fallback. */
.sa-mtn { position: relative; isolation: isolate; overflow: hidden; overflow: clip; --mtn-progress: 0.5; }
@supports (animation-timeline: view()) {
  .sa-mtn[data-motion="css"] { animation: sa-mtn-travel linear both; animation-timeline: view(); }
}
/* THE CLIP IS WRAPPER-SIZED; THE LAYER IS ART-SIZED. The fade lives on the clip so it always
   runs out at the SECTION's bottom edge — on the art layer it measured against the art's own
   height (1190px at 1280 wide) and the wrapper cut the base off long before the fade began. */
.sa-mtn__clip {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, #000 58%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 58%, transparent 100%);
}
.sa-mtn__layer {
  position: absolute; top: 0; left: 50%;
  width: max(100vw, ${MIN_ART_WIDTH_PX}px); transform: translateX(-50%);
  aspect-ratio: 1 / ${MOUNTAIN_GEOMETRY.aspect};
}
.sa-mtn__art, .sa-mtn__art svg { display: block; width: 100%; height: auto; }
.sa-mtn__shade, .sa-mtn__glow {
  position: absolute; inset: 0; overflow: hidden;
  --mtn-p: var(--mtn-progress);
  transition: --mtn-p ${STEP_EASE_MS}ms cubic-bezier(0.2, 0.9, 0.25, 1);
  -webkit-mask-image: url("${MOUNTAIN_SVG_URL}"); mask-image: url("${MOUNTAIN_SVG_URL}");
  -webkit-mask-size: 100% auto; mask-size: 100% auto;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: top center; mask-position: top center;
}
.sa-mtn__shade::before {
  content: ""; position: absolute; top: -5%; bottom: -5%; left: 0; width: 55%;
  background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.42) 50%, rgba(0,0,0,0) 100%);
  transform: translateX(calc(-100% + var(--mtn-p) * 282%));
  will-change: transform;
}
.sa-mtn__glow::before {
  content: ""; position: absolute; width: 56%; aspect-ratio: 1 / 0.75;
  left: ${(MOUNTAIN_GEOMETRY.peakX * 100 - 28).toFixed(2)}%; top: -6%;
  background: radial-gradient(ellipse at 50% 8%, rgba(255, 214, 150, 0.95) 0%, rgba(255, 190, 120, 0.45) 30%, rgba(255, 170, 100, 0) 68%);
  mix-blend-mode: screen;
  opacity: calc(min(var(--mtn-p), 1 - var(--mtn-p)) * 2 * 0.85);
}
.sa-mtn__content { position: relative; z-index: 1; }
@media (prefers-reduced-motion: reduce) {
  .sa-mtn { animation: none !important; --mtn-progress: 0.5 !important; }
  .sa-mtn__shade, .sa-mtn__glow { transition: none; }
}
`;

/** `var(--x)` → resolved computed value on `el`, or null when it is not a var() / not set. */
function resolveVar(value: string, el: HTMLElement): string | null {
  const m = value.trim().match(/^var\((--[\w-]+)/);
  if (!m) return null;
  const v = getComputedStyle(el).getPropertyValue(m[1]).trim();
  return v || null;
}

/** Any colour we can measure → #RRGGBB; otherwise null (callers keep the CSS expression). */
function toHex(value: string): string | null {
  if (hexToRgb(value)) return value.toUpperCase();
  const m = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  return m ? rgbToHex(+m[1], +m[2], +m[3]) : null;
}

/** Fraction of the wrapper's journey through the viewport — the same range CSS view() covers. */
function viewProgress(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const p = (vh - r.top) / (vh + r.height);
  return Math.max(0, Math.min(1, p));
}

function supportsScrollTimeline(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline: view()");
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function MountainBackdrop({ children, c1 = "var(--bolt-primary)", c2 = "var(--bolt-secondary)", className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [rise, setRise] = useState<number>(PEAK_RISE_FALLBACK_PX);
  const [motion, setMotion] = useState<"css" | "js" | "none">("css");
  // What the palette is computed from: the props, or — once mounted — the hex the props' vars
  // resolve to, so the lightness fit (and the light-secondary clamp) can actually run.
  const [resolved, setResolved] = useState<{ c1: string; c2: string }>({ c1, c2 });

  // Resolve var() props against the wrapper on every render: the campus theme is an inline style
  // on an ancestor that re-renders this subtree when the school changes, so "after each render"
  // is exactly when the answer may have changed. setState is skipped when nothing did.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const next = {
      c1: toHex(c1) ?? toHex(resolveVar(c1, el) ?? "") ?? c1,
      c2: toHex(c2) ?? toHex(resolveVar(c2, el) ?? "") ?? c2,
    };
    setResolved((cur) => (cur.c1 === next.c1 && cur.c2 === next.c2 ? cur : next));
  });

  const palette = useMemo(() => mountainPalette(resolved.c1, resolved.c2), [resolved]);

  // Fetch the art off the critical path and inject it inline.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(MOUNTAIN_SVG_URL)
        .then((r) => {
          if (!r.ok) throw new Error(`${MOUNTAIN_SVG_URL} → ${r.status}`);
          return r.text();
        })
        .then((text) => {
          if (!cancelled) setSvg(text);
        })
        .catch((err: unknown) => {
          // Decoration only — the section it sits behind must keep working — but say so loudly.
          console.error("[MountainBackdrop] could not load the mountain", err);
        });
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let idleId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (typeof w.requestIdleCallback === "function") idleId = w.requestIdleCallback(load, { timeout: 1500 });
    else timer = setTimeout(load, 1);
    return () => {
      cancelled = true;
      if (idleId !== null && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(idleId);
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  // Head-room above the children = PEAK_RISE of their height, kept in step as they resize
  // (the reminder card collapses to one line once a text is booked).
  useIsomorphicLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setRise(Math.round(el.getBoundingClientRect().height * PEAK_RISE));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll progress: CSS view() timeline when the browser has it, a rAF-throttled scroll
  // listener writing --mtn-progress when it does not, nothing under reduced motion.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setMotion("none");
      return;
    }
    if (supportsScrollTimeline()) {
      setMotion("css");
      return;
    }
    setMotion("js");
    let raf = 0;
    const write = () => {
      raf = 0;
      el.style.setProperty("--mtn-progress", viewProgress(el).toFixed(4));
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(write);
    };
    write();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      el.style.removeProperty("--mtn-progress");
    };
  }, []);

  const wrapStyle = useMemo<CSSProperties>(
    () => ({ ...(palette as unknown as CSSProperties), paddingTop: rise }),
    [palette, rise],
  );

  return (
    <div ref={wrapRef} className={["sa-mtn", className].filter(Boolean).join(" ")} data-motion={motion} style={wrapStyle}>
      <style href="sa-mountain-backdrop" precedence="default">{STYLE_CSS}</style>
      {svg && (
        <div className="sa-mtn__clip" aria-hidden="true">
          <div className="sa-mtn__layer">
            <div className="sa-mtn__art" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="sa-mtn__shade" />
            <div className="sa-mtn__glow" />
          </div>
        </div>
      )}
      <div ref={contentRef} className="sa-mtn__content">
        {children}
      </div>
    </div>
  );
}
