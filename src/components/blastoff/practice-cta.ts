// THE PRACTICE SLIDE — its words, for the filmed slide and the site's end screen. Pure.
//
// Lee, 2026-09-14:
//   "For practice first, I want a button there to try them first. Surviveaccounting.com underneath the
//   button, so if it's on socials they know where. In site, I want an actual button… [Try Practice
//   Questions] surviveaccounting.com. And I'll say, keep watching if you want."
//   "[LOCK IT IN] Practice Questions. Finish the questions to unlock the full recap. [Start Practice →]
//   [Skip practice] surviveaccounting.com. Make Start Practice prominent and Skip practice a smaller text
//   link. For social exports, replace the buttons with 'Practice at surviveaccounting.com' so viewers
//   aren't trying to tap buttons that don't work."
//
// ONE FILE, TWO SURFACES. The video is filmed once and posted everywhere, so the FILMED slide is the
// social-safe one: no button shapes, "Practice at surviveaccounting.com". The SITE adds the real buttons:
// the player shows the end screen (components/learn/PracticeEndCard.tsx) when a video that ends on this
// slide finishes — the publication carries `endCta` for that.

export type PracticeVariant = "try" | "unlock";

export const PRACTICE_COPY: Record<PracticeVariant, { chip: string; heading: string; line: string; primary: string; secondary: string }> = {
  try: { chip: "Practice first", heading: "Try the practice questions", line: "Then watch the videos, and practice again.", primary: "Try Practice Questions", secondary: "Keep watching" },
  unlock: { chip: "Lock it in", heading: "Practice Questions", line: "Finish the questions to unlock the full recap.", primary: "Start Practice →", secondary: "Skip practice" },
};

export const PRACTICE_DOMAIN = "surviveaccounting.com";
/** What the filmed slide says where the site shows buttons. */
export const PRACTICE_FILMED_LINE = `Practice at ${PRACTICE_DOMAIN}`;

export function practiceVariantOf(frame: { practice?: unknown }): PracticeVariant {
  return frame.practice === "unlock" ? "unlock" : "try";
}

/** The slide's words: his, else the variant's defaults. chipText = the chip, text = the heading, the
 *  first bullet = the line under it. */
export function practiceWords(frame: { practice?: unknown; chipText?: string; text?: string; bullets?: string[] }): { variant: PracticeVariant; chip: string; heading: string; line: string } {
  const variant = practiceVariantOf(frame);
  const d = PRACTICE_COPY[variant];
  const line = (frame.bullets ?? []).map((b) => b.trim()).find(Boolean);
  return { variant, chip: frame.chipText?.trim() || d.chip, heading: frame.text?.trim() || d.heading, line: line || d.line };
}

/** The end button a video gets on the site, from the slides it films: the last practice slide in it. */
export function endCtaOf(frames: readonly { kind: string; skipped?: boolean; practice?: unknown }[]): PracticeVariant | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (f.skipped) continue;
    if (f.kind === "practice") return practiceVariantOf(f);
  }
  return null;
}
