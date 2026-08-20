// OG CARD GENERATOR v2 — writes the DEFAULT card (public/og-card.png) and one CAMPUS card per
// school (public/og/campus/<slug>.png), 1200x630 each.
//
// ONE-OFF, NOT A BUILD STEP (same contract as the original og-card.mjs it extends): needs a
// rasteriser and font files that the app itself never uses, so nothing here enters package.json.
//
//   # fonts (already committed): public/fonts/Rubik-Black.ttf, Inter-SemiBold.ttf
//   #   (fetched from Google Fonts with an UNKNOWN user-agent — modern UAs get woff2 and the
//   #    old MSIE trick now gets EOT; an unrecognised UA is what yields plain TTF.)
//   # campus data: exported from src/lib/schools (slug, canonical name, course code, colorway):
//   bun -e "import { ALL_SCHOOLS, boltForSlug } from './src/lib/schools'; \
//     await Bun.write('/tmp/og-campuses.json', JSON.stringify(ALL_SCHOOLS.map(s => \
//     ({ slug: s.slug, name: s.name, courseCode: s.courseCode ?? null, ...boltForSlug(s.slug) }))))"
//   # render:
//   npx --yes -p @resvg/resvg-js node scripts/og-cards.mjs /tmp/og-campuses.json
//
// TYPOGRAPHY = THE SITE'S OWN FACES. Headlines and the wordmark are Rubik Black (BRAND_DISPLAY
// is Rubik); supporting text is Inter (BRAND_SANS is Inter).
//
// THE BUG THE OLD CARD SHIPPED WITH: resvg-js 2.6.2 silently IGNORES the documented
// `font.fontBuffers` option — every lookup misses, and with the miss it grabs a system face
// (a condensed DIN-alike on Windows). The original og-card.mjs used fontBuffers, so the live
// card's "Rubik" was never Rubik at all; that is the off-brand typography this rewrite fixes.
// `font.fontFiles` (paths) DOES register faces correctly — proven by side-by-side render —
// so this script only ever passes paths. If you touch font loading, re-render and LOOK.
//
// EVERY TEXT ELEMENT LIVES INSIDE A 60px SAFE MARGIN — iMessage crops edges. Long campus names
// step down two font sizes and then TRUNCATE; they never shrink below legibility.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

// Canonical geometry, copied from src/components/canvas/brand.tsx so the card cannot drift from
// the bolt the site actually draws.
const BOLT_OUTER = "M76.02 3.9 L66.89 32.29 L85.06 31.98 L54.88 51.08 L77.05 50.77 L43.48 73.57 L76.74 73.57 L49.77 92.03 L63.19 94.82 L28.39 111.14 L42.56 112.07 L18.22 120.69 L22.53 128.7 L-8.27 137.63 L15.14 108.99 L-10.73 108.06 L26.85 92.35 L-11.54 90.51 L34.22 62.78 L3.83 64.94 L41.41 44 L21.39 38.45 L57.55 18.89 L42.46 15.29 Z";
const BOLT_RIGHT = "M75.53 3.74 L43.85 14.01 L56.41 19.96 L21.36 38.79 L42.92 44.46 L2.88 65.4 L34.3 61.71 L-10.67 90.66 L28.14 91.89 L-12.21 106.98 L14.99 110.04 L-10.11 138.7 L24.54 129.73 L19.03 121.61 L20.48 114.36 L23.38 107.69 L9.17 105.37 L46.87 95.8 L37.59 91.74 L61.08 78.4 L8.3 85.94 L59.34 56.36 L40.77 54.14 L70.06 35.77 L44.26 35.77 L69.77 22.72 Z";
const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 };

const NAVY = "#14213D", RED = "#CE1126", BLUE = "#0A3161", CREAM = "#F5EFE6", WHITE = "#FFFFFF", GOLD = "#FCA311";
const W = 1200, H = 630, MARGIN = 60;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The bolt as an SVG group, `h` px tall with its top-left at (x, y). */
function bolt(x, y, h, c1 = RED, c2 = BLUE) {
  const scale = h / VB.h;
  return `<g transform="translate(${x} ${y}) scale(${scale}) translate(${-VB.x} ${-VB.y}) rotate(2 ${VB.w} ${VB.h * 0.51})">
    <path d="${BOLT_OUTER}" fill="${c1}" stroke="${WHITE}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
    <path d="${BOLT_RIGHT}" fill="${c2}"/>
  </g>`;
}

