// SCROLL A ROW INTO VIEW WITHOUT MOVING THE PAGE.
//
// `element.scrollIntoView({ block: "nearest" })` does not mean "scroll the nearest container". It
// means "bring this into view, adjusting EVERY scrollable ancestor as needed" — and the document
// is always one of those ancestors. When the element is already visible inside its own list but
// the page happens to be at the top, the browser satisfies the request by scrolling the DOCUMENT.
//
// That is what hid the chapter banner on /go/ pages. The exam outline calls this on mount to
// reveal the active topic; the outline had no scrollable ancestor of its own, so the only thing
// left to scroll was the window. The page silently jumped ~74px on load, which put the banner and
// the claim link underneath the 55px sticky navbar. It read as a z-index or offset bug and was
// neither: at scrollY 0 the banner sits at y=71, comfortably clear.
//
// This helper scrolls the nearest scrollable ANCESTOR and nothing else. If there isn't one, it
// does nothing at all — which is the correct behaviour, because "the row is already as visible as
// its container can make it" should never be resolved by moving the whole page under the user.

/** Smooth-scroll the PAGE to an element by id — the deliberate kind, for a CTA the visitor just
 *  pressed. Distinct from revealInContainer below, which must never move the page.
 *
 *  Honours reduced-motion by jumping instead of animating; a long smooth scroll is exactly the
 *  motion that setting exists to suppress. The element's own scroll-margin-top handles the sticky
 *  navbar, so anchors stay correct without a magic offset here. */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** The nearest ancestor that can actually scroll vertically, or null if only the page can. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

/** Bring `el` into view inside its own scroll container. Never scrolls the window. */
export function revealInContainer(el: HTMLElement | null | undefined, behavior: ScrollBehavior = "auto"): void {
  if (!el) return;
  const box = scrollParent(el);
  if (!box) return; // page-level scrolling only — deliberately a no-op

  const e = el.getBoundingClientRect();
  const c = box.getBoundingClientRect();
  // Only move if it is actually out of view, and only by the shortfall — matching what
  // block:"nearest" was meant to do, scoped to one element.
  const over = e.bottom - c.bottom;
  const under = c.top - e.top;
  const delta = under > 0 ? -under : over > 0 ? over : 0;
  if (delta === 0) return;

  if (behavior === "smooth" && typeof box.scrollTo === "function") box.scrollTo({ top: box.scrollTop + delta, behavior: "smooth" });
  else box.scrollTop += delta;
}
