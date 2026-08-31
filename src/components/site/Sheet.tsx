// THE OVERLAY, DECIDED ONCE — bottom sheet on a phone, centred dialog from 640px up.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
// Every overlay on the marketing site was written by hand, and each one had a different subset of
// the same four bugs. Two of them were unusable on a 390px phone. Measured, not guessed:
//
//   THE CLAIM SHEET COULD NOT BE CLOSED AT ALL. Its panel rendered 854px tall inside an 844px
//   viewport, so no backdrop was tappable; its × sat at (353, 27), underneath the sticky navbar,
//   so elementFromPoint returned the navbar and the tap never reached the button; and because the
//   backdrop used `align-items: flex-end` with `overflow-y-auto`, the overflow went past the
//   container's START edge, which is the one direction scrolling cannot reach. Escape works — on
//   a phone there is no Escape key. That is a scholarship chair, halfway through a claim form,
//   with no way out but the back button.
//
//   THE LEARN-HOW PANEL rendered under the navbar for the same stacking reason.
//
// So the rules live here, once:
//
//   1. PORTAL TO document.body. A `fixed` overlay is only as high as the stacking context it is
//      declared in. `<main>` is `position: relative; z-index: 1` and the footer is the same, so an
//      overlay declared inside either one is pinned below the sticky z-200 header no matter what
//      z-index it asks for. The number is never the problem; the ancestor is.
//   2. CAP THE HEIGHT AT 88dvh AND SCROLL INSIDE. dvh rather than vh: iOS resolves `vh` against
//      the viewport with the browser chrome RETRACTED, so an 88vh panel is taller than the screen
//      for exactly as long as the toolbar is showing — which is when the visitor first sees it.
//   3. THE HEADER IS STICKY, NEVER SCROLLED. The close control is the one deliberate exit and it
//      must be on screen whatever the body does.
//   4. PIN THE PAGE BEHIND IT (useScrollLock), and contain overscroll so a flick at the end of
//      the panel does not chain into the document.
//
// It is deliberately NOT a general-purpose Dialog. It has one shape, and having one shape is the
// point — "where does a panel come from on this site" should have a single answer.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { useScrollLock } from "@/lib/use-scroll-lock";

export function Sheet({ title, onClose, children, maxWidth = 420, labelledAs }: {
  /** Rendered in the sticky header beside the close control. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  /** Accessible name when it should differ from the visible title. */
  labelledAs?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // createPortal needs a document. On the server there is none, and rendering the panel inline
  // "just for SSR" reintroduces the exact bug this component exists to fix — so it renders
  // nothing until the client mounts. Nothing can have opened it before then.
  useEffect(() => setMounted(true), []);

  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:px-4"
      style={{ background: "rgba(5,8,16,0.72)" }}
      // mousedown, not click: releasing a text selection outside the panel would otherwise close
      // the sheet and discard everything typed into it.
      onMouseDown={(e) => { if (!panel.current?.contains(e.target as Node)) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={labelledAs ?? title}
        className="flex w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
        style={{
          maxWidth,
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)",
          maxHeight: "min(88dvh, 88vh)",
          fontFamily: BRAND_SANS,
        }}
      >
        {/* GRAB HANDLE — phone only. What makes a panel read as a sheet rather than a box that
            appeared. Purely visual; the backdrop and the × do the dismissing. */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span style={{ width: 36, height: 4, borderRadius: 999, background: "var(--border-default)" }} />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3">
          <h3 className="pr-1 text-[17px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            // 40px, not 32: on a phone this is the only deliberate exit, and it sits in the
            // corner of the screen where a thumb is least accurate.
            className="-mr-1 -mt-1 grid shrink-0 place-items-center rounded-full hover:bg-white/10"
            style={{ height: 40, width: 40, color: "var(--brand-cream)", background: "none", border: 0, cursor: "pointer" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-5"
          style={{ overscrollBehavior: "contain", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
