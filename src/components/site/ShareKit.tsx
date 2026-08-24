// THE SHARE KIT — for an exec who needs the treasurer, the chapter or an advisor to say yes first.
//
// "Not ready to buy" is not a dead end; it is the most common state. This gives the exec the exact
// artefacts that conversation needs, already carrying their chapter, their campus, their course
// code and the term being sold — so nothing has to be rewritten by hand and nothing can quote a
// price or a date that disagrees with the seat screen.
//
// PRESALE TRAVELS WITH EVERY DOCUMENT. Anything that names a price also names the fact that Exams
// 2, 3 and the Final are still being filmed. That is the rule wherever money is discussed, and a
// pitch document a treasurer reads without us in the room is exactly where it matters most.
//
// EVERY ACTION IS LOGGED (chapter_share_events) so Lee can see which chapters are pitching
// internally — an ACTION log, never a viewing log.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { logShareEvent } from "@/lib/chapter-seats.functions";
import {
  CHAPTER_PRESALE_TIMING_COPY, PRESALE_DISCLOSURE, SEAT_PACKS, money, purchasableTerms, termId,
} from "@/lib/terms";

export function ChapterShareKit({ chapterId, chapterName, courseCode, chapterUrl, onClose, isTest }: {
  chapterId: string;
  chapterName: string;
  courseCode: string | null;
  /** The chapter's real /go/ URL — never a second identity for the chapter. */
  chapterUrl: string | null;
  onClose: () => void;
  isTest?: boolean;
}) {
  const term = purchasableTerms()[0];
  const course = courseCode ?? "intro accounting";
  const link = chapterUrl ?? "https://surviveaccounting.com/chapters";
  const [copied, setCopied] = useState<string | null>(null);

  const log = (kind: "flyer" | "treasurer_pdf" | "slide" | "groupchat" | "treasurer_email" | "invoice_link") =>
    void logShareEvent({ data: { chapterId, kind, termId: termId(term), isTest: !!isTest } }).catch(() => {});

  const copy = async (kind: "groupchat" | "treasurer_email", text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label); setTimeout(() => setCopied(null), 1800);
      log(kind);
    } catch { /* clipboard blocked — the text is on screen to select */ }
  };

  const pack = SEAT_PACKS[1]; // the 20-seat pack is the one most chapters land on
  const treasurerEmail = [
    `Subject: ${chapterName} — ${course} exam prep for the house (${term.label})`,
    ``,
    `Hey — asking about covering the chapter for ${term.label}.`,
    ``,
    `Survive Accounting makes ${course} cram videos and practice exams. Exam 1 is already free for every member. Seats cover a member for Exam 2, Exam 3 and the Final through ${term.expiresLabel}.`,
    ``,
    `Pricing: ${pack.seats} seats for ${money(pack.priceCents)} (${money(SEAT_PACKS[0].priceCents)} for ${SEAT_PACKS[0].seats}, ${money(SEAT_PACKS[2].priceCents)} for ${SEAT_PACKS[2].seats}). We can pay by card, by invoice to you, or by check.`,
    ``,
    `One thing to know up front: ${PRESALE_DISCLOSURE} ${CHAPTER_PRESALE_TIMING_COPY}`,
    ``,
    `Our chapter page: ${link}`,
  ].join("\n");

  const groupChat = `Free ${course} exam prep for the house ⚡ Exam 1 is free right now — ${link}. We're looking at covering everyone for Exam 2, 3 and the Final this ${term.label.split(" ")[0].toLowerCase()}.`;

  const items = [
    {
      key: "treasurer_email" as const,
      title: "Treasurer email",
      body: `Term, seats, pricing, expiration and the presale note — ready to send.`,
      action: () => void copy("treasurer_email", treasurerEmail, "Treasurer email"),
      cta: "Copy email →",
    },
    {
      key: "groupchat" as const,
      title: "Exec group-chat message",
      body: "One line for the exec chat, with your chapter link in it.",
      action: () => void copy("groupchat", groupChat, "Group message"),
      cta: "Copy message →",
    },
    {
      key: "flyer" as const,
      title: "Chapter flyer",
      body: "The printable flyer with your chapter's QR code.",
      href: chapterUrl ? `/chapters/kit${new URL(link).pathname.replace("/go", "")}` : null,
      cta: "Open flyer →",
    },
    {
      key: "treasurer_pdf" as const,
      title: "One-page treasurer PDF",
      body: "The advisor/treasurer handout — what Survive is, your course, pricing, term and the presale note.",
      soon: true,
      cta: "Download PDF",
    },
    {
      key: "slide" as const,
      title: "Chapter meeting slide",
      body: "A 16:9 slide with your letters, campus colours and the QR code.",
      soon: true,
      cta: "Download slide",
    },
  ];

  return (
    <section className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", fontFamily: BRAND_SANS }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Pitch it internally</h2>
          <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Everything below already says {chapterName}, {course} and {term.label} — access through {term.expiresLabel}.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-secondary)" }}>
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>×</span>
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.key} className="flex flex-col rounded-2xl px-4 py-4" style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)" }}>
            <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>{it.title}</p>
            <p className="mt-1 flex-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{it.body}</p>
            {it.soon ? (
              <span className="mt-3 inline-flex items-center self-start rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "rgba(245,239,230,0.05)", border: "1px dashed var(--border-default)", color: "var(--text-secondary)" }}>
                {it.cta} · coming
              </span>
            ) : it.href ? (
              <a href={it.href} onClick={() => log(it.key)} className="mt-3 inline-flex items-center self-start rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" }}>
                {it.cta}
              </a>
            ) : (
              <button type="button" onClick={it.action} className="mt-3 inline-flex items-center self-start rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 40, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: copied === it.title ? "var(--accent-info-text)" : "var(--brand-cream)" }}>
                {copied === it.title ? "Copied ⚡" : it.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "rgba(252,163,17,0.10)", border: "1px solid rgba(252,163,17,0.40)" }}>
        <p className="text-[13.5px] font-bold" style={{ color: "var(--brand-cream)" }}>{PRESALE_DISCLOSURE}</p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>{CHAPTER_PRESALE_TIMING_COPY}</p>
      </div>
    </section>
  );
}
