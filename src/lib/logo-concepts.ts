// LOGO LAB CONCEPTS (pure data) — three SVG logo-mark concepts for Lee to
// evaluate on the /logo-lab comparison sheet. Token-driven colors only:
// navy #0A1128 · amber #FCA311 → red #E0284A gradient · cream #FBF9F4.
// LEGALLY DISTINCT by construction: no skull anywhere, no Grateful Dead stealie
// elements — a plain 6-point bolt + circle, navy/amber (not red/blue).
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
  id: "A" | "B" | "C";
  name: string;
  blurb: string;
  marks: LogoMark[];
}

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
