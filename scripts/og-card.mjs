// OG CARD GENERATOR — writes public/og-card.png (1200x630), the link-preview image.
//
// ONE-OFF, NOT A BUILD STEP. It needs a rasteriser and a font file, neither of which the app
// itself uses, so nothing here is a dependency of the site. Run it only when the card changes:
//
//   # 1. the font — Google serves woff2 to a modern UA and TTF to a legacy one, and resvg
//   #    wants the TTF. The UA string is what selects the format; don't "clean it up".
//   curl -sL -A "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)" \
//     "https://fonts.googleapis.com/css2?family=Rubik:wght@900" \
//   | grep -o "https://[^)]*\.ttf" | head -1 | xargs curl -sL -o /tmp/Rubik-Black.ttf
//
//   # 2. render (npx, so @resvg/resvg-js never enters package.json — an npm install here also
//   #    rewrites package-lock.json, and this repo installs with bun)
//   npx --yes -p @resvg/resvg-js node scripts/og-card.mjs /tmp/Rubik-Black.ttf
//
// WHY GENERATED AND NOT DRAWN BY HAND: the wordmark on the site is live HTML text plus an inline
// SVG bolt, not artwork. Tracing it by hand would produce a share card that slowly stops matching
// the logo. Every number below is imported-by-copy from the real source and cited, so a drift is
// a visible diff rather than a thing nobody notices.
import { Resvg } from "@resvg/resvg-js";

// Canonical geometry, copied from src/components/canvas/brand.tsx so the card cannot drift from
// the bolt the site actually draws.
const BOLT_OUTER = "M76.02 3.9 L66.89 32.29 L85.06 31.98 L54.88 51.08 L77.05 50.77 L43.48 73.57 L76.74 73.57 L49.77 92.03 L63.19 94.82 L28.39 111.14 L42.56 112.07 L18.22 120.69 L22.53 128.7 L-8.27 137.63 L15.14 108.99 L-10.73 108.06 L26.85 92.35 L-11.54 90.51 L34.22 62.78 L3.83 64.94 L41.41 44 L21.39 38.45 L57.55 18.89 L42.46 15.29 Z";
const BOLT_RIGHT = "M75.53 3.74 L43.85 14.01 L56.41 19.96 L21.36 38.79 L42.92 44.46 L2.88 65.4 L34.3 61.71 L-10.67 90.66 L28.14 91.89 L-12.21 106.98 L14.99 110.04 L-10.11 138.7 L24.54 129.73 L19.03 121.61 L20.48 114.36 L23.38 107.69 L9.17 105.37 L46.87 95.8 L37.59 91.74 L61.08 78.4 L8.3 85.94 L59.34 56.36 L40.77 54.14 L70.06 35.77 L44.26 35.77 L69.77 22.72 Z";
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };

const NAVY = "#14213D", RED = "#CE1126", BLUE = "#0A3161", CREAM = "#F5EFE6", WHITE = "#FFFFFF";
const W = 1200, H = 630;

// LOCKUP MATHS. The wordmark is "surv" + bolt-as-the-i + "ve", so the bolt has to be measured
// against the cap height rather than guessed: it sits at 0.8x the type size with a baseline drop,
// exactly as SurviveWordmark does on the site.
const FS = 132;                       // wordmark size
const boltH = FS * 0.8;
const boltW = boltH * (VB.w / VB.h);
const survW = FS * 2.02;              // measured advance of "surv" in Rubik 900 at 1em ≈ 2.02
const veW   = FS * 1.03;              // "ve"
const gapL = FS * -0.015, gapR = FS * 0.03;
const lockW = survW + gapL + boltW + gapR + veW;
const x0 = (W - lockW) / 2;
const baseline = 292;                 // wordmark baseline (content optically centred in 630)

const boltX = x0 + survW + gapL + FS * (-1 / 96);   // offX nudge, matching SurviveWordmark
const boltY = baseline - boltH + FS * 0.13;
const scale = boltH / VB.h;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <g font-family="Rubik" font-weight="900" fill="${CREAM}" font-size="${FS}" letter-spacing="-1.3">
    <text x="${x0}" y="${baseline}">surv</text>
    <text x="${boltX + boltW + gapR}" y="${baseline}">ve</text>
  </g>
  <g transform="translate(${boltX} ${boltY}) scale(${scale}) translate(${-VB.x} ${-VB.y}) rotate(2 ${VB.w} ${VB.h * 0.51})">
    <path d="${BOLT_OUTER}" fill="${RED}" stroke="${WHITE}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
    <path d="${BOLT_RIGHT}" fill="${BLUE}"/>
  </g>
  <text x="${W / 2}" y="365" text-anchor="middle" font-family="Rubik" font-weight="900"
        font-size="40" letter-spacing="15" fill="${CREAM}" opacity="0.62">ACCOUNTING</text>
  <text x="${W / 2}" y="470" text-anchor="middle" font-family="Rubik" font-weight="900"
        font-size="46" fill="${CREAM}">Cram what&apos;s on your exam.</text>
</svg>`;

// keep the SVG next to the PNG for inspection/diffing
  writeFileSync("public/og-card.svg", svg);
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontBuffers: [readFileSync(process.argv[2] ?? "/tmp/Rubik-Black.ttf")], defaultFontFamily: "Rubik", loadSystemFonts: false },
});
const png = r.render().asPng();
writeFileSync("public/og-card.png", png);
console.log("wrote public/og-card.png", png.length, "bytes");
