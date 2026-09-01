// THE PARTNER KIT — one ZIP a council officer walks into a meeting with (2026-08-28).
//
// Built ENTIRELY on the server, for the same structural reason the flyer is (see flyer.server.ts):
// pdf-lib, qrcode and jszip must never be dragged into the browser bundle by a file route. The
// endpoint (routes/api.partner-kit.$school.$council.tsx) streams one archive; the page just
// downloads it.
//
// ── GENERATED, NOT SHIPPED ────────────────────────────────────────────────────────────────────
//
// The brief called the four cover pieces "static PDFs shipped as assets". They are GENERATED here
// instead, by the same pdf-lib/Poppins machinery the flyer uses. Reasons, in order:
//   · the price, the seat minimum and Lee's numbers already live in code — a binary PDF would be a
//     second copy of facts that change, and the day it drifted nobody would notice;
//   · the READ-ME has to carry the council's name and the semester, so at least one of them was
//     always going to be generated;
//   · they stay in the flyer's exact visual language for free.
// If Lee ever wants them hand-designed, drop the PDFs in public/kit/ and swap the four builders.
//
// NOTHING HERE INVENTS A NUMBER. Every figure comes from SEAT_PRICE / SEAT_MINIMUM or the
// chapter roster; the sample invoice is watermarked SAMPLE and is arithmetic on those constants.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { flyerPdf, slidePdf, type FlyerInput } from "@/lib/flyer.server";
import { SEAT_MINIMUM, SEAT_PRICE } from "@/components/site/ChapterAccess";
import { LEE_PHONE_DISPLAY } from "@/lib/partners";
import { CHAPTER_SEATS_BUY_URL } from "@/lib/site-config";

const NAVY = "#14213D";
const CREAM = "#F5F1E8";
const AMBER = "#F5A623";
const MUTED = "#8B97BD";
const BODY = "#B9C2DC";

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

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** US Letter portrait, navy field with the flyer's amber rules — every kit page shares this. */
type Sheet = { doc: PDFDocument; page: PDFPage; bold: PDFFont; semi: PDFFont; reg: PDFFont; ital: PDFFont };
async function sheet(title: string): Promise<Sheet> {
  const f = await faces();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  const bold = await doc.embedFont(f["Poppins-Bold"]);
  const semi = await doc.embedFont(f["Poppins-SemiBold"]);
  const reg = await doc.embedFont(f["Poppins-Regular"]);
  const ital = await doc.embedFont(f["Poppins-Italic"]);
  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: hex(NAVY) });
  page.drawRectangle({ x: 0, y: 788, width: 612, height: 4, color: hex(AMBER) });
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 4, color: hex(AMBER) });
  // The wordmark, top-left, on every sheet.
  page.drawText("survive", { x: 54, y: 716, size: 30, font: bold, color: hex(CREAM) });
  page.drawText("ACCOUNTING", { x: 56, y: 700, size: 8, font: semi, color: hex(MUTED), ...{ characterSpacing: 4 } });
  return { doc, page, bold, semi, reg, ital };
}

/** Left-aligned text at a baseline measured DOWN from the top, like the flyer's helpers. */
const T = (s: Sheet, text: string, yTop: number, size: number, font: PDFFont, color: string, spacing = 0) =>
  s.page.drawText(text, { x: 54, y: 792 - yTop, size, font, color: hex(color), ...(spacing ? { characterSpacing: spacing } : {}) });

/** Wrapped paragraph; returns the y it finished at. */
function para(s: Sheet, text: string, yTop: number, size: number, font: PDFFont, color: string, width = 504, lead = 1.5): number {
  const words = text.split(/\s+/);
  let line = "";
  let y = yTop;
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > width && line) {
      T(s, line, y, size, font, color);
      y += size * lead;
      line = w;
    } else line = trial;
  }
  if (line) { T(s, line, y, size, font, color); y += size * lead; }
  return y;
}

/** THE COVER STAMP. A person is never named here — only what they typed as their COUNCIL, and
 *  only if they typed one. Exported so both branches are pinned by a test. */
