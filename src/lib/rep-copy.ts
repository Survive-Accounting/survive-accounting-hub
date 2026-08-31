// CAMPUS REP — the words a rep candidate reads, from first contact to onboarded, in ONE place.
//
// WHY A MODULE AND NOT INLINE STRINGS: the same two numbers appear on the application page, the
// dashboard empty state and the bonus explainer. Written three times they drift, and the drift is
// expensive here — these are earnings claims made to a 20-year-old.
//
// ── THE TWO NUMBERS, AND WHICH ONE GOES WHERE ────────────────────────────────────────────────
// They describe different things and the copy needs both, in this order:
//
//   THE CEILING — a mature campus produces ~$20k/yr; Ole Miss has already produced ~$25k. Not a
//                 projection: something that happened, once chapters renew and members cycle in.
//   THE RAMP    — a brand-new campus in its first semester is smaller. Chapters have to be found,
//                 contacted, convinced and budgeted for. Hundreds, not thousands.
//
// Ceiling first, ramp second. Honest, and more compelling than either number alone.
//
// TONE: talking to a 20-year-old, not a contractor. Short sentences. Never "ambassador", never
// "brand partner", never "leverage". "Growth Partner" is the INTERNAL term — to a student this is
// always a campus rep.

/** A campus that is up and running, per year. The ceiling. */
export const CAMPUS_MATURE_ANNUAL_USD = 20_000;
/** What Ole Miss has already produced. Evidence, not a forecast. */
export const OLE_MISS_TO_DATE_USD = 25_000;
/** A first-semester rep at a brand-new campus, signing bonus included. The ramp. */
export const FIRST_SEMESTER_RANGE = "$300–800";
/** Rep commission on everything sold through their link. */
export const REP_COMMISSION_PCT = 10;

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** THE CEILING sentence. Leads, because the ceiling is what makes this different from a stipend. */
export const CEILING_LINE =
  `A campus that's up and running produces around ${usd(CAMPUS_MATURE_ANNUAL_USD)} a year, and you earn ${REP_COMMISSION_PCT}% of it. Ole Miss is already there.`;

/** THE RAMP sentence. Follows the ceiling, always — never on its own, never omitted.
 *  NOTE: "in October" is deliberately concrete for this fall's recruiting. It is the one dated
 *  string in this file; change it here and every surface follows. */
export const RAMP_LINE =
  `Your campus won't be there in October. Your first semester is about opening it — figure a few hundred dollars while you're building it, and a real number once it's running.`;

/** The signing-bonus gate, stated plainly. Never fine print, never softened. */
export const BONUS_GATE_LINE =
  `Your first bonus unlocks at your first chapter sale. If no chapter signs up, the bonus isn't paid.`;

/** The résumé line a rep earns. Deliberately carries no number — it stands on its own. */
export const RESUME_LINE = "Launched a new campus for a national tutoring platform.";

// ── THE DASHBOARD EMPTY STATE ────────────────────────────────────────────────────────────────
// What a newly approved rep sees before doing anything — the highest-leverage copy in the set.
// Three steps, then the ceiling, then the gate. No dismiss button: it disappears when they start.

export type EmptyStateCopy = {
  eyebrow: string;
  headline: string;
  steps: string[];
  ceiling: string;
  job: string;
  gate: string;
  cta: string;
};

export function emptyStateCopy(i: { campusName: string | null; chapterCount: number }): EmptyStateCopy {
  const campus = (i.campusName ?? "your campus").toUpperCase();
  const n = i.chapterCount;
  return {
    eyebrow: `Your campus · ${campus}`,
    headline: n > 0
      ? `You've got ${n} chapter${n === 1 ? "" : "s"}. Here's what happens next.`
      : `Your chapters are being set up. Here's what happens next.`,
    steps: [
      "We give you each chapter's Instagram and a message to send",
      "You send about 10 a day — from your account, to houses you know",
      `When a chapter signs up, you earn ${REP_COMMISSION_PCT}% of everything they buy`,
    ],
    ceiling: `A campus like this is worth about ${usd(CAMPUS_MATURE_ANNUAL_USD)} a year once it's running.`,
    job: "Your job is getting it started.",
    gate: "Your first bonus unlocks at your first chapter sale.",
    cta: n > 0 ? "See your chapters →" : "See your campus →",
  };
}

// ── THE REJECTION NOTE ───────────────────────────────────────────────────────────────────────
// Most applicants won't fit. Short, warm, door left open — a declined applicant is still a student
// who might use the product and tell their chapter, so this never reads as a rejection letter.

export function declineCopy(i: { firstName: string; campusName: string | null }): { subject: string; blocks: string[] } {
  const campus = i.campusName ?? "your campus";
  return {
    subject: "About the campus rep spot",
    blocks: [
      `Hey ${i.firstName},`,
      `Thanks for putting your name in for ${campus}. I'm not able to bring you on right now — I'm keeping the program small on each campus while I figure out what works, so it's a numbers thing more than anything about you.`,
      `If that changes I'll come back to you first. And either way, Exam 1 is free — use it, and send it to your chapter if it helps them.`,
      `Thanks for wanting to be part of it.`,
    ],
  };
}

/** The four questions the first calls have to answer — they are the copy brief for everything
 *  above. Shown to Lee in the review queue's call-notes field so they get captured while the call
 *  is happening, not reconstructed afterwards. */
export const CALL_CAPTURE_PROMPTS = [
  "What did they ask about first?",
  "What made them hesitate?",
  "Which motivation did they volunteer unprompted?",
  "What did they think the job was before you explained it?",
];
