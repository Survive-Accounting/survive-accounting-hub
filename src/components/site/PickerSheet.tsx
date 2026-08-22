// PICKER SHEET (§3) — ONE picker chrome for both landing pickers (school, professor).
//
// Desktop: an anchored dropdown. Mobile (<768px): a bottom sheet.
//
// THE SHAPE SWITCH IS CSS (`.sa-picker`'s @media block in styles.css), not a React branch.
// place() writes --sa-x/--sa-y/--sa-w custom properties rather than inline left/top/width,
// precisely so the mobile rule can override them — an inline style would beat any
// stylesheet. That buys one markup tree, no `isMobile` state, no SSR/hydration hazard, and
// rotation for free. JS reads the breakpoint in exactly three places (place-on-reflow, the
// scroll lock, and dismiss), all inside effects or handlers — never during render.
//
// STATE: none. Everything is refs, so nothing in here re-renders — zero React commits during
// a 60fps drag and zero during background scroll.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as RPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

import { BRAND_DISPLAY } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";

/** The one definition of "mobile" for these pages — matches the 16px-input rule in styles.css. */
export const PICKER_MOBILE_MQ = "(max-width: 767px)";
const isMobileNow = () => typeof window !== "undefined" && !!window.matchMedia?.(PICKER_MOBILE_MQ).matches;
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Downward travel, in px, that commits to closing rather than snapping back. */
const DRAG_CLOSE = 72;
/** Desktop panel height used for the above/below flip decision; matches .sa-picker max-height. */
const DESKTOP_H = 340;

export type PickerSheetProps = {
  /** The trigger to anchor to on desktop. Ignored on mobile, where the sheet is full-width. */
  anchor: RefObject<HTMLElement | null>;
  /** Close for real. The caller owns the open flag and any field it wants to reset. */
  onClose: () => void;
  /** aria-label, and the visible title when there is no search field. */
  label: string;
  /** The pinned search row. `null` for a short form that has its own input. */
  search: { value: string; onChange: (v: string) => void; placeholder: string } | null;
  /** Pinned below the list — never scrolls away. */
  footer?: ReactNode;
  /** true = short form, not a list: size to content instead of a fixed-height sheet. */
  compact?: boolean;
  children: ReactNode;
};

