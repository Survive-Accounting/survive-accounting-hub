// SKELETON GRID (P4) — the ghost preview for a named deck's undealt items.
// A deck with a slot GRID shows, for every UNDEALT (tucked) member, a ghosted
// kind-shaped outline locked to that member's slot: students see "there's more
// coming here"; Lee gets a filming teleprompter. Dealing fills the slot with the
// real card; RESET re-tucks → the skeleton returns. Rendered in flow coordinates
// via ViewportPortal (pans/zooms with the canvas) — derived from the live nodes,
// so nothing extra persists. Deal-to-locked-position + skeleton-preview are one
// feature (the deck route places a dealt grid member AT its slot).
import { ViewportPortal, useNodes } from "@xyflow/react";

import { deckMembersOf } from "./deck-defs";
import { isTucked } from "./deck-logic";
import { NEON } from "./theme";
import type { CardBase, DeckDef } from "./types";

/** Skeleton footprint per kind — roughly the real card's silhouette. */
const KIND_SKELETON: Record<string, { w: number; h: number; label: string }> = {
  je: { w: 220, h: 130, label: "Journal Entry" },
  ceq: { w: 240, h: 150, label: "Question" },
  taccount: { w: 210, h: 150, label: "T-Account" },
  memorize: { w: 220, h: 120, label: "Memorize" },
  computation: { w: 230, h: 150, label: "Computation" },
  schedule: { w: 260, h: 150, label: "Schedule" },
  note: { w: 190, h: 120, label: "Note" },
  list: { w: 200, h: 150, label: "List" },
  memo: { w: 190, h: 90, label: "Memo" },
  formula: { w: 260, h: 90, label: "Formula" },
  legend: { w: 200, h: 150, label: "Legend" },
  image: { w: 220, h: 150, label: "Image" },
  video: { w: 240, h: 140, label: "Video" },
};
const DEFAULT_SKELETON = { w: 220, h: 140, label: "Card" };

export function SkeletonLayer({ decks }: { decks: DeckDef[] }) {
  const nodes = useNodes();
  const gridDecks = decks.filter((d) => d.showSkeletons !== false && (d.slots?.length ?? 0) > 0);
  if (gridDecks.length === 0) return null;

  type SkelNode = { id: string; type?: string; data?: { deckId?: string; stageOrder?: number; slotIndex?: number; tucked?: boolean; minimized?: boolean; staged?: boolean } };
  return (
    <ViewportPortal>
      {gridDecks.flatMap((deck) => {
        const members = deckMembersOf(nodes as unknown as SkelNode[], deck.id);
        return members.flatMap((n, i) => {
          const idx = (n.data?.slotIndex ?? i) as number;
          const slot = deck.slots?.[idx];
          if (!slot) return [];
          if (!isTucked((n.data ?? {}) as unknown as CardBase)) return []; // dealt → real card fills the slot
          const shape = KIND_SKELETON[n.type ?? ""] ?? DEFAULT_SKELETON;
          return [
            <div
              key={`skel-${deck.id}-${n.id}`}
              className="pointer-events-none absolute"
              style={{
                left: slot.x,
                top: slot.y,
                width: shape.w,
                height: shape.h,
                borderRadius: 14,
                border: `1.5px dashed ${NEON.borderSoft}`,
                background: "repeating-linear-gradient(135deg, rgba(147,160,180,0.05) 0 8px, rgba(147,160,180,0.02) 8px 16px)",
                display: "grid",
                placeItems: "center",
                color: NEON.muted,
                opacity: 0.5,
              }}
            >
              <span className="text-[10.5px] font-bold uppercase tracking-[0.18em]" style={{ opacity: 0.8 }}>{shape.label}</span>
            </div>,
          ];
        });
      })}
    </ViewportPortal>
  );
}
