// THE CAPTURE CAMERA — zoom (wheel / pinch), the O pull-back, the Alt latch,
// Alt+drag move and the alt-hover grips, on /v3/$topic/$set/blast-off/film.
//
// The canvas film surface has a real ReactFlow camera; this surface has one
// slide in a black phone, so the camera is a CSS transform on the slide
// (PhoneFrame `stageStyle`) and the card's own gestures (CeqPreviewNode's
// startAltMove and AltGrips) are answered through the same contexts the
// canvas provides them — MoveContext, WidthContext, ScaleContext,
// PersistContext — with the values this hook returns.
//
// WHAT LIVES WHERE
//   zoom          one number for the whole take (survives walking slides);
//                 wheel over the phone or the black surround changes it,
//                 O toggles the pull-back, 0 resets it.
//   the slide     per slide, reset the moment `frameId` changes: the
//                 Alt-move translate and the grip overrides (width, scale).
//   the latch     Alt held ⇒ rootClass "sa-alt", which is what PV_CSS keys
//                 the grips and the grab affordances on.
//
// THE TRANSFORM. `translate(x, y) scale(z)` about the slide's centre. A CSS
// translate written BEFORE the scale is in the phone's pixels, so the card
// stays under the pointer when x = tx·z where tx is the move in slide units
// (the card reports screen pixels; they are divided by the zoom on the way
// in). Keeping tx in slide units means the pull-back and the wheel zoom
// scale the card's offset with everything else, as the canvas does.
//
// NOTHING PERSISTS. On /film a position is per take; the set has no field for
// it (the canvas writes instance geometry — that is its surface, not this).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject, type WheelEvent as ReactWheelEvent } from "react";

import type { CardOverride } from "../SetCard";

export interface CaptureCamera {
  /** Transform applied to the slide (PhoneFrame `stageStyle`). */
  stageStyle?: CSSProperties;
  /** Extra classes on the film-mode root — `sa-alt` while Alt is latched. */
  rootClass: string;
  /** Unused by this camera: the wheel is listened to NATIVELY on the host
   *  (non-passive, so the page scroll and the browser's own ctrl+wheel zoom
   *  can be stopped) — React's onWheel is passive and cannot. */
  onWheel?: (e: ReactWheelEvent<HTMLDivElement>) => void;
  /** Contexts the live card reads for Alt-move / grips, provided by the caller. */
  moveBy: (id: string, dx: number, dy: number) => void;
  setWidth: (id: string, w: number) => void;
  setScale: (id: string, s: number) => void;
  persist: (id: string) => void;
  /** The live card's per-slide override from the grips (width in flow units,
   *  scale as a multiplier of the scale PhoneFrame gave it). BlastOffCapture
   *  passes it to PhoneFrame as `cardOverride`; undefined until a grip moves. */
  cardOverride?: CardOverride;
  /** The current zoom, for a readout. */
  zoom?: number;
  /** True while O has the camera pulled back. */
  pulledBack?: boolean;
}

// ---- the numbers ---------------------------------------------------------
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.4;
/** The O pull-back — a touch wider than the shot, never a speck. */
export const PULL_BACK_ZOOM = 0.82;
/** The grips' scale multiplier: half to a bit over double the given scale. */
export const CARD_SCALE_MIN = 0.5;
export const CARD_SCALE_MAX = 2.2;
/** The grips' width, in the card's own flow units (CARD_W = 560 at rest). */
export const CARD_W_MIN = 320;
export const CARD_W_MAX = 900;
/** The attribute a live SetCard publishes its GIVEN scale on, so a grip's
 *  absolute target can be turned back into a multiplier of it. */
export const CARD_BASE_ATTR = "data-sa-card-scale";

// ---- pure pieces (tested in camera.test.ts) ------------------------------
export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

export function clampCardScale(m: number): number {
  return Math.max(CARD_SCALE_MIN, Math.min(CARD_SCALE_MAX, Math.round(m * 1000) / 1000));
}

export function clampCardW(w: number): number {
  return Math.max(CARD_W_MIN, Math.min(CARD_W_MAX, Math.round(w)));
}

