// FILM CAMERA — the free camera on the capture surface, and the CEQ pin that
// makes it safe to use.
//
// THE PROBLEM THIS SOLVES (Lee, 2026-09-01). The capture window's ReactFlow ran
// with panOnDrag / zoomOnScroll / zoomOnPinch all false: the camera was welded
// to the fitted frame so OBS framing could never drift. That guarantee is worth
// keeping, but it made the frame a CAGE — an exhibit had to be shrunk until it
// fit a 1080x1920 box, which is unreadable on a phone, and there was no way to
// push in on one corner of the accounting cycle and talk about it.
//
// The fix is not to delete the guarantee, it is to make it RECOVERABLE:
//
//   HOME        the fitted shot fitFilm() computes. Unchanged, still exact.
//   MANUAL      Lee has panned or zoomed. The camera is wherever he put it and
//               NOTHING may move it — not a resize, not a focus, not the settle
//               timers. A camera that snaps back mid-sentence is worse than one
//               that never moved.
//   RE-HOME     ` (the key under Escape — the same sweep that already clears
//               marks) and any question change cut straight back to HOME.
//
// So the frame stops being a box the content must fit inside and becomes a shot
// the camera returns to. Content may live outside it. That is the whole idea,
// and it needs no data-model change: a frame rect was always just a rectangle.
//
// THE PIN. Free camera alone would drag the question off-screen the moment Lee
// zoomed into an exhibit — the CEQ is a node on the canvas like everything else.
// So the active question is COUNTER-TRANSFORMED: pinned to the screen position
// the SET TEMPLATE (the Q0 layout) maps to under the HOME viewport, at the home
// scale. Two things fall out of that, and the second one is the point:
//
//   1. Zooming and flying over an exhibit leaves the question stock still.
//   2. Every question renders its card in the SAME screen spot, because the
//      anchor is the set template — not the question's own saved geometry.
//      Hand-placed `geom` and `ignoreLayout` are what make "apply the layout"
//      look broken (ceq-geom.ts resolves instance ?? template, so any question
//      ever nudged by hand wins forever). While pinned, the template always
//      governs the shot. "The top of the CEQ in the same spot every time" is
//      then a property of the FILM SURFACE, not of 30 questions' geometry.
//
// Nothing here is persisted and nothing here writes to a node. The pin is a
// render-time transform on the film surface only; authoring and student views
// never read it, so a take can't bake in a layout the canvas doesn't have.
//
// Same realm-shared module-store pattern as exhibit-modes / the exhibit clear
// bus: the film popout is a portal in THIS JS realm, so one store keeps the
// capture window and the editor previewer on the same camera with no
// cross-window plumbing.

export interface Viewport { x: number; y: number; zoom: number }

/** Where the pinned card should be nailed, in FILM-CANVAS coordinates — the
 *  template spot, already offset for the active frame. */
export interface PinTarget {
  /** The node that gets pinned. Only this exact id — in the film stack every
   *  question has a card node and pinning them all would stack them. */
  nodeId: string;
  /** Template card spot (frame-local + frame offset) and its authored scale. */
  x: number;
  y: number;
  scale: number;
}

interface Snap {
  /** True ⇒ Lee moved the camera himself; auto-fits must leave it alone. */
  manual: boolean;
  /** The HOME shot fitFilm() last computed. The pin anchors against this. */
  home: Viewport | null;
  /** The capture window's live viewport — the editor mirrors this. */
  live: Viewport | null;
  /** Pin config; null ⇒ pinning off (the old behaviour, exactly). */
  pin: PinTarget | null;
  /** Lee's toggle. Off ⇒ cards render where their own geometry says. */
  pinOn: boolean;
  /** ALT IS HELD — the film surface is temporarily in rearrange mode.
   *
   *  Lives here rather than in CeqPreviewer's state because the RESIZE handles
   *  are drawn by ElementResizer, deep inside each card, which has no way to
   *  reach the previewer. It renders nothing at all in film (isVisible gates on
   *  !film), which is why CSS could not bring the handles back — there was no
   *  DOM to un-hide. Cards read this to know the lock is lifted. */
  altRearrange: boolean;
}

