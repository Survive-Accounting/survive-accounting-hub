// ONE WAY OUT, EVERY TIME.
//
// Written because the chapter claim form had no way out at all: it opened, and the only exit was a
// page refresh. That is the worst version of the bug, but the audit found the milder version
// everywhere — overlays that close on × and backdrop but ignore Esc, so a keyboard user is stuck
// with a form they can't reach past.
//
// Rather than fix each one by hand and let them drift apart again, dismissal is a single hook.
// Anything that opens over the page uses it, so "can I get out of this?" has one answer.
//
//   const ref = useDismiss(onClose);
//   <div onMouseDown={e => e.target === e.currentTarget && onClose()}>   // backdrop
//     <div ref={ref}> … <button onClick={onClose} aria-label="Close">×</button> … </div>
//
// WHY MOUSEDOWN AND NOT CLICK for outside-dismissal: with `click`, selecting text inside the panel
// and releasing the mouse outside it fires a click on the backdrop and closes the dialog, wiping
// whatever was typed. Tracking where the press STARTED avoids destroying input on a stray drag.
import { useEffect, useRef } from "react";

export function useDismiss<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  opts: { esc?: boolean; outside?: boolean; enabled?: boolean } = {},
) {
  // `enabled` matters more than it looks. Callers that live above their own open/closed state call
  // this hook unconditionally (hooks can't be conditional), so without a gate every closed overlay
  // on the page would still be listening — and each one would swallow Escape from whatever IS
  // open. Pass `enabled: open`.
  const { esc = true, outside = true, enabled = true } = opts;
  const ref = useRef<T>(null);
  // Kept in a ref so the listeners are attached once and never re-bound when the parent re-renders
  // (an unstable onClose would otherwise detach/reattach on every keystroke).
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    if (!enabled || (!esc && !outside)) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cb.current();
    };

    // Where the press began. A press that starts inside the panel never closes it, however far the
    // pointer travels before release.
    let startedInside = false;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      startedInside = !!el && e.target instanceof Node && el.contains(e.target);
    };
    const onUp = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el || startedInside) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      cb.current();
    };

    if (esc) document.addEventListener("keydown", onKey);
    if (outside) {
      document.addEventListener("mousedown", onDown, true);
      document.addEventListener("mouseup", onUp, true);
      document.addEventListener("touchstart", onDown, true);
      document.addEventListener("touchend", onUp, true);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("touchstart", onDown, true);
      document.removeEventListener("touchend", onUp, true);
    };
  }, [enabled, esc, outside]);

  return ref;
}
