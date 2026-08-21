// ANIMATED CAMPUS BOLT — THE CONVEYOR.
//
// THE MENTAL MODEL is a filmstrip, not a slideshow. Campuses are stacked bottom-to-top on one tall
// tape; the tape slides upward at a constant speed and never stops, so the campus that is leaving
// is physically pushed out of the top by the one arriving from below. There is no fade, no reset,
// no "transition state" — the hand-over IS the motion, and the motion is the same at every instant.
//
//   slot 2  ┃ pre-warmed, below the frame                  ▲ tape moves up, forever
//   slot 1  ┃ the arriving campus                          ┃
//   slot 0  ┃ the campus that owns the bolt right now      ┃
//
// One campus panel is PANEL_SPAN bolt-heights tall, and the tape travels exactly one panel per
// CAMPUS_DURATION_MS. At span 2 that means half of every cycle is a hand-over (an edge crossing the
// bolt) and half is one campus alone — a clean read — while the flow speed never changes.
//
// SEAMLESS BY CONSTRUCTION: when the tape has moved a whole panel, the content that was in slot 1
// is standing exactly where slot 0 was. We shift the queue up one, append the next campus at the
// bottom and subtract one panel from the offset — the same pixels, described differently. There is
// no frame at which anything jumps, and no loop boundary to see.
//
// WHY THE THIRD SLOT: the queue shift is React state, so it lands a frame or two after the rAF
// asks for it. Rather than clamp the tape (a visible stall) we let it keep sliding past the wrap
// point — slot 2 is already painted down there, so those frames are correct — and subtract the
// panel in a layout effect once the new queue has actually committed.
//
// COST: React re-renders ~0.3×/second (a campus change), plus once more for the label flip. The
// motion itself is two `transform` attribute writes per frame, straight to the DOM.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { PANEL_SLOTS, panelHeight } from "./bolt-geometry";
import type { BoltCampus } from "./bolt-palette";

export type BoltRotationOptions = {
  /** false = one static campus, no conveyor (the lab's autoplay switch, and any pinned surface). */
  autoplay: boolean;
  /** prefers-reduced-motion: no tape at all, just a slow cross-fade between campuses. */
  reduced: boolean;
  durationMs: number;
  panelSpan: number;
  /** Fraction OF THE HAND-OVER at which the plate flips to the arriving campus (0–1). */
  labelSwitchProgress: number;
  /** Campus dwell in reduced-motion mode. */
  reducedDwellMs: number;
};

export type BoltRotation = {
  /** The queue, slot 0 first. Always PANEL_SLOTS long (padded by repetition for short lists). */
  panels: BoltCampus[];
  /** The campus the plate names and a click means — the visually dominant one. */
  labelCampus: BoltCampus;
  /** Attach to the two lane groups; the loop writes their transform directly. */
  leftLaneRef: React.RefObject<SVGGElement | null>;
  rightLaneRef: React.RefObject<SVGGElement | null>;
  /** True while the tape is actually running (autoplay on, motion allowed, list non-empty). */
  running: boolean;
};

export function useBoltRotation(campuses: BoltCampus[], opts: BoltRotationOptions): BoltRotation {
  const { autoplay, reduced, durationMs, panelSpan, labelSwitchProgress, reducedDwellMs } = opts;

  // Identity of the list, not of the array: a parent that rebuilds the array every render must not
  // reseed the conveyor and snap it back to campus one.
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
  // 0 = the plate names slot 0 (the departing campus), 1 = it has flipped to the arriving one.
  const [labelSlot, setLabelSlot] = useState<0 | 1>(0);

  const leftLaneRef = useRef<SVGGElement>(null);
  const rightLaneRef = useRef<SVGGElement>(null);
  const offsetRef = useRef(0);
  const labelSlotRef = useRef<0 | 1>(0);
  const nextIdxRef = useRef(PANEL_SLOTS);
  const wrapPendingRef = useRef(false);

  const paint = useCallback(() => {
    const t = `translate(0 ${-offsetRef.current})`;
    leftLaneRef.current?.setAttribute("transform", t);
    rightLaneRef.current?.setAttribute("transform", t);
  }, []);

  // Runs after EVERY commit — including the one that shifted the queue. Subtracting the panel here
  // rather than in the rAF is what makes the wrap invisible: the offset and the queue it belongs
  // to always reach the screen together.
  useLayoutEffect(() => {
    if (wrapPendingRef.current) {
      offsetRef.current -= panelHeight(panelSpan);
      wrapPendingRef.current = false;
    }
    paint();
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

  const running = autoplay && !reduced && campuses.length > 0;

  // ── the tape ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) {
      offsetRef.current = 0;
      paint();
      return;
    }
    const panelH = panelHeight(panelSpan);
    const speed = panelH / (durationMs / 1000); // user units per second
    // The plate flips part-way through the HAND-OVER, and the hand-over is the first 1/panelSpan
    // of the cycle — so in cycle terms it is that much earlier than the raw constant suggests.
    const switchAt = Math.min(0.999, Math.max(0, labelSwitchProgress) / panelSpan);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000; // a backgrounded tab must not teleport the tape
      last = now;
      offsetRef.current += speed * dt;

      if (!wrapPendingRef.current && offsetRef.current >= panelH) {
        // Hand the queue on. The offset is NOT touched here (see the layout effect above).
        wrapPendingRef.current = true;
        // The next campus is chosen HERE, not inside the updater: React is free to run an updater
        // more than once (StrictMode, a re-entrant render), and advancing the feed cursor in there
        // would silently skip campuses.
        const list = listRef.current;
        const nextCampus = list.length ? list[nextIdxRef.current % list.length] : undefined;
        nextIdxRef.current += 1;
        setPanels((prev) => [...prev.slice(1), nextCampus ?? prev[prev.length - 1]]);
        labelSlotRef.current = 0; // slot 1 has become slot 0 — same campus, so the plate is unchanged
        setLabelSlot(0);
      } else if (
        !wrapPendingRef.current &&
        labelSlotRef.current === 0 &&
        offsetRef.current / panelH >= switchAt
      ) {
        labelSlotRef.current = 1;
        setLabelSlot(1);
      }

      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, durationMs, panelSpan, labelSwitchProgress, paint, listKey]);

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

  const labelCampus = panels[reduced || !autoplay ? 0 : labelSlot] ?? panels[0] ?? campuses[0];
  return { panels, labelCampus, leftLaneRef, rightLaneRef, running };
}
