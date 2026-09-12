// THE ACCOUNTING CYCLE SLIDE's field — the pure geometry (CycleFrame.tsx draws it).
//
// Lee, 2026-09-12: "I want to pull out the Accounting Cycle exhibit we have and maybe like, have it
// zoomed way out, but let me zoom up to it and drag around / swim around? Just to give users a
// quick tease of it. We will need this zoom functionality later, too."
//
// So the ring (canvas/exhibit-lab/cycle-ring.tsx) is laid on a FIELD, exactly like the map's, and
// the map's own gestures move the camera over it: wheel zooms about the pointer, alt-drag swims,
// 0 goes home, O is the bird's-eye (capture/field-roam.ts — one implementation, two kinds).
//
// HOME IS DELIBERATELY UNREADABLE. The whole ring is on screen and its labels are too small to
// read: that IS the tease. Zooming in is the gesture that pays it off, and at the roam's 4× cap a
// step's label is about 3.6 % of the frame's width — the size a caption used to be.
import { overviewCamera, type ClusterCamera } from "./cluster/cluster-spec";

/** The field the ring sits on, in field units, and the ring's own box inside it. The margin is
 *  what gives the swim somewhere to go at high zoom. */
export const CYCLE_FIELD = { w: 1450, h: 950 } as const;
export const CYCLE_RING_W = 1300;
/** The ring's box keeps the exhibit's 1000 × 600 shape. */
export const CYCLE_RING_H = Math.round((CYCLE_RING_W * 600) / 1000);

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Where the camera starts: the whole field in frame, a breath inside the edges. */
export function cycleHome(): ClusterCamera {
  const ov = overviewCamera(CYCLE_FIELD);
  return { x: ov.x, y: ov.y, zoom: r3(ov.zoom * 0.94) };
}

/** Where the ring's box sits inside the field (centred), in field units. */
export function cycleRingBox(): { left: number; top: number; w: number; h: number } {
  return { left: Math.round((CYCLE_FIELD.w - CYCLE_RING_W) / 2), top: Math.round((CYCLE_FIELD.h - CYCLE_RING_H) / 2), w: CYCLE_RING_W, h: CYCLE_RING_H };
}
