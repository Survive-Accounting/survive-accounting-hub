// CHAPTER FLYER — one SVG template, ~1,100 chapters, rendered on demand.
//
// PIPELINE: template → token substitution → resvg (PNG) → pdf-lib (8.5x11 PDF).
//
// No headless browser. Puppeteer would be the obvious way to get SVG→PDF, but it is a ~300MB
// dependency and a cold start measured in seconds, for a page element most visitors never press.
// resvg rasterises the SVG at print resolution and pdf-lib wraps that bitmap in a correctly-sized
// page — a printed flyer is a photograph of a design, not a document anyone selects text in, so a
// 300 DPI raster is the right output and a tenth of the machinery.
//
// FONTS ARE VENDORED, NOT FETCHED. public/fonts holds Poppins 400/600/700/italic from the Google
// Fonts OFL repo, with OFL.txt beside them. SIL Open Font License 1.1 explicitly permits embedding
// and server-side rendering, so there is no licence obstacle — the obstacle was that the app loads
// every face from the Google CDN at runtime and therefore had no font FILES for a renderer to use.
//
// QR IS GENERATED LOCALLY. The rest of the app encodes QR through api.qrserver.com, which is fine
// for a screen that can be reloaded. A flyer is permanent: if that service is down, slow, or
// changes its output at the moment someone generates a print run, the failure is printed on paper.
// `qrcode` renders it in-process at error-correction H.
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";

import { SEC_SCHOOLS } from "@/components/canvas/brand";
import { BOLT_OUTER, BOLT_RIGHT } from "@/components/canvas/brand";
import { schoolBySlug } from "@/lib/schools";

/** Brand fallbacks, per the template's own header. */
const FALLBACK_C1 = "#CE1126";
const FALLBACK_C2 = "#1D4E9E";

export type FlyerInput = {
  schoolSlug: string;
  schoolName: string;
  courseCode: string | null;
  /** Chapter slug — omitted for a campus flyer. */
  chapterSlug?: string;
  chapterName?: string;
};

/** COURSE CODE AUTO-SIZING, per the template. Missouri's ACCTCY 2026 is 11 characters and lands in
 *  the smallest bucket; at 300 it would run past the artboard. */
export function courseFontSize(code: string): number {
  const n = code.length;
  if (n <= 8) return 300;
  if (n <= 10) return 240;
  return 200;
}

/** XML-escape anything interpolated into the SVG. A chapter name with an ampersand — "Alpha & Co" —
 *  would otherwise produce an SVG that fails to parse, and the flyer block would vanish with no
 *  explanation. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** The canonical URL a scan lands on, carrying flyer attribution. */
export function flyerTarget(i: FlyerInput): string {
  return i.chapterSlug
    ? `https://surviveaccounting.com/go/${i.schoolSlug}/${i.chapterSlug}?s=flyer`
    : `https://surviveaccounting.com/${i.schoolSlug}?s=flyer`;
}

/** THE FLYER BACKGROUND IS #14213D, AND SO IS OLE MISS'S c1. Drawn as-is, half the bolt vanishes
 *  into the paper — the audit flagged that colour as 1.09:1 against navy and this is where it
 *  actually bites. Any colour too close to the background is swapped for the school's other
 *  colour when that reads better, and falls back to brand red only if both are too dark. */