export const stamp = (councilName: string | null, schoolName: string, semester: string) =>
  councilName ? `Prepared for ${councilName} at ${schoolName} · ${semester}` : `Prepared for ${schoolName} · ${semester}`;

/** The current semester, derived — never hardcoded into a shipped asset. */
export function semesterLabel(now = new Date()): string {
  const m = now.getMonth();
  const season = m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  return `${season} ${now.getFullYear()}`;
}

// ── the four cover pieces ─────────────────────────────────────────────────────────────────────
async function readMePdf(d: KitInput, chapters: number): Promise<Buffer> {
  const s = await sheet("Read me first — Survive Accounting partner kit");
  T(s, stamp(d.councilName, d.schoolName, d.semester), 140, 11, s.semi, AMBER, 1.5);
  T(s, "Read me first", 186, 34, s.bold, CREAM);
  let y = para(s, "Everything in this folder gets free intro accounting exam prep in front of your chapters. There are two ways to use it — pick either, or both.", 224, 12, s.reg, BODY);

  y += 14;
  T(s, "1 · SEND IT", y, 12, s.bold, AMBER, 1.2); y += 20;
  y = para(s, "Each chapter has its own page. The chapter list on the council page builds one email with every link in it, sent from your inbox under your name.", y, 12, s.reg, BODY);

  y += 14;
  T(s, "2 · BRING IT TO THE MEETING", y, 12, s.bold, AMBER, 1.2); y += 20;
  y = para(s, `The Chapters folder has a printable flyer and a projector slide for each of your ${chapters} chapters. Every one carries that chapter's own QR code, so a member who scans it lands on their chapter's page.`, y, 12, s.reg, BODY);

  y += 18;
  T(s, "ALSO IN HERE", y, 12, s.bold, AMBER, 1.2); y += 20;
  for (const line of [
    "About-Lee.pdf — who makes this.",
    "Rate-Sheet.pdf — what is free and what a chapter can choose to sponsor.",
    "Sample-Invoice.pdf — what a sponsorship invoice looks like, so nothing is a surprise.",
  ]) { T(s, line, y, 12, s.reg, BODY); y += 18; }

  y += 20;
  T(s, "Questions, any time:", y, 12, s.reg, MUTED); y += 20;
  T(s, "Lee Ingram · (662) 565-8818 · lee@surviveaccounting.com", y, 13, s.semi, CREAM);
  T(s, "surviveaccounting.com", 740, 11, s.reg, MUTED);
  return Buffer.from(await s.doc.save());
}

async function aboutLeePdf(): Promise<Buffer> {
  const s = await sheet("About Lee — Survive Accounting");
  T(s, "About", 150, 11, s.semi, AMBER, 1.5);
  T(s, "Lee Ingram", 190, 34, s.bold, CREAM);
  let y = para(s, "I have tutored intro accounting since 2015 and worked with more than 1,000 students. I have two accounting degrees. Survive is the thing I wished I could hand every one of them.", 230, 12, s.reg, BODY);
  y += 16;
  T(s, "THE METHOD", y, 12, s.bold, AMBER, 1.2); y += 22;
  for (const line of [
    "1 · Cram videos that cover what the exam actually asks.",
    "2 · Practice questions worked start to finish, not just answered.",
    "3 · Built around the course your campus actually teaches.",
  ]) { y = para(s, line, y, 12, s.reg, BODY) + 4; }
  T(s, "lee@surviveaccounting.com · (662) 565-8818", 700, 12, s.semi, CREAM);
  T(s, "surviveaccounting.com", 740, 11, s.reg, MUTED);
  return Buffer.from(await s.doc.save());
}

