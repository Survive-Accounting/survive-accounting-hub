// INTAKE KINDS — the closed list every web capture maps to (spec §1). Client-safe.
export const INTAKE_KINDS = [
  "notify_exam", "save_progress", "syllabus", "greek_member", "greek_claim",
  "rep", "school_request", "tutoring_request", "outreach_page", "referral",
  "question", // "Ask me about this one" from cram mode — reference + shorthand + message
] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];

/** Founder alert routing (spec §5): priority kinds page Lee immediately; the rest roll into
 *  the Sunday digest's Demand section. Purchases will join priority when checkout exists. */
export const PRIORITY_KINDS: readonly IntakeKind[] = ["syllabus", "greek_claim", "rep", "question"];

export const KIND_LABEL: Record<IntakeKind, string> = {
  notify_exam: "Notify me (exam)",
  save_progress: "Save progress",
  syllabus: "Syllabus",
  greek_member: "Greek member",
  greek_claim: "Chapter claim",
  rep: "Campus rep",
  school_request: "School request",
  tutoring_request: "Tutoring request",
  outreach_page: "Campus page signup",
  referral: "Referral",
  question: "Question about a problem",
};
