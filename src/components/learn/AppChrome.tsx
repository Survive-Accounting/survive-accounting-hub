// /learn's SHELL — the part that makes it read as an app rather than a web page.
//
// ── WHAT WENT AWAY ────────────────────────────────────────────────────────────────────────────
// The marketing navbar. /learn is not a page someone is deciding about; it is the thing they came
// for, and a bar offering "Reviews" and "Meet your tutor" on the surface where a student is
// cramming at 11pm is an invitation to leave. What replaces it is the two things an app opens
// with: who you are, and where to start.
//
// ── AND WHAT ARRIVED ──────────────────────────────────────────────────────────────────────────
// A BOTTOM TAB BAR, which is the single strongest "this is an app" signal on a phone and also the
// honest information architecture: cram, practice and review are three modes of one surface, and
// account is the fourth thing you can be doing. It is fixed, it is safe-area-aware, and it does
// NOT move when the keyboard opens — see the note on the bar itself, because that one is easy to
// get wrong and very obvious when you do.
//
// HELP IS ONE TAP FROM ANYWHERE. Lee's number has to be reachable from every screen of this
// surface, so it is in the header rather than buried at the bottom of a scroll.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BookOpen, ChevronDown, HelpCircle, ListChecks, Mail, Menu, Pencil, Phone, X, Zap } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { EMAIL_SUBJECT, emailLinkProps } from "@/lib/email-link";
import { useScrollLock } from "@/lib/use-scroll-lock";

const LEE_PHONE = "(662) 565-8818";
const LEE_TEL = "+16625658818";

export const LEARN_TABS = ["cram", "practice", "review", "account"] as const;
export type LearnTab = (typeof LEARN_TABS)[number];

const TAB_ICON: Record<LearnTab, typeof Zap> = {
  cram: Zap,
  practice: Pencil,
  review: BookOpen,
  account: ListChecks,
};

/** THE HEADER — wordmark, welcome, and the two controls that must be reachable from every screen.
 *
 *  The wordmark ANIMATES (BoltBoil is the boiling bolt from the homepage hero). It is the one
 *  piece of motion on the surface and it is at the top, where it reads as a launch screen rather
 *  than as something competing with the content. */
export function LearnHeader({ name, examLabel, topicLabel, onPickTopic, onOpenMenu }: {
  /** Pulled from session where available. */
  name: string;
  examLabel: string | null;
  topicLabel: string | null;
  onPickTopic: () => void;
  onOpenMenu: () => void;
}) {
  const [help, setHelp] = useState(false);

  return (
    <div className="shrink-0" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* ROW 1 — the brand, and the two always-reachable controls. */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="inline-flex shrink-0 items-center" aria-label="Survive">
          <BoltBoil height={26} />
        </span>
        <span
          className="text-[17px] font-black lowercase"
          style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)", letterSpacing: "-0.01em" }}
        >
          survive
        </span>
        <span className="min-w-0 flex-1" />

        <button
          type="button"
          onClick={() => setHelp(true)}
          aria-label="Help"
          className="grid shrink-0 place-items-center rounded-full"
          style={{ height: 40, width: 40, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}
        >
          <HelpCircle className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Menu"
          className="grid shrink-0 place-items-center rounded-full"
          style={{ height: 40, width: 40, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* ROW 2 — the greeting. Two short lines: who, then what to do. */}
      <div className="px-4 pb-2 pt-1">
        <p className="text-[22px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)" }}>
          Welcome, {name}
        </p>
        <p className="text-[13.5px]" style={{ color: "var(--lm-muted)" }}>Start studying below.</p>
      </div>

      {/* ROW 3 — where you are. Left, because that is where an app puts its current context. */}
      <div className="flex items-center gap-2 px-4 pb-2.5">
        <button
          type="button"
          onClick={onPickTopic}
          className="flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"
          style={{ color: "var(--lm-text)", border: "1px solid var(--lm-border)", background: "transparent", cursor: "pointer", minHeight: 36 }}
        >
          {examLabel && (
            <span className="shrink-0 font-black uppercase tracking-wide" style={{ color: "var(--lm-accent)" }}>{examLabel}</span>
          )}
          <span className="truncate">{topicLabel ?? "Pick a topic"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--lm-muted)" }} />
        </button>
      </div>

      {help && <HelpSheet onClose={() => setHelp(false)} />}
    </div>
  );
}

/** TEXT ME OR EMAIL ME. Two rows, nothing else — a help sheet that offers a knowledge base is a
 *  help sheet that does not want to be contacted. */
