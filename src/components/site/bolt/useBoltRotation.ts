// ANIMATED CAMPUS BOLT — THE CHARGE.
//
// THE MENTAL MODEL is a filmstrip that MOVES IN BEATS, not a conveyor that never stops. Campuses
// are stacked bottom-to-top on one tall tape; every cycle the tape drives up by exactly one panel
// and then holds dead still:
//
//   slot 2  ┃ pre-warmed, below the frame              CHARGE  ── tape drives up one panel, eased
//   slot 1  ┃ the arriving campus                      DWELL   ── nothing moves; this is READING time
//   slot 0  ┃ the campus that owns the bolt right now  CHARGE  ── …
//
// The earlier version ran at a constant speed with no rest at all, so the hand-over ate half of
// every cycle and the mark was never once still. Movement, rest, movement, rest — the finished
// school IS the resting state, and the charge is punctuation between them.
//
// SEAMLESS BY CONSTRUCTION: a panel is PANEL_SPAN bolt-heights tall and the charge travels exactly
// one panel, so when it finishes, the content that was in slot 1 stands precisely where slot 0
// was. We shift the queue up one, append the next campus at the bottom and subtract one panel from
// the offset — the same pixels, described differently. There is no loop boundary to see.
//
// WHY THE THIRD SLOT: the queue shift is React state, so it lands a frame or two after the rAF
// asks for it. Rather than stall the tape we let it sit at the end of its travel — slot 2 is
// already painted below — and subtract the panel in a layout effect once the new queue commits.
//
// COST: React re-renders twice per cycle (the campus, and the caption swap). The motion itself is
// two `transform` writes per frame during the charge and NOTHING AT ALL during the dwell — the rAF
// loop keeps running but writes nothing while the tape is parked.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { PANEL_SLOTS, panelHeight } from "./bolt-geometry";
import type { BoltCampus } from "./bolt-palette";

/** Which beat the bolt is on. Mirrored onto the host as `data-phase`, where the stylesheet uses it
 *  to fade the caption and to run the idle float during rest only. */
export type BoltPhase = "charge" | "rest";

export type BoltRotationOptions = {
  /** false = one static campus, no charge (the lab's autoplay switch, and any pinned surface). */
  autoplay: boolean;
  /** prefers-reduced-motion: no tape at all, just a slow cross-fade between campuses. */
  reduced: boolean;
  chargeMs: number;
  dwellMs: number;
  panelSpan: number;
  /** Cubic-bezier control points for the charge. */
  ease: readonly [number, number, number, number];
  /** Fraction of the CHARGE at which the caption's text is swapped (it is invisible then). */
  captionSwapProgress: number;
  /** Campus dwell in reduced-motion mode. */
  reducedDwellMs: number;
  /** The element that carries `data-phase`. */
  hostRef: React.RefObject<HTMLElement | null>;
};

export type BoltRotation = {
  /** The queue, slot 0 first. Always PANEL_SLOTS long (padded by repetition for short lists). */
  panels: BoltCampus[];
  /** The campus the caption names and a click means — the visually dominant one. */
  labelCampus: BoltCampus;
  /** Attach to the two lane groups; the loop writes their transform directly. */
  leftLaneRef: React.RefObject<SVGGElement | null>;
  rightLaneRef: React.RefObject<SVGGElement | null>;
  /** True while the tape is actually running (autoplay on, motion allowed, 2+ campuses). */
  running: boolean;
};

/** A cubic-bezier timing function, the same four numbers CSS takes, solved by bisection.
 *
 *  Bisection rather than Newton-Raphson on purpose: it needs no derivative, cannot diverge on a
 *  steep control polygon, and 20 iterations is exact to ~1e-6 — which is far below a pixel on a
 *  147-unit bolt, and costs nothing at one call per frame. */