const BG = "#14213D";
const lum = (h: string) => {
  const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

function colorway(schoolSlug: string): { c1: string; c2: string } {
  const id = schoolBySlug(schoolSlug)?.id;
  const hit = id ? SEC_SCHOOLS.find((s) => s.id === id) : undefined;
  if (!hit) return { c1: FALLBACK_C1, c2: FALLBACK_C2 };
  let { c1, c2 } = hit;
  // 1.6:1 is the threshold the audit used for 'disappears into the navy'.
  if (contrast(c1, BG) < 1.6) {
    if (contrast(c2, BG) >= 1.6) [c1, c2] = [c2, c1];   // the school's own other colour first
    else c1 = FALLBACK_C1;                               // both too dark — brand red rather than mud
  }
  return { c1, c2 };
}

/** The template, with the placeholder bolt replaced by the REAL brand split-bolt geometry and the
 *  font family pointed at the vendored faces. */
function svgTemplate(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2550 3300" width="2550" height="3300" font-family="Poppins">
  <rect width="2550" height="3300" fill="#14213D"/>
  <rect x="0" y="0" width="2550" height="14" fill="#F5A623"/>
  <rect x="0" y="3286" width="2550" height="14" fill="#F5A623"/>

  <text x="1275" y="330" fill="#F5F1E8" font-size="112" font-weight="700" text-anchor="middle" letter-spacing="-2">survive</text>
  <text x="1275" y="382" fill="#8B97BD" font-size="34" font-weight="600" letter-spacing="18" text-anchor="middle">ACCOUNTING</text>

  <text x="1275" y="560" fill="#F5A623" font-size="54" font-weight="700" letter-spacing="10" text-anchor="middle">FOR {{SCHOOL_NAME}} STUDENTS</text>

  <text x="1275" y="880" fill="#F5F1E8" font-size="{{COURSE_SIZE}}" font-weight="700" text-anchor="middle" letter-spacing="-6">{{COURSE_CODE}}</text>

  <!-- THE REAL BRAND BOLT — same BOLT_OUTER/BOLT_RIGHT paths the site draws, white keyline kept.
       Its viewBox is -18.21 -2.26 109.27 146.96, so it is translated by its own origin and scaled
       to the ~430px the template's placeholder occupied. -->
  <g transform="translate(1275, 1000) scale(2.95) translate(-45.4 0)">
    <path d="${BOLT_OUTER}" fill="{{BOLT_C1}}" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
    <path d="${BOLT_RIGHT}" fill="{{BOLT_C2}}"/>
  </g>

  <text x="1275" y="1720" fill="#F5F1E8" font-size="96" font-weight="700" text-anchor="middle">Cram what&apos;s on your exam.</text>
  <text x="1275" y="1820" fill="#B9C2DC" font-size="52" text-anchor="middle">Real exam-style questions, worked start to finish</text>
  <text x="1275" y="1884" fill="#B9C2DC" font-size="52" text-anchor="middle">by a tutor who&apos;s helped 1,000+ students.</text>

  <rect x="855" y="1990" width="840" height="96" rx="48" fill="#F5A623"/>
  <text x="1275" y="2056" fill="#14213D" font-size="52" font-weight="700" letter-spacing="4" text-anchor="middle">SCAN IT — EXAM 1 IS FREE</text>

  <rect x="945" y="2150" width="660" height="660" rx="24" fill="#FFFFFF"/>
  <image x="975" y="2180" width="600" height="600" href="{{QR_DATA_URI}}"/>

  <text x="1275" y="2905" fill="#8B97BD" font-size="46" font-style="italic" text-anchor="middle">{{CHAPTER_LINE}}</text>

  <line x1="700" y1="3010" x2="1850" y2="3010" stroke="#2A3555" stroke-width="3"/>
  <text x="1275" y="3105" fill="#F5F1E8" font-size="58" font-weight="600" text-anchor="middle">surviveaccounting.com</text>
  <text x="1275" y="3175" fill="#5C6B99" font-size="38" text-anchor="middle">Free Exam 1 · No card required</text>
</svg>`;
}

export async function flyerSvg(i: FlyerInput): Promise<string> {
  const { c1, c2 } = colorway(i.schoolSlug);
  // NO PLACEHOLDER CODE. A campus with no verified code gets the honest generic hero rather than a
  // blank line or an invented "ACCT 101" printed on paper.
  const code = (i.courseCode ?? "").trim() || "INTRO ACCOUNTING";

  const qr = await QRCode.toDataURL(flyerTarget(i), {
    errorCorrectionLevel: "H",
    margin: 0,                       // the template's white card IS the quiet zone
    width: 600,
    color: { dark: "#000000", light: "#FFFFFF" },   // black on white only
  });

  return svgTemplate()
    .replace(/\{\{SCHOOL_NAME\}\}/g, esc(i.schoolName.toUpperCase()))
    .replace(/\{\{COURSE_SIZE\}\}/g, String(courseFontSize(code)))
    .replace(/\{\{COURSE_CODE\}\}/g, esc(code))
    .replace(/\{\{BOLT_C1\}\}/g, c1)
    .replace(/\{\{BOLT_C2\}\}/g, c2)
    .replace(/\{\{CHAPTER_LINE\}\}/g, i.chapterName ? esc(`Shared by ${i.chapterName}`) : "")
    .replace(/\{\{QR_DATA_URI\}\}/g, qr);
}

/** resvg 2.6 takes FILE PATHS, not buffers. Passing `fontBuffers` type-errors and is ignored at
 *  runtime, so the first render silently came out in a system fallback instead of Poppins —
 *  which is exactly the silent substitution the brief said to report rather than ship. */
const FONT_DIR = join(process.cwd(), "public", "fonts");

/** PNG at the template's native 2550x3300 — that IS 8.5x11 at 300 DPI. */
export async function flyerPng(i: FlyerInput): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const svg = await flyerSvg(i);
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: 2550 },
    font: { fontDirs: [FONT_DIR], defaultFontFamily: "Poppins", loadSystemFonts: false },
  });
  return Buffer.from(r.render().asPng());
}

/** 8.5x11 PDF. Page size is in POINTS (72/in), so 612x792 — the 2550x3300 bitmap laid onto it is
 *  300 DPI by construction. */
export async function flyerPdf(i: FlyerInput): Promise<Buffer> {
  const png = await flyerPng(i);
  const doc = await PDFDocument.create();
  doc.setTitle(`${i.chapterName ?? i.schoolName} — Survive Accounting`);
  const page = doc.addPage([612, 792]);
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  return Buffer.from(await doc.save());
}
