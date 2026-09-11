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
import { flyerQrCaption } from "@/lib/rep-earnings";

// The house mark, for a flyer whose campus has no stored pair.
const FALLBACK_C1 = "#006BA6";
const FALLBACK_C2 = "#00456E";

export type FlyerInput = {
  schoolSlug: string;
  schoolName: string;
  courseCode: string | null;
  chapterSlug?: string;
  chapterName?: string;
  /** REP ATTRIBUTION rides in the QR ONLY: when set, the QR encodes /r/<code> (which sets the
   *  sa_ref cookie and 302s to the same /go page). The rep's NAME never appears on the flyer —
   *  chapter branding stays, attribution stays invisible. */
  refCode?: string;
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
  // A rep-attributed flyer scans to the tracked short link — the redirect lands on the same /go
  // (or campus) page, so the student sees nothing different; only the cookie does.
  if (i.refCode) return `https://surviveaccounting.com/r/${i.refCode}`;
  return i.chapterSlug
    // ?s=flyer IS the flyer's attribution stamp and always has been — the /go page reads it as
    // the "flyer" share source alongside ?via=link / ?via=groupme (see readVia there). Deliberately
    // NOT renamed to via=: every flyer already printed and pinned up in a chapter house carries
    // this exact param, and a rename would silently orphan all of them.
    ? `https://surviveaccounting.com/go/${i.schoolSlug}/${i.chapterSlug}?s=flyer`
    : `https://surviveaccounting.com/${i.schoolSlug}?s=flyer`;
}

/** THE MEETING SLIDE'S QR. Same destination, its own stamp — a scan from a projector in a chapter
 *  meeting is a different channel from a flyer on a wall, and the partner kit is the only thing
 *  that produces one. Rep attribution still wins, exactly as on the flyer. */
