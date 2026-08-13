// LOGO LAB CONCEPTS (pure data) — four SVG logo-mark concepts for Lee to
// evaluate on the /logo-lab comparison sheet. Token-driven colors only:
// navy #0A1128 · amber #FCA311 → red #E0284A gradient · cream #FBF9F4.
// LEGALLY DISTINCT by construction: no skull anywhere, no Grateful Dead stealie
// elements — plain original bolts (6-point badge / 11-point letterform), navy/amber (not red/blue), no circle-skull composites.
// Neutral strokes/text use currentColor so a mark can sit on navy OR cream
// (the lab sets the container color per background).

export const LOGO_NAVY = "#0A1128";
export const LOGO_AMBER = "#FCA311";
export const LOGO_RED = "#E0284A";
export const LOGO_CREAM = "#FBF9F4";

export interface LogoMark {
  id: string;
  label: string;
  /** Raw SVG source (viewBox + width/height 100% so it scales to its box). */
  svg: string;
  /** Aspect ratio w/h for non-square (wordmark) marks; absent = square. */
  ratio?: number;
  /** The px sizes to render (square edge; height for ratio marks). */
  sizes: number[];
}

export interface LogoConcept {
  id: "A" | "B" | "C" | "D";
  name: string;
  blurb: string;
  marks: LogoMark[];
}

/** Concept D shared geometry — the ORIGINAL multi-notch bolt (drawn fresh for
 *  this mark: flat head, two staircase notches per side, pointed tail — NOT a
 *  trace of any existing bolt; different point count and proportions than the
 *  Grateful Dead 13-point bolt) and the geometric pencil in writing position.
 *  Kept as template pieces so the wordmark/standalone/animated variants can't
 *  drift from each other. */
const D_BOLT = "M44 0 L14 0 L6 40 L18 40 L2 78 L14 78 L6 116 L30 74 L20 74 L38 36 L28 36 Z";
/** Deep charcoal-navy bolt + soft offset shadow + light edge so it sits proud
 *  of the wordmark plane on navy AND reads as dark navy on cream. */
const dBolt = () => `
    <path d="${D_BOLT}" fill="rgba(0,0,0,0.35)" transform="translate(4 5)"/>
    <path d="${D_BOLT}" fill="#111A30" stroke="rgba(147,160,180,0.5)" stroke-width="1.5"/>`;
/** The pencil — body carries the flame gradient (the ONLY colored element),
 *  cream ferrule band, cream wood tip, dark graphite. Tip DOWN (writing). */
const dPencil = (gradId: string) => `
    <g transform="translate(22 60) rotate(20)">
      <rect x="-6" y="-44" width="12" height="56" rx="2" fill="url(#${gradId})"/>
      <rect x="-6" y="12" width="12" height="6" fill="#FBF9F4"/>
      <path d="M-6 18 L6 18 L0 34 Z" fill="#F4EFE6"/>
      <path d="M-2.2 28.2 L2.2 28.2 L0 34 Z" fill="#111A30"/>
    </g>`;
const dGrad = (id: string, from: string, to: string) => `
    <linearGradient id="${id}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>`;
/** SURV[bolt]VE wordmark — letters stay Concept B's currentColor; the bolt is
 *  slightly TALLER than the caps (ascends above, descends below the baseline). */
const dWordmark = (gradId: string, from: string, to: string) => `<svg viewBox="0 0 340 104" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>${dGrad(gradId, from, to)}</defs>
  <text x="6" y="78" font-family="'League Spartan','Sora',system-ui,sans-serif" font-weight="800" font-size="66" letter-spacing="3" fill="currentColor">SURV</text>
  <g transform="translate(183 20) scale(0.56)">${dBolt()}${dPencil(gradId)}
  </g>
  <text x="222" y="78" font-family="'League Spartan','Sora',system-ui,sans-serif" font-weight="800" font-size="66" letter-spacing="3" fill="currentColor">VE</text>
</svg>`;
/** Standalone bolt+pencil (no letters). `anim` adds a subtle SMIL write-stroke
 *  loop on the pencil (intro/app only — static stays the primary mark). */
const dStandalone = (gradId: string, from: string, to: string, opts?: { pencil?: boolean; anim?: boolean }) => `<svg viewBox="0 0 100 136" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>${opts?.pencil === false ? "" : dGrad(gradId, from, to)}</defs>
  <g transform="translate(28 8)">${dBolt()}${opts?.pencil === false ? "" : `
    <g transform="translate(22 60) rotate(20)">${opts?.anim ? `
      <animateTransform attributeName="transform" type="translate" additive="sum" values="0 0; 2.2 3; 0.6 1.2; -1.4 -0.8; 0 0" dur="1s" repeatCount="indefinite"/>` : ""}
      <rect x="-6" y="-44" width="12" height="56" rx="2" fill="url(#${gradId})"/>
      <rect x="-6" y="12" width="12" height="6" fill="#FBF9F4"/>
      <path d="M-6 18 L6 18 L0 34 Z" fill="#F4EFE6"/>
      <path d="M-2.2 28.2 L2.2 28.2 L0 34 Z" fill="#111A30"/>
    </g>`}
  </g>
</svg>`;

