// THE FIELD ROAM — the capture camera's gestures on a MAP frame (2026-09-07).
//
// Lee: "we can like see the entire cluster from birds eye view in the frame, but we can go swim
// around for it in the capture window." On a cluster frame the wheel, alt-drag, 0 and O act on
// the FIELD, not on a card: wheel = zoom about the pointer, alt-drag = pan, 0 = snap back to the
// shot's camera, O = the bird's-eye (overviewCamera). The shot's camera (cluster-spec's
// cameraAt) is the home position; this is an OFFSET over it — dx/dy in field pixels, zoom as a
// multiplier — that resets the moment the shot or the frame changes, so every press of space
// lands exactly where the map's author put the camera.
//
// The card camera (capture/camera.ts) is told `target: "field"` on these frames and stands
// down: its wheel and its O/0 are skipped there, its transform is identity — the two never
// fight over one wheel tick. Pure helpers first (field-roam.test.ts), the hook under them.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { PHONE, overviewCamera, type ClusterCamera } from "../cluster/cluster-spec";
import { isTypingTarget } from "./camera";

/** How the offset last changed — ClusterStage picks its transition from it (a drag flies with
 *  no transition, a wheel tick eases in 120 ms, a shot change gets the 480 ms overshoot). */
export type RoamGesture = "none" | "wheel" | "drag";

export interface FieldRoam { dx: number; dy: number; zoom: number; gesture: RoamGesture }
export const NO_ROAM: FieldRoam = { dx: 0, dy: 0, zoom: 1, gesture: "none" };

/** Bounds on the multiplier over the shot's zoom: 0.15 × (far out) to 4 × (close in). */
export const ROAM_ZOOM_MIN = 0.15;
export const ROAM_ZOOM_MAX = 4;
export const clampRoamZoom = (z: number): number => Math.max(ROAM_ZOOM_MIN, Math.min(ROAM_ZOOM_MAX, z));

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** The camera the field is actually drawn with: the shot's, offset by the roam. */
export function effectiveCamera(shot: ClusterCamera, roam: FieldRoam): ClusterCamera {
  return { x: r3(shot.x + roam.dx), y: r3(shot.y + roam.dy), zoom: r3(shot.zoom * roam.zoom) };
}

/** d3-zoom's feel (the same curve capture/camera.ts uses): 2^(−ΔY·k), k by deltaMode, ×10 for
 *  a ctrl-wheel / trackpad pinch. A factor, not a zoom — the caller multiplies. */
export function wheelFactor(deltaY: number, deltaMode = 0, ctrl = false): number {
  const k = deltaMode === 1 ? 0.05 : deltaMode ? 1 : 0.002;
  return Math.pow(2, -deltaY * k * (ctrl ? 10 : 1));
}

/** ZOOM ABOUT THE POINTER: the field point under (px, py) — in phone units, 0..1080 × 0..1920 —
 *  stays under it after the zoom. Bounded by the multiplier range. */
export function zoomAbout(roam: FieldRoam, shot: ClusterCamera, factor: number, px: number, py: number, phone = PHONE): FieldRoam {
  const zoomMul = clampRoamZoom(roam.zoom * factor);
  if (zoomMul === roam.zoom) return { ...roam, gesture: "wheel" };
  const z = shot.zoom * roam.zoom, z2 = shot.zoom * zoomMul;
  const ox = px - phone.w / 2, oy = py - phone.h / 2;
  // The field point under the pointer: centre + offset / zoom. Keep it there at the new zoom.
  const fx = shot.x + roam.dx + ox / z, fy = shot.y + roam.dy + oy / z;
  return { dx: r3(fx - ox / z2 - shot.x), dy: r3(fy - oy / z2 - shot.y), zoom: r3(zoomMul), gesture: "wheel" };
}

/** PAN by a pointer movement in phone units: dragging the field right moves the camera left. */
export function panBy(roam: FieldRoam, shot: ClusterCamera, dxPhone: number, dyPhone: number): FieldRoam {
  const z = shot.zoom * roam.zoom;
  return { ...roam, dx: r3(roam.dx - dxPhone / z), dy: r3(roam.dy - dyPhone / z), gesture: "drag" };
}

/** The roam that makes the effective camera exactly `target` (O → the overview). */
export function roamTo(shot: ClusterCamera, target: ClusterCamera): FieldRoam {
  return { dx: r3(target.x - shot.x), dy: r3(target.y - shot.y), zoom: r3(target.zoom / shot.zoom), gesture: "none" };
}

export const isHome = (roam: FieldRoam): boolean => roam.dx === 0 && roam.dy === 0 && roam.zoom === 1;
const sameRoam = (a: FieldRoam, b: FieldRoam): boolean => a.dx === b.dx && a.dy === b.dy && a.zoom === b.zoom;

