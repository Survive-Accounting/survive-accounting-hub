// PRACTICE PACK (D5) — "Survive AC 210 · Exam 1 Practice Pack", the printable
// lead magnet. Generated SERVER-SIDE from the live bank so it is never stale;
// HTTP-cached by bank hash (the flyer's caching philosophy: no cache table,
// nothing to get out of step).
//
// THE HARD RULE, enforced in code and tested directly: ONLY content that is
// free in the app can ever reach the PDF. buildPackQuestions() reads the same
// deduped live decks the student player reads, keeps only decks in the ACTIVE
// Exam 1 unit whose access is not paid, and only live (non-draft,
// non-soft-archived, non-note) questions; assertPackSafety() then re-checks
// every deck and throws before a single byte renders. Exams 2/3/Final are
// paid units and can never enter — there is no code path that reads them.
//
// Drawing reuses the flyer's stack wholesale: pdf-lib + fontkit + the Poppins
// faces served from /fonts, the brand bolt geometry, and a qrcode PNG.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

import { BOLT_OUTER, BOLT_RIGHT } from "@/components/canvas/brand";
import { loadDecksDeduped, liveDecks, shippedPub } from "@/lib/student.functions";

const ORIGIN = process.env.SITE_ORIGIN || "https://surviveaccounting.com";
const BG = "#14213D";
const CREAM = "#F5F1E8";
const GOLDP = "#F5A623";
const MUTED = "#8B97BD";
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

export interface PackChoice { text: string; correct: boolean; feedback: string | null }
export interface PackQuestion { n: number; stem: string; choices: PackChoice[] }
export interface PackSet { name: string; questions: PackQuestion[] }
export interface PackTopic { name: string; sets: PackSet[] }
export interface PackInput {
  topics: PackTopic[];
  /** Stable content hash — the HTTP cache key. Changes when the bank changes. */
  hash: string;
  courseCode: string;
  schoolName: string | null;
  /** Optional discount code (env PDF_PROMO_CODE) — the slot doesn't render without it. */
  promoCode: string | null;
  qrTarget: string;
}

/** THE GUARD (QA gauntlet #5 tests this directly): throws unless every deck is
 *  free AND in the active Exam 1 unit. Paid tabs can never reach the pack. */
export function assertPackSafety(decks: { id: string; name: string; access?: string; inExam1Unit: boolean }[]): void {
  for (const d of decks) {
    if (d.access === "paid") throw new Error(`practice pack refused: paid set "${d.name}" (${d.id}) reached the generator`);
    if (!d.inExam1Unit) throw new Error(`practice pack refused: set "${d.name}" (${d.id}) is outside the Exam 1 unit`);
  }
}

/** djb2 over everything that shapes the output — id, stem, choices, correct. */
export function packHash(topics: PackTopic[]): string {
  let h = 5381;
  const eat = (s: string) => { for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; };
  for (const t of topics) { eat(t.name); for (const st of t.sets) { eat(st.name); for (const q of st.questions) { eat(q.stem); for (const c of q.choices) eat(`${c.correct ? "*" : ""}${c.text}|${c.feedback ?? ""}`); } } }
  return h.toString(36);
}

/** The free Exam-1 bank, in teaching order — the same store, the same gates,
 *  the same order the student player serves. */
