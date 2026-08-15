// FILM LOCK (film-mode-lock, A1) — the shared canvas-object law: ON CAMERA,
// GEOMETRY IS READ-ONLY. One module owns the rule so every object type — CEQ
// cards, note cards, and all exhibit cards (accounting cycle today, T-accounts /
// journal-entry / trial-balance cards later) — inherits it without card code.
//
// Why this exists (the 2026-08-14 live-session incident): the film popout let
// staged cards be selected, which showed live NodeResizer handles; a resize
// writes w/h into node data and PERSISTS. Meanwhile film drags deliberately
// don't persist — so sizes stuck while positions rubber-banded back to the
// authored layout on the next Space, which read as the card "re-affixing
// itself". Root cause was never the layout engine (stampFromTemplate runs only
// from the explicit apply-to-all action); it was film surfaces leaking
// authoring affordances.
//
// Three prongs, defense in depth:
//   1. filmDragAllowed — per-node draggability in film. Arrow heads stay live
//      (dragging an arrow on camera is a PERFORMANCE tool, Lee's call), and a
//      card can opt in via data.filmMovable (authored outside film). Everything
//      else is frozen. (The camera bubble is a route-level overlay, not a
//      ReactFlow node — the lock can't and shouldn't touch it.)
//   2. FILM_LOCK_CSS — kills resize handles + card chrome under a .film-mode
//      root. Injected into the STUDIO FILM POPOUT, which previously got
//      FLAME_CSS + PV_CSS only — so staged cards showed their full hover chrome
//      on camera. Deliberately NOT appended to FILM_MODE_CSS: the canvas film
//      surface hover-reveals its handles by design (film-nobox-resize, July 21)
//      and that surface wasn't part of the incident.
//   3. FilmContext / useFilm — the shared "you are on camera" signal, moved out
//      of CeqPreviewer so exhibit cards can consume it. Chrome components
//      (ElementChrome / ElementResizer) return nothing in film.
import { createContext, createElement, useContext, type ReactNode } from "react";

/** True ⇒ this render is on a film surface. Provided by the film popout (and any
 *  future film surface); default false = authoring. */
export const FilmContext = createContext(false);
export const useFilm = () => useContext(FilmContext);
/** Plain-identifier provider for ROUTE files: TanStack Router's code-splitter
 *  drops imports referenced only via member-expression JSX (<FilmContext.Provider>
 *  → "FilmContext is not defined" at runtime, invisible to tsc). Components under
 *  src/components can keep using FilmContext.Provider directly. */
export function FilmProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return createElement(FilmContext.Provider, { value }, children);
}

/** The minimum shape the drag rule needs — keeps it testable without ReactFlow. */
export interface FilmLockNode {
  id: string;
  data?: unknown;
}

/** May this node be dragged ON CAMERA? Arrow heads yes (performance tool);
 *  explicit data.filmMovable yes (authored opt-in, per object); all else no. */
export function filmDragAllowed(node: FilmLockNode): boolean {
  if (node.id.startsWith("ah:")) return true;
  return !!(node.data as { filmMovable?: boolean } | undefined)?.filmMovable;
}

/** THE global typing guard (backtick sweep): ` (and every global key) must
 *  never fire while focus is in a text field — there it types a backtick like
 *  a normal key. One implementation; every keydown site uses it. */
export function isTypingTarget(doc?: Document): boolean {
  const d = doc ?? (typeof document !== "undefined" ? document : undefined);
  const el = d?.activeElement as HTMLElement | null | undefined;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** Chrome + resize handles must never render under a .film-mode root.
 *  - .react-flow__resize-control: EVERY NodeResizer handle/line, all cards.
 *  - .card-actions: the element hover chrome (clone · lock · ×).
 *  - .sa-chrome: the general "never on camera" hook (BaseCard chrome etc.).
 *  display:none (not visibility) so nothing is left focusable or clickable. */
export const FILM_LOCK_CSS = `
.film-mode .react-flow__resize-control { display: none !important; }
.film-mode .card-actions { display: none !important; }
.film-mode .sa-chrome { display: none !important; }
`;
