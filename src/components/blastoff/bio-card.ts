// THE TUTOR CARD — the bio slide, in the detour format (Lee, 2026-09-03: "do the
// bio slide in the same format as the memorize this, deeper idea, cheat code…
// but maybe a bit bigger. To distinguish it"). One place for the words, read by
// the review stage (FrameView) and by send-to-film (the synced note frame), so
// the two can never disagree.
//
// THE CLAIMS ARE LOAD-BEARING (carried over from SurviveBio): "1,000+ students"
// and "since 2015" are across intro accounting overall — never a thousand in any
// one course. No grade promise, no coverage guarantee.
import type { CalloutSettings } from "@/components/canvas/types";

export const BIO_CARD = {
  kind: "tutor" as const,
  title: "Lee Ingram",
  lines: ["BAccy · MAccy — Ole Miss", "Tutor since 2015", "1,000+ students"],
  footer: "surviveaccounting.com",
  /** A bit bigger than a detour card — the one card in the family that is a person. */
  scale: 1.15,
  /** The synced frame's width for the same reason (a detour card is CARD_W = 560). */
  cardW: 640,
};

/** The callout settings the bio note frame carries — dark, labelled, footer. */
export function bioCallout(): CalloutSettings {
  return { kind: BIO_CARD.kind, showTopic: false, detour: true, extraStems: [...BIO_CARD.lines], footer: BIO_CARD.footer };
}
