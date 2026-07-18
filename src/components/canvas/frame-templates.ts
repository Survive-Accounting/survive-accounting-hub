// FRAME ARCHETYPE TEMPLATES (pure, additive) — safe starting layouts for a shot.
// A template is just a list of NORMALIZED placements (0..1 within the 16:9 frame)
// for EXISTING card/element kinds. Applying one spawns those blank cards parented
// to the frame at safe positions/sizes — nothing new in the scene format, and the
// spawned objects are ordinary, fully-editable cards. NO AI, no "suggest visual".
//
// The `visualType` tag is also stamped on the frame (additive nullable) so the
// Visual Mix summary (Phase 8) can report the mix of shot types.
import type { CardData } from "./types";

export type FrameTemplateId =
  | "stage" | "statement" | "card_focus" | "comparison"
  | "diagram" | "worked_model" | "real_world" | "cram";

export interface TemplatePlacement {
  kind: CardData["kind"];
  /** Normalized top-left within the frame (0..1). */
  x: number;
  y: number;
  /** Normalized width (0..1 of frame width). */
  w: number;
}

export interface FrameTemplate {
  id: FrameTemplateId;
  name: string;
  blurb: string;
  /** Stamped on the frame for the Visual Mix summary. */
  visualType: string;
  placements: TemplatePlacement[];
}

// A comfortable safe inset — content never hugs the frame edge (phone-safe too).
const SAFE = 0.06;
const inSafe = (v: number) => v >= SAFE - 1e-6 && v <= 1 - SAFE + 1e-6;

export const FRAME_TEMPLATES: FrameTemplate[] = [
  {
    id: "stage", name: "Stage", blurb: "One big title — the opening shot.",
    visualType: "stage",
    placements: [{ kind: "heading", x: 0.14, y: 0.36, w: 0.72 }],
  },
  {
    id: "statement", name: "Statement", blurb: "A claim up top, support below.",
    visualType: "statement",
    placements: [
      { kind: "heading", x: 0.1, y: 0.1, w: 0.8 },
      { kind: "list", x: 0.15, y: 0.4, w: 0.7 },
    ],
  },
  {
    id: "card_focus", name: "Card Focus", blurb: "A single teaching card, centered.",
    visualType: "card_focus",
    placements: [{ kind: "je", x: 0.29, y: 0.2, w: 0.42 }],
  },
  {
    id: "comparison", name: "Comparison", blurb: "Two things, side by side.",
    visualType: "comparison",
    placements: [
      { kind: "heading", x: 0.1, y: 0.07, w: 0.8 },
      { kind: "list", x: 0.08, y: 0.3, w: 0.4 },
      { kind: "list", x: 0.52, y: 0.3, w: 0.4 },
    ],
  },
  {
    id: "diagram", name: "Diagram", blurb: "A titled relationship in the center.",
    visualType: "diagram",
    placements: [
      { kind: "heading", x: 0.1, y: 0.08, w: 0.8 },
      { kind: "formula", x: 0.14, y: 0.38, w: 0.72 },
    ],
  },
  {
    id: "worked_model", name: "Worked Model", blurb: "Entry on the left, the math on the right.",
    visualType: "worked_model",
    placements: [
      { kind: "je", x: 0.07, y: 0.16, w: 0.42 },
      { kind: "computation", x: 0.53, y: 0.16, w: 0.4 },
    ],
  },
  {
    id: "real_world", name: "Real World", blurb: "An image with a caption note.",
    visualType: "real_world",
    placements: [
      { kind: "image", x: 0.07, y: 0.14, w: 0.46 },
      { kind: "note", x: 0.58, y: 0.2, w: 0.35 },
    ],
  },
  {
    id: "cram", name: "Cram", blurb: "The must-remember list, front and center.",
    visualType: "cram",
    placements: [
      { kind: "heading", x: 0.1, y: 0.08, w: 0.8 },
      { kind: "list", x: 0.12, y: 0.3, w: 0.76 },
    ],
  },
];

export function templateById(id: string | undefined): FrameTemplate | undefined {
  return id ? FRAME_TEMPLATES.find((t) => t.id === id) : undefined;
}

/** Absolute child placements (px, relative to the frame origin) for a frame of
 *  (frameW, frameH). Widths are clamped to a sane minimum so a card never spawns
 *  narrower than it can render. */
export function placeTemplate(t: FrameTemplate, frameW: number, frameH: number): { kind: CardData["kind"]; x: number; y: number; w: number }[] {
  return t.placements.map((pl) => ({
    kind: pl.kind,
    x: Math.round(pl.x * frameW),
    y: Math.round(pl.y * frameH),
    w: Math.max(180, Math.round(pl.w * frameW)),
  }));
}

/** Every placement of every template sits inside the phone-safe region — a guard
 *  so a template can never seed content off the edge. */
export function templatePlacementsAreSafe(t: FrameTemplate): boolean {
  return t.placements.every((pl) => inSafe(pl.x) && inSafe(pl.y) && pl.x + pl.w <= 1 - SAFE + 1e-6);
}
