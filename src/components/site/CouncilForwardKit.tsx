// THE FORWARD KIT — the part of the council page that actually produces signups.
//
// A council academics chair already has a mailing list of every chapter president. They are not
// going to compose an email about a tutoring service, and they are not going to look up sixteen
// chapter URLs. So everything here is written for them and copies in one press: the email, the
// group-chat line, and each chapter's own link.
//
// EVERY CHAPTER GETS ITS OWN LINK, and the email says so explicitly. A president who forwards the
// council page instead of their chapter's page produces signups attributed to nobody, which breaks
// the leaderboard that motivated the forward in the first place.
import { useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { logCouncilAction, type CouncilPage } from "@/lib/greek-councils.functions";

const SITE = "https://surviveaccounting.com";

/** The email a chair pastes into their existing presidents list. Written to be sent verbatim —
 *  it explains the free exam, tells each president to use THEIR link, and lists every one. */
export function presidentsEmail(page: CouncilPage): string {
  const course = page.courseCode ?? "intro accounting";
  const lines = page.chapters.map((c) => `${c.chapterName}: ${SITE}${c.goPath}`).join("\n");
  return [
    `Subject: Free ${course} cram videos for your chapter`,
    ``,
    `Hey all,`,
    ``,
    `${course} is one of the harder classes our members take, and it tends to hit a lot of them at`,
    `the same time. I found a tutor who makes cram videos built around what each school and`,
    `professor actually tests, and Exam 1 is free for every member — no cost to the chapter.`,
    ``,
    `Each chapter has its own page. Please send YOUR chapter's link to your members — the links are`,
    `per chapter so you can see how many of your own guys/girls are using it:`,
    ``,
    lines,
    ``,
    `Takes about a minute to share. Worth it if it saves a few grades.`,
    ``,
    `— ${page.councilName} Academics`,
  ].join("\n");
}

/** The short version for a presidents' GroupMe or Slack. */
export function groupChatMessage(page: CouncilPage): string {
  const course = page.courseCode ?? "intro accounting";
  return `Free ${course} cram videos for our chapters — Exam 1 is free for every member. Each chapter has its own link, grab yours and send it to your members. Full list here: (council page)`;
}

export function CouncilForwardKit({ page, token }: { page: CouncilPage; token?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState(false);

  const log = (action: "copy_email" | "copy_groupchat" | "copy_chapter_link" | "download_qr" | "download_flyer") => {
    void logCouncilAction({ data: { schoolSlug: page.schoolSlug, councilSlug: page.councilSlug, token: token ?? "", action } }).catch(() => {});
  };

  const copy = async (key: string, text: string, action: Parameters<typeof log>[0]) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
      log(action);
    } catch { /* clipboard blocked in some in-app browsers — the links are still listed below */ }
  };

  const BTN: React.CSSProperties = {
    minHeight: 50, background: "rgba(245,239,230,0.06)",
    border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)",
  };

  // Same public encoder the chapter kit already uses — no QR library added for one image.
  const councilUrl = `${SITE}/chapters`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data=${encodeURIComponent(councilUrl)}`;

  return (
    <section className="mt-12" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>FORWARD KIT</p>
      <h2 className="mt-2 text-[21px] font-black leading-[1.15] sm:text-[24px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Send it to your chapter presidents.
      </h2>
      <p className="mt-2 max-w-[54ch] text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Already written. Paste it into the list you already have — every chapter&apos;s own link is
        included, so each president shares the right one.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={() => void copy("email", presidentsEmail(page), "copy_email")} className="w-full rounded-xl px-4 text-[14.5px] font-bold" style={BTN}>
          {copied === "email" ? "Email copied ⚡" : "Copy email to all chapter presidents"}
        </button>
        <button type="button" onClick={() => void copy("chat", groupChatMessage(page), "copy_groupchat")} className="w-full rounded-xl px-4 text-[14.5px] font-bold" style={BTN}>
          {copied === "chat" ? "Message copied ⚡" : "Copy group-chat message"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <a href={qr} target="_blank" rel="noreferrer" onClick={() => log("download_qr")} className="flex items-center justify-center rounded-xl px-3 text-center text-[13.5px] font-bold" style={BTN}>
            Download QR slide
          </a>
          <a href="/chapters" target="_blank" rel="noreferrer" onClick={() => log("download_flyer")} className="flex items-center justify-center rounded-xl px-3 text-center text-[13.5px] font-bold" style={BTN}>
            Download flyer
          </a>
        </div>
      </div>

      {/* PER-CHAPTER LINKS. Collapsed, because a chair who is pasting the email does not need to
          scroll past sixteen URLs to reach the rest of the page — but one press away, because the
          chair who works chapter-by-chapter needs exactly this. */}
      <button type="button" onClick={() => setShowLinks((v) => !v)} aria-expanded={showLinks} className="mt-4 text-[13px] font-bold" style={{ color: "var(--accent)", minHeight: 44 }}>
        {showLinks ? "× Hide chapter links" : `+ Copy links chapter by chapter (${page.chapters.length})`}
      </button>

      {showLinks && (
        <div className="mt-2 overflow-hidden rounded-xl" style={{ border: "1px solid rgba(245,239,230,0.12)" }}>
          {page.chapters.map((c) => (
            <div key={c.chapterSlug} className="flex items-center justify-between gap-3 border-b px-3.5 py-2" style={{ borderColor: "rgba(245,239,230,0.08)" }}>
              <span className="min-w-0 truncate text-[13px]" style={{ color: "var(--brand-cream)" }}>{c.chapterName}</span>
              <button
                type="button"
                onClick={() => void copy(c.chapterSlug, `${SITE}${c.goPath}`, "copy_chapter_link")}
                className="shrink-0 rounded-lg px-2.5 text-[12px] font-bold"
                style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)", minHeight: 36 }}
              >
                {copied === c.chapterSlug ? "Copied ⚡" : "Copy link"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
