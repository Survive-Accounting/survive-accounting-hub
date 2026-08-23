// COMMS TEMPLATES — every student message, sequence email, broadcast, and founder alert, as
// ONE block structure rendered to plain text + near-plain HTML + (where defined) a one-segment
// SMS. Client-safe (pure functions, no env): the admin harness previews these in-browser.
//
// VOICE RULE (Lee, spec §0): from Lee, a person. First person, short, every one invites a
// reply. No marketing chrome. Subjects are sentence case. [TEST] prefixes test sends.
import type { IntakeKind } from "@/lib/comms/kinds";

export type TemplateKey =
  | "confirm_notify_exam" | "confirm_save_progress" | "confirm_syllabus" | "confirm_greek_member"
  | "confirm_greek_claim" | "confirm_rep" | "confirm_school_request" | "confirm_tutoring_request"
  | "confirm_outreach_page" | "confirm_question" | "confirm_chapter_seats"
  | "seq_exam_t10" | "seq_exam_t3" | "seq_exam_t1" | "seq_post_exam1_d1" | "seq_post_exam1_d7" | "seq_meet_lee"
  | "broadcast_exam_live"
  | "founder_priority" | "founder_batched";

export type TemplateCategory = "transactional" | "marketing" | "founder";

/** Everything a template may reference. Renderers degrade gracefully on missing fields. */
export interface TemplateCtx {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  school?: string | null;        // campus display name
  campusSlug?: string | null;    // → https://surviveaccounting.com/<slug>
  courseCode?: string | null;    // "ACCY 201"
  professor?: string | null;
  chapter?: string | null;       // Greek chapter display ("Kappa Alpha Theta")
  chapterLink?: string | null;   // /go/<school>/<chapter>
  exam?: number | null;          // 1..3, 99 = Final
  topic?: string | null;
  questionCount?: number | null; // Exam 1 practice questions live (default below)
  examDate?: string | null;      // ISO date for sequence A
  daysOut?: number | null;
  price?: number | null;         // paid exam price
  // "purchase" is a founder-alert LABEL, not an intake kind: the label map below already
  // renders it, and widening INTAKE_KINDS would add a value the intake table has no use for.
  kind?: IntakeKind | "purchase" | null;      // founder alerts
  adminLink?: string | null;     // founder alerts → /outreach/demand?lead=
  heldCount?: number | null;     // founder rate-limit: alerts held since the last one
  note?: string | null;          // free text the student left (syllabus notes, referral)
  unsubscribeLink?: string | null;
  preferencesLink?: string | null;
  isTest?: boolean;
  /** Chapter seats: the term label ("Fall 2026"), its expiry ("Dec. 31, 2026") and the count. */
  term?: string | null;
  expiresLabel?: string | null;
  seats?: number | null;
}

export const ORIGIN = "https://surviveaccounting.com";
export const EXAM1_QUESTION_COUNT = 206; // live Exam 1 practice questions (08-21 flip; per-set scenes authoritative)

type Block = string | { cta: string; href: string } | { sig: true };
interface Rendered { subject: string; text: string; html: string; sms?: string }

const first = (c: TemplateCtx) => (c.name ?? "").trim().split(/\s+/)[0] || "there";
const examLabel = (n?: number | null) => (n == null ? "your exam" : n === 99 ? "the Final" : `Exam ${n}`);
const examShort = (n?: number | null) => (n == null ? "Exam" : n === 99 ? "Final" : `Exam ${n}`);
const code = (c: TemplateCtx) => c.courseCode?.trim() || "intro accounting";
const startLink = (c: TemplateCtx) => (c.campusSlug ? `${ORIGIN}/${c.campusSlug}` : `${ORIGIN}/`);
const learnLink = () => `${ORIGIN}/learn`;
const qCount = (c: TemplateCtx) => c.questionCount ?? EXAM1_QUESTION_COUNT;
const sig: Block = { sig: true };

/** Short URL for SMS — the campus page when known, else the root. */
const smsLink = (c: TemplateCtx) => (c.campusSlug ? `surviveaccounting.com/${c.campusSlug}` : "surviveaccounting.com");