// ---- MODULE STATE, TDZ-IMMUNE (read tdz-hazards.test.ts before touching) ----
//
// This module is on the RENDER PATH: withCeqPin calls getFilmCamera and
// subscribeFilmCamera from useSyncExternalStore during every CEQ node render.
// The canvas has been taken down twice in production by exactly that shape —
// "Cannot access 'oi' before initialization", then 'wl' here on 2026-09-01 —
// where a bundler ordered a module body after the render that reads it. Dev
// never reproduces it (unbundled ESM) and neither does a local prod build.
//
// So this module obeys the house law, all the way down:
//   · every callable is a hoisted `function` declaration, never `const f = () =>`
//   · the mutable state is `var`, which hoists AND initialises to undefined —
//     a `let`/`const` read before its module body runs throws the same way the
//     arrow did, so hoisting only the functions would have moved the crash
//     rather than removed it
//   · state is created lazily inside a hoisted function, so the very first
//     reader materialises it no matter what order the bundler picked
//
// eslint-disable-next-line no-var
var snap: Snap | undefined;
// eslint-disable-next-line no-var
var listeners: Set<() => void> | undefined;

/** The live snapshot, materialised on first read. */
function state(): Snap {
  if (!snap) snap = { manual: false, home: null, live: null, pin: null, pinOn: true, altRearrange: false };
  return snap;
}

function subs(): Set<() => void> {
  if (!listeners) listeners = new Set();
  return listeners;
}

function emit(p: Partial<Snap>): void {
  const cur = state();
  const next = { ...cur, ...p };
  // Cheap equality guard: these fire on every pointermove during a pan.
  if (next.manual === cur.manual && next.pinOn === cur.pinOn && next.pin === cur.pin && next.altRearrange === cur.altRearrange
    && sameVp(next.home, cur.home) && sameVp(next.live, cur.live)) return;
  snap = next;
  subs().forEach((fn) => fn());
}