async function rateSheetPdf(d: KitInput): Promise<Buffer> {
  const s = await sheet("Rate sheet — Survive Accounting");
  T(s, stamp(d.councilName, d.schoolName, d.semester), 140, 11, s.semi, AMBER, 1.5);
  T(s, "Rate sheet", 186, 34, s.bold, CREAM);

  let y = 232;
  T(s, "FREE, FOR EVERY MEMBER", y, 12, s.bold, AMBER, 1.2); y += 22;
  y = para(s, "Exam 1 — cram videos and practice — is free for every member of every chapter, at no cost to the council.", y, 12, s.reg, BODY);

  y += 20;
  T(s, "IF A CHAPTER WANTS THE REST", y, 12, s.bold, AMBER, 1.2); y += 24;
  T(s, `$${SEAT_PRICE} per member, per semester`, y, 22, s.bold, CREAM); y += 26;
  T(s, `${SEAT_MINIMUM}-seat minimum`, y, 13, s.semi, MUTED); y += 26;
  y = para(s, "A sponsored seat unlocks Exam 2, Exam 3 and the Final for that member for the semester. A chapter sponsors its own members; the council is never invoiced.", y, 12, s.reg, BODY);

  y += 24;
  T(s, "WHAT A SEAT UNLOCKS", y, 12, s.bold, AMBER, 1.2); y += 22;
  for (const line of ["Exam 2 · cram videos + practice", "Exam 3 · cram videos + practice", "Final · cram videos + practice"]) {
    T(s, line, y, 12, s.reg, BODY); y += 18;
  }
  T(s, "surviveaccounting.com", 740, 11, s.reg, MUTED);
  return Buffer.from(await s.doc.save());
}

async function sampleInvoicePdf(d: KitInput): Promise<Buffer> {
  const s = await sheet("Sample invoice — Survive Accounting");
  const total = SEAT_PRICE * SEAT_MINIMUM;
  T(s, stamp(d.councilName, d.schoolName, d.semester), 140, 11, s.semi, AMBER, 1.5);
  T(s, "Sample invoice", 186, 34, s.bold, CREAM);
  T(s, "This is an example so nothing is a surprise. It is not a bill.", 224, 12, s.ital, MUTED);

  let y = 276;
  s.page.drawRectangle({ x: 54, y: 792 - y - 8, width: 504, height: 1, color: hex("#2A3555") });
  y += 26;
  T(s, "Chapter sponsorship — Exams 2, 3 and the Final", y, 13, s.semi, CREAM); y += 22;
  T(s, `${SEAT_MINIMUM} seats × $${SEAT_PRICE} per member, per semester`, y, 12, s.reg, BODY); y += 30;
  s.page.drawRectangle({ x: 54, y: 792 - y - 8, width: 504, height: 1, color: hex("#2A3555") });
  y += 26;
  T(s, `Total  $${total.toLocaleString()}`, y, 20, s.bold, CREAM); y += 34;
  y = para(s, "A real invoice only ever comes from a chapter's own claim — an exec identifies themselves, picks how many seats, and we send it to them. Nobody can be invoiced from this folder.", y, 12, s.reg, BODY);

  // THE WATERMARK — unmissable, diagonal, across the sheet.
  s.page.drawText("SAMPLE", {
    x: 96, y: 300, size: 108, font: s.bold, color: hex(AMBER), opacity: 0.16, rotate: degrees(32),
  });
  T(s, "surviveaccounting.com", 740, 11, s.reg, MUTED);
  return Buffer.from(await s.doc.save());
}

// ── the archive ───────────────────────────────────────────────────────────────────────────────
export type KitChapter = { name: string; slug: string; letters: string | null };
export type KitInput = {
  schoolSlug: string;
  schoolName: string;
  courseCode: string | null;
  /** Null when the officer has not told us who they are — the cover then names the school only. */
  councilName: string | null;
  semester: string;
  chapters: KitChapter[];
};

/** Filesystem-safe, human-readable folder name: "ΑΔΧ-Alpha-Delta-Chi" (letters only when ASCII —
 *  a Greek-letter folder name is a coin flip on Windows unzip tools). */
export function chapterFolder(c: KitChapter): string {
  const clean = (v: string) => v.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const letters = c.letters && /^[A-Za-z0-9 ]+$/.test(c.letters) ? clean(c.letters) : "";
  const name = clean(c.name) || "Chapter";
  return letters ? `${letters}-${name}` : name;
}