// ---- the copy -----------------------------------------------------------------------------
function blocksFor(key: TemplateKey, c: TemplateCtx): { subject: string; blocks: Block[]; sms?: string } {
  const n = first(c);
  switch (key) {
    case "confirm_notify_exam":
      return {
        subject: `You're on the list for ${examShort(c.exam)}`,
        blocks: [
          `Hey ${n},`,
          `You're on the list — I'll email you the day ${examLabel(c.exam)} videos go live for ${code(c)}. No spam in between.`,
          `While you wait: all the Exam 1 practice questions are already up and free. That's ${qCount(c)} questions with real exam-style problems — worth running through even before the videos land.`,
          { cta: "Start cramming Exam 1 →", href: startLink(c) },
          `If you've got a syllabus or study guide, send it my way and I'll make sure my videos line up with what your professor actually tests.`,
          sig,
        ],
        sms: `On the list for ${examShort(c.exam)} - I'll text the day it's live. Free Exam 1 practice now: ${smsLink(c)} - Lee`,
      };
    case "confirm_save_progress":
      return {
        subject: "Saved — pick up where you left off",
        blocks: [
          `Hey ${n},`,
          `Your progress is saved. Come back any time and you'll land right where you stopped.`,
          { cta: "Pick up where you left off →", href: learnLink() },
          `One thing worth doing now: send me your syllabus. Takes you 30 seconds and it lets me tell you exactly which of my videos map to your exam — and what's on your exam that I haven't covered yet.`,
          sig,
        ],
        sms: `Progress saved - pick up where you left off: surviveaccounting.com/learn - Lee`,
      };
    case "confirm_syllabus":
      return {
        subject: "Got your syllabus — I'll map it out",
        blocks: [
          `Hey ${n},`,
          `Got it. I'll go through your ${code(c)} syllabus and send you back a gameplan — which topics to cram, in what order, and what to skip.`,
          `Give me a day or two. If your exam is sooner than that, reply and tell me when — I'll bump you up.`,
          sig,
        ],
        sms: `Got your ${code(c)} syllabus - gameplan coming in a day or two. Exam sooner? Reply with the date and I'll bump you up. - Lee`,
      };
    case "confirm_greek_member":
      return {
        subject: `You're in — free Exam 1 for ${c.chapter ?? "your chapter"}`,
        blocks: [
          `Hey ${n},`,
          `You're in. Every Exam 1 cram video and practice question is unlocked for you, free.`,
          { cta: "Start cramming →", href: c.chapterLink ?? startLink(c) },
          `Send this to anyone in ${c.chapter ?? "your chapter"} who's in ${code(c)} — same link works for all of them: ${c.chapterLink ?? startLink(c)}`,
          sig,
        ],
        sms: `You're in - Exam 1 is free for ${c.chapter ?? "your chapter"}: ${(c.chapterLink ?? startLink(c)).replace(/^https?:\/\//, "")} - Lee`,
      };
    case "confirm_greek_claim":
      return {
        subject: `Got your claim for ${c.chapter ?? "your chapter"}`,
        blocks: [
          `Hey ${n},`,
          `Got your request to claim ${c.chapter ?? "your chapter"} at ${c.school ?? "your school"}. I'll review it and text you shortly — usually same day.`,
          `In the meantime, here's your chapter's link. Members can start Exam 1 free right now, before anything's set up: ${c.chapterLink ?? startLink(c)}`,
          sig,
        ],
        sms: `Got your ${c.chapter ?? "chapter"} claim - texting you today. Members start Exam 1 free: ${(c.chapterLink ?? startLink(c)).replace(/^https?:\/\//, "")} - Lee`,
      };
    // SEATS ACTIVATED. Sent to the exec the moment a term seat pool goes active (card, Stripe
    // invoice paid, or Lee marking a check paid). It names the term and the exact expiry,
    // because the whole point of the term model is that access ends on a date the chapter
    // agreed to — a confirmation that omitted it would be the surprise this model exists to
    // prevent.
    case "confirm_chapter_seats":
      return {
        subject: `${c.chapter ?? "Your chapter"} is covered — ${c.term ?? "this term"}`,
        blocks: [
          `Hey ${n},`,
          `${c.seats ?? "Your"} seat${c.seats === 1 ? "" : "s"} for ${c.chapter ?? "your chapter"} are active for ${c.term ?? "this term"}. Assigned members get Exam 2, Exam 3 and the Final through ${c.expiresLabel ?? "the end of the term"}.`,
          `Assign your seats → ${c.adminLink ?? "https://surviveaccounting.com/chapters/dashboard"}`,
          c.note ?? "",
          sig,
        ].filter(Boolean),
        sms: `${c.chapter ?? "Your chapter"} is covered for ${c.term ?? "this term"} - assign seats: surviveaccounting.com/chapters/dashboard - Lee`,
      };
    case "confirm_rep":
      return {
        subject: "Got your campus rep application",
        blocks: [
          `Hey ${n},`,
          `Thanks for putting your name in for ${c.school ?? "your campus"}. I read every one of these myself and I'll reach out personally within a couple of days.`,
          sig,
        ],
        sms: `Got your campus rep application for ${c.school ?? "your campus"} - I'll reach out personally within a couple of days. - Lee`,
      };
    case "confirm_school_request":
      return {
        subject: `Thanks — noted ${c.school ?? "your school"}`,
        blocks: [
          `Hey ${n},`,
          `Thanks for telling me about ${c.school ?? "your school"}. I add campuses based on who asks, so this genuinely moves it up the list.`,
          `In the meantime, the videos still work — intro accounting is nearly the same course everywhere.`,
          { cta: "Start Exam 1 free →", href: `${ORIGIN}/` },
          sig,
        ],
        sms: `Noted ${c.school ?? "your school"} - that moves it up the list. The videos still work in the meantime: surviveaccounting.com - Lee`,
      };
    case "confirm_tutoring_request":
      return {
        subject: "Got your request — I'll text you within a day",
        blocks: [
          `Hey ${n},`,
          `Got your ${code(c)} request${c.professor ? ` (Prof. ${c.professor})` : ""}. I'll look at what you sent and text you within one business day with how I'd attack it.`,
          `While you wait, the Exam 1 practice questions are free and already up — ${qCount(c)} of them.`,
          { cta: "Start cramming Exam 1 →", href: startLink(c) },
          sig,
        ],
        sms: `Got your ${code(c)} request - I'll text you within a business day. Free practice in the meantime: ${smsLink(c)} - Lee`,
      };
    case "confirm_outreach_page":
      return {
        subject: `You're on the list for ${code(c)}`,
        blocks: [
          `Hey ${n},`,
          `You're on the list for ${code(c)}${c.school ? ` at ${c.school}` : ""}. I'll email you the moment the videos for your exam go live.`,
          `Until then, the Exam 1 practice questions are free — ${qCount(c)} real exam-style problems.`,
          { cta: "Start cramming Exam 1 →", href: startLink(c) },
          `If you sent a syllabus, I'll go through it and send a gameplan. If you didn't, reply with it and I will.`,
          sig,
        ],
        sms: `You're on the list for ${code(c)} - I'll text the day the videos are live. Free practice now: ${smsLink(c)} - Lee`,
      };

    case "confirm_question":
      return {
        subject: `Got your question on ${c.topic ?? "that problem"}`,
        blocks: [
          `Hey ${n},`,
          `Got your question on ${c.topic ?? "that problem"}${c.chapter ? ` (${c.chapter})` : ""}. I'll answer it myself — usually same day, and if a few people are stuck on the same one it's the next thing I film.`,
          c.note ? `You wrote: "${c.note.slice(0, 400)}"` : "",
          `Keep cramming in the meantime — the questions you get wrong now are the ones you'll get right on the exam.`,
          sig,
        ].filter((b) => b !== ""),
        sms: `Got your question on ${c.topic ?? "that problem"} - I'll answer it myself, usually same day. - Lee`,
      };

    // ---- sequence A: exam-date triggered ---------------------------------------------------
    case "seq_exam_t10":
      return {
        subject: `${examShort(c.exam)} at ${c.school ?? "your school"} is in 10 days`,
        blocks: [
          `Hey ${n},`,
          `Ten days out. Here's what's on ${examLabel(c.exam)} for ${code(c)} and the topics I'd start with — links go straight to each one.`,
          { cta: `Open the ${examShort(c.exam)} topics →`, href: startLink(c) },
          c.price != null && (c.exam ?? 1) > 1
            ? `${examLabel(c.exam)} is a paid exam — $${c.price} for every video and practice set on it. Only worth it if you'll actually use it; the free Exam 1 material is still there either way.`
            : `Everything on Exam 1 is free. Start with the practice questions and let the videos fill in what you miss.`,
          `Reply if you want me to look at your syllabus and tell you what to skip.`,
          sig,
        ],
      };
    case "seq_exam_t3":
      return {
        subject: "3 days out — here's the order I'd cram in",
        blocks: [
          `Hey ${n},`,
          `Three days. Don't reread the chapters. Here's the order I'd go in for ${code(c)}, most-tested first:`,
          `1. The accounting cycle and adjusting entries — they're on every version of this exam.\n2. Journal entries: debits, credits, and "on account".\n3. Financial statements: which line goes where.\n4. Trial balances and closing entries last — quick points once the rest clicks.`,
          { cta: "Cram in this order →", href: startLink(c) },
          c.price != null && (c.exam ?? 1) > 1 ? `If you want the ${examShort(c.exam)} videos, they're $${c.price}: ${startLink(c)}` : `Every bit of it is free.`,
          sig,
        ],
      };
    case "seq_exam_t1":
      return {
        subject: `${code(c)} exam tomorrow`,
        blocks: [`${code(c)} exam tomorrow. Here's the last-minute list: ${startLink(c)} — Lee`],
        sms: `${code(c)} exam tomorrow. Here's the last-minute list: ${smsLink(c)} - Lee`,
      };

    // ---- sequence B: post-Exam-1 -------------------------------------------------------------
    case "seq_post_exam1_d1":
      return {
        subject: "How'd Exam 1 go?",
        blocks: [
          `Hey ${n},`,
          `Genuinely asking — how did Exam 1 go? Hit reply and tell me. What surprised you, what my stuff covered, what it didn't. I read every reply and it's how I decide what to film next.`,
          `If it went badly, tell me that too. That's the more useful email.`,
          sig,
          `P.S. Exam 2 topics are up when you're ready: ${startLink(c)}`,
        ],
      };
    case "seq_post_exam1_d7":
      return {
        subject: "Exam 2 topics are up",
        blocks: [
          `Hey ${n},`,
          `Exam 2 is up: merchandising, inventory (FIFO/LIFO), the multi-step income statement, internal controls, and receivables — the same cram-then-practice format as Exam 1.`,
          `It's $${c.price ?? 50} for everything on it. Exam 1 stays free regardless.`,
          { cta: "See what's on Exam 2 →", href: startLink(c) },
          sig,
        ],
      };

    // ---- sequence C: meet Lee ----------------------------------------------------------------
    case "seq_meet_lee":
      return {
        subject: "Why I made Survive Accounting",
        blocks: [
          `Hey ${n},`,
          `Quick story. My first accounting exam looked nothing like my notes. I'd been to every lecture, I'd done the reading, and I sat down to a page of problems I'd never practiced — because lectures teach you *about* accounting, and exams test whether you can *do* it.`,
          `That gap is the whole reason this exists. Every video I make starts from a real exam question, shows you what the question is actually asking, and then makes you work it before I do.`,
          `So: what are you stuck on right now? Reply and tell me — a topic, a problem type, a professor's weird wording. I answer these myself.`,
          sig,
        ],
      };

    // ---- broadcast --------------------------------------------------------------------------
    case "broadcast_exam_live":
      return {
        subject: `${examShort(c.exam)} videos are live`,
        blocks: [
          `Hey ${n},`,
          `You asked me to tell you — ${examLabel(c.exam)} videos are live${c.topic ? ` (${c.topic})` : ""}. Each set is a quick cram blast, the practice questions, then me working them.`,
          { cta: `Watch ${examShort(c.exam)} →`, href: startLink(c) },
          `Reply and tell me what's still confusing after — that's how the next round gets better.`,
          sig,
        ],
        sms: `${examShort(c.exam)} videos are live - you asked me to text you: ${smsLink(c)} - Lee`,
      };

    // ---- founder alerts ---------------------------------------------------------------------
    case "founder_priority": {
      const kindLabel = ({ syllabus: "SYLLABUS", greek_claim: "CHAPTER CLAIM", rep: "CAMPUS REP", purchase: "PURCHASE", question: `QUESTION ${c.topic ?? ""}`.trim() } as Record<string, string>)[c.kind ?? ""] ?? (c.kind ?? "LEAD").toUpperCase();
      const line = [c.name, c.school, c.courseCode, c.professor ? `Prof. ${c.professor}` : null, c.chapter].filter(Boolean).join(" · ");
      const smsLine = [c.name, c.school, c.courseCode, c.professor ? `Prof. ${c.professor}` : null, c.chapter].filter(Boolean).join(", ");
      return {
        subject: `⚡ ${kindLabel}: ${line || c.email || c.phone || "new"}`,
        blocks: [
          `${kindLabel}${c.heldCount ? ` (+${c.heldCount} held)` : ""}`,
          line || "(no context)",
          [c.email, c.phone].filter(Boolean).join(" · ") || "(no contact)",
          c.note ? `"${c.note.slice(0, 280)}"` : "",
          c.adminLink ? `Open: ${c.adminLink}` : "",
          c.phone ? `Text back: sms:${c.phone}` : "",
        ].filter((b) => b !== ""),
        // GSM-7 on purpose (no bolt, no middle dots) so Lee's alert is one segment.
        sms: `!! ${kindLabel}${c.heldCount ? ` (+${c.heldCount} held)` : ""}: ${smsLine || c.email || "new"}${c.phone ? ` ${c.phone}` : ""}${c.adminLink ? ` ${c.adminLink}` : ""}`,
      };
    }
    case "founder_batched": {
      const line = [c.kind, c.name, c.school, c.courseCode, c.email ?? c.phone].filter(Boolean).join(" · ");
      return { subject: line, blocks: [line] };
    }
  }
}