export function slideTarget(i: FlyerInput): string {
  if (i.refCode) return `https://surviveaccounting.com/r/${i.refCode}`;
  return i.chapterSlug
    ? `https://surviveaccounting.com/go/${i.schoolSlug}/${i.chapterSlug}?via=slide`
    : `https://surviveaccounting.com/${i.schoolSlug}?via=slide`;
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

async function qrDataUri(i: FlyerInput, target = flyerTarget(i)): Promise<string> {
  return QRCode.toDataURL(target, {
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
  <text x="1275" y="2872" fill="#F5F1E8" font-size="42" font-weight="600" text-anchor="middle">${esc(flyerQrCaption(i.courseCode))}</text>
  <text x="1275" y="2952" fill="#8B97BD" font-size="46" font-style="italic" text-anchor="middle">${i.chapterName ? esc(`Shared by ${i.chapterName}`) : ""}</text>
  <line x1="700" y1="3010" x2="1850" y2="3010" stroke="#2A3555" stroke-width="3"/>
  <text x="1275" y="3105" fill="#F5F1E8" font-size="58" font-weight="600" text-anchor="middle">surviveaccounting.com</text>
  <text x="1275" y="3175" fill="#5C6B99" font-size="38" text-anchor="middle">Free Exam 1 · No card required</text>
</svg>`;
}

// ── THE PRINT FLYER (2026-09-09) ─────────────────────────────────────────────────────────────
// The dark flyer above works on screen and is bad on paper — a chapter printing it at the house
// burns a full page of navy ink. This is a dedicated white, ink-friendly design for exactly that
// job: pin-on-a-corkboard, handed out at rush, 8.5x11 with safe margins. It shares FlyerInput,
// colorway(), heroCode(), flyerTarget() and qrDataUri() with the dark flyer — a campus's course
// code or colourway changes both designs from the same edit, nothing here duplicates that data.
//
// THE DARK FLYER IS NOT REMOVED. It stays reachable at ?f=digital / ?f=digitalpdf for a future
// social/digital use (see api.flyer.$school.$chapter.tsx) — this file only changes which design
// answers the DEFAULT ?f=pdf / ?f=svg the Print/Save button and the on-page preview already use.
const PRINT_INK = "#14213D";      // near-black navy body text — the brand navy, repurposed as ink
const PRINT_MUTED = "#5B6478";    // secondary text — readable on white, still legible in grayscale
const PRINT_RULE = "#D9DEE8";     // hairline dividers — a whisper of ink, never a fill
const PRINT_ACCENT = "#F5A623";   // the ONE other spot of solid colour besides the bolt, used twice

/** The chapter's own short URL, exactly what the QR encodes, minus the protocol and the `?s=flyer`
 *  attribution stamp — what a human reads under the code, not what the scanner reads. */
export function flyerDisplayUrl(i: FlyerInput): string {
  return flyerTarget(i).replace(/^https?:\/\//, "").replace(/\?.*$/, "");
}

/** The headline ("{code} EXAM 1") runs longer than the code alone, so it gets its own scale —
 *  same idea as courseFontSize, tuned for the extra two words. */
function printHeroFontSize(text: string): number {
  const n = text.length;
  if (n <= 12) return 190;
  if (n <= 16) return 160;
  return 130;
}

export async function printFlyerSvg(i: FlyerInput): Promise<string> {
  const { c1, c2 } = colorway(i.schoolSlug);
  const code = heroCode(i);
  const qr = await qrDataUri(i);
  const eyebrow = i.chapterName
    ? `FOR ${i.chapterName.toUpperCase()} · ${i.schoolName.toUpperCase()}`
    : `FOR ${i.schoolName.toUpperCase()} STUDENTS`;
  const line1 = `${code} EXAM 1`;
  const size1 = printHeroFontSize(line1);
  const url = esc(flyerDisplayUrl(i));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2550 3300" width="100%" font-family="Poppins, system-ui, sans-serif">
  <rect width="2550" height="3300" fill="#FFFFFF"/>

  <!-- THE BOLT — the one place strong school colour stays prominent. A dark keyline, not white,
       so it stays crisp on paper (a white stroke would vanish into the page). -->
  <g transform="translate(1275, 300) scale(1.05) translate(-45.4 0)">
    <path d="${BOLT_OUTER}" fill="${c1}" stroke="${PRINT_INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
    <path d="${BOLT_RIGHT}" fill="${c2}"/>
  </g>

  <text x="1275" y="560" fill="${PRINT_MUTED}" font-size="42" font-weight="700" letter-spacing="6" text-anchor="middle">${esc(eyebrow)}</text>
  <line x1="1075" y1="604" x2="1475" y2="604" stroke="${PRINT_RULE}" stroke-width="3"/>

  <text x="1275" y="830" fill="${PRINT_INK}" font-size="${size1}" font-weight="700" text-anchor="middle" letter-spacing="-4">${esc(line1)}</text>
  <text x="1275" y="1030" font-size="${size1}" font-weight="700" text-anchor="middle" letter-spacing="-4">
    <tspan fill="${PRINT_INK}">IS </tspan><tspan fill="${PRINT_ACCENT}">FREE.</tspan>
  </text>

  <text x="1275" y="1160" fill="${PRINT_INK}" font-size="72" font-weight="600" text-anchor="middle">Like Reels for exam prep.</text>
  <text x="1275" y="1250" fill="${PRINT_MUTED}" font-size="50" text-anchor="middle">2-minute cram videos + exam-style practice.</text>
  <line x1="700" y1="1320" x2="1850" y2="1320" stroke="${PRINT_RULE}" stroke-width="3"/>

  <!-- THE QR — one of the largest elements on the page, as specified. Black-on-white needs no
       colour to scan reliably, so it costs almost no ink even on a full-page print. -->
  <rect x="675" y="1400" width="1200" height="1200" rx="28" fill="#FFFFFF" stroke="${PRINT_RULE}" stroke-width="3"/>
  <image x="725" y="1450" width="1100" height="1100" href="${qr}"/>

  <text x="1275" y="2700" fill="${PRINT_INK}" font-size="64" font-weight="700" text-anchor="middle">Scan to start cramming →</text>
  <text x="1275" y="2770" fill="${PRINT_MUTED}" font-size="46" text-anchor="middle">${url}</text>
  <line x1="700" y1="2840" x2="1850" y2="2840" stroke="${PRINT_RULE}" stroke-width="3"/>

  <text x="1275" y="2930" font-size="46" font-weight="600" text-anchor="middle">
    <tspan fill="${PRINT_ACCENT}">✓ </tspan><tspan fill="${PRINT_MUTED}">Created by a pro tutor</tspan>
  </text>
  <text x="1275" y="2996" font-size="46" font-weight="600" text-anchor="middle">
    <tspan fill="${PRINT_ACCENT}">✓ </tspan><tspan fill="${PRINT_MUTED}">1,000+ students helped</tspan>
  </text>

  <text x="1275" y="3080" fill="${PRINT_MUTED}" font-size="38" font-style="italic" text-anchor="middle">Cram what&apos;s on your exam. Skip everything else.</text>
</svg>`;
}


// ── the slide (16:9) ───────────────────────────────────────────────────────────────────────────

/** ONE ASSET, TWO USES. The portrait flyer above is for printing and pinning up; this is the same
 *  message laid out for a projector at a chapter meeting — 1920×1080, the campus bolt at hero
 *  scale on the right, and a QR big enough to scan from the back of a room.
 *
 *  Deliberately NOT a deck. A room full of people looking at a slide will read one thing: the
 *  course, the offer, and the code to point a phone at. A second slide is a second thing nobody
 *  reads.
 *
 *  It shares colorway(), heroCode(), qrDataUri() and the brand bolt geometry with the flyer, so a
 *  campus that changes its course code or colours changes both at once. */
export async function slideSvg(i: FlyerInput): Promise<string> {
  const { c1, c2 } = colorway(i.schoolSlug);
  const code = heroCode(i);
  const qr = await qrDataUri(i, slideTarget(i));
  // The headline runs at 150 for a short code and steps down as the code grows, same rule the
  // flyer uses — just scaled for the shorter landscape measure.
  const codeSize = Math.round(courseFontSize(code) * 0.62);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="100%" font-family="Poppins, system-ui, sans-serif">
  <rect width="1920" height="1080" fill="#14213D"/>
  <rect x="0" y="0" width="1920" height="10" fill="#F5A623"/>
  <rect x="0" y="1070" width="1920" height="10" fill="#F5A623"/>

  <text x="120" y="150" fill="#F5F1E8" font-size="72" font-weight="700" letter-spacing="-1">survive</text>
  <text x="122" y="188" fill="#8B97BD" font-size="22" font-weight="600" letter-spacing="12">ACCOUNTING</text>

  <text x="120" y="300" fill="#F5A623" font-size="34" font-weight="700" letter-spacing="6">FOR ${esc(i.schoolName.toUpperCase())} STUDENTS</text>
  <text x="120" y="${codeSize + 340}" fill="#F5F1E8" font-size="${codeSize}" font-weight="700" letter-spacing="-4">${esc(code)}</text>
  <text x="120" y="${codeSize + 430}" fill="#F5F1E8" font-size="64" font-weight="700">Cram what&apos;s on your exam.</text>
  <text x="120" y="${codeSize + 496}" fill="#B9C2DC" font-size="34">Real exam-style questions, worked start to finish</text>
  <text x="120" y="${codeSize + 544}" fill="#B9C2DC" font-size="34">by a tutor who&apos;s helped 1,000+ students.</text>

  <rect x="120" y="820" width="560" height="76" rx="38" fill="#F5A623"/>
  <text x="400" y="871" fill="#14213D" font-size="36" font-weight="700" letter-spacing="3" text-anchor="middle">SCAN IT — EXAM 1 IS FREE</text>
  <text x="120" y="960" fill="#8B97BD" font-size="30" font-style="italic">${i.chapterName ? esc(`Shared by ${i.chapterName}`) : ""}</text>
  <text x="120" y="1015" fill="#F5F1E8" font-size="34" font-weight="600">surviveaccounting.com</text>

  <!-- the bolt, hero scale, in the campus colourway -->
  <g transform="translate(1290, 250) scale(3.4) translate(-45.4 0)">
    <path d="${BOLT_OUTER}" fill="${c1}" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
    <path d="${BOLT_RIGHT}" fill="${c2}"/>
  </g>

  <!-- QR: 380px square, scannable from the back of a chapter room -->
  <rect x="1480" y="700" width="320" height="320" rx="18" fill="#FFFFFF"/>
  <image x="1502" y="722" width="276" height="276" href="${qr}"/>
  <text x="1640" y="1052" fill="#F5F1E8" font-size="24" font-weight="600" text-anchor="middle">${esc(flyerQrCaption(i.courseCode))}</text>
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

/** Centred text, two colours on one line (e.g. "IS " + "FREE.") — centred as a single unit, then
 *  drawn as two adjacent runs so only the second part picks up the accent colour. Print flyer
 *  only; the dark flyer never needed this. */
function centreTwoTone(page: PDFPage, a: string, colorA: string, b: string, colorB: string, yTop: number, size: number, font: PDFFont) {
  const s = size * S;
  const wa = font.widthOfTextAtSize(a, s);
  const wb = font.widthOfTextAtSize(b, s);
  const x = 306 - (wa + wb) / 2;
  page.drawText(a, { x, y: Y(yTop), size: s, font, color: hex(colorA) });
  page.drawText(b, { x: x + wa, y: Y(yTop), size: s, font, color: hex(colorB) });
}

/** THE MEETING SLIDE, as a PDF — 16:9 landscape, one page, for the projector in a chapter
 *  meeting. Same content and colourway as slideSvg (which is the on-screen preview), drawn with
 *  the same pdf-lib primitives the flyer uses, because the same "no rasteriser" constraint at the
 *  top of this file applies. Left column reads at the back of the room; the QR is 40% of the
 *  height on the right and encodes slideTarget (?via=slide). */
export async function slidePdf(i: FlyerInput): Promise<Buffer> {
  const { c1, c2 } = colorway(i.schoolSlug);
  const code = heroCode(i);
  const f = await faces();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${i.chapterName ?? i.schoolName} — meeting slide`);
  const bold = await doc.embedFont(f["Poppins-Bold"]);
  const semi = await doc.embedFont(f["Poppins-SemiBold"]);
  const reg = await doc.embedFont(f["Poppins-Regular"]);
  const ital = await doc.embedFont(f["Poppins-Italic"]);

  // 16:9 at a comfortable projector size (13.33in × 7.5in at 72pt/in).
  const W = 960, H = 540;
  const page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(BG) });
  page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: hex("#F5A623") });
  page.drawRectangle({ x: 0, y: 0, width: W, height: 5, color: hex("#F5A623") });

  const L = 60;                       // left margin
  const top = (y: number) => H - y;   // measure down from the top like the SVG does
  page.drawText("survive", { x: L, y: top(78), size: 36, font: bold, color: hex("#F5F1E8") });
  page.drawText("ACCOUNTING", { x: L + 2, y: top(96), size: 11, font: semi, color: hex("#8B97BD"), ...{ characterSpacing: 6 } });

  if (i.chapterName) {
    page.drawText(i.chapterName.toUpperCase(), { x: L, y: top(160), size: 17, font: bold, color: hex("#F5A623"), ...{ characterSpacing: 3 } });
  }
  page.drawText(code, { x: L, y: top(228), size: Math.min(58, courseFontSize(code) * 0.2), font: bold, color: hex("#F5F1E8") });
  page.drawText("Exam 1 is free for the house.", { x: L, y: top(284), size: 30, font: bold, color: hex("#F5F1E8") });
  page.drawText("Cram videos + practice built on what actually gets tested.", { x: L, y: top(320), size: 16, font: reg, color: hex("#B9C2DC") });

  page.drawRectangle({ x: L, y: top(410), width: 300, height: 42, color: hex("#F5A623") });
  page.drawText("SCAN IT — EXAM 1 IS FREE", { x: L + 22, y: top(398), size: 15, font: bold, color: hex("#14213D"), ...{ characterSpacing: 2 } });
  page.drawText("surviveaccounting.com", { x: L, y: top(470), size: 15, font: semi, color: hex("#F5F1E8") });
  if (i.chapterName) page.drawText(`Shared by ${i.chapterName}`, { x: L, y: top(496), size: 12, font: ital, color: hex("#8B97BD") });

  // The bolt, between the copy and the QR.
  const bs = 1.15;
  page.drawSvgPath(BOLT_OUTER, { x: 630 - 45.4 * bs, y: top(120), scale: bs, color: hex(c1), borderColor: rgb(1, 1, 1), borderWidth: 8 * bs });
  page.drawSvgPath(BOLT_RIGHT, { x: 630 - 45.4 * bs, y: top(120), scale: bs, color: hex(c2) });

  // The QR, big enough to scan from the back row.
  const q = 216;
  page.drawRectangle({ x: W - q - 60 - 16, y: 60 - 16, width: q + 32, height: q + 32, color: rgb(1, 1, 1) });
  const qr = await doc.embedPng(await qrDataUri(i, slideTarget(i)));
  page.drawImage(qr, { x: W - q - 60, y: 60, width: q, height: q });
  // The line beneath every QR (comp spec §5) — a bare QR on a projector gets ignored too.
  {
    const cap = flyerQrCaption(i.courseCode);
    const cw = semi.widthOfTextAtSize(cap, 11);
    page.drawText(cap, { x: W - 60 - q / 2 - cw / 2, y: 26, size: 11, font: semi, color: hex("#F5F1E8") });
  }

  return Buffer.from(await doc.save());
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

  // Every QR gets a line of text beneath it — a bare QR on a corkboard gets ignored (comp spec §5).
  centre(page, flyerQrCaption(i.courseCode), 2872, 42, semi, "#F5F1E8");
  if (i.chapterName) centre(page, `Shared by ${i.chapterName}`, 2952, 46, ital, "#8B97BD");

  page.drawRectangle({ x: X(700), y: Y(3010), width: X(1150), height: X(3), color: hex("#2A3555") });
  centre(page, "surviveaccounting.com", 3105, 58, semi, "#F5F1E8");
  centre(page, "Free Exam 1 · No card required", 3175, 38, reg, "#5C6B99");

  return Buffer.from(await doc.save());
}

/** THE PRINT FLYER, as a PDF — same content and layout as printFlyerSvg, drawn with the exact
 *  same X()/Y()/centre() coordinate mapping the dark flyerPdf above uses, so a template-unit
 *  position means the same thing in both designs. White page, near-black ink, the campus bolt in
 *  its own colours with a dark (not white) keyline so it stays crisp on paper. This is what the
 *  default ?f=pdf now serves — see api.flyer.$school.$chapter.tsx. */
export async function printFlyerPdf(i: FlyerInput): Promise<Buffer> {
  const { c1, c2 } = colorway(i.schoolSlug);
  const code = heroCode(i);
  const f = await faces();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${i.chapterName ?? i.schoolName} — Survive Accounting (print)`);
  const bold = await doc.embedFont(f["Poppins-Bold"]);
  const semi = await doc.embedFont(f["Poppins-SemiBold"]);
  const ital = await doc.embedFont(f["Poppins-Italic"]);

  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });

  const eyebrow = i.chapterName
    ? `FOR ${i.chapterName.toUpperCase()} · ${i.schoolName.toUpperCase()}`
    : `FOR ${i.schoolName.toUpperCase()} STUDENTS`;
  const line1 = `${code} EXAM 1`;
  const size1 = printHeroFontSize(line1);

  // THE BOLT — same anchor pattern as the dark flyer's hero bolt (translate → scale → the -45.4
  // viewBox-half offset), just a smaller scale and a dark keyline instead of white.
  const bs = 1.05 * S;
  page.drawSvgPath(BOLT_OUTER, {
    x: 306 - 45.4 * bs, y: Y(300), scale: bs,
    color: hex(c1), borderColor: hex(PRINT_INK), borderWidth: 4 * bs,
  });
  page.drawSvgPath(BOLT_RIGHT, { x: 306 - 45.4 * bs, y: Y(300), scale: bs, color: hex(c2) });

  centre(page, eyebrow, 560, 42, bold, PRINT_MUTED, 6);
  page.drawRectangle({ x: X(1075), y: Y(604), width: X(400), height: X(3), color: hex(PRINT_RULE) });

  centre(page, line1, 830, size1, bold, PRINT_INK);
  centreTwoTone(page, "IS ", PRINT_INK, "FREE.", PRINT_ACCENT, 1030, size1, bold);

  centre(page, "Like Reels for exam prep.", 1160, 72, semi, PRINT_INK);
  centre(page, "2-minute cram videos + exam-style practice.", 1250, 50, semi, PRINT_MUTED);
  page.drawRectangle({ x: X(700), y: Y(1320), width: X(1150), height: X(3), color: hex(PRINT_RULE) });

  // THE QR — one of the largest elements on the page, same inset ratio as the dark flyer's box.
  page.drawRectangle({ x: X(675), y: Y(2600), width: X(1200), height: X(1200), color: rgb(1, 1, 1), borderColor: hex(PRINT_RULE), borderWidth: X(3) });
  const qr = await doc.embedPng(await qrDataUri(i));
  page.drawImage(qr, { x: X(725), y: Y(2550), width: X(1100), height: X(1100) });

  centre(page, "Scan to start cramming →", 2700, 64, bold, PRINT_INK);
  centre(page, flyerDisplayUrl(i), 2770, 46, semi, PRINT_MUTED);
  page.drawRectangle({ x: X(700), y: Y(2840), width: X(1150), height: X(3), color: hex(PRINT_RULE) });

  centreTwoTone(page, "✓ ", PRINT_ACCENT, "Created by a pro tutor", PRINT_MUTED, 2930, 46, semi);
  centreTwoTone(page, "✓ ", PRINT_ACCENT, "1,000+ students helped", PRINT_MUTED, 2996, 46, semi);

  centre(page, "Cram what's on your exam. Skip everything else.", 3080, 38, ital, PRINT_MUTED);

  return Buffer.from(await doc.save());
}