/** The next zoom for a wheel tick — d3-zoom's feel (what ReactFlow's camera
 *  uses): 2^(−ΔY·k), k by deltaMode, ×10 for a ctrl-wheel / trackpad pinch. */
export function wheelZoom(z: number, deltaY: number, deltaMode = 0, ctrl = false): number {
  const k = deltaMode === 1 ? 0.05 : deltaMode ? 1 : 0.002;
  return clampZoom(z * Math.pow(2, -deltaY * k * (ctrl ? 10 : 1)));
}

/** O: pulled back ⇒ return to the remembered zoom; otherwise remember this
 *  one and pull back. `prev` null means "not pulled back". */
export function togglePullBack(zoom: number, prev: number | null): { zoom: number; prev: number | null } {
  return prev == null ? { zoom: PULL_BACK_ZOOM, prev: zoom } : { zoom: prev, prev: null };
}

/** The slide's transform: translate in phone pixels (slide units × zoom),
 *  then the zoom — see the note at the top. */
export function stageTransform(tx: number, ty: number, zoom: number): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return `translate(${r(tx * zoom)}px, ${r(ty * zoom)}px) scale(${r(zoom)})`;
}

/** Key events from a field are the field's. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || !!el.isContentEditable);
}

/** The state that belongs to ONE slide. `id` is the frame it belongs to; a
 *  reader on another frame sees EMPTY_SLIDE, so a walk resets it with no
 *  effect and no flash of the old offset. */
export interface SlideState { id: string; tx: number; ty: number; cardW?: number; scaleMul?: number }
export const EMPTY_SLIDE: SlideState = { id: "", tx: 0, ty: 0 };

/** The slide state to build on for frame `id`: the previous one if it is the
 *  same frame, a fresh one otherwise. */
export function slideFor(prev: SlideState, id: string): SlideState {
  return prev.id === id ? prev : { id, tx: 0, ty: 0 };
}

