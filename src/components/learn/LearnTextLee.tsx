// TEXT LEE, FLOATING (redesign, 2026-09-11) — bottom-right on every tier of /learn.
//
// Lee's photo (the same asset the home page's floating chat renders, /lee-text-avatar.jpg) in a
// 56px circle with a soft drop shadow that reads as standing off the page, plus a small chat glyph
// on its corner. A tap on a phone opens sms: — the number rides in the href. On a computer, where
// sms: goes nowhere useful, it opens a small card: the number, three lines, and a copy button.
// The old desktop behaviour (a choice of email or text) is gone, per the proposal.
//
// Copy rule (learn.tsx header): no "run" / "blast" / "pledge", no emoji. The chat glyph is drawn.
import { useState } from "react";
import { Check, Copy, MessageCircle, X } from "lucide-react";

import { LK } from "@/components/learn/learn-theme";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { useDismiss } from "@/lib/use-dismiss";

export const LEE_TEL = "+16625658818";
export const LEE_PHONE = "(662) 565-8818";
/** The photo the home page's FloatingContact frames above its pill. */
export const LEE_PHOTO = "/lee-text-avatar.jpg";

/** The three lines the desktop card says — as drafted in the proposal. */
export const TEXT_LEE_LINES = [
  "I love hearing from students.",
  "Ask anything, or just introduce yourself.",
  "I do my best to answer every single one.",
] as const;

const PHOTO_SIZE = 56;
const SHADOW = "0 14px 30px -8px rgba(0,0,0,0.85), 0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)";

export function LearnTextLee({ narrow, bottomOffset = 16 }: {
  /** Phone: the tap opens sms:. Otherwise the tap opens the card. */
  narrow: boolean;
  /** px above the safe area. */
  bottomOffset?: number;
}) {
  const [open, setOpen] = useState(false);
  const face = (
    <span className="relative block" style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, lineHeight: 0 }}>
      <img
        src={LEE_PHOTO} alt="" aria-hidden
        style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, objectFit: "cover", objectPosition: "50% 30%", borderRadius: "50%", border: `2px solid ${LK.text}`, boxShadow: SHADOW, display: "block" }}
      />
      <span className="absolute grid place-items-center rounded-full" style={{ right: -4, bottom: -4, width: 24, height: 24, background: LK.acc, color: LK.accInk, boxShadow: "0 6px 14px -4px rgba(0,0,0,0.9)" }}>
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
      </span>
    </span>
  );
  const wrap = { right: 16, bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` } as const;

  if (narrow) {
    return (
      <a href={`sms:${LEE_TEL}`} aria-label={`Text Lee at ${LEE_PHONE}`} className="fixed z-[90] block" style={wrap}>
        {face}
      </a>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Text Lee at ${LEE_PHONE}`} aria-expanded={open} className="fixed z-[90] block" style={{ ...wrap, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>
        {face}
      </button>
      {open && <TextLeeCard onClose={() => setOpen(false)} />}
    </>
  );
}

/** The desktop card: "Text Lee · (662) 565-8818", three lines, copy the number. */
function TextLeeCard({ onClose }: { onClose: () => void }) {
  const ref = useDismiss<HTMLDivElement>(onClose);
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () => {
    const ok = await copyToClipboard(LEE_PHONE);
    setCopied(ok);
    window.setTimeout(() => setCopied(null), 1800);
  };
  return (
    <div ref={ref} role="dialog" aria-label="Text Lee" className="lk-sheet lk-in fixed z-[95] rounded-2xl" style={{ right: 16, bottom: `calc(84px + env(safe-area-inset-bottom, 0px))`, width: 320, padding: 18 }}>
      <div className="flex items-start gap-3">
        <img src={LEE_PHOTO} alt="" aria-hidden style={{ width: 44, height: 44, objectFit: "cover", objectPosition: "50% 30%", borderRadius: "50%", border: `2px solid ${LK.text}`, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <p className="lk-disp" style={{ margin: 0, fontSize: 17, lineHeight: 1.2 }}>Text Lee</p>
          <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: LK.text, whiteSpace: "nowrap" }}>{LEE_PHONE}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: LK.border, color: LK.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      </div>
      <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 13.5, lineHeight: 1.45, color: LK.muted }}>
        {TEXT_LEE_LINES.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <button type="button" onClick={() => void copy()} className="lk-btn lk-btn-acc mt-3 w-full" style={{ minHeight: 44 }}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === true ? "Copied" : copied === false ? `Couldn't copy — ${LEE_PHONE}` : "Copy the number"}
      </button>
    </div>
  );
}
