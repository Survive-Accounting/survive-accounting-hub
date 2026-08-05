// STACKING ORDER — the single source of truth for DOM overlay z-index (the CHROME
// layer: panels, overlays, dialogs, toasts). This is NOT React Flow node z-order —
// that lives in zorder.ts and is a separate stacking context inside the canvas viewport.
//
// WHY THIS EXISTS: ad-hoc `z-[NN]` values scattered across the app are exactly what let
// the Load-scene modal (z-50) render BEHIND the CEQ Studio overlay (z-[60]). Every new
// hand-picked z-index risks the next collision. Use these NAMED tiers instead.
//
// HOW TO USE: Tailwind can't JIT a dynamic `z-[${...}]`, so apply via inline style:
//     style={{ zIndex: Z.modal }}
// A full-screen takeover surface is `overlay`; anything that must sit ON TOP of one
// (a dialog, confirm, picker) is `modal`; a dialog stacked on a dialog is `modalTop`;
// transient toasts + fail-loud alerts are `toast` (always on top). Bands are spaced so
// intent is obvious and there's room to insert without renumbering.
//
//   base     0   world/canvas backgrounds
//   canvas  45   in-canvas overlays: guides, pills, frame chrome, minimap, menus
//   overlay 60   FULL-SCREEN takeover surfaces: CEQ Studio, grid/storyboard, teleprompter, rearrange
//   navbar  65   the top navbar (a full-screen overlay covers it, by design)
//   modal   70   dialogs/confirms that must sit ABOVE an overlay (Load scene, Manage*, pickers, snapshot confirm)
//   modalTop 80  a modal stacked on a modal (keymap cheat-sheet, secondary pickers)
//   toast   90   transient toasts + fail-loud alerts — always on top
//   recording 1000  the film-safe Recording Mode overlay — an opaque full-window layer
//                   that must cover EVERYTHING (even toasts) so nothing leaks into a take.
export const Z = {
  base: 0,
  canvas: 45,
  overlay: 60,
  navbar: 65,
  modal: 70,
  modalTop: 80,
  toast: 90,
  recording: 1000,
} as const;

export type ZLayer = keyof typeof Z;