// ---- renderers ----------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** *word* → italics; newline → <br>; bare https:// and sms: URLs become links (founder alerts,
 *  chapter links in body copy). Deliberately the only markup a paragraph may carry. */
const inline = (s: string) =>
  esc(s)
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,)])/g, '<a href="$1" style="color:#14213D;">$1</a>')
    .replace(/(^|\s)(sms:\+?\d{7,15})/g, '$1<a href="$2" style="color:#14213D;">$2</a>')
    .replace(/\n/g, "<br>");

export function renderTemplate(key: TemplateKey, ctx: TemplateCtx): Rendered {
  const { subject: rawSubject, blocks, sms } = blocksFor(key, ctx);
  const subject = (ctx.isTest ? "[TEST] " : "") + rawSubject;
  const category = categoryOf(key);
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  for (const b of blocks) {
    if (typeof b === "string") {
      textParts.push(b.replace(/\*([^*]+)\*/g, "$1"));
      htmlParts.push(`<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1a1a1a;">${inline(b)}</p>`);
    } else if ("cta" in b) {
      textParts.push(`${b.cta.replace(/\s*→$/, "")}: ${b.href}`);
      htmlParts.push(`<p style="margin:0 0 18px;"><a href="${esc(b.href)}" style="display:inline-block;background:#14213D;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:11px 18px;border-radius:8px;">${esc(b.cta)}</a></p>`);
    } else {
      textParts.push("— Lee\nReply to this email if you need anything. I read every one.");
      htmlParts.push(`<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1a1a1a;">— Lee<br><span style="color:#555;">Reply to this email if you need anything. I read every one.</span></p>`);
    }
  }
  const footerText = footerFor(category, ctx, false);
  const footerHtml = footerFor(category, ctx, true);
  const text = [ctx.isTest ? "[TEST — sample data; nothing here went to a student]\n" : "", ...textParts].filter(Boolean).join("\n\n") + (footerText ? `\n\n${footerText}` : "");
  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">` +
    `<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    (ctx.isTest ? `<p style="margin:0 0 18px;font-size:12px;color:#B45309;background:#FEF3C7;padding:6px 10px;border-radius:6px;">TEST — sample data; nothing here went to a student</p>` : "") +
    htmlParts.join("") +
    (footerHtml ? `<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#777;">${footerHtml}</p>` : "") +
    `</div></body></html>`;
  return { subject, text, html, sms: sms ? (ctx.isTest ? `[TEST] ${sms}` : sms) : undefined };
}

