// TEXT LEE, FLOATING (redesign, 2026-09-11) — bottom-right on every tier of /learn, and since
// later that day on the home page too (Lee: "Change the / text Lee floating modal to match the
// one on /learn" — TwoDoorHome now mounts this instead of Marketing's FloatingContact).
//
// Lee's photo (the same asset the home page's floating chat renders, /lee-text-avatar.jpg) in a
// circle with a small accent badge. On a phone the tap opens sms: to Lee's number; on a desk it
// opens a card — "Text Lee · (662) 565-8818", the three lines as drafted, "Copy the number".
//
// TOKEN-AGNOSTIC so it looks the same on both pages: every colour is a --lk-* variable (the /learn
// room's) with the home page's token as the fallback, and its CSS is its own (.ltl-*), injected
// here — it leans on nothing LEARN_CSS defines. `narrow` may be omitted; then the phone/desk
// choice is read from the viewport in an effect (never in a useState initializer — SSR).
// Copy rule: no emoji; the number is written as Lee writes it.
import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { useDismiss } from "@/lib/use-dismiss";

export const LEE_TEL = "+16625658818";
export const LEE_PHONE = "(662) 565-8818";
export const LEE_PHOTO = "/lee-text-avatar.jpg";

/** The three lines the desktop card says — as drafted in the proposal. */
export const TEXT_LEE_LINES = [
  "I love hearing from students.",
  "Ask anything, or just introduce yourself.",
  "I do my best to answer every single one.",
] as const;

const PHOTO_SIZE = 56;
const SHADOW = "0 14px 30px -8px rgba(0,0,0,0.85), 0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)";

/** The room's tokens, the home page's as fallbacks. */
const T = {
  text: "var(--lk-text, var(--text-primary, #F7F0E6))",
  muted: "var(--lk-muted, var(--text-secondary, #AAB4C8))",
  surface: "var(--lk-surface, var(--bg-surface, #162443))",
  border: "var(--lk-border, var(--border-default, #34486D))",
  acc: "var(--lk-acc, var(--accent-primary, #FFA611))",
  accInk: "var(--lk-acc-ink, #0B1220)",
  shadow: "var(--lk-shadow, 0 10px 30px rgba(0,0,0,.45))",
} as const;

const CSS = `
@keyframes ltl-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.ltl-card { position: fixed; z-index: 95; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); width: 320px; padding: 18px; border-radius: 16px; background: ${T.surface}; border: 1px solid ${T.border}; color: ${T.text}; box-shadow: ${T.shadow}; font-family: ${BRAND_SANS}; animation: ltl-in 180ms ease-out; }
.ltl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 44px; margin-top: 12px; border-radius: 999px; padding: 9px 16px; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; border: 0; cursor: pointer; background: ${T.acc}; color: ${T.accInk}; font-family: ${BRAND_SANS}; }
.ltl-btn:focus-visible, .ltl-face:focus-visible { outline: 2px solid ${T.acc}; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .ltl-card { animation: none; } }
`;

function readNarrow(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 639px)").matches;
}

export function LearnTextLee({ narrow, bottomOffset = 16 }: {
  /** Phone: the tap opens sms:. Otherwise the tap opens the card. Omitted → read from the viewport. */
  narrow?: boolean;
  /** px above the safe area. */
  bottomOffset?: number;
}) {
  const [open, setOpen] = useState(false);
  const [autoNarrow, setAutoNarrow] = useState(false);
  useEffect(() => {
    if (narrow !== undefined) return;
    const on = () => setAutoNarrow(readNarrow());
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [narrow]);
  const isNarrow = narrow ?? autoNarrow;
  const face = (
    <span className="relative block" style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, lineHeight: 0 }}>
      <img
        src={LEE_PHOTO} alt="" aria-hidden
        style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, objectFit: "cover", objectPosition: "50% 30%", borderRadius: "50%", border: `2px solid ${T.text}`, boxShadow: SHADOW, display: "block" }}
      />
      <span className="absolute grid place-items-center rounded-full" style={{ right: -4, bottom: -4, width: 24, height: 24, background: T.acc, color: T.accInk, boxShadow: "0 6px 14px -4px rgba(0,0,0,0.9)" }}>
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
      </span>
    </span>
  );
  const wrap = { right: 16, bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` } as const;

  if (isNarrow) {
    return (
      <>
        <style>{CSS}</style>
        <a href={`sms:${LEE_TEL}`} aria-label={`Text Lee at ${LEE_PHONE}`} className="ltl-face fixed z-[90] block" style={wrap}>
          {face}
        </a>
      </>
    );
  }
  return (
    <>
      <style>{CSS}</style>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Text Lee at ${LEE_PHONE}`} aria-expanded={open} className="ltl-face fixed z-[90] block" style={{ ...wrap, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>
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
    <div ref={ref} role="dialog" aria-label="Text Lee" className="ltl-card">
      <div className="flex items-start gap-3">
        <img src={LEE_PHOTO} alt="" aria-hidden style={{ width: 44, height: 44, objectFit: "cover", objectPosition: "50% 30%", borderRadius: "50%", border: `2px solid ${T.text}`, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.2, fontFamily: BRAND_DISPLAY, fontWeight: 900 }}>Text Lee</p>
          <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>{LEE_PHONE}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: T.border, color: T.text, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
      </div>
      <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4, fontSize: 13.5, lineHeight: 1.45, color: T.muted }}>
        {TEXT_LEE_LINES.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <button type="button" onClick={() => void copy()} className="ltl-btn">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === true ? "Copied" : copied === false ? `Couldn't copy — ${LEE_PHONE}` : "Copy the number"}
      </button>
    </div>
  );
}
