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

// ---- TDZ-IMMUNE MODULE STATE (read tdz-hazards.test.ts before touching) ------
//
// THIS MODULE TOOK THE CAPTURE WINDOW DOWN ON 2026-09-01 — "Cannot access 'yl'
// before initialization". `orientation` was a module-scope arrow, and it is read
// from inside CeqPreviewer's node-building useMemo:
//
//   build useMemo → deckCeqIds.forEach → geomOf(od, orientation())
//
// A module-scope `const f = () =>` is in a dead zone until this module's body
// runs, and the bundler is free to order that body after the render that calls
// it. Dev never reproduces it (unbundled ESM), and neither did a local
// production build — only the deployed chunk did.
//
// So: every callable is a hoisted `function`, and the state is `var` (hoisted
// AND initialised to undefined) materialised lazily by a hoisted function.
// Hoisting only the functions would have moved the crash onto `current`, not
// removed it — a `let` read before its module body runs throws the same way.
//
// eslint-disable-next-line no-var
var current: Orientation | undefined;
// eslint-disable-next-line no-var
var subs: Set<(o: Orientation) => void> | undefined;

function read(): Orientation {
  try {
    const v = localStorage.getItem(KEY);
    return (ORIENTATIONS as readonly string[]).includes(v ?? "") ? (v as Orientation) : DEFAULT_ORIENTATION;
  } catch { return DEFAULT_ORIENTATION; }
}

/** The live orientation, materialised on first read. */
function state(): Orientation {
  if (current === undefined) current = typeof localStorage === "undefined" ? DEFAULT_ORIENTATION : read();
  return current;
}

function listeners(): Set<(o: Orientation) => void> {
  if (!subs) subs = new Set();
  return subs;
}

export function orientation(): Orientation { return state(); }

export function setOrientation(o: Orientation): void {
  if (o === state()) return;
  current = o;
  try { localStorage.setItem(KEY, o); } catch { /* session-only then */ }
  listeners().forEach((f) => f(o));
}

export function subscribeOrientation(fn: (o: Orientation) => void): () => void {
  listeners().add(fn);
  fn(state());
  return () => { listeners().delete(fn); };
}

/** Test seam. */
export function __setOrientation(o: Orientation): void { current = o; }