function footerFor(category: TemplateCategory, c: TemplateCtx, html: boolean): string {
  if (category === "founder") return "";
  const pref = c.preferencesLink ?? `${ORIGIN}/u`;
  const unsub = c.unsubscribeLink ?? pref;
  const link = (href: string, label: string) => (html ? `<a href="${esc(href)}" style="color:#777;">${label}</a>` : `${label}: ${href}`);
  const who = `You're getting this because you signed up at surviveaccounting.com.`;
  if (category === "marketing") return `${who} ${link(unsub, "Unsubscribe")}${html ? " · " : " · "}${link(pref, "Email preferences")}`;
  return `${who} ${link(pref, "Email preferences")}`;
}

export function categoryOf(key: TemplateKey): TemplateCategory {
  if (key.startsWith("founder_")) return "founder";
  if (key.startsWith("confirm_")) return "transactional";
  return "marketing"; // sequences + broadcast carry unsubscribe (CAN-SPAM)
}

/** The confirmation template for an intake kind. */
export const confirmTemplateFor = (kind: IntakeKind): TemplateKey => {
  switch (kind) {
    case "notify_exam": return "confirm_notify_exam";
    case "save_progress": return "confirm_save_progress";
    case "syllabus": return "confirm_syllabus";
    case "greek_member": return "confirm_greek_member";
    case "greek_claim": return "confirm_greek_claim";
    case "rep": return "confirm_rep";
    case "school_request": return "confirm_school_request";
    case "referral": return "confirm_school_request";
    case "tutoring_request": return "confirm_tutoring_request";
    case "outreach_page": return "confirm_outreach_page";
    case "question": return "confirm_question";
  }
};