export function PickerSheet({ anchor, onClose, label, search, footer, compact, children }: PickerSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const closing = useRef(false);
  const dragged = useRef(false);
  const drag = useRef<{ y: number; active: boolean } | null>(null);
  const timer = useRef(0);
  // Assigned every render on purpose: dismiss() runs from a timeout and must not close over
  // a stale onClose.
  closeRef.current = onClose;

  // DESKTOP ANCHORING. Writes vars, never setState — no re-render per scroll event and no
  // one-frame ghost at the wrong position. Also adds the viewport clamp and the above/below
  // FLIP that the professor dropdown never had (it could render below the fold).
  const place = () => {
    const el = panelRef.current;
    const r = anchor.current?.getBoundingClientRect();
    if (!el || !r) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const G = 10;
    const w = Math.min(Math.max(r.width, 260), vw - G * 2);
    const below = vh - r.bottom - 8;
    el.style.setProperty("--sa-w", `${w}px`);
    el.style.setProperty("--sa-x", `${Math.max(G, Math.min(r.left, vw - w - G))}px`);
    el.style.setProperty(
      "--sa-y",
      below >= DESKTOP_H || below >= r.top ? `${r.bottom + 8}px` : `${Math.max(G, r.top - DESKTOP_H - 8)}px`,
    );
  };

  // ANIMATED DISMISS — scrim, X, Escape, swipe. Picking a row calls onClose() DIRECTLY
  // instead, so a commit CUTS: the content behind the sheet is already changing, and
  // animating out over the top of it reads as lag rather than polish.
  const dismiss = () => {
    const el = panelRef.current;
    if (closing.current) return;
    if (!el || !isMobileNow() || reducedMotion()) { closeRef.current(); return; }
    closing.current = true;
    el.style.animation = "none";  // a running CSS animation outranks inline styles
    el.style.transition = "transform 170ms cubic-bezier(.3,.8,.4,1)";
    el.style.transform = "translateY(100%)";
    if (scrimRef.current) {
      scrimRef.current.style.transition = "opacity 170ms ease";
      scrimRef.current.style.opacity = "0";
    }
    timer.current = window.setTimeout(() => closeRef.current(), 165);
  };

  // OPEN. useLayoutEffect so it runs BEFORE paint and still inside the tap's task — which is
  // what makes iOS actually raise the keyboard for a programmatic focus. (Corollary: never
  // wrap the caller's setOpen(true) in startTransition.)
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    place();
    inputRef.current?.focus({ preventScroll: true });

    // SCROLL LOCK — on documentElement, NOT body. `html.sa-navy` sets overflow-x:hidden, so
    // the root's overflow is not `visible`, body's overflow is therefore NOT propagated to
    // the viewport, and the textbook `body{overflow:hidden}` lock is a silent no-op here.
    // Mobile only: desktop keeps its scroll-reflow dropdown and never gets a scrollbar jump.
    let locked = false;
    let prevOv = "";
    let prevOb = "";
    const lock = () => {
      if (locked || !isMobileNow()) return;
      locked = true;
      prevOv = html.style.overflow;
      prevOb = html.style.overscrollBehavior;
      html.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
    };
    const unlock = () => {
      if (!locked) return;
      locked = false;
      html.style.overflow = prevOv;
      html.style.overscrollBehavior = prevOb;
    };
    lock();

    const mq = window.matchMedia(PICKER_MOBILE_MQ);
    // ONE handler for both the matchMedia change and the plain resize, deliberately. Rotating
    // an iPhone to landscape is ~844px wide, i.e. it CROSSES this breakpoint — the sheet has
    // to become a dropdown and the lock has to release. Releasing it only from the mq event
    // would leave the page permanently unscrollable if that event were ever missed while
    // `resize` still arrived, and a landing page stuck unscrollable is the worst failure here.
    // Re-locking is idempotent, so running this more often costs nothing.
    const sync = () => { if (mq.matches) lock(); else { unlock(); place(); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); dismiss(); } };
    const reflow = () => { if (!mq.matches) place(); };  // scroll only needs re-anchoring
    mq.addEventListener("change", sync);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.clearTimeout(timer.current);
      mq.removeEventListener("change", sync);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      unlock();
      prev?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS KEYBOARD. Safari does not shrink the LAYOUT viewport, so a bottom:0 sheet ends up
  // behind the keyboard. offsetTop is in the formula because iOS also scrolls the VISUAL
  // viewport to reveal the focused field, and without it the sheet drifts. Android Chrome
  // does resize the layout viewport, so this evaluates to ~0 there — one formula, no UA
  // sniffing. rAF-coalesced: iOS fires these continuously through the keyboard animation and
  // every root custom-property write invalidates document style.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;  // var stays 0px; search is pinned at the TOP, so it stays legible
    let raf = 0;
    const write = () => {
      raf = 0;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty("--sa-kb", `${kb}px`);
    };
    const sync = () => { if (!raf) raf = requestAnimationFrame(write); };
    write();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      document.documentElement.style.removeProperty("--sa-kb");
    };
  }, []);

  // ---- DRAG-TO-DISMISS. The transform is written straight to the node: zero React renders.
  // `fromList` starts inactive — the gesture has to prove it means "down" before we steal it
  // from the list's own scroller.
  const begin = (y: number, fromList: boolean) => {
    const el = panelRef.current;
    if (!el || closing.current) return;
    drag.current = { y, active: !fromList };
    el.style.animation = "none";
    el.style.transition = "none";
    if (!fromList) inputRef.current?.blur();
  };
  const move = (y: number) => {
    const d = drag.current;
    const el = panelRef.current;
    if (!d || !el) return;
    const dy = y - d.y;
    if (!d.active) {
      if (dy > 10) {
        d.active = true;
        dragged.current = true;
        // Stop the browser scrolling the list at the same time as we drag the sheet.
        if (listRef.current) listRef.current.style.overflowY = "hidden";
        inputRef.current?.blur();
      } else if (dy < -4) { drag.current = null; return; }  // they meant to scroll content
      else return;
    }
    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };
  const end = (y: number | null) => {
    const d = drag.current;
    const el = panelRef.current;
    drag.current = null;
    if (listRef.current) listRef.current.style.overflowY = "";
    if (!d || !el) return;
    if (!d.active || y == null) { el.style.transition = ""; el.style.transform = ""; return; }
    if (Math.max(0, y - d.y) > DRAG_CLOSE) { dismiss(); return; }
    el.style.transition = "transform 170ms cubic-bezier(.2,.8,.2,1)";
    el.style.transform = "";
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* SCRIM. pointerdown, not click: once the portal unmounts on mousedown no click ever
          arrives. preventDefault stops the compatibility click from hit-testing the trigger
          underneath, which would otherwise re-open the picker on some engines. */}
      <div
        ref={scrimRef}
        className="sa-picker-scrim"
        aria-hidden
        onPointerDown={(e) => { e.preventDefault(); dismiss(); }}
      />

      {/* THEME VARS + BRAND_DISPLAY: this portal renders at document.body, outside the themed
          landing root, so var(--brand-cream)/--accent and Rubik must be re-declared or the
          rows render in the wrong colour and the wrong font. */}
      <div
        ref={panelRef}
        className="sa-picker"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-compact={compact ? "" : undefined}
        style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), fontFamily: BRAND_DISPLAY }}
      >
        {/* Grab strip — mobile only (display:none on desktop). touch-action:none + pointer
            capture means this one always works, whatever the list does. */}
        <div
          className="sa-picker-grab"
          aria-hidden
          // setPointerCapture throws NotFoundError if the pointer is already gone. Capture is
          // an optimisation (it keeps the drag alive outside the 28px strip), never a
          // requirement — so it must not be able to take the drag down with it.
          onPointerDown={(e: RPointerEvent<HTMLDivElement>) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ } begin(e.clientY, false); }}
          onPointerMove={(e) => move(e.clientY)}
          onPointerUp={(e) => end(e.clientY)}
          onPointerCancel={() => end(null)}
        >
          <span style={{ width: 40, height: 4, borderRadius: 999, background: "var(--border-default)" }} />
        </div>

        <div className="sa-picker-head">
          {search ? (
            <>
              <Search className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
              {/* fontSize 16 is set EXPLICITLY rather than left to the html.sa-navy rule —
                  that rule only fires on pages calling useNavyDocument(), and this input is
                  the one named as the cause of the iOS auto-zoom / overflow bug. */}
              <input
                ref={inputRef}
                className="sa-picker-input"
                value={search.value}
                onChange={(e) => {
                  search.onChange(e.target.value);
                  // Scroll-to-top lives HERE, not in the callers: neither can forget it, and
                  // a third picker inherits it. Filtered results must paint already at top.
                  if (listRef.current) listRef.current.scrollTop = 0;
                }}
                placeholder={search.placeholder}
                style={{ fontSize: 16 }}
                inputMode="search"
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-label={label}
              />
            </>
          ) : (
            <span className="sa-picker-title">{label}</span>
          )}
          <button type="button" className="sa-picker-x" onClick={dismiss} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Swipe-down works from the list too, but ONLY while it is scrolled to the top and
            only after 10px of downward travel. Strictly additive: if iOS claims the touch for
            its own scroller we get pointercancel and snap back — nothing breaks. */}
        <div
          ref={listRef}
          className="sa-picker-list"
          onPointerDown={(e) => {
            if (e.pointerType !== "touch") return;
            if ((e.currentTarget.scrollTop || 0) > 0) return;
            begin(e.clientY, true);
          }}
          onPointerMove={(e) => move(e.clientY)}
          onPointerUp={(e) => end(e.clientY)}
          onPointerCancel={() => end(null)}
          // A drag that happens to end over a row must not pick that row.
          onClickCapture={(e) => { if (dragged.current) { dragged.current = false; e.preventDefault(); e.stopPropagation(); } }}
        >
          {children}
        </div>

        {footer && <div className="sa-picker-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