export const LOGO_CONCEPTS: LogoConcept[] = [
  {
    id: "A",
    name: "Bolt-in-circle",
    blurb: "A circular badge split navy/amber along the bolt's diagonal — the cream bolt IS the seam. Jam-band badge grammar, nothing else in the circle.",
    marks: [
      {
        id: "a-badge",
        label: "Badge",
        sizes: [200, 64, 16],
        svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="saA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FCA311"/>
      <stop offset="1" stop-color="#E0284A"/>
    </linearGradient>
    <clipPath id="saAc"><circle cx="50" cy="50" r="44"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="47" fill="#FBF9F4" stroke="#0A1128" stroke-opacity="0.18" stroke-width="1.5"/>
  <g clip-path="url(#saAc)">
    <rect width="100" height="100" fill="url(#saA)"/>
    <path d="M62 2 54 42 72 42 26 98 110 110 110 -10 Z" fill="#0A1128"/>
  </g>
  <path d="M62 2 30 56 46 56 26 98 72 42 54 42 Z" fill="#FBF9F4"/>
</svg>`,
      },
    ],
  },
  {
    id: "B",
    name: "Bolt-as-S",
    blurb: "The S in SURVIVE is a lightning letterform — icon and wordmark are one object. The isolated S doubles as the standalone mark (that's the one that shrinks to 16px).",
    marks: [
      {
        id: "b-wordmark",
        label: "Wordmark",
        ratio: 400 / 96,
        sizes: [72, 28],
        svg: `<svg viewBox="0 0 400 96" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="saB" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FCA311"/>
      <stop offset="1" stop-color="#E0284A"/>
    </linearGradient>
  </defs>
  <g transform="translate(18 0) skewX(-8)">
    <path d="M60 34 H30 L26 56 H52 L48 78 H14" fill="none" stroke="url(#saB)" stroke-width="13" stroke-linecap="square" stroke-linejoin="miter"/>
  </g>
  <text x="74" y="78" font-family="'League Spartan','Sora',system-ui,sans-serif" font-weight="800" font-size="66" letter-spacing="3" fill="currentColor">URVIVE</text>
</svg>`,
      },
      {
        id: "b-smark",
        label: "S-bolt (standalone)",
        sizes: [200, 64, 16],
        svg: `<svg viewBox="0 0 96 96" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="saBS" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FCA311"/>
      <stop offset="1" stop-color="#E0284A"/>
    </linearGradient>
  </defs>
  <g transform="translate(26 10) skewX(-8)">
    <path d="M58 8 H24 L19 38 H50 L45 68 H8" fill="none" stroke="url(#saBS)" stroke-width="15" stroke-linecap="square" stroke-linejoin="miter"/>
  </g>
</svg>`,
      },
    ],
  },
  {
    id: "D",
    name: "Bolt-as-I + pencil",
    blurb: "SURV⚡VE — the I is an original multi-notch bolt, slightly taller than the caps, sitting proud of the wordmark (offset shadow + edge light). Inverted colors: letters stay Concept B's neutral, the bolt goes dark charcoal-navy, and the PENCIL inside carries the flame — compare the brand amber→red pencil against the hotter orange→yellow. Bolt-alone is the tiny-context fallback.",
    marks: [
      { id: "d-word-brand", label: "Wordmark — brand amber→red pencil", ratio: 340 / 104, sizes: [72, 28], svg: dWordmark("saDw1", "#FCA311", "#E0284A") },
      { id: "d-word-hot", label: "Wordmark — hot orange→yellow pencil", ratio: 340 / 104, sizes: [72, 28], svg: dWordmark("saDw2", "#FF7A00", "#FFE03D") },
      { id: "d-mark-brand", label: "Standalone — brand pencil", sizes: [200, 64, 32, 16], svg: dStandalone("saDs1", "#FCA311", "#E0284A") },
      { id: "d-mark-hot", label: "Standalone — hot pencil", sizes: [200, 64, 32, 16], svg: dStandalone("saDs2", "#FF7A00", "#FFE03D") },
      { id: "d-fallback", label: "Bolt alone — tiny-context fallback (≤ 24px)", sizes: [32, 16], svg: dStandalone("saDf", "#FCA311", "#E0284A", { pencil: false }) },
      { id: "d-anim", label: "Animated variant (intro/app only; static is primary)", sizes: [200, 96], svg: dStandalone("saDa", "#FF7A00", "#FFE03D", { anim: true }) },
    ],
  },
  {
    id: "C",
    name: "Minimal bolt badge",
    blurb: "The sparest bolt-in-circle — one ring, one bolt, all currentColor, so it works monochrome as the CEQ-card watermark and as an app icon.",
    marks: [
      {
        id: "c-mono",
        label: "Mono badge",
        sizes: [200, 64, 16],
        svg: `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="7"/>
  <path d="M60 12 34 54 48 54 32 88 70 44 54 44 Z" fill="currentColor"/>
</svg>`,
      },
    ],
  },
];
