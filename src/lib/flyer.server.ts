// CHAPTER FLYER — one design, ~1,100 chapters, generated on demand.
//
// ── WHY THERE IS NO RASTERISER HERE ───────────────────────────────────────────────────────────
//
// The obvious build is SVG → resvg → PNG → PDF. It works perfectly in dev and does not deploy.
// resvg ships a native .node binary, and on this stack that produced a chain of failures that only
// ever appeared at BUILD time — tsc and the whole test suite stayed green throughout:
//
//   1. rollup tried to parse the .node binary as JavaScript          → ParseError
//   2. externalising it dragged node:path into the CLIENT bundle     → "join is not exported"
//   3. removing node:path pulled qrcode + pdf-lib in instead         → V8 out-of-memory
//   4. externalising all three finally built clean — and shipped NOTHING: the deployed function's
//      node_modules contained no @resvg, no qrcode, no pdf-lib. Every flyer would have 404'd in
//      production while rendering perfectly on localhost.
//
// The cause is structural. The flyer endpoint is a FILE ROUTE, so it lives in the client route tree
// and Vite follows even a dynamic import into the browser graph.
//
// So the PDF is drawn directly with pdf-lib — pure JavaScript, no binary, nothing to externalise.
// Text, rectangles, the QR image and the brand bolt (drawSvgPath) are all primitives it already
// has. The SVG is still generated for the on-page PREVIEW, where the browser is the renderer and
// has the fonts loaded already.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

import { BOLT_OUTER, BOLT_RIGHT, SEC_SCHOOLS } from "@/components/canvas/brand";
import { schoolBySlug } from "@/lib/schools";

const FALLBACK_C1 = "#CE1126";
const FALLBACK_C2 = "#1D4E9E";

export type FlyerInput = {
  schoolSlug: string;
  schoolName: string;
  courseCode: string | null;
  chapterSlug?: string;
  chapterName?: string;
};

