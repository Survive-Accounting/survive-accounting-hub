// SHARE TOOLS — available to anyone, on day one, with nothing claimed.
//
// These used to sit behind approval, which had the incentive exactly backwards: the moment a
// chapter is most likely to spread the link is the minute they first see the page, and a member who
// wants to drop it in the group chat is not going to fill in a form and wait a business day first.
// Nothing here costs anything or exposes anything private — it is a public URL and a sentence.
//
// The flyer is DATA, NOT CODE: site_settings.greekFlyerUrl. When it is empty the button is not
// rendered at all, rather than linking somewhere broken.
//
// Every action logs to expand_events, the existing generic event log, prefixed "greek_share:". It
// is inserted defensively there — analytics must never break a share.
import { useState } from "react";

import { BRAND_SANS } from "@/components/canvas/brand";
import { logExpandEvent } from "@/lib/referrals.functions";

/** One place, so the copied link and the printed flyer can never disagree. */
export const chapterUrl = (schoolSlug: string, chapterSlug: string) =>
  `https://surviveaccounting.com/go/${schoolSlug}/${chapterSlug}`;

/** The message someone actually pastes into GroupMe. Written to be forwarded verbatim: it says
 *  what it is, that it is free, and nothing that needs explaining. */
export const shareMessage = (chapterName: string, url: string) =>
  `Intro accounting is rough — ${chapterName} has free Exam 1 cram videos set up for us. Pick your professor and go: ${url}`;

export function ChapterShare({ schoolSlug, chapterSlug, chapterName, flyerUrl }: {
  schoolSlug: string;
  chapterSlug: string;
  chapterName: string;
  flyerUrl?: string;
}) {
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const url = chapterUrl(schoolSlug, chapterSlug);

  const track = (what: string) => {
    void logExpandEvent({ data: { event: `greek_share:${what}:${schoolSlug}/${chapterSlug}` } }).catch(() => {});
  };

  const copy = async (kind: "link" | "text") => {
    const text = kind === "link" ? url : shareMessage(chapterName, url);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      track(kind === "link" ? "copy_link" : "copy_message");
      window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
    } catch { /* clipboard blocked — the field below still shows the URL */ }
  };

  const BTN: React.CSSProperties = {
    minHeight: 46, background: "rgba(245,239,230,0.06)",
    border: "1px solid rgba(245,239,230,0.16)", color: "var(--brand-cream)",
  };

  return (
    <div className="mx-auto w-full max-w-sm" style={{ fontFamily: BRAND_SANS }}>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => void copy("link")} className="w-full rounded-xl px-4 text-[14px] font-bold" style={BTN}>
          {copied === "link" ? "Link copied ⚡" : "Copy chapter link"}
        </button>
        <button type="button" onClick={() => void copy("text")} className="w-full rounded-xl px-4 text-[14px] font-bold" style={BTN}>
          {copied === "text" ? "Message copied ⚡" : "Copy a message for the group chat"}
        </button>
        {flyerUrl && (
          <a
            href={flyerUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("flyer_download")}
            className="flex w-full items-center justify-center rounded-xl px-4 text-[14px] font-bold"
            style={BTN}
          >
            Download the flyer (PDF)
          </a>
        )}
      </div>
      {/* The URL in plain sight: clipboard access is blocked in some in-app browsers, and a link
          nobody can read is a dead end. */}
      <p className="mt-2 truncate text-center text-[11.5px]" style={{ color: "var(--text-muted)" }}>{url.replace("https://", "")}</p>
    </div>
  );
}
