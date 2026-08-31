// LOCK THE PAGE BEHIND AN OVERLAY — properly, including on iOS.
//
// ── WHY `overflow: hidden` IS NOT ENOUGH ──────────────────────────────────────────────────────
// The usual one-liner is `document.documentElement.style.overflow = "hidden"`. On desktop that
// works. In iOS Safari it does nothing at all: the page keeps scrolling underneath the dialog,
// so a visitor dragging inside a bottom sheet scrolls the homepage behind it and loses their
// place. Every overlay in this codebase used that one-liner.
//
// The version that actually holds is pinning the body: `position: fixed` with a negative `top`
// equal to the current scroll offset. The page cannot move because it is no longer in flow.
//
// ── AND WHY THE RESTORE MATTERS AS MUCH AS THE LOCK ───────────────────────────────────────────
// Pinning the body discards the scroll position. Without restoring it on unlock, closing a sheet
// teleports the visitor to the top of the page — which reads as "the site reloaded" and is worse
// than the bug being fixed. The offset is captured on lock and scrolled back on release.
//
// NESTING IS COUNTED. Two overlays open at once (a sheet that opens a dialog) would otherwise
// have the inner one's cleanup unlock the page while the outer one is still up. A module-level
// depth counter means only the last release actually restores.
import { useEffect } from "react";

let depth = 0;
let saved: { htmlOverflow: string; position: string; top: string; width: string; y: number } | null = null;

function lock() {
  if (depth++ > 0) return;
  const html = document.documentElement;
  const body = document.body;
  const y = window.scrollY;
  saved = { htmlOverflow: html.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width, y };
  html.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${y}px`;
  // Without an explicit width the fixed body collapses to its content width and the whole
  // layout visibly narrows for as long as the overlay is open.
  body.style.width = "100%";
}

function release() {
  if (--depth > 0) return;
  depth = 0;
  if (!saved) return;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = saved.htmlOverflow;
  body.style.position = saved.position;
  body.style.top = saved.top;
  body.style.width = saved.width;
  window.scrollTo(0, saved.y);
  saved = null;
}

/** Pin the page while `enabled`. Pass the overlay's open state — callers that live above their
 *  own open/closed state must not lock the page while closed. */
export function useScrollLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    lock();
    return release;
  }, [enabled]);
}