// ── DEFAULT CARD — the original wordmark lockup, tagline moved from Rubik to Inter ────────────
function defaultCard() {
  const FS = 132;
  const boltH = FS * 0.8;
  const boltW = boltH * (VB.w / VB.h);
  // MEASURED from the real Rubik-Black.ttf hmtx table (not eyeballed): "surv" advances sum to
  // 2.412em, "ve" to 1.253em. The old 2.02/1.03 were tuned against the impostor fallback font
  // the fontBuffers bug substituted, which is why the bolt collided once real Rubik loaded.
  // letter-spacing (-1.3px) applies after each glyph, so each run also loses chars×1.3.
  const survW = FS * 2.412 - 4 * 1.3, veW = FS * 1.253 - 2 * 1.3;
  const gapL = FS * -0.015, gapR = FS * 0.03;
  const lockW = survW + gapL + boltW + gapR + veW;
  const x0 = (W - lockW) / 2;
  const baseline = 292;
  const boltX = x0 + survW + gapL + FS * (-1 / 96);
  const boltY = baseline - boltH + FS * 0.13;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <g font-family="Rubik" font-weight="900" fill="${CREAM}" font-size="${FS}" letter-spacing="-1.3">
    <text x="${x0}" y="${baseline}">surv</text>
    <text x="${boltX + boltW + gapR}" y="${baseline}">ve</text>
  </g>
  ${bolt(boltX, boltY, boltH)}
  <text x="${W / 2}" y="365" text-anchor="middle" font-family="Rubik" font-weight="900"
        font-size="40" letter-spacing="15" fill="${CREAM}" opacity="0.62">ACCOUNTING</text>
  <text x="${W / 2}" y="472" text-anchor="middle" font-family="Inter" font-weight="600"
        font-size="42" fill="${CREAM}">Cram what&apos;s on your exam.</text>
</svg>`;
}

// ── CAMPUS CARD — school-colorway bolt + campus name + course code ────────────────────────────
/** Rubik Black caps run ≈0.66em average advance; sizes step down before truncation so a long
 *  name shrinks a little, then loses characters — never legibility. */
function fitName(name) {
  for (const fs of [84, 70, 58]) {
    if (name.length * 0.66 * fs <= W - MARGIN * 2) return { text: name, fs };
  }
  const max = Math.floor((W - MARGIN * 2) / (0.66 * 58)) - 1;
  return { text: name.slice(0, max) + "…", fs: 58 };
}

function campusCard({ name, courseCode, c1, c2 }) {
  const boltH = 190;
  const boltW = boltH * (VB.w / VB.h);
  const { text, fs } = fitName(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  ${bolt((W - boltW) / 2, 64, boltH, c1, c2)}
  <text x="${W / 2}" y="${348 + fs * 0.36}" text-anchor="middle" font-family="Rubik" font-weight="900"
        font-size="${fs}" letter-spacing="-1" fill="${CREAM}">${esc(text)}</text>
  <text x="${W / 2}" y="482" text-anchor="middle" font-family="Rubik" font-weight="900"
        font-size="52" fill="${GOLD}">${esc(courseCode ?? "Intro Accounting")}</text>
  <text x="${W / 2}" y="548" text-anchor="middle" font-family="Inter" font-weight="600"
        font-size="30" fill="${CREAM}" opacity="0.72">Cram videos + practice exams. Exam 1 is free.</text>
</svg>`;
}

// ── RENDER ────────────────────────────────────────────────────────────────────────────────────
// fontFiles, NEVER fontBuffers — see the header. loadSystemFonts stays false so a lookup miss
// renders as visibly missing text instead of silently borrowing whatever the OS has.
const render = (svg) =>
  new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: {
      fontFiles: ["public/fonts/Rubik-Black.ttf", "public/fonts/Inter-SemiBold.ttf"],
      defaultFontFamily: "Rubik",
      loadSystemFonts: false,
    },
  }).render().asPng();

writeFileSync("public/og-card.svg", defaultCard());
writeFileSync("public/og-card.png", render(defaultCard()));
console.log("wrote public/og-card.png");

const campuses = JSON.parse(readFileSync(process.argv[2] ?? "/tmp/og-campuses.json", "utf8"));
mkdirSync("public/og/campus", { recursive: true });
for (const c of campuses) {
  writeFileSync(`public/og/campus/${c.slug}.png`, render(campusCard(c)));
}
console.log(`wrote ${campuses.length} campus cards to public/og/campus/`);
