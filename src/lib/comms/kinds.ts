// INTAKE KINDS — the closed list every web capture maps to (spec §1). Client-safe.
export const INTAKE_KINDS = [
  "notify_exam", "save_progress", "syllabus", "greek_member", "greek_claim",
  "rep", "school_request", "tutoring_request", "outreach_page", "referral",
  "question", // "Ask me about this one" from cram mode — reference + shorthand + message
  "practice_pack", // lead magnet: emailed printable practice pack (free content only)
  // A MEMBER TICKING "I'd want my chapter to sponsor this for me" on a /go page. Its OWN kind,
  // and therefore its own row, deliberately: it must never be conflated with greek_member. One
  // says a person signed up, the other says a person asked their chapter to pay — and the second
  // number is what gets shown to a scholarship chair. A boolean on the member row would make
  // "14 members want this" indistinguishable from "14 members signed up".
  "greek_sponsor_interest",
  // A STUDENT ASKING FOR A "TAKE IT TO AN A" VIDEO that is not made yet (/v3/learn, 2026-09-10).
  // Its note carries the deck id, the video's name and scope=one|all; topic is the exam topic.
  // Priority: a request for a specific video is the clearest signal of what to film next.
  "offshoot_request",
] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];

/** Founder alert routing (spec §5): priority kinds page Lee immediately; the rest roll into
 *  the Sunday digest's Demand section. Purchases will join priority when checkout exists. */
export const PRIORITY_KINDS: readonly IntakeKind[] = ["syllabus", "greek_claim", "rep", "question", "offshoot_request"];

export const KIND_LABEL: Record<IntakeKind, string> = {
  notify_exam: "Notify me (exam)",
  save_progress: "Save progress",
  syllabus: "Syllabus",
  greek_member: "Greek member",
  greek_claim: "Chapter claim",
  rep: "Campus rep",
  school_request: "School request",
  practice_pack: "Practice pack (PDF)",
  greek_sponsor_interest: "Wants chapter to sponsor",
  tutoring_request: "Tutoring request",
  outreach_page: "Campus page signup",
  referral: "Referral",
  question: "Question about a problem",
  offshoot_request: "Wants a Take-it-to-an-A video",
};
