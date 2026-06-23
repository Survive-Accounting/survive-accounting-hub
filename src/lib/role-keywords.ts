// Role keyword catalog used by the Faculty Triage Step #3 panel.
//
// Each entry produces a one-click chip on the panel: clicking the chip
// applies (or removes) the chip's label as a tag on every faculty row
// whose `title` matches the regex.
//
// `intro` = true means this role is a likely teacher of Intro 1 / Intro 2
// (Principles of Financial / Managerial Accounting). The "Intro-likely"
// quick-action button tags every row whose title matches any `intro: true`
// pattern AND does NOT match `EXCLUDE_INTRO_RE`.

export type RoleKeyword = {
  /** Tag label applied when the chip is clicked. */
  label: string;
  /** Regex that decides whether a title matches this role. */
  re: RegExp;
  /** Likely to teach Intro 1 / Intro 2. */
  intro: boolean;
};

/** Order matters only for chip display; matching itself is independent. */
export const ROLE_KEYWORDS: RoleKeyword[] = [
  // --- High-yield intro teachers ---
  { label: "Lecturer",             re: /\blecturer\b/i,                                                       intro: true  },
  { label: "Senior Lecturer",      re: /\bsenior\s+lecturer\b/i,                                              intro: true  },
  { label: "Clinical Lecturer",    re: /\bclinical\s+lecturer\b/i,                                            intro: true  },
  { label: "Adjunct",              re: /\badjunct\b/i,                                                        intro: true  },
  { label: "Instructor",           re: /\binstructor\b/i,                                                     intro: true  },
  { label: "Senior Instructor",    re: /\bsenior\s+instructor\b/i,                                            intro: true  },
  { label: "Clinical Instructor",  re: /\bclinical\s+instructor\b/i,                                          intro: true  },
  { label: "Teaching Professor",   re: /\b(teaching\s+professor|professor\s+of\s+teaching|assistant\s+teaching\s+professor|associate\s+teaching\s+professor)\b/i, intro: true },
  { label: "Professor of Practice",re: /\bprofessor\s+of\s+practice\b|\bpractitioner\s+in\s+residence\b/i,    intro: true  },
  { label: "Visiting",             re: /\bvisiting\b/i,                                                       intro: true  },
  { label: "Assistant Professor",  re: /\bassistant\s+professor\b/i,                                          intro: true  },
  { label: "Clinical Assistant Professor", re: /\bclinical\s+assistant\s+professor\b/i,                       intro: true  },

  // --- Secondary intro teachers ---
  { label: "Associate Professor",  re: /\bassociate\s+professor\b/i,                                          intro: true  },
  { label: "Clinical Associate Professor", re: /\bclinical\s+associate\s+professor\b/i,                       intro: true  },

  // --- TA / support roles (sometimes coordinate intro sections) ---
  { label: "Teaching Assistant",   re: /\bteaching\s+assistant\b/i,                                           intro: true  },
  { label: "Graduate Assistant",   re: /\bgraduate\s+assistant\b/i,                                           intro: true  },
  { label: "Grader",               re: /\bgrader\b/i,                                                         intro: true  },

  // --- Recognized but unlikely to teach intro (excluded from Intro-likely) ---
  { label: "Professor",            re: /\b(full\s+)?professor\b/i,                                            intro: false },
  { label: "Emeritus",             re: /\bemerit(?:us|a)\b/i,                                                 intro: false },
  { label: "Chair",                re: /\bchair(?:person)?\b/i,                                               intro: false },
  { label: "Dean",                 re: /\bdean\b/i,                                                           intro: false },
  { label: "Director",             re: /\bdirector\b/i,                                                       intro: false },
];

/** A title that matches this is excluded from "Intro-likely" even if it also
 *  matches an intro pattern. Department leadership / research roles are
 *  rarely scheduled on Principles sections. */
export const EXCLUDE_INTRO_RE =
  /\b(emerit(?:us|a)|dean|associate\s+dean|department\s+chair|chairperson|provost|director\s+of\s+(?:research|phd|ph\.?d\.?|center|graduate(?:\s+studies)?)|endowed|distinguished|named\s+chair)\b/i;

/** Return every role label whose regex matches `title`. */
export function matchRoles(title: string | null | undefined): string[] {
  const t = (title ?? "").trim();
  if (!t) return [];
  const out: string[] = [];
  for (const { label, re } of ROLE_KEYWORDS) if (re.test(t)) out.push(label);
  return out;
}

/** Does this title qualify as an "Intro 1 / Intro 2 likely teacher"? */
export function isIntroLikely(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  if (!t) return false;
  if (EXCLUDE_INTRO_RE.test(t)) return false;
  return ROLE_KEYWORDS.some((k) => k.intro && k.re.test(t));
}

/** Broad faculty matcher used to AUTO-SELECT rows for import. Unlike
 *  isIntroLikely, this includes every teaching/professorial title — full,
 *  tenured, chaired, and emeritus professors; lecturers; instructors;
 *  adjuncts; clinical / visiting / teaching-track faculty; professors of
 *  practice; and TAs. It intentionally excludes pure-administrative roles
 *  (dean, director, advisor) and non-teaching staff so those aren't
 *  auto-checked. Course-level enrichment (who teaches Intro 1/2, Intermediate
 *  1/2) happens later via isIntroLikely / the role chips, independent of this. */
const FACULTY_TITLE_RE =
  /\b(professor|lecturer|instructor|adjunct|faculty|teaching|clinical|visiting|emerit(?:us|a)|practitioner|chair(?:person|ed)?|teaching\s+assistant|graduate\s+assistant)\b/i;

export function isFaculty(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  if (!t) return false;
  return FACULTY_TITLE_RE.test(t);
}

/** Default tag applied by the "Tag all Intro-likely" quick-action button. */
export const INTRO_TARGET_TAG = "Intro Target";

/** Default keep-tag auto-applied to every faculty row so it is checked for
 *  import. Tagging IS the keep signal, so this is what auto-selects faculty. */
export const FACULTY_TAG = "Faculty";