/** The given (pre-override) scale the live card publishes — see CARD_BASE_ATTR. */
export function readCardBase(host: HTMLElement | null): number | null {
  const el = host?.querySelector(`[${CARD_BASE_ATTR}]`);
  const v = el ? Number(el.getAttribute(CARD_BASE_ATTR)) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ---- the hook --------------------------------------------------------------
export function useCaptureCamera({ hostRef, frameId }: { hostRef: RefObject<HTMLDivElement | null>; frameId: string }): CaptureCamera {
  const [zoom, setZoom] = useState(1);
  /** The zoom O will return to; null when not pulled back. */
  const [pulled, setPulled] = useState<number | null>(null);
  const [alt, setAlt] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [slide, setSlide] = useState<SlideState>(EMPTY_SLIDE);

  // The card's gestures call back from pointer handlers created at
  // pointer-down; they read the live values through refs so a handler made a
  // few renders ago still moves the right slide at the right zoom.
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const pulledRef = useRef(pulled); pulledRef.current = pulled;
  const frameRef = useRef(frameId); frameRef.current = frameId;
  const draggingRef = useRef(false);

  // ---- ZOOM: the wheel, natively on the host ----
  const onWheelNative = useCallback((e: globalThis.WheelEvent) => {
    const host = hostRef.current;
    if (!host) return;
    // The prompter and the chrome scroll themselves: only the phone and the
    // black surround are the camera.
    const t = e.target as Element | null;
    if (t !== host && !t?.closest?.("[data-sa-phone]")) return;
    e.preventDefault();
    setPulled(null); // a wheel is a manual shot — O pulls back from here next
    setZoom((z) => wheelZoom(z, e.deltaY, e.deltaMode, e.ctrlKey || e.metaKey));
  }, [hostRef]);
  // The host mounts AFTER the plan loads, so a mount-time effect would find
  // the ref empty. This runs after every commit and (re)attaches only when the
  // element itself changes — the common case is one compare and a return.
  const attachedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = hostRef.current;
    if (el === attachedRef.current) return;
    attachedRef.current?.removeEventListener("wheel", onWheelNative);
    attachedRef.current = el;
    el?.addEventListener("wheel", onWheelNative, { passive: false });
  });
  useEffect(() => () => { attachedRef.current?.removeEventListener("wheel", onWheelNative); attachedRef.current = null; }, [onWheelNative]);

  // ---- KEYS: O, 0, and the Alt latch ----
  // Space / Shift+Space / ` / Escape / H / P / F1 / Delete belong to other
  // handlers and are not touched here.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Alt") {
        // A lone Alt press-and-release would hand focus to the browser's menu
        // (Windows); on a filming surface Alt is a modifier and nothing else.
        e.preventDefault();
        setAlt(true);
        return;
      }
      if (e.altKey) { setAlt(true); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        const next = togglePullBack(zoomRef.current, pulledRef.current);
        setZoom(next.zoom);
        setPulled(next.prev);
        return;
      }
      if (e.code === "Digit0" || e.key === "0") {
        e.preventDefault();
        setPulled(null);
        setZoom(1);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") e.preventDefault();
      if (!e.altKey) setAlt(false);
    };
    const off = () => setAlt(false);
    const vis = () => { if (document.visibilityState === "hidden") off(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    document.addEventListener("visibilitychange", vis);
    return () => {
      off();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  // ---- the card's gestures (stable: read through refs) ----
  // A move is in flight from the first nudge until the pointer is released
  // ANYWHERE (the card tracks the pointer on the window, so the release can
  // land off the card): no transition while it flies, the 120ms ease back
  // for wheel / O / 0. The end listeners go on inside the same pointermove
  // that starts the drag, so a quick release can never slip past a commit.
  const moveBy = useCallback((_id: string, dx: number, dy: number) => {
    if (!draggingRef.current) {
      draggingRef.current = true;
      setDragging(true);
      const end = () => {
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        window.removeEventListener("blur", end);
        draggingRef.current = false;
        setDragging(false);
      };
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      window.addEventListener("blur", end);
    }
    const z = zoomRef.current, fid = frameRef.current;
    setSlide((p) => { const b = slideFor(p, fid); return { ...b, tx: b.tx + dx / z, ty: b.ty + dy / z }; });
  }, []);
  const setWidth = useCallback((_id: string, w: number) => {
    const fid = frameRef.current;
    setSlide((p) => ({ ...slideFor(p, fid), cardW: clampCardW(w) }));
  }, []);
  const setScale = useCallback((_id: string, s: number) => {
    // The grip hands over the card's ABSOLUTE data.scale (given × multiplier +
    // its delta); the override is a multiplier of the given scale, so the same
    // grip drag means the same thing at every phone width. The given scale is
    // read off the live card, which publishes it for exactly this.
    const base = readCardBase(hostRef.current);
    if (base == null) {
      console.error(`[capture camera] setScale: no live card publishes ${CARD_BASE_ATTR} under the host — the grip cannot scale it`);
      return;
    }
    const fid = frameRef.current;
    setSlide((p) => ({ ...slideFor(p, fid), scaleMul: clampCardScale(s / base) }));
  }, [hostRef]);
  // NOTHING TO WRITE: on /film a card's spot is per take. The set has no
  // field for instance geometry (the canvas writes its own; that is that
  // surface's door, not this one's), so the card's pointer-up is a no-op here.
  const persist = useCallback((_id: string) => {}, []);

  // ---- what the caller applies ----
  const cur = slide.id === frameId ? slide : EMPTY_SLIDE;
  const stageStyle = useMemo<CSSProperties>(() => ({
    transform: stageTransform(cur.tx, cur.ty, zoom),
    transformOrigin: "50% 50%",
    transition: dragging ? "none" : "transform 120ms ease-out",
  }), [cur.tx, cur.ty, zoom, dragging]);
  const cardOverride = useMemo<CardOverride | undefined>(
    () => (cur.cardW == null && cur.scaleMul == null ? undefined : { ...(cur.cardW == null ? {} : { cardW: cur.cardW }), ...(cur.scaleMul == null ? {} : { scaleMul: cur.scaleMul }) }),
    [cur.cardW, cur.scaleMul],
  );

  return { stageStyle, rootClass: alt ? "sa-alt" : "", moveBy, setWidth, setScale, persist, cardOverride, zoom, pulledBack: pulled != null };
}