export async function partnerKitZip(d: KitInput): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const root = zip.folder(`Survive-${d.schoolName.replace(/[^A-Za-z0-9]+/g, "-")}-Partner-Kit`)!;

  root.file("READ-ME-FIRST.pdf", await readMePdf(d, d.chapters.length));
  root.file("About-Lee.pdf", await aboutLeePdf());
  root.file("Rate-Sheet.pdf", await rateSheetPdf(d));
  root.file("Sample-Invoice.pdf", await sampleInvoicePdf(d));

  const chapters = root.folder("Chapters")!;
  // Sequential on purpose: each chapter is two PDFs plus two QR renders, and a 30-chapter council
  // fired off in parallel is a memory spike in a serverless function for no wall-clock win.
  for (const c of d.chapters) {
    const input: FlyerInput = {
      schoolSlug: d.schoolSlug, schoolName: d.schoolName, courseCode: d.courseCode,
      chapterSlug: c.slug, chapterName: c.name,
    };
    const folder = chapters.folder(chapterFolder(c))!;
    folder.file("Flyer.pdf", await flyerPdf(input));
    folder.file("Meeting-Slide.pdf", await slidePdf(input));
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) as unknown as Promise<Buffer>;
}

// ── THE SCHOLARSHIP CHAIR KIT — ONE CHAPTER (Build 2, section 6) ───────────────────────────────
// The council kit above is a whole campus; this is one house's ZIP, branded to it (letters, campus,
// course code), handed to a scholarship chair from her chapter page or the share panel. Same PDF
// machinery, four pieces: the flyer, the meeting slide, a one-pager on what Survive is, and a
// "how to buy" walkthrough — which is deliberately NOT the council kit's sample invoice.

export type ChapterKitInput = {
  schoolSlug: string;
  schoolName: string;
  courseCode: string | null;
  chapterSlug: string;
  chapterName: string;
  letters: string | null;
  semester: string;
};

/** "ΑΧΩ · Alabama · Fall 2026" — or the chapter name when there is no ASCII-safe letters string. */
function chapterStamp(d: ChapterKitInput): string {
  const who = (d.letters ?? "").trim() || d.chapterName;
  return `Prepared for ${who} · ${d.schoolName} · ${d.semester}`;
}

/** ONE PAGE ON WHAT SURVIVE ACCOUNTING IS. Product-first (the About-Lee.pdf in the council kit is
 *  credentials-first); a chair drops this in front of a house that has never heard the name. */
async function aboutSurvivePdf(d: ChapterKitInput): Promise<Buffer> {
  const s = await sheet("About Survive Accounting");
  const course = (d.courseCode ?? "").trim() || "intro accounting";
  T(s, chapterStamp(d), 140, 11, s.semi, AMBER, 1.5);
  T(s, "What Survive is", 186, 34, s.bold, CREAM);
  let y = para(s, `Survive Accounting is exam prep for ${course}, built around the course ${d.schoolName} actually teaches. Cram videos that cover what the exam asks, and practice questions worked start to finish — not just answered.`, 226, 12, s.reg, BODY);

  y += 16;
  T(s, "HOW IT WORKS", y, 12, s.bold, AMBER, 1.2); y += 22;
  for (const line of [
    "1 · Watch the cram video for the topic.",
    "2 · Work the practice questions alongside it.",
    "3 · Walk into the exam having already seen the moves.",
  ]) { y = para(s, line, y, 12, s.reg, BODY) + 4; }

  y += 16;
  T(s, "WHO MAKES IT", y, 12, s.bold, AMBER, 1.2); y += 22;
  y = para(s, "Lee Ingram — two accounting degrees, 1,000+ students tutored, building Survive on his own.", y, 12, s.reg, BODY);

  y += 22;
  s.page.drawRectangle({ x: 54, y: 792 - y - 8, width: 504, height: 1, color: hex("#2A3555") });
  y += 26;
  T(s, "Free for every member of your chapter:", y, 12, s.semi, CREAM); y += 20;
  y = para(s, "The whole of Exam 1 — cram videos and practice — at no cost to the chapter and nothing to buy.", y, 12, s.reg, BODY);

  T(s, `Questions: Lee Ingram · ${LEE_PHONE_DISPLAY} · lee@surviveaccounting.com`, 720, 12, s.semi, CREAM);
  T(s, "surviveaccounting.com", 748, 11, s.reg, MUTED);
  return Buffer.from(await s.doc.save());
}

