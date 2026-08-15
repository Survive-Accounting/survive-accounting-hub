// EXHIBIT BASE — the shared canvas-object layer. Every exhibit card (accounting
// cycle today; T-accounts, journal entries, trial balances, financial statements
// tomorrow) gets the banked A1/A3/A4 wins by DECLARATION, not implementation:
//
//   · FILM GEOMETRY LOCK — on camera nothing drags/resizes (film-lock.ts);
//     the only opt-out is the explicit per-object 🎬 filmMovable toggle.
//   · KEYBOARD ISOLATION — cards never capture Space/Enter/Tab; those belong
//     to the film controller. Cards may only listen to plain clicks.
//   · HIGHLIGHTS — click-to-glow with multi-select and adjacency arcs
//     (exhibit-highlights.ts); the card declares nodes + adjacency, the layer
//     owns toggle/multi/edge/` behavior and the one glow look.
//   · ` RESET — clearExhibitHighlights() reaches every mounted card.
//   · NO RUNTIME LAYOUT RE-APPLY — layout application is an author-time,
//     save-time action (applyLayoutToAll). Nothing in this layer, and nothing
//     in a card built on it, may reposition/resize from navigation, keypress,
//     re-render, or film mode.
//   · NO PERSISTENCE FROM FILM — film surfaces never write geometry; writes
//     happen in authoring through the command bus only.
//
// A NEW CARD DECLARES ONLY: content (its JSX), its highlightable nodes +
// adjacency, and its intrinsic min size. Zero behavior code. See
// docs/NEW-EXHIBIT-CHECKLIST.md before building one.
import { useCardActions } from "./BaseCard";
import { ConnectionDots } from "./ConnectionDots";
import { EXHIBIT_GLOW, useExhibitHighlights, type ExhibitHighlights } from "./exhibit-highlights";
import { useFilm } from "./film-lock";
import { ElementChrome, ElementResizer } from "./cards/elements";

/** What a card declares. Nothing else. */
export interface ExhibitDeclaration {
  /** Intrinsic minimum size — the resizer floor; the card's own render decides
   *  its natural size. Apply-layout NEVER touches an exhibit's size. */
  minWidth: number;
  minHeight: number;
  keepAspect?: boolean;
  /** Highlightable node ids, in display order. Omit for a non-highlight card. */
  nodes?: string[];
  /** Adjacency for edge glow: "ring" = each node connects to the next, wrapping
   *  (the cycle card's shape); or explicit pairs; or omit for no edge glow. */
  adjacency?: "ring" | [string, string][];
}

/** Everything a card's render needs back from the layer. */
export interface ExhibitApi {
  /** On a film surface? Cards use this ONLY to hide their own custom authoring
   *  affordances — never to implement behavior the layer already owns. */
  film: boolean;
  hl: ExhibitHighlights;
  /** Click handler for a declared node — glow toggle in film, no-op otherwise
   *  (authoring clicks stay the card's own, e.g. inline editing). */
  nodeClick: (nodeId: string) => ((e: React.MouseEvent) => void) | undefined;
  /** Visual state for a declared node. Pure styles — never size or position. */
  nodeStyle: (nodeId: string) => { lit: boolean; dimmed: boolean; border: string; boxShadow?: string; opacity?: number };
  /** True when the connector between two nodes should glow (both ends lit AND
   *  declared adjacent). */
  edgeLit: (a: string, b: string) => boolean;
}

/** Adjacency test from a declaration. Exported pure for tests. */
export function declaredAdjacent(decl: ExhibitDeclaration, a: string, b: string): boolean {
  if (!decl.nodes || decl.nodes.length === 0 || !decl.adjacency) return false;
  if (decl.adjacency === "ring") {
    const i = decl.nodes.indexOf(a);
    if (i < 0) return false;
    const next = decl.nodes[(i + 1) % decl.nodes.length];
    const prev = decl.nodes[(i - 1 + decl.nodes.length) % decl.nodes.length];
    return b === next || b === prev;
  }
  return decl.adjacency.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function useExhibit(decl: ExhibitDeclaration): ExhibitApi {
  const film = useFilm();
  const hl = useExhibitHighlights();
  return {
    film,
    hl,
    nodeClick: (nodeId) => (film ? (e) => { if (e.altKey) return; e.stopPropagation(); hl.toggle(nodeId); } : undefined),
    nodeStyle: (nodeId) => {
      const lit = hl.isLit(nodeId);
      const dimmed = hl.any && !lit;
      return {
        lit,
        dimmed,
        border: lit ? EXHIBIT_GLOW.border : "rgba(252,163,17,0.55)",
        boxShadow: lit ? EXHIBIT_GLOW.shadow : undefined,
        opacity: dimmed ? EXHIBIT_GLOW.dimOpacity : 1,
      };
    },
    edgeLit: (a, b) => declaredAdjacent(decl, a, b) && hl.edgeLit(a, b),
  };
}

/** The standard shell: chrome + resizer + connection dots, all already
 *  film-gated. A card renders <ExhibitShell> around its content and is DONE —
 *  no per-card film plumbing. */
export function ExhibitShell({ id, decl, posLock, selected, width, minHeight, children }: {
  id: string;
  decl: ExhibitDeclaration;
  posLock?: boolean;
  selected?: boolean;
  width: number;
  minHeight: number;
  children: React.ReactNode;
}) {
  const { toFront } = useCardActions(id);
  return (
    <div onPointerDownCapture={toFront} className="group/el animate-in fade-in relative duration-150" style={{ width, minHeight }}>
      <ConnectionDots />
      <ElementChrome id={id} posLock={posLock} selected={selected} />
      <ElementResizer id={id} selected={selected} minWidth={decl.minWidth} minHeight={decl.minHeight} keepAspect={decl.keepAspect} />
      {children}
    </div>
  );
}
