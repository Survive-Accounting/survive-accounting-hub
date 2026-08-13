// SURVIVE ACCOUNTING HUB — the shared geometry (flow-space) behind the branded
// home. ONE source of truth for both the decorative backdrop (SurviveBackdrop)
// AND the region scaffold, so a course's lessons build INSIDE its plate instead
// of floating over the hub. The Start Here plate is sized to hold a full region
// (5×3 lesson cells + a wrap-up row) at natural node size — zoom the plate to
// fill the screen and the scaffold sits neatly inside it; zoom out for the
// overhead map of the whole hub.
import { lessonCellSize, regionLayout, REGION } from "./frames";

export interface Rect { x: number; y: number; w: number; h: number }

/** Breathing room inside the plate, around the region cluster. */
const PLATE_PAD = 640;
/** A band at the top of the plate interior for the Home welcome + Ask Lee. */
const HOME_BAND = 320;
/** Vertical gaps in the crown composition. */
const LABEL_GAP = 420;
const PLATE_GAP = 820;
const FUTURE_GAP = 1000;

export const HUB_START_COURSE = "Start Here";
/** The four not-yet-lit courses + how to recognise them from a course name. */
export const HUB_FUTURE = [
  { key: "intro1", label: "Intro 1", match: /intro(?:ductory)?\s*(?:1|i\b)|principles\s*(?:1|i\b)/i },
  { key: "intro2", label: "Intro 2", match: /intro(?:ductory)?\s*(?:2|ii\b)|principles\s*(?:2|ii\b)/i },
  { key: "ia1", label: "IA1", match: /\bia\s*1|intermediate\s*(?:1|i\b)/i },
  { key: "ia2", label: "IA2", match: /\bia\s*2|intermediate\s*(?:2|ii\b)/i },
] as const;

export interface HubLayout {
  header: { text: string; font: number; top: number; h: number };
  label: { text: string; font: number; top: number; h: number };
  /** The lit Start Here plate — sized to contain the region + Home band. */
  startPlate: Rect;
  /** Top-left of the Home band inside the plate (welcome heading + Ask Lee). */
  homeOrigin: { x: number; y: number };
  /** Top-left where the region GRID starts (below the Home band). */
  regionOrigin: { x: number; y: number };
  /** Usable region footprint inside the plate (grid + optional wrap-up row). */
  regionW: number;
  future: { key: string; label: string; rect: Rect }[];
}

/** Deterministic hub composition, centred on x = 0. Depends only on the frame
 *  constants, so both the backdrop and the scaffold agree pixel-for-pixel. */
export function hubLayout(): HubLayout {
  const cell = lessonCellSize();
  // Size for the largest region we lay out: a full 5×3 grid + a wrap-up row.
  const rl = regionLayout(REGION.cols * REGION.minRows, 0, 0, true, cell);
  const regionW = rl.gridW;
  const regionH = rl.gridH + REGION.wrapGapY + cell.h; // include the wrap-up cell

  const plateW = regionW + PLATE_PAD * 2;
  const plateH = HOME_BAND + regionH + PLATE_PAD * 2;
  const plateX = -plateW / 2;

  // The crown scales with the plate so the hub reads as one composition.
  const headerFont = Math.round(plateW * 0.06);
  const headerH = Math.round(headerFont * 1.25);
  const headerTop = 0;
  const labelFont = Math.round(headerFont * 0.33);
  const labelTop = headerTop + headerH + LABEL_GAP;
  const labelH = Math.round(labelFont * 1.4);
  const plateY = labelTop + labelH + PLATE_GAP;

  const homeOrigin = { x: plateX + PLATE_PAD, y: plateY + PLATE_PAD };
  const regionOrigin = { x: plateX + PLATE_PAD, y: plateY + PLATE_PAD + HOME_BAND };

  const futW = (plateW - FUTURE_GAP * 3) / 4;
  const futH = Math.round(futW * 0.6);
  const futTop = plateY + plateH + FUTURE_GAP;
  const future = HUB_FUTURE.map((c, i) => ({
    key: c.key,
    label: c.label,
    rect: { x: plateX + i * (futW + FUTURE_GAP), y: futTop, w: futW, h: futH } as Rect,
  }));

  return {
    header: { text: "SURVIVE ACCOUNTING", font: headerFont, top: headerTop, h: headerH },
    label: { text: "START HERE", font: labelFont, top: labelTop, h: labelH },
    startPlate: { x: plateX, y: plateY, w: plateW, h: plateH },
    homeOrigin,
    regionOrigin,
    regionW,
    future,
  };
}

/** Which plate a course scaffolds into: "start" for Start Here, a future key for
 *  the four teasers, or null (unknown → the caller centres on the viewport). */
export function plateForCourse(name: string | null | undefined): "start" | string | null {
  if (!name) return null;
  if (/start\s*here/i.test(name)) return "start";
  const f = HUB_FUTURE.find((x) => x.match.test(name));
  return f ? f.key : null;
}