/** O toggles: at the overview → home; anywhere else → the overview. */
export function toggleOverview(roam: FieldRoam, shot: ClusterCamera, field: { w: number; h: number }, phone = PHONE): FieldRoam {
  const ov = roamTo(shot, overviewCamera(field, phone));
  return sameRoam(roam, ov) ? NO_ROAM : ov;
}

// ---------------------------------------------------------------- the hook

export interface FieldRoamApi {
  /** The offset over the shot's camera — NO_ROAM until a gesture. */
  roam: FieldRoam;
  /** 0: back to the shot. */
  reset: () => void;
}

/** The field's gestures on the capture host. `active` only on a cluster frame that is the take
 *  (not the main window's next-slide preview); `key` names the frame + shot the roam belongs to
 *  — a new key is a fresh NO_ROAM, with no flash of the old offset. */
export function useFieldRoam({ hostRef, active, shot, field, key }: {
  hostRef: RefObject<HTMLDivElement | null>;
  active: boolean;
  shot: ClusterCamera | null;
  field: { w: number; h: number } | null;
  key: string;
}): FieldRoamApi {
  const [state, setState] = useState<{ key: string; roam: FieldRoam }>({ key, roam: NO_ROAM });
  const roam = state.key === key ? state.roam : NO_ROAM;
  const keyRef = useRef(key); keyRef.current = key;
  const shotRef = useRef(shot); shotRef.current = shot;
  const fieldRef = useRef(field); fieldRef.current = field;
  const activeRef = useRef(active); activeRef.current = active;
  const update = useCallback((f: (r: FieldRoam, s: ClusterCamera) => FieldRoam) => {
    const s = shotRef.current;
    if (!s) return;
    const k = keyRef.current;
    setState((p) => ({ key: k, roam: f(p.key === k ? p.roam : NO_ROAM, s) }));
  }, []);
  const reset = useCallback(() => setState({ key: keyRef.current, roam: NO_ROAM }), []);

  /** The pointer, in phone units, from a client point — the phone's rect is the reference. */
  const phonePoint = useCallback((clientX: number, clientY: number): { px: number; py: number; k: number } | null => {
    const phone = hostRef.current?.querySelector("[data-sa-phone]") as HTMLElement | null;
    if (!phone) return null;
    const r = phone.getBoundingClientRect();
    const k = PHONE.w / r.width;
    return { px: (clientX - r.left) * k, py: (clientY - r.top) * k, k };
  }, [hostRef]);

  // ---- WHEEL: zoom about the pointer, natively (non-passive) on the host ----
  const onWheel = useCallback((e: globalThis.WheelEvent) => {
    if (!activeRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    const t = e.target as Element | null;
    if (t !== host && !t?.closest?.("[data-sa-phone]")) return;
    e.preventDefault();
    const p = phonePoint(e.clientX, e.clientY);
    if (!p) return;
    const f = wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey || e.metaKey);
    update((r, s) => zoomAbout(r, s, f, p.px, p.py));
  }, [hostRef, phonePoint, update]);

  // ---- ALT-DRAG: pan ----
  const onDown = useCallback((e: PointerEvent) => {
    if (!activeRef.current || !e.altKey || e.button !== 0) return;
    const host = hostRef.current;
    const t = e.target as Element | null;
    if (!host || (t !== host && !t?.closest?.("[data-sa-phone]"))) return;
    e.preventDefault();
    let lx = e.clientX, ly = e.clientY;
    const move = (m: PointerEvent) => {
      const p = phonePoint(m.clientX, m.clientY);
      if (!p) return;
      const dx = (m.clientX - lx) * p.k, dy = (m.clientY - ly) * p.k;
      lx = m.clientX; ly = m.clientY;
      update((r, s) => panBy(r, s, dx, dy));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      // The drag is over: the next change (a shot, a wheel) transitions again.
      update((r) => ({ ...r, gesture: "none" }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
  }, [hostRef, phonePoint, update]);

  // The host mounts after the plan loads — attach per element, like the card camera does.
  const attachedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = hostRef.current;
    if (el === attachedRef.current) return;
    if (attachedRef.current) { attachedRef.current.removeEventListener("wheel", onWheel); attachedRef.current.removeEventListener("pointerdown", onDown); }
    attachedRef.current = el;
    if (el) { el.addEventListener("wheel", onWheel, { passive: false }); el.addEventListener("pointerdown", onDown); }
  });
  useEffect(() => () => { attachedRef.current?.removeEventListener("wheel", onWheel); attachedRef.current?.removeEventListener("pointerdown", onDown); attachedRef.current = null; }, [onWheel, onDown]);

  // ---- KEYS: O = the overview, 0 = home ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!activeRef.current || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "o" || e.key === "O") {
        const f = fieldRef.current;
        if (!f) return;
        e.preventDefault();
        update((r, s) => toggleOverview(r, s, f));
      } else if (e.code === "Digit0" || e.key === "0") {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [update, reset]);

  return { roam, reset };
}
