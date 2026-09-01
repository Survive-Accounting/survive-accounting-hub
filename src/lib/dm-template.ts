// THE DM — the message "Copy DM" puts on the clipboard, with the tracked link baked in.
//
// Client-safe (no server imports). The council-type merge picks the noun the officer thinks in:
// IFC → fraternities, Panhellenic → sororities, NPHC/MGC/FSL → chapters, a club → members. The
// link is /s/<slug>?ref=<contactId>; the /s/ page records the click against that contact and,
// when the officer forwards it, the ?ref= rides along so every chapter visit attributes back.

export function councilNoun(councilKey: string): string {
  const k = (councilKey ?? "").toLowerCase();
  if (k === "ifc") return "fraternities";
  if (k === "panhellenic") return "sororities";
  if (k === "nphc" || k === "mgc" || k === "fsl") return "chapters";
  return "members";
}

export const dmLink = (slug: string, contactId: string) => `surviveaccounting.com/s/${slug}?ref=${contactId}`;

/** Lee's council DM. `courseCode` null → "intro accounting" with no parenthetical. */
export function buildDmMessage(o: { councilKey: string; courseCode: string | null; slug: string; contactId: string }): string {
  const course = o.courseCode || "intro accounting";
  const courseParen = o.courseCode ? ` (${o.courseCode})` : "";
  const noun = councilNoun(o.councilKey);
  return [
    `Hey! Intro accounting${courseParen} is one of the biggest drags on GPAs across your ${noun}, and it's a fixable one.`,
    ``,
    `I'm an Ole Miss accounting grad and I've tutored ${course} since 2015. I make cram videos and practice exams built around what's actually on the exam — everything for Exam 1 is free.`,
    ``,
    `Could you pass this to your chapter scholarship chairs so they can share it with their members?`,
    ``,
    dmLink(o.slug, o.contactId),
    ``,
    `Happy to answer any questions. Thanks!`,
    ``,
    `— Lee`,
  ].join("\n");
}