export async function buildPackQuestions(admin: { from: (t: string) => any }): Promise<{ topics: PackTopic[]; hash: string }> {
  const owned = await loadDecksDeduped(admin);
  const live = liveDecks(owned);

  // The ACTIVE Exam 1 unit's chapters — the only chapters the pack may read.
  const { data: units } = await admin.from("exam_units").select("id,course_id,name,status").eq("status", "active");
  const exam1 = ((units ?? []) as { id: string; name: string }[]).find((u) => u.name === "Exam 1");
  if (!exam1) throw new Error("practice pack: no active Exam 1 unit");
  const { data: mem } = await admin.from("exam_unit_chapters").select("chapter_id").eq("exam_unit_id", exam1.id);
  const unitChapters = new Set(((mem ?? []) as { chapter_id: string }[]).map((m) => m.chapter_id));
  const { data: chapterRows } = await admin.from("chapters").select("id,chapter_name,chapter_number");
  const chById = new Map(((chapterRows ?? []) as { id: string; chapter_name: string; chapter_number: number }[]).map((c) => [c.id, c]));

  type CardData = { deckId?: string; stageOrder?: number; prompt?: string; noteOnly?: boolean; draft?: boolean; bankArchived?: string; choices?: { text?: string; correct?: boolean; feedback?: string }[] };
  const eligible = live
    .map((o) => ({ o, d: o.deck as { id: string; name: string; access?: string; topicId?: string | null; sortOrder?: number } }))
    .filter(({ d }) => d.access !== "paid" && !!d.topicId && unitChapters.has(d.topicId));

  // The guard runs over what we KEPT — and would throw if the filter above
  // ever regressed. Belt and braces, and the thing the tests attack.
  assertPackSafety(eligible.map(({ d }) => ({ id: d.id, name: d.name, access: d.access, inExam1Unit: !!d.topicId && unitChapters.has(d.topicId!) })));

  const topicsMap = new Map<string, { name: string; number: number; sets: { order: number; set: PackSet }[] }>();
  for (const { o, d } of eligible) {
    const ch = chById.get(d.topicId!)!;
    const cards = (o.nodes as { id: string; data?: CardData }[])
      .map((n) => n.data ?? {})
      .filter((c) => !c.noteOnly && !c.draft && !c.bankArchived && (c.prompt ?? "").trim() && (c.choices ?? []).length >= 2)
      .sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));
    if (!cards.length) continue;
    if (!topicsMap.has(ch.id)) topicsMap.set(ch.id, { name: ch.chapter_name, number: ch.chapter_number, sets: [] });
    topicsMap.get(ch.id)!.sets.push({
      order: d.sortOrder ?? 9999,
      set: {
        name: d.name.replace(/^"|"$/g, "").replace(/\[\s*\]/g, "___"),
        questions: cards.map((c, i) => ({
          n: i + 1,
          stem: String(c.prompt).trim(),
          choices: (c.choices ?? []).map((ch2) => ({ text: String(ch2.text ?? "").trim(), correct: !!ch2.correct, feedback: ch2.feedback?.trim() || null })),
        })),
      },
    });
  }
  const topics = [...topicsMap.values()]
    .sort((a, b) => a.number - b.number)
    .map((t) => ({ name: t.name, sets: t.sets.sort((a, b) => a.order - b.order).map((s) => s.set) }));
  return { topics, hash: packHash(topics) };
}

// ─────────────────────────────────────────────────────────── the drawing

const FACES = ["Poppins-Bold", "Poppins-SemiBold", "Poppins-Regular", "Poppins-Italic"] as const;
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