/** Every template, for the harness ("send me one of each") and the preview list. */
export const ALL_TEMPLATES: { key: TemplateKey; label: string; group: "Confirmations" | "Sequences" | "Broadcast" | "Founder alerts"; hasSms: boolean; smsOnly?: boolean }[] = [
  { key: "confirm_notify_exam", label: "notify_exam — You're on the list for Exam N", group: "Confirmations", hasSms: true },
  { key: "confirm_save_progress", label: "save_progress — Saved", group: "Confirmations", hasSms: true },
  { key: "confirm_syllabus", label: "syllabus — Got your syllabus", group: "Confirmations", hasSms: true },
  { key: "confirm_greek_member", label: "greek_member — You're in", group: "Confirmations", hasSms: true },
  { key: "confirm_greek_claim", label: "greek_claim — Got your claim", group: "Confirmations", hasSms: true },
  { key: "confirm_rep", label: "rep — Got your application", group: "Confirmations", hasSms: true },
  { key: "confirm_school_request", label: "school_request / referral — Noted", group: "Confirmations", hasSms: true },
  { key: "confirm_tutoring_request", label: "tutoring_request — Got your request", group: "Confirmations", hasSms: true },
  { key: "confirm_outreach_page", label: "outreach_page — You're on the list", group: "Confirmations", hasSms: true },
  { key: "confirm_question", label: "question — Got your question on 3.2.14", group: "Confirmations", hasSms: true },
  { key: "seq_exam_t10", label: "A · T-10 days", group: "Sequences", hasSms: false },
  { key: "seq_exam_t3", label: "A · T-3 days", group: "Sequences", hasSms: false },
  { key: "seq_exam_t1", label: "A · T-1 day (SMS only)", group: "Sequences", hasSms: true, smsOnly: true },
  { key: "seq_post_exam1_d1", label: "B · +1 day — How'd Exam 1 go?", group: "Sequences", hasSms: false },
  { key: "seq_post_exam1_d7", label: "B · +7 days — Exam 2 topics are up", group: "Sequences", hasSms: false },
  { key: "seq_meet_lee", label: "C · Why I made Survive Accounting", group: "Sequences", hasSms: false },
  { key: "broadcast_exam_live", label: "Exam N videos are live", group: "Broadcast", hasSms: true },
  { key: "founder_priority", label: "Priority alert (syllabus / claim / rep / purchase)", group: "Founder alerts", hasSms: true },
];

/** Realistic sample data for the harness + previews. */
export const SAMPLE_CTX: TemplateCtx = {
  name: "Maddie Carter",
  email: "maddie.carter@go.olemiss.edu",
  phone: "+16625550142",
  school: "Ole Miss",
  campusSlug: "university-of-mississippi",
  courseCode: "ACCY 201",
  professor: "Hawthorne",
  chapter: "Kappa Alpha Theta",
  chapterLink: `${ORIGIN}/go/university-of-mississippi/kappa-alpha-theta`,
  exam: 2,
  topic: "Merchandising",
  questionCount: EXAM1_QUESTION_COUNT,
  examDate: "2026-09-18",
  daysOut: 3,
  price: 50,
  kind: "syllabus",
  adminLink: `${ORIGIN}/outreach/demand?lead=sample`,
  heldCount: 0,
  isTest: true,
};