export function cubicBezierEase([x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const curve = (a: number, b: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0,
      hi = 1,
      t = x;
    for (let i = 0; i < 20; i++) {
      t = (lo + hi) / 2;
      if (curve(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return curve(y1, y2, t);
  };
}

export function useBoltRotation(campuses: BoltCampus[], opts: BoltRotationOptions): BoltRotation {
  const {
    autoplay,
    reduced,
    chargeMs,
    dwellMs,
    panelSpan,
    ease,
    captionSwapProgress,
    reducedDwellMs,
    hostRef,
  } = opts;

  // Identity of the list, not of the array: a parent that rebuilds the array every render must not
  // reseed the rotation and snap it back to campus one.
  const listKey = useMemo(
    () => campuses.map((c) => `${c.id}:${c.primary}:${c.secondary}:${c.accent ?? ""}`).join("|"),
    [campuses],
  );
  const listRef = useRef(campuses);
  listRef.current = campuses;

  const seed = useCallback((list: BoltCampus[]) => {
    if (!list.length) return [] as BoltCampus[];
    return Array.from({ length: PANEL_SLOTS }, (_, i) => list[i % list.length]);
  }, []);

  const [panels, setPanels] = useState<BoltCampus[]>(() => seed(campuses));
  // The rAF loop cannot read `panels` from its closure (it would be the array from the render that
  // started the loop), so the current identity is mirrored here for the wrap guard below.
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  // 0 = the caption names slot 0 (the departing campus), 1 = it has swapped to the arriving one.
  const [labelSlot, setLabelSlot] = useState<0 | 1>(0);

  const leftLaneRef = useRef<SVGGElement>(null);
  const rightLaneRef = useRef<SVGGElement>(null);
  const offsetRef = useRef(0);
  const labelSlotRef = useRef<0 | 1>(0);
  const nextIdxRef = useRef(PANEL_SLOTS);
  const wrapPendingRef = useRef(false);
  const phaseRef = useRef<BoltPhase>("rest");

  const paint = useCallback(() => {
    const t = `translate(0 ${-offsetRef.current})`;
    leftLaneRef.current?.setAttribute("transform", t);
    rightLaneRef.current?.setAttribute("transform", t);
  }, []);

  /** The phase lives on the DOM, not in React state: it flips twice a second at most, but nothing
   *  in the tree needs to re-render for it — the stylesheet does all the work from the attribute. */
  const setPhase = useCallback(
    (p: BoltPhase) => {
      if (phaseRef.current === p) return;
      phaseRef.current = p;
      if (hostRef.current) hostRef.current.dataset.phase = p;
    },
    [hostRef],
  );

  // Runs after EVERY commit — including the one that shifted the queue. Subtracting the panel here
  // rather than in the rAF is what makes the wrap invisible: the offset and the queue it belongs
  // to always reach the screen together.
  //
  // The subtraction waits for the QUEUE ARRAY ITSELF to change, not merely for the next render. An
  // unrelated re-render arriving between "wrap requested" and "wrap committed" would otherwise
  // subtract a whole panel while the old queue was still on screen — a one-frame jump backwards.
  const wrapFromRef = useRef<BoltCampus[] | null>(null);
  useLayoutEffect(() => {
    if (wrapPendingRef.current && panels !== wrapFromRef.current) {
      offsetRef.current -= panelHeight(panelSpan);
      wrapPendingRef.current = false;
      wrapFromRef.current = null;
    }
    paint();
    if (hostRef.current) hostRef.current.dataset.phase = phaseRef.current;
  });

  // A different campus list (a picker choice, a campus page resolving) restarts cleanly.
  useEffect(() => {
    setPanels(seed(listRef.current));
    setLabelSlot(0);
    labelSlotRef.current = 0;
    nextIdxRef.current = PANEL_SLOTS;
    offsetRef.current = 0;
    wrapPendingRef.current = false;
  }, [listKey, seed]);

  // A single campus never charges — there is nothing to charge INTO. It rests permanently, which
  // is exactly right for a campus page: one school, pinned, still.
  const running = autoplay && !reduced && campuses.length > 1;

  // ── the beat ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) {
      offsetRef.current = 0;
      setPhase("rest");
      paint();
      return;
    }
    const panelH = panelHeight(panelSpan);
    const easeFn = cubicBezierEase(ease);
    const swapAt = Math.min(1, Math.max(0, captionSwapProgress));

    let raf = 0;
    // `elapsed` is time INSIDE the current beat. Accumulating deltas rather than reading a start
    // timestamp keeps a backgrounded tab from teleporting the tape when it wakes up.
    let elapsed = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100); // a backgrounded tab must not jump the charge
      last = now;
      elapsed += dt;

      if (phaseRef.current === "rest") {
        // NOTHING IS WRITTEN during the dwell — no transform, no state. The tape is parked.
        if (elapsed >= dwellMs) {
          elapsed -= dwellMs;
          setPhase("charge");
        }
      }

      if (phaseRef.current === "charge") {
        const t = Math.min(1, elapsed / chargeMs);
        offsetRef.current = easeFn(t) * panelH;
        paint();

        if (!wrapPendingRef.current && labelSlotRef.current === 0 && t >= swapAt) {
          labelSlotRef.current = 1;
          setLabelSlot(1);
        }

        if (t >= 1 && !wrapPendingRef.current) {
          // Hand the queue on. The offset is NOT reset here (see the layout effect above).
          wrapPendingRef.current = true;
          wrapFromRef.current = panelsRef.current;
          // The next campus is chosen HERE, not inside the updater: React is free to run an
          // updater more than once, and advancing the feed cursor in there would skip campuses.
          const list = listRef.current;
          const nextCampus = list.length ? list[nextIdxRef.current % list.length] : undefined;
          nextIdxRef.current += 1;
          setPanels((prev) => [...prev.slice(1), nextCampus ?? prev[prev.length - 1]]);
          // slot 1 has become slot 0 — the same campus, so the caption does not change.
          labelSlotRef.current = 0;
          setLabelSlot(0);
          elapsed -= chargeMs;
          setPhase("rest");
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, chargeMs, dwellMs, panelSpan, ease, captionSwapProgress, paint, setPhase, listKey]);

  // ── reduced motion: a slow cross-fade, no tape ──────────────────────────────────────────────
  useEffect(() => {
    if (!reduced || !autoplay || campuses.length < 2) return;
    const id = window.setInterval(() => {
      const list = listRef.current;
      const nextCampus = list[nextIdxRef.current % list.length];
      nextIdxRef.current += 1;
      setPanels((prev) => [...prev.slice(1), nextCampus]);
    }, reducedDwellMs);
    return () => window.clearInterval(id);
  }, [reduced, autoplay, campuses.length, reducedDwellMs, listKey]);

  const labelCampus = panels[running ? labelSlot : 0] ?? panels[0] ?? campuses[0];
  return { panels, labelCampus, leftLaneRef, rightLaneRef, running };
}