/** Greedy wrap by measured width — pdf-lib draws single lines only. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) <= maxWidth || !cur) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

const PAGE_W = 612, PAGE_H = 792;   // US Letter
const M = 54;                        // margin
const FOOT_H = 34;

export async function practicePackPdf(input: PackInput): Promise<Uint8Array> {
  const f = await faces();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Survive ${input.courseCode} · Exam 1 Practice Pack`);
  const bold = await doc.embedFont(f["Poppins-Bold"]);
  const semi = await doc.embedFont(f["Poppins-SemiBold"]);
  const reg = await doc.embedFont(f["Poppins-Regular"]);
  const ital = await doc.embedFont(f["Poppins-Italic"]);

  const footer = (page: PDFPage) => {
    page.drawText("survive ACCOUNTING", { x: M, y: 20, size: 8, font: bold, color: hex(MUTED) });
    page.drawText("surviveaccounting.com", { x: PAGE_W / 2 - reg.widthOfTextAtSize("surviveaccounting.com", 8) / 2, y: 20, size: 8, font: reg, color: hex(MUTED) });
    const tail = "Free Exam 1 practice — videos at the QR on the cover";
    page.drawText(tail, { x: PAGE_W - M - reg.widthOfTextAtSize(tail, 8), y: 20, size: 8, font: reg, color: hex(MUTED) });
  };

  // ---- COVER --------------------------------------------------------------
  {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: hex(BG) });
    page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: hex(GOLDP) });
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 6, color: hex(GOLDP) });
    page.drawText("survive", { x: M, y: PAGE_H - 110, size: 44, font: bold, color: hex(CREAM) });
    page.drawText("ACCOUNTING", { x: M + 3, y: PAGE_H - 132, size: 13, font: semi, color: hex(MUTED), ...{ characterSpacing: 7 } });
    const bs = 0.9;
    page.drawSvgPath(BOLT_OUTER, { x: PAGE_W - M - 100, y: PAGE_H - 80, scale: bs, color: hex(GOLDP), borderColor: rgb(1, 1, 1), borderWidth: 8 * bs });
    page.drawSvgPath(BOLT_RIGHT, { x: PAGE_W - M - 100, y: PAGE_H - 80, scale: bs, color: hex("#E08700") });

    page.drawText(`${input.courseCode}${input.schoolName ? ` · ${input.schoolName.toUpperCase()}` : ""}`, { x: M, y: PAGE_H - 250, size: 16, font: semi, color: hex(GOLDP), ...{ characterSpacing: 2 } });
    page.drawText("Exam 1 Practice Pack", { x: M, y: PAGE_H - 296, size: 34, font: bold, color: hex(CREAM) });
    page.drawText("Cram what's on your exam.", { x: M, y: PAGE_H - 328, size: 14, font: ital, color: hex(MUTED) });

    const q = 150;
    page.drawRectangle({ x: M - 10, y: 170 - 10, width: q + 20, height: q + 20, color: rgb(1, 1, 1) });
    const qrPng = await QRCode.toDataURL(input.qrTarget, { margin: 0, width: 300 });
    const qr = await doc.embedPng(qrPng);
    page.drawImage(qr, { x: M, y: 170, width: q, height: q });
    page.drawText("Scan for the cram videos + this practice, free.", { x: M + q + 26, y: 170 + q / 2 + 8, size: 12, font: semi, color: hex(CREAM) });
    page.drawText("surviveaccounting.com", { x: M + q + 26, y: 170 + q / 2 - 12, size: 12, font: reg, color: hex(MUTED) });

    if (input.promoCode) {
      page.drawText(`Bring this code to your Semester Pass: ${input.promoCode}`, { x: M, y: 120, size: 11.5, font: semi, color: hex(GOLDP) });
    }
    footer(page);
  }

  // ---- QUESTIONS, grouped by topic/set in teaching order ------------------
  let page = doc.addPage([PAGE_W, PAGE_H]);
  footer(page);
  let y = PAGE_H - M;
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); footer(page); y = PAGE_H - M; };
  const need = (h: number) => { if (y - h < M + FOOT_H) newPage(); };
  const width = PAGE_W - 2 * M;

  const answerKey: { ref: string; letter: string; feedback: string | null }[] = [];
  let qNum = 0;
  for (const topic of input.topics) {
    need(60);
    y -= 10;
    page.drawText(topic.name.toUpperCase(), { x: M, y, size: 15, font: bold, color: hex(BG), ...{ characterSpacing: 1.5 } });
    y -= 6;
    page.drawRectangle({ x: M, y, width, height: 2.5, color: hex(GOLDP) });
    y -= 20;
    for (const set of topic.sets) {
      need(44);
      page.drawText(set.name, { x: M, y, size: 11.5, font: semi, color: hex("#3D4A6B") });
      y -= 20;
      for (const q of set.questions) {
        qNum += 1;
        const stemLines = wrapText(`${qNum}. ${q.stem}`, semi, 10.5, width);
        const choiceLines = q.choices.map((c, i) => wrapText(`${String.fromCharCode(65 + i)}.  ${c.text}`, reg, 10, width - 18));
        const blockH = stemLines.length * 14 + choiceLines.reduce((a, l) => a + l.length * 13, 0) + 14;
        need(blockH);
        for (const line of stemLines) { page.drawText(line, { x: M, y, size: 10.5, font: semi, color: hex("#111827") }); y -= 14; }
        q.choices.forEach((c, i) => {
          for (const line of choiceLines[i]) { page.drawText(line, { x: M + 18, y, size: 10, font: reg, color: hex("#374151") }); y -= 13; }
          if (c.correct) answerKey.push({ ref: String(qNum), letter: String.fromCharCode(65 + i), feedback: c.feedback });
        });
        y -= 14;
      }
      y -= 6;
    }
  }

  // ---- ANSWER KEY ---------------------------------------------------------
  newPage();
  page.drawText("ANSWER KEY", { x: M, y, size: 16, font: bold, color: hex(BG), ...{ characterSpacing: 2 } });
  y -= 8;
  page.drawRectangle({ x: M, y, width, height: 2.5, color: hex(GOLDP) });
  y -= 22;
  for (const a of answerKey) {
    const head = `${a.ref}. ${a.letter}`;
    const lines = a.feedback ? wrapText(`${head} — ${a.feedback}`, reg, 9.5, width) : [head];
    need(lines.length * 12.5 + 4);
    for (const [i, line] of lines.entries()) {
      page.drawText(line, { x: M, y, size: 9.5, font: i === 0 ? semi : reg, color: hex("#111827") });
      y -= 12.5;
    }
    y -= 3;
  }

  return doc.save();
}
