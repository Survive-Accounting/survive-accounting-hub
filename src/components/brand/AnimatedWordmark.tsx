// ANIMATED WORDMARK — "surv⚡ve" (+ a lighter "accounting" beneath) drawing itself on in the
// bolt style. SVG paths animated with stroke-dashoffset; the bolt (the "i") pops in at its slot
// using the deterministic BoltBoil frame, so the whole thing is a pure function of `progress`.
//
// THE ONE RULE (docs/BRAND-ANIMATION.md): everything is driven by a VALUE, never wall-clock.
// Given `progress`, this renders exactly one deterministic frame — which is what lets Remotion
// (or any offline renderer) turn it into video. Omit `progress` and a small rAF driver plays it
// once at `speed` as a convenience for live pages; prefers-reduced-motion jumps that driver
// straight to the finished mark.
//
// NO DEPENDENCIES. pathLength={1} normalises every stroke, so dasharray/dashoffset math needs
// no getTotalLength() — deterministic on the server and the client alike.
//
// "accounting" is the hard part — a long word in a style built for a short one — so per the
// spec it is a separate, lighter-weight line beneath: ~40% of the cap height, thinner stroke.
import { useEffect, useRef, useState } from "react";

import { BoltBoil, BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { GLYPHS, PATH_WEIGHT } from "@/components/brand/wordmark-glyphs";

/** Glyph space: ascender top y=0, baseline y=100, descender ~132. */
const EM_TOP = 0;
const EM_BOTTOM = 134;
const EM_H = EM_BOTTOM - EM_TOP;
const TRACKING = 6; // units between glyphs

type Seg = { kind: "path"; d: string; weight: number } | { kind: "bolt"; weight: number };

/** Flatten a word into draw segments (each glyph path, in stroke order). "⚡" is the bolt slot. */
export function segments(word: string): Seg[] {
  const out: Seg[] = [];
  for (const ch of word) {
    if (ch === "⚡") { out.push({ kind: "bolt", weight: 3 }); continue; }
    const g = GLYPHS[ch];
    if (!g) continue; // unknown char: skipped loudly in dev via the lab, silently in prod
    g.d.forEach((d, i) => out.push({ kind: "path", d, weight: PATH_WEIGHT[ch]?.[i] ?? 1 }));
  }
  return out;
}

export function wordWidth(word: string): number {
  let w = 0;
  for (const ch of word) w += (ch === "⚡" ? 44 : GLYPHS[ch]?.w ?? 0) + TRACKING;
  return Math.max(1, w - TRACKING);
}

/** Per-segment progress: the global 0..1 split across segments by weight, each stroke starting
 *  a little EARLY (overlapping the previous one — real handwriting never fully stops) but ending
 *  exactly on its own boundary, so t=1 always means every stroke is complete. */
export function segProgress(segs: Seg[], t: number): number[] {
  const total = segs.reduce((a, s) => a + s.weight, 0) || 1;
  const OVERLAP = 0.35; // fraction of a segment's own span it starts early
  let acc = 0;
  return segs.map((s) => {
    const span = s.weight / total;
    const start = Math.max(0, acc / total - span * OVERLAP);
    const end = acc / total + span; // the LAST segment's end is exactly 1
    acc += s.weight;
    const p = (t - start) / Math.max(1e-6, end - start);
    return Math.max(0, Math.min(1, p));
  });
}

/** One drawn word as an SVG. Pure: same word + progress → same pixels. */
function DrawnWord({ word, capHeight, stroke, color, progress }: {
  word: string; capHeight: number; stroke: number; color: string; progress: number;
}) {
  const scale = capHeight / 100; // baseline-to-ascender box drives the visual size
  const segs = segments(word);
  const ps = segProgress(segs, progress);
  let x = 0;
  let segIdx = 0;
  const nodes: React.ReactNode[] = [];
  for (const ch of word) {
    if (ch === "⚡") {
      const p = ps[segIdx++] ?? 0;
      // The bolt POPS rather than draws — it is the brand's ready-made mark. Scale+fade from
      // its own slot; boilFrame from global progress keeps the boil deterministic.
      nodes.push(
        <g key={`bolt-${x}`} transform={`translate(${x}, 8)`} style={{ opacity: p }}>
          <foreignObject x={-6} y={-4} width={60} height={130} style={{ overflow: "visible" }}>
            <span style={{ display: "block", transform: `scale(${0.6 + 0.4 * p})`, transformOrigin: "50% 60%" }}>
              <BoltBoil height={104} boilFrame={Math.floor(progress * 24)} />
            </span>
          </foreignObject>
        </g>,
      );
      x += 44 + TRACKING;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) continue;
    const paths = g.d.map((d, i) => {
      const p = ps[segIdx++] ?? 0;
      return (
        <path
          key={i}
          d={d}
          pathLength={1}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={1}
          strokeDashoffset={1 - p}
          style={{ opacity: p > 0 ? 1 : 0 }}
        />
      );
    });
    nodes.push(<g key={`g-${x}`} transform={`translate(${x}, 0)`}>{paths}</g>);
    x += g.w + TRACKING;
  }
  const w = wordWidth(word);
  return (
    <svg
      viewBox={`${-stroke} ${EM_TOP - stroke} ${w + stroke * 2} ${EM_H + stroke * 2}`}
      width={(w + stroke * 2) * scale}
      height={(EM_H + stroke * 2) * scale}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {nodes}
    </svg>
  );
}

export function AnimatedWordmark({ progress, speed = 1, showAccounting = false, size = 96, color = BRAND_CREAM, onDone }: {
  /** 0..1 — the ONLY driver when provided. Same value, same pixels, every time. */
  progress?: number;
  /** Self-driving convenience mode only (progress omitted): 1 ≈ a 2.2s draw. */
  speed?: number;
  /** The second, lighter line beneath. */
  showAccounting?: boolean;
  /** Cap height of the "survive" line, px. */
  size?: number;
  color?: string;
  /** Self-driving mode: fires once when the draw completes. */
  onDone?: () => void;
}) {
  // SELF-DRIVING DRIVER — exists only when no progress is supplied. Reduced motion jumps to
  // the finished mark: the drawn state IS the wordmark; the journey is the decoration.
  const [auto, setAuto] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (progress !== undefined) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setAuto(1);
      if (!doneRef.current) { doneRef.current = true; onDone?.(); }
      return;
    }
    const durMs = 2200 / Math.max(0.1, speed);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durMs);
      setAuto(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else if (!doneRef.current) { doneRef.current = true; onDone?.(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the draw plays once per mount
  }, [progress === undefined]);

  const t = progress !== undefined ? Math.max(0, Math.min(1, progress)) : auto;

  // Timeline: "survive" owns 0..0.66; "accounting" (when shown) draws in 0.62..1 — it starts
  // as the main word's last stroke is finishing, like a hand moving to the second line.
  const tSurvive = showAccounting ? Math.min(1, t / 0.66) : t;
  const tAcct = showAccounting ? Math.max(0, Math.min(1, (t - 0.62) / 0.38)) : 0;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: size * 0.06 }}>
      <DrawnWord word="surv⚡ve" capHeight={size} stroke={7} color={color} progress={tSurvive} />
      {showAccounting && (
        <span style={{ opacity: 0.82 }}>
          <DrawnWord word="accounting" capHeight={size * 0.4} stroke={4.6} color={color} progress={tAcct} />
        </span>
      )}
    </span>
  );
}