/** Per the template: 300 for ≤8 chars, 240 for 9–10, 200 for 11+. Missouri's ACCTCY 2026 is 11. */
export function courseFontSize(code: string): number {
  const n = code.length;
  if (n <= 8) return 300;
  if (n <= 10) return 240;
  return 200;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function flyerTarget(i: FlyerInput): string {
  return i.chapterSlug
    ? `https://surviveaccounting.com/go/${i.schoolSlug}/${i.chapterSlug}?s=flyer`
    : `https://surviveaccounting.com/${i.schoolSlug}?s=flyer`;
}

// ── colourway, with the guard the template could not know it needed ──────────────────────────
//
// The flyer background is #14213D — which is EXACTLY Ole Miss's c1. Drawn as specified, half the
// bolt disappears into the paper. Any primary below 1.6:1 against the background swaps to the
// school's own secondary; brand red only if both are too dark.
const BG = "#14213D";
const lum = (h: string) => {
  const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

export function colorway(schoolSlug: string): { c1: string; c2: string } {
  const id = schoolBySlug(schoolSlug)?.id;
  const hit = id ? SEC_SCHOOLS.find((s) => s.id === id) : undefined;
  if (!hit) return { c1: FALLBACK_C1, c2: FALLBACK_C2 };
  let c1 = hit.c1, c2 = hit.c2;
  if (contrast(c1, BG) < 1.6) {
    if (contrast(c2, BG) >= 1.6) { const t = c1; c1 = c2; c2 = t; }
    else c1 = FALLBACK_C1;
  }
  return { c1, c2 };
}

/** Course code, never blank and never invented. */
export const heroCode = (i: FlyerInput) => (i.courseCode ?? "").trim() || "INTRO ACCOUNTING";

async function qrDataUri(i: FlyerInput): Promise<string> {
  return QRCode.toDataURL(flyerTarget(i), {
    errorCorrectionLevel: "H",   // as specified
    margin: 0,                   // the white card IS the quiet zone — deliberately not shrunk
    width: 600,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

/** THE PREVIEW SVG. Rendered by the browser, inline in the page, so it uses the Poppins the site
 *  has already loaded — no font embedding and no rasteriser. */
export async function flyerSvg(i: FlyerInput): Promise<string> {
  const { c1, c2 } = colorway(i.schoolSlug);
  const code = heroCode(i);
  const qr = await qrDataUri(i);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2550 3300" width="100%" font-family="Poppins, system-ui, sans-serif">
  <rect width="2550" height="3300" fill="#14213D"/>
  <rect x="0" y="0" width="2550" height="14" fill="#F5A623"/>
  <rect x="0" y="3286" width="2550" height="14" fill="#F5A623"/>
  <text x="1275" y="330" fill="#F5F1E8" font-size="112" font-weight="700" text-anchor="middle" letter-spacing="-2">survive</text>
  <text x="1275" y="382" fill="#8B97BD" font-size="34" font-weight="600" letter-spacing="18" text-anchor="middle">ACCOUNTING</text>
  <text x="1275" y="560" fill="#F5A623" font-size="54" font-weight="700" letter-spacing="10" text-anchor="middle">FOR ${esc(i.schoolName.toUpperCase())} STUDENTS</text>
  <text x="1275" y="880" fill="#F5F1E8" font-size="${courseFontSize(code)}" font-weight="700" text-anchor="middle" letter-spacing="-6">${esc(code)}</text>
  <g transform="translate(1275, 1000) scale(2.95) translate(-45.4 0)">
    <path d="${BOLT_OUTER}" fill="${c1}" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
    <path d="${BOLT_RIGHT}" fill="${c2}"/>
  </g>
  <text x="1275" y="1720" fill="#F5F1E8" font-size="96" font-weight="700" text-anchor="middle">Cram what&apos;s on your exam.</text>
  <text x="1275" y="1820" fill="#B9C2DC" font-size="52" text-anchor="middle">Real exam-style questions, worked start to finish</text>
  <text x="1275" y="1884" fill="#B9C2DC" font-size="52" text-anchor="middle">by a tutor who&apos;s helped 1,000+ students.</text>
  <rect x="855" y="1990" width="840" height="96" rx="48" fill="#F5A623"/>
  <text x="1275" y="2056" fill="#14213D" font-size="52" font-weight="700" letter-spacing="4" text-anchor="middle">SCAN IT — EXAM 1 IS FREE</text>
  <rect x="945" y="2150" width="660" height="660" rx="24" fill="#FFFFFF"/>
  <image x="975" y="2180" width="600" height="600" href="${qr}"/>
  <text x="1275" y="2905" fill="#8B97BD" font-size="46" font-style="italic" text-anchor="middle">${i.chapterName ? esc(`Shared by ${i.chapterName}`) : ""}</text>
  <line x1="700" y1="3010" x2="1850" y2="3010" stroke="#2A3555" stroke-width="3"/>
  <text x="1275" y="3105" fill="#F5F1E8" font-size="58" font-weight="600" text-anchor="middle">surviveaccounting.com</text>
  <text x="1275" y="3175" fill="#5C6B99" font-size="38" text-anchor="middle">Free Exam 1 · No card required</text>
</svg>`;
}

// ── the PDF ───────────────────────────────────────────────────────────────────────────────────

/** Fonts fetched from the deployment's own static output. public/ is NOT inside the serverless
 *  function, so reading them off disk works in dev and fails in production. One fetch per cold
 *  start, cached for the life of the instance. */
const ORIGIN = process.env.SITE_ORIGIN || "https://surviveaccounting.com";
const FACES = ["Poppins-Regular", "Poppins-SemiBold", "Poppins-Bold", "Poppins-Italic"] as const;
let FONTS: Record<string, ArrayBuffer> | null = null;
async function faces(): Promise<Record<string, ArrayBuffer>> {
  if (FONTS) return FONTS;
  const out: Record<string, ArrayBuffer> = {};
  await Promise.all(FACES.map(async (n) => {
    const r = await fetch(`${ORIGIN}/fonts/${n}.ttf`);
    if (!r.ok) throw new Error(`font ${n} → ${r.status}`);
    out[n] = await r.arrayBuffer();
  }));
  FONTS = out;
  return out;
}

const S = 612 / 2550;                 // template units → PDF points (8.5in at 72pt/in)
const X = (v: number) => v * S;
/** SVG measures down from the top; PDF measures up from the bottom. */
const Y = (y: number) => 792 - y * S;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** Centred text — every line in this design is centre-anchored. */
function centre(page: PDFPage, text: string, yTop: number, size: number, font: PDFFont, color: string, spacing = 0) {
  const s = size * S;
  const track = spacing * S;
  const w = font.widthOfTextAtSize(text, s) + track * Math.max(0, text.length - 1);
  page.drawText(text, {
    x: 306 - w / 2, y: Y(yTop), size: s, font, color: hex(color),
    ...(track ? { characterSpacing: track } : {}),
  });
}

export async function flyerPdf(i: FlyerInput): Promise<Buffer> {
  const { c1, c2 } = colorway(i.schoolSlug);
  const code = heroCode(i);
  const f = await faces();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${i.chapterName ?? i.schoolName} — Survive Accounting`);
  const bold = await doc.embedFont(f["Poppins-Bold"]);
  const semi = await doc.embedFont(f["Poppins-SemiBold"]);
  const reg = await doc.embedFont(f["Poppins-Regular"]);
  const ital = await doc.embedFont(f["Poppins-Italic"]);

  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: hex(BG) });
  page.drawRectangle({ x: 0, y: 792 - X(14), width: 612, height: X(14), color: hex("#F5A623") });
  page.drawRectangle({ x: 0, y: 0, width: 612, height: X(14), color: hex("#F5A623") });

  centre(page, "survive", 330, 112, bold, "#F5F1E8");
  centre(page, "ACCOUNTING", 382, 34, semi, "#8B97BD", 18);
  centre(page, `FOR ${i.schoolName.toUpperCase()} STUDENTS`, 560, 54, bold, "#F5A623", 10);
  centre(page, code, 880, courseFontSize(code), bold, "#F5F1E8");

  // The real brand bolt, same paths the site draws. pdf-lib's y grows upward, so the path is
  // flipped with a negative y-scale and anchored from its own viewBox origin.
  const bs = 2.95 * S;
  page.drawSvgPath(BOLT_OUTER, {
    x: 306 - 45.4 * bs, y: Y(1000), scale: bs,
    color: hex(c1), borderColor: rgb(1, 1, 1), borderWidth: 8 * bs,
  });
  page.drawSvgPath(BOLT_RIGHT, { x: 306 - 45.4 * bs, y: Y(1000), scale: bs, color: hex(c2) });

  centre(page, "Cram what's on your exam.", 1720, 96, bold, "#F5F1E8");
  centre(page, "Real exam-style questions, worked start to finish", 1820, 52, reg, "#B9C2DC");
  centre(page, "by a tutor who's helped 1,000+ students.", 1884, 52, reg, "#B9C2DC");

  page.drawRectangle({ x: X(855), y: Y(2086), width: X(840), height: X(96), color: hex("#F5A623") });
  centre(page, "SCAN IT — EXAM 1 IS FREE", 2056, 52, bold, "#14213D", 4);

  page.drawRectangle({ x: X(945), y: Y(2810), width: X(660), height: X(660), color: rgb(1, 1, 1) });
  const qr = await doc.embedPng(await qrDataUri(i));
  page.drawImage(qr, { x: X(975), y: Y(2780), width: X(600), height: X(600) });

  if (i.chapterName) centre(page, `Shared by ${i.chapterName}`, 2905, 46, ital, "#8B97BD");

  page.drawRectangle({ x: X(700), y: Y(3010), width: X(1150), height: X(3), color: hex("#2A3555") });
  centre(page, "surviveaccounting.com", 3105, 58, semi, "#F5F1E8");
  centre(page, "Free Exam 1 · No card required", 3175, 38, reg, "#5C6B99");

  return Buffer.from(await doc.save());
}
