// ORIENTATION STORE — the workspace's current frame shape.
//
// Module-level, not React state, for the same reason the slate is: the studio
// window and the capture popout are ONE React tree (PanelPopout portals into the
// popout document), and both must agree on the orientation at all times. A prop
// would have to thread through the previewer, the film portal and the takes
// inbox — three places to forget.
//
// Session-scoped but REMEMBERED across reloads: Lee films a whole vertical pass,
// and having it silently revert to landscape after a refresh mid-session would
// mean filming the rest of the set in the wrong shape without noticing.

import { DEFAULT_ORIENTATION, ORIENTATIONS, type Orientation } from "./orientation";

const KEY = "sa-orientation";

const read = (): Orientation => {
  try {
    const v = localStorage.getItem(KEY);
    return (ORIENTATIONS as readonly string[]).includes(v ?? "") ? (v as Orientation) : DEFAULT_ORIENTATION;
  } catch { return DEFAULT_ORIENTATION; }
};

let current: Orientation = typeof localStorage === "undefined" ? DEFAULT_ORIENTATION : read();
const subs = new Set<(o: Orientation) => void>();

export const orientation = (): Orientation => current;

export function setOrientation(o: Orientation): void {
  if (o === current) return;
  current = o;
  try { localStorage.setItem(KEY, o); } catch { /* session-only then */ }
  subs.forEach((f) => f(o));
}

export function subscribeOrientation(fn: (o: Orientation) => void): () => void {
  subs.add(fn);
  fn(current);
  return () => { subs.delete(fn); };
}

/** Test seam. */
export const __setOrientation = (o: Orientation): void => { current = o; };
