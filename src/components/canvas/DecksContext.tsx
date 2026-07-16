// NAMED DECKS context (item 4) — the route owns the scene's deck definitions and
// a transient "highlight" pulse; cards (BaseCard/JE) consume it to render their
// deck-name chip and to flash briefly when their deck is clicked in the panel.
// Kept in a context so a card rendered deep in React Flow shares one source.
import { createContext, useContext } from "react";
import { Layers } from "lucide-react";

import { NEON } from "./theme";
import type { DeckDef } from "./types";

export interface DecksCtx {
  decks: DeckDef[];
  /** The deck whose members should pulse right now (panel click), or null. */
  highlightId: string | null;
  /** Briefly highlight a deck's member cards on the canvas (auto-clears). */
  flashDeck: (deckId: string) => void;
  /** MIME type used to drag a card/memo node onto a deck row (item 4a). */
}

const noop = () => {};
export const DecksContext = createContext<DecksCtx>({ decks: [], highlightId: null, flashDeck: noop });
export const useDecks = () => useContext(DecksContext);

/** DnD payload key for dragging a canvas node onto a named-deck row. */
export const DECK_DND_MIME = "application/x-sa-deck-node";

/** The DeckDef a node currently belongs to (by data.deckId), or undefined. */
export function deckOfNode(decks: DeckDef[], deckId: string | undefined): DeckDef | undefined {
  return deckId ? decks.find((d) => d.id === deckId) : undefined;
}

/** DECK CHIP (item 4b) — shown in a card's hover chrome. Names the card's named
 *  deck when it has one (item b), and is the DRAG SOURCE (item a): drag it onto a
 *  deck row to (re)assign membership. A loose card shows a faint "deck" grip so it
 *  can be dragged into a deck too. Purely presentational — HTML5-draggable, nodrag
 *  so React Flow doesn't pan while dragging. */
export function DeckChip({ nodeId, deckId }: { nodeId: string; deckId?: string }) {
  const { decks } = useDecks();
  const deck = deckOfNode(decks, deckId);
  const memo = deck?.payloadType === "memos";
  const color = deck ? (memo ? NEON.pinkSoft : NEON.yellow) : NEON.muted;
  return (
    <span
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(DECK_DND_MIME, nodeId); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }}
      onPointerDown={(e) => e.stopPropagation()}
      title={deck ? `In deck “${deck.name}” — drag onto another deck to move` : "Loose card — drag onto a deck to add it"}
      className="sa-chrome nodrag inline-flex max-w-[92px] shrink-0 cursor-grab items-center gap-0.5 rounded px-1 text-[8.5px] font-bold uppercase tracking-wide active:cursor-grabbing"
      style={{ color, border: `1px solid ${color}66`, background: deck ? `${color}14` : "transparent", opacity: deck ? 1 : 0.6 }}
    >
      <Layers className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{deck ? deck.name : "deck"}</span>
    </span>
  );
}
