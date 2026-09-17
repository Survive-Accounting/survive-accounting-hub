// THE STUDY PASS — $150, one course, one semester, everything in it.
//
// WHY ONE PASS AND NOT A CART. The archive is ~1,300 videos and the solutions bank is ~2,500
// worked problems. Priced per item that is a student doing arithmetic instead of studying, and
// 1,300 Stripe prices for us. One price per course means the buying decision is made once and
// never again for the rest of the term.
//
// WHAT IT UNLOCKS. Every paid set in the student's COURSE — cram videos, the review videos, the
// homework-help archive and the textbook solutions. Scope is the course, not the exam, because a
// student who paid in September should not hit a second wall in November.
//
// WHEN IT ENDS. With the term, per terms.ts. NO ROLLOVER — same rule seats already follow, and
// the disclosure below has to appear anywhere money is asked for.
//
// Copy and price live HERE so the checkout page, the paywall, the receipt email and the admin
// console can never quote different numbers.
import { termFor, type Term } from "./terms";

export const STUDY_PASS_PRICE_CENTS = 15_000;
export const STUDY_PASS_PRICE_USD = STUDY_PASS_PRICE_CENTS / 100;

/** The term a pass bought right now belongs to, and the day it dies. */
export const studyPassTerm = (now = new Date()): Term => termFor(now);

/** "ACCY 201 Study Pass" when we know the campus's course code, plain "Study Pass" when we don't —
 *  never the tell-tale "Course Study Pass". */
export const studyPassName = (courseCode: string | null | undefined): string => {
  const c = (courseCode ?? "").trim();
  return c ? `${c} Study Pass` : "Study Pass";
};

/** What a student gets. Kept short — four lines a person actually reads. */
export function studyPassIncludes(courseCode: string | null | undefined): string[] {
  const c = (courseCode ?? "").trim() || "your course";
  return [
    `Every cram video for ${c} — all exams, not just Exam 1`,
    "The full review-video archive, organized by chapter",
    // Lee's own videos walking problems — never the textbook's answer key (Lee, 09-17: the
    // solutions bank stays internal).
    "Homework help: Lee working through the quick study, exercises and problems",
    "Practice questions and the bonus round on every topic",
  ];
}

/** THE DISCLOSURE. Nothing may ask for money without stating the end date and the no-rollover
 *  rule first — the same promise the chapter presale makes. */
export const studyPassDisclosure = (t: Term = studyPassTerm()): string =>
  `Access runs through ${t.expiresLabel} (end of ${t.label}) and does not roll over to the next term.`;
