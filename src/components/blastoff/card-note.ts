// THE NOTE ON A SET CARD — the pure rules (CardNote.tsx draws it).
//
// Lee (2026-09-11): "I want to create a note I can add to the top of a ceq set... it can be
// resized, if it's added, the answer choices can be toggled to be dimmed/blurred behind it or not.
// I will create the note, then in the recording use F1 to arrow between the note and what I want
// to talk about. The text in the note should auto resize itself if there's more text than needed.
// For context, I will use this to define something in the question stem... like what prepaid
// insurance is."
//
// So the note is a box over the card, placed as fractions of the phone (so it films at the same
// spot at any width), dragged and resized on the Review stage; its words shrink to fit the box.
// The F1 arrow is the capture's own (capture/arrows.tsx) — nothing new here.

import type { SlideLayout } from "./layout";

export interface CardNoteSpec {
  text: string;
  /** Top-left and size, as fractions of the phone. Absent = the default spot for the layout. */
  x?: number; y?: number; w?: number; h?: number;
  /** Dim and blur the answer choices behind it. */
  dim?: boolean;
}

export interface NoteBox { x: number; y: number; w: number; h: number }

/** Where a new note sits: over the top of the choices, just under the stem — pass 2 puts the card
 *  at the top of the safe column, pass 1 centres it. He drags it from there. */
export function defaultNoteBox(layout: SlideLayout): NoteBox {
  return layout === "pass2" ? { x: 0.1, y: 0.25, w: 0.68, h: 0.16 } : { x: 0.1, y: 0.37, w: 0.68, h: 0.16 };
}

/** Keep the note on the phone and a sensible size. Pure. */
export function clampNoteBox(b: NoteBox): NoteBox {
  const w = Math.min(0.95, Math.max(0.2, b.w));
  const h = Math.min(0.6, Math.max(0.05, b.h));
  return { x: Math.min(1 - w, Math.max(0, b.x)), y: Math.min(1 - h, Math.max(0, b.y)), w, h };
}

/** The note's box: its own, else the layout's default. */
export function noteBox(n: CardNoteSpec, layout: SlideLayout): NoteBox {
  const d = defaultNoteBox(layout);
  return clampNoteBox({ x: n.x ?? d.x, y: n.y ?? d.y, w: n.w ?? d.w, h: n.h ?? d.h });
}

/** The type range, in phone units on the 306-wide Review phone. */
export const NOTE_FONT = { max: 22, min: 7 } as const;

/** The biggest size in [min, max] that `fits`, to half a pixel — a binary search, so a long note
 *  settles in a handful of measurements. `fits` must be monotone (bigger never fits better). */
export function fitFont(fits: (px: number) => boolean, max: number, min: number): number {
  if (fits(max)) return max;
  let lo = min, hi = max;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}