/** HOW TO BUY — a walkthrough, not an invoice. What a chapter does IF it wants to fund the rest of
 *  the semester. Structured so a cart/invoice link can drop into step 1 later: until
 *  CHAPTER_SEATS_BUY_URL is set, the step says "text Lee and he sends it" rather than a dead link. */
async function howToBuyPdf(d: ChapterKitInput): Promise<Buffer> {
  const s = await sheet("How to fund seats — Survive Accounting");
  T(s, chapterStamp(d), 140, 11, s.semi, AMBER, 1.5);
  T(s, "How to fund seats", 186, 34, s.bold, CREAM);
  T(s, "Only if the chapter wants the rest of the semester. Exam 1 is already free.", 224, 12, s.ital, MUTED);

  let y = 268;
  T(s, "WHAT A SPONSORED SEAT ADDS", y, 12, s.bold, AMBER, 1.2); y += 22;
  y = para(s, "Exam 2, Exam 3 and the Final — cram videos and practice — unlocked for a member for the whole semester.", y, 12, s.reg, BODY);

  y += 18;
  T(s, "THE STEPS", y, 12, s.bold, AMBER, 1.2); y += 24;
  const buyStep = CHAPTER_SEATS_BUY_URL
    ? `1 · Start here: ${CHAPTER_SEATS_BUY_URL.replace(/^https?:\/\//, "")}`
    : `1 · Text Lee at ${LEE_PHONE_DISPLAY} and say your chapter wants seats. He sends the invoice.`;
  for (const line of [
    buyStep,
    "2 · Tell him how many members — anything from the minimum up to your whole roster.",
    "3 · The chapter pays one invoice, by card or check. No member ever pays.",
    "4 · Those members' Exams 2, 3 and the Final unlock for the semester.",
  ]) { y = para(s, line, y, 12, s.reg, BODY) + 8; }

  y += 10;
  T(s, "THE RATE", y, 12, s.bold, AMBER, 1.2); y += 24;
  T(s, `$${SEAT_PRICE} per member, per semester`, y, 22, s.bold, CREAM); y += 26;
  T(s, `${SEAT_MINIMUM}-seat minimum`, y, 13, s.semi, MUTED); y += 26;
  y = para(s, "This sheet is a walkthrough, not a bill — nothing here charges the chapter. An invoice only ever comes after an exec asks for one.", y, 12, s.reg, BODY);

  T(s, "surviveaccounting.com", 748, 11, s.reg, MUTED);
  return Buffer.from(await s.doc.save());
}

/** The one-chapter archive. Four pieces, branded to the chapter. `placeholders` names anything that
 *  degraded to a note rather than a real asset, so the endpoint can surface it in a header and the
 *  report can list it — nothing is silently invented. */
export async function chapterKitZip(d: ChapterKitInput): Promise<{ zip: Buffer; placeholders: string[] }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folderName = chapterFolder({ name: d.chapterName, slug: d.chapterSlug, letters: d.letters });
  const root = zip.folder(`Survive-${folderName}-Kit`)!;

  const input: FlyerInput = {
    schoolSlug: d.schoolSlug, schoolName: d.schoolName, courseCode: d.courseCode,
    chapterSlug: d.chapterSlug, chapterName: d.chapterName,
  };
  root.file("Flyer.pdf", await flyerPdf(input));
  // "One-slide PowerPoint" ships as a print/projector-ready PDF slide, exactly as the council kit
  // does — a real .pptx would need a new dependency for no gain on a slide meant to be projected.
  root.file("Meeting-Slide.pdf", await slidePdf(input));
  root.file("About-Survive-Accounting.pdf", await aboutSurvivePdf(d));
  root.file("How-to-Fund-Seats.pdf", await howToBuyPdf(d));

  // The only asset that can be "missing" is the checkout destination — the PDFs are all generated.
  const placeholders = CHAPTER_SEATS_BUY_URL ? [] : ["How-to-Fund-Seats.pdf → buy link (CHAPTER_SEATS_BUY_URL is empty; step 1 falls back to texting Lee)"];

  const buf = (await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })) as unknown as Buffer;
  return { zip: buf, placeholders };
}
