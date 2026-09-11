// THE FOUR VARIANTS' BADGES. A cover advertising a cheat code wears the same label and the same
// on-navy accent the cheat-code detour slide wears inside the video (CalloutCard), so the promise
// on the grid and the moment in the short match. STANDARD wears none.
import { CALLOUT_KINDS, detourAccent } from "@/components/canvas/cards/CalloutCard";
import type { ThumbVariant } from "@/lib/brand-kit/thumbnail";

const KIND = { CHEAT_CODE: "cheat-code", MEMORIZE: "memorize-this", DEEP_QUESTION: "deeper-idea" } as const;

export function variantBadge(v: ThumbVariant): { label: string; accent: string } | null {
  if (v === "STANDARD") return null;
  const k = KIND[v];
  return { label: CALLOUT_KINDS[k].label, accent: detourAccent(k) };
}

export const VARIANT_NAME: Record<ThumbVariant, string> = {
  STANDARD: "Standard",
  CHEAT_CODE: "Cheat code",
  MEMORIZE: "Memorize",
  DEEP_QUESTION: "Deep question",
};
