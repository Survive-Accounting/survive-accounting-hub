// SHARE WITH CHAPTERS — the modal behind the primary CTA on both council and national pages.
//
// ONE ACTION-FOCUSED SURFACE. A council or national officer already has a list of chapter leaders;
// what they do not have is the words to send. So this is nothing but ready-to-send copy: a leader
// email, a group-chat line, and every chapter's own link — each one press to the clipboard, with
// "copy all links" for the officer who works in bulk. No roster upload, no configuration, no
// account: V1 is copy-to-clipboard, which is all distribution actually needs.
//
// It is a centered dialog on desktop and a bottom sheet on a phone (same component, a media query
// on the panel), because on a phone a full-height sheet is what a share action is expected to be.
//
// Reuses the clipboard idiom every other share surface here uses (ChapterShare, PartnerToolkit):
// write, flip the label to "Copied ⚡", restore after ~1.8s, and never throw if the clipboard is
// blocked — the raw text stays visible so an in-app browser is not a dead end.
import { useEffect, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

export type ShareLink = { label: string; url: string };

export function ShareChaptersModal({ title, subtitle, email, message, links, linksLabel = "Chapter links", onClose }: {
  title: string;
  subtitle?: string;
  /** Ready-to-send leader email (subject + body). */
  email: string;
  /** Ready-to-send group-chat / text line. */
  message: string;
  /** Every chapter / campus link, copyable individually and in bulk. */
  links: ShareLink[];
  linksLabel?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);

  // Escape closes it; the body cannot scroll behind the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = prev; };
  }, [onClose]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch { /* clipboard blocked — the text is still on screen to select */ }
  };

  const copyAll = () => void copy("all", links.map((l) => l.url).join("\n"));

  return (
    <div
      role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(4,8,18,0.66)", fontFamily: BRAND_SANS }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl sm:max-w-[520px] sm:rounded-2xl"
        style={{ background: "var(--bg-overlay, #1A2948)", border: "1px solid var(--border-default)", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.85)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border-default)" }}>
          <div>
            <h2 className="text-[18px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
            <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>×</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ShareBlock
            heading="Email chapter leaders"
            body="Ready to send. Personalized with your council, campus and course."
            preview={email.split("\n").slice(0, 2).join("  ")}
            cta={copied === "email" ? "Copied ⚡" : "Copy email"}
            onCopy={() => void copy("email", email)}
          />
          <ShareBlock
            heading="GroupMe / text"
            body="One line for the group chat."
            preview={message}
            cta={copied === "msg" ? "Copied ⚡" : "Copy message"}
            onCopy={() => void copy("msg", message)}
          />

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14.5px] font-black" style={{ color: "var(--brand-cream)" }}>{linksLabel}</p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{links.length} link{links.length === 1 ? "" : "s"} — one per chapter.</p>
              </div>
              {links.length > 0 && (
                <button type="button" onClick={copyAll} className="shrink-0 rounded-lg px-3 text-[12.5px] font-black" style={{ minHeight: 40, background: "var(--accent)", color: "#0B1220" }}>
                  {copied === "all" ? "Copied ⚡" : "Copy all"}
                </button>
              )}
            </div>

            {links.length > 6 && !linksOpen ? (
              <button type="button" onClick={() => setLinksOpen(true)} className="mt-2 text-[13px] font-bold underline underline-offset-4" style={{ color: "var(--accent)" }}>
                Show all {links.length} chapter links
              </button>
            ) : (
              <div className="mt-2 overflow-hidden rounded-xl" style={{ border: "1px solid var(--border-subtle)" }}>
                {links.map((l) => (
                  <div key={l.url} className="flex items-center justify-between gap-3 border-b px-3.5 py-2 last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
                    <span className="min-w-0 truncate text-[13px]" style={{ color: "var(--brand-cream)" }}>{l.label}</span>
                    <button type="button" onClick={() => void copy(l.url, l.url)} className="shrink-0 rounded-lg px-2.5 text-[12px] font-bold" style={{ minHeight: 36, background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>
                      {copied === l.url ? "Copied ⚡" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareBlock({ heading, body, preview, cta, onCopy }: { heading: string; body: string; preview: string; cta: string; onCopy: () => void }) {
  return (
    <div className="mb-4 rounded-xl px-4 py-3.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-black" style={{ color: "var(--brand-cream)" }}>{heading}</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{body}</p>
        </div>
        <button type="button" onClick={onCopy} className="shrink-0 rounded-lg px-3 text-[13px] font-black" style={{ minHeight: 42, background: "var(--accent)", color: "#0B1220" }}>{cta}</button>
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] leading-snug" style={{ color: "var(--text-muted)", opacity: 0.85 }}>{preview}</p>
    </div>
  );
}
