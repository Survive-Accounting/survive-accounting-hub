// THE SET CARD NODE (2026-09-07) — a map can carry the question it explains. The SAME SetCard
// the ceq frame draws (frame-view.tsx), by ceq id from the set the film hands down; the card's
// scale comes from the node's width (the card is CARD_W + its 22·s padding each side).
import type { BoothCeq, BoothSetInfo } from "@/lib/talkthrough.functions";
import { CARD_W } from "@/components/canvas/ceq-geom";

import { SetCard } from "../../SetCard";

/** SetCard's outer width at scale s: the card plus the navy padding. */
export const setCardScaleFor = (w: number): number => w / (CARD_W + 44);

export function CeqNode({ id, w, ceqId, set, live }: { id: string; w: number; ceqId: string; set: BoothSetInfo | null; live: boolean }) {
  const scale = setCardScaleFor(w);
  const ceq: BoothCeq | undefined = set?.ceqs.find((c) => c.id === ceqId);
  if (!ceq) return <SetCard id={`${id}-missing`} stem="This card is no longer in the set." scale={scale} live={live} />;
  if (ceq.noteOnly) return <SetCard id={ceq.id} stem={ceq.stem} scale={scale} callout={{ kind: "found-on-exam", detour: true, showTopic: false }} live={live} />;
  return <SetCard id={ceq.id} stem={ceq.stem} choices={ceq.choices} scale={scale} live={live} />;
}