function sameVp(a: Viewport | null, b: Viewport | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

export function subscribeFilmCamera(fn: () => void): () => void {
  subs().add(fn);
  return () => { subs().delete(fn); };
}

export function getFilmCamera(): Snap { return state(); }

/** Lee grabbed the camera. Latches until a re-home. */
export function markCameraManual(): void { emit({ manual: true }); }

/** The capture window's camera moved — publish it so the editor can mirror. */
export function publishFilmViewport(v: Viewport): void { emit({ live: v }); }

/** fitFilm computed the home shot. Recording it is what lets the pin anchor
 *  against the same numbers the camera uses, so at HOME a pinned card that
 *  already conforms to the template renders pixel-identically to before. */
export function setFilmHome(v: Viewport): void { emit({ home: v }); }

/** ` and question changes: back to the fitted shot, camera released. */
export function releaseCamera(): void { emit({ manual: false }); }

/** May an automatic fit move the camera right now? */
export function autoFitAllowed(): boolean { return !state().manual; }

export function setPinTarget(t: PinTarget | null): void {
  const p = state().pin;
  if (p === t) return;
  if (p && t && p.nodeId === t.nodeId && p.x === t.x && p.y === t.y && p.scale === t.scale) return;
  emit({ pin: t });
}

export function setPinOn(on: boolean): void { emit({ pinOn: on }); }
export function togglePin(): boolean { emit({ pinOn: !state().pinOn }); return state().pinOn; }

// ---- THE COUNTER-TRANSFORM --------------------------------------------------

/** The transform that holds a node still on screen while the camera moves.
 *
 *  A film node lives inside `.react-flow__viewport`, which carries
 *  `translate(vp.x, vp.y) scale(vp.zoom)`, and inside its own wrapper, which
 *  carries `translate(node.x, node.y)`. So a point p in the node's own space
 *  lands on screen at `vp.x + (node + p) * vp.zoom`.
 *
 *  We want the node's origin to land where the TEMPLATE spot lands under the
 *  HOME viewport, at the home scale — regardless of where the camera is now.
 *  Solving `vp.x + (node.x + dx) * vp.zoom = home.x + pin.x * home.zoom` gives
 *  the translation; the scale is the ratio that cancels the live zoom and
 *  restores the home one.
 *
 *  Returns null when the transform would be the identity (camera at home and
 *  the card already on the template) so the common case adds no style at all.
 */
export function pinTransform(opts: {
  vp: Viewport;
  home: Viewport;
  pin: PinTarget;
  /** The node's own absolute position on the film canvas. */
  nodeX: number;
  nodeY: number;
  /** The node's authored data.scale — the template's scale replaces it. */
  nodeScale: number;
}): { transform: string; transformOrigin: string } | null {
  const { vp, home, pin, nodeX, nodeY } = opts;
  if (!vp.zoom || !home.zoom) return null;
  // PULLING BACK RELEASES THE PIN. Pinning exists so pushing INTO an exhibit
  // doesn't shove the question off screen. Zoomed OUT past the framed shot Lee
  // is reading the map — "let me zoom out and bounce around to a new problem" —
  // and a card held at full screen size would sit on top of that map like a
  // billboard, hiding the very layout he pulled back to see. Below home zoom the
  // card rides the canvas with everything else and shrinks honestly.
  if (vp.zoom < home.zoom - 1e-4) return null;
  const nodeScale = opts.nodeScale || 1;
  const k = (home.zoom / vp.zoom) * ((pin.scale || 1) / nodeScale);
  const dx = (home.x + pin.x * home.zoom - vp.x) / vp.zoom - nodeX;
  const dy = (home.y + pin.y * home.zoom - vp.y) / vp.zoom - nodeY;
  if (Math.abs(k - 1) < 1e-4 && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return null;
  // translate FIRST, then scale about the top-left: the origin lands exactly on
  // (dx, dy) and the scale grows away from it, so the anchor is the card's
  // top-left corner — which is what "the top of the CEQ is always here" means.
  return { transform: `translate(${dx}px, ${dy}px) scale(${k})`, transformOrigin: "0 0" };
}

// ---- THE EDITOR MIRROR ------------------------------------------------------
// "If I zoom in on the capture window it should match the study canvas" (Lee).
// The two panes are DIFFERENT SIZES, so copying the viewport across would show
// two different shots. What travels between them is the canvas-space RECT the
// capture window is looking at; each pane then fits that rect to its own size.
// Capture leads, editor follows — one writer, so the two can never fight.

export interface Rect { x: number; y: number; w: number; h: number }

/** The canvas-space rect a pane of `w`×`h` is showing at this viewport. */
export function visibleRect(vp: Viewport, w: number, h: number): Rect {
  const z = vp.zoom || 1;
  return { x: -vp.x / z, y: -vp.y / z, w: w / z, h: h / z };
}

/** The viewport that CONTAINS `rect` in a pane of `w`×`h`, centred. Contain (not
 *  cover) on the mirror side: the editor is a monitor, and seeing a little more
 *  than the shot is exactly what makes it useful for finding the next move. */
export function fitRectViewport(rect: Rect, w: number, h: number): Viewport {
  if (!rect.w || !rect.h || !w || !h) return { x: 0, y: 0, zoom: 1 };
  const zoom = Math.min(w / rect.w, h / rect.h);
  return { x: w / 2 - (rect.x + rect.w / 2) * zoom, y: h / 2 - (rect.y + rect.h / 2) * zoom, zoom };
}

/** The editor's shot for the capture window's shot. */
export function mirrorViewport(filmVp: Viewport, filmW: number, filmH: number, editW: number, editH: number): Viewport {
  return fitRectViewport(visibleRect(filmVp, filmW, filmH), editW, editH);
}

/** Is the camera parked exactly on the home shot? Drives the "off home" hint. */
export function atHome(vp: Viewport | null, home: Viewport | null): boolean {
  if (!vp || !home) return true;
  return Math.abs(vp.zoom - home.zoom) < 1e-3 && Math.abs(vp.x - home.x) < 0.5 && Math.abs(vp.y - home.y) < 0.5;
}

/** Alt down / up on a film surface. Cards read this through useAltRearrange. */
export function setAltRearrange(on: boolean): void {
  if (state().altRearrange !== on) emit({ altRearrange: on });
}

/** Is the film lock temporarily lifted? For cards that draw their own chrome. */
export function altRearrangeOn(): boolean { return state().altRearrange; }
