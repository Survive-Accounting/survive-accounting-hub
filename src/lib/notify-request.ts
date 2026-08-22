// NOTIFY REQUEST (08-21) — the ONE shape every "tell me when it's ready" click in the student
// player produces. Clicking a muted Cram / Review pill, a locked set on a future exam, the
// Poster's "Notify me" button or the Semester Pass bracket all build one of these and hand it
// to the ONE NotifyModal. The modal shows the copy and posts the context through the unified
// intake (submitNotify → runIntake, kind notify_exam). Client-safe: types + pure functions.

export type NotifyWant = "cram" | "review" | "exam" | "pass";

export interface NotifyReq {
  /** What the student tried to reach. Drives the copy and rides into the lead's note. */
  want: NotifyWant;
  /** Two lines of modal copy — "Cram Blast for The Accounting Cycle is coming soon." */
  headline: string;
  sub: string;
  /** Context, all optional — whatever the surface knew at the click. */
  examNum?: number | null;
  examLabel?: string | null;
  topicName?: string | null;
  setName?: string | null;
  /** Human-readable "what they asked for" — goes into campus_waitlist.topic. */
  topic: string;
}

const tidy = (s: string | null | undefined) => (s ?? "").replace(/^"|"$/g, "").trim();
const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** A muted CRAM pill: "Cram Blast for <topic> is coming soon." */
export const cramRequest = (a: { examNum: number; examLabel: string; topicName: string; setName: string }): NotifyReq => ({
  want: "cram",
  headline: `Cram Blast for ${a.topicName} is coming soon.`,
  sub: "Want me to tell you when it lands?",
  examNum: a.examNum, examLabel: a.examLabel, topicName: a.topicName, setName: tidy(a.setName),
  topic: `Cram Blast · ${a.topicName} · ${short(tidy(a.setName))}`,
});

/** A muted REVIEW pill: "Review for this set is coming soon." */
export const reviewRequest = (a: { examNum: number; examLabel: string; topicName: string; setName: string }): NotifyReq => ({
  want: "review",
  headline: "Review for this set is coming soon.",
  sub: "Want me to tell you when it's ready?",
  examNum: a.examNum, examLabel: a.examLabel, topicName: a.topicName, setName: tidy(a.setName),
  topic: `Review · ${a.topicName} · ${short(tidy(a.setName))}`,
});

/** A future exam (locked tab content, the Poster CTA, an unbuilt free topic). */
export const examRequest = (a: { examNum: number; examLabel: string; topicName?: string | null; setName?: string | null; launchWindow: string; free?: boolean }): NotifyReq => ({
  want: "exam",
  headline: a.free
    ? `${a.topicName ?? a.examLabel} is still being filmed.`
    : `${a.examLabel === "Final" ? "The Final" : a.examLabel} is still being filmed.`,
  sub: a.free ? "Get notified when this set is ready." : `Opens ${a.launchWindow}. Get notified when your course is ready.`,
  examNum: a.examNum, examLabel: a.examLabel, topicName: a.topicName ?? null, setName: tidy(a.setName) || null,
  topic: [a.examLabel, a.topicName, a.setName ? short(tidy(a.setName)) : null].filter(Boolean).join(" · "),
});

/** The Semester Pass bracket / line. */
export const passRequest = (a: { price: number; launchWindow: string }): NotifyReq => ({
  want: "pass",
  headline: `The Semester Pass — Exams 2, 3 + the Final for $${a.price}.`,
  sub: `Opens ${a.launchWindow}. Want a heads-up when it's ready?`,
  topic: "Semester Pass",
});

/** The note written on the lead: what they wanted, in one line an admin can scan. */
export const notifyNote = (r: NotifyReq): string =>
  [`wants:${r.want}`, r.examLabel ? `exam:${r.examLabel}` : null, r.topicName ? `topic:${r.topicName}` : null, r.setName ? `set:${r.setName}` : null].filter(Boolean).join(" · ");