function HelpSheet({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const row = "flex w-full items-center gap-3 rounded-xl px-4 text-left";
  const rowStyle: React.CSSProperties = {
    minHeight: 56, background: "rgba(255,255,255,0.05)",
    border: "1px solid var(--lm-border)", color: "var(--lm-text)",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(4,7,14,0.74)" }}
      onMouseDown={(e) => { if (!panel.current?.contains(e.target as Node)) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        className="w-full max-w-[420px] rounded-t-2xl px-5 pt-3 sm:rounded-2xl"
        style={{
          background: "var(--lm-surface, #101728)", border: "1px solid var(--lm-border)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", fontFamily: BRAND_SANS,
          paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
          maxHeight: "min(88dvh, 88vh)",
        }}
      >
        <div className="flex justify-center pb-2 sm:hidden" aria-hidden>
          <span style={{ width: 36, height: 4, borderRadius: 999, background: "var(--lm-border)" }} />
        </div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)" }}>Stuck? Ask me.</p>
          <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 grid shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ height: 40, width: 40, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <a href={`sms:${LEE_TEL}`} className={row} style={rowStyle}>
            <Phone className="h-4 w-4 shrink-0" style={{ color: "var(--lm-accent)" }} />
            <span className="min-w-0">
              <span className="block text-[14px] font-black">Text Lee</span>
              <span className="block text-[12px]" style={{ color: "var(--lm-muted)" }}>{LEE_PHONE}</span>
            </span>
          </a>
          {/* Gmail compose, never mailto: — see lib/email-link.ts. */}
          <a {...emailLinkProps(EMAIL_SUBJECT.learn)} className={row} style={rowStyle}>
            <Mail className="h-4 w-4 shrink-0" style={{ color: "var(--lm-accent)" }} />
            <span className="min-w-0">
              <span className="block text-[14px] font-black">Email Lee</span>
              <span className="block truncate text-[12px]" style={{ color: "var(--lm-muted)" }}>lee@surviveaccounting.com</span>
            </span>
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** THE BOTTOM TAB BAR.
 *
 *  ── WHY IT DOES NOT JUMP WHEN THE KEYBOARD OPENS ────────────────────────────────────────────
 *  `position: fixed; bottom: 0` is measured against the LAYOUT viewport, which on both iOS and
 *  Android stays the full height of the screen when the keyboard appears. The bar therefore sits
 *  underneath the keyboard rather than riding on top of it — which is what you want: a tab bar
 *  that leaps up to sit above the keyboard while someone is typing an email address is the single
 *  most common "this feels broken" bug on a mobile web app. `position: sticky` inside the scroller
 *  and any `100vh` arithmetic both produce the jump; this does not.
 *
 *  The safe-area inset is padding, not margin, so the bar's BACKGROUND still reaches the bottom
 *  of the screen on a device with a home indicator and the row of labels sits above it. */
export function LearnTabBar({ active, onPick, accountBadge }: {
  active: LearnTab;
  onPick: (t: LearnTab) => void;
  /** Count of unfinished setup items. 0 renders no badge at all. */
  accountBadge: number;
}) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-[120] flex"
      style={{
        background: "rgba(9,14,26,0.98)",
        borderTop: "1px solid var(--lm-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backdropFilter: "blur(8px)",
        fontFamily: BRAND_SANS,
      }}
    >
      {LEARN_TABS.map((t) => {
        const Icon = TAB_ICON[t];
        const on = t === active;
        const badge = t === "account" ? accountBadge : 0;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            aria-current={on ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5"
            style={{ minHeight: 56, background: "none", border: 0, cursor: "pointer", color: on ? "var(--lm-accent)" : "var(--lm-muted)" }}
          >
            <span className="relative">
              <Icon className="h-[18px] w-[18px]" />
              {badge > 0 && (
                <span
                  aria-label={`${badge} to finish`}
                  className="absolute grid place-items-center rounded-full text-[9px] font-black tabular-nums"
                  style={{
                    top: -5, right: -9, minWidth: 15, height: 15, padding: "0 3px",
                    background: "var(--lm-accent)", color: "var(--lm-accent-ink)",
                  }}
                >
                  {badge}
                </span>
              )}
            </span>
            <span className="text-[9.5px] font-black uppercase tracking-[0.1em]">{t}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** How much room the fixed bar takes, so a scroller can end above it rather than under it. */
export const TAB_BAR_SPACER = "calc(56px + env(safe-area-inset-bottom, 0px))";
