// OUTREACH V2 — the pure half of /admin/dm-v2 (2026-09-14).
//
// Lee: "instead of scheduling individual DMs, I really just want to prioritize campuses … for each
// campus the priority to hit is the IFC president, Panhellenic president … the org Instagram, the
// president's personal Instagram or the scholarship chair's personal Instagram … whether we have the
// contact or not we want the link ready to copy and the DM ready to copy … a toggle to show chapters
// for each of those councils, in order of their size … mark sent, a checkbox for each of the three."
//
// So: an ordered campus list (rearrangeable, saved), three councils per campus, three slots per
// council and per chapter, each slot with a handle, the DM, the link and a sent tick.

export const V2_COUNCILS = [
  { key: "ifc", label: "IFC", name: "Interfraternity Council" },
  { key: "panhellenic", label: "Panhellenic", name: "Panhellenic Council" },
  { key: "nphc", label: "NPHC", name: "National Pan-Hellenic Council" },
] as const;
export type V2CouncilKey = (typeof V2_COUNCILS)[number]["key"];

export const V2_SLOTS = [
  { key: "org", label: "Org Instagram" },
  { key: "pres", label: "President" },
  { key: "chair", label: "Scholarship chair" },
] as const;
export type V2SlotKey = (typeof V2_SLOTS)[number]["key"];

/** Lee's order, as he said it (2026-09-14): Ole Miss, LSU, Tennessee, Mississippi State, Alabama,
 *  Arkansas, Auburn, Georgia, Kentucky, the Florida cluster, Missouri, Oklahoma — then the rest of
 *  the SEC and the Power Four. Rearrangeable on the page; this is only the starting order. */
export const V2_PRIORITY: readonly { slug: string; label: string; cluster?: string }[] = [
  { slug: "university-of-mississippi", label: "Ole Miss" },
  { slug: "louisiana-state-university", label: "LSU" },
  { slug: "university-of-tennessee-knoxville", label: "Tennessee" },
  { slug: "mississippi-state-university", label: "Mississippi State" },
  { slug: "university-of-alabama", label: "Alabama" },
  { slug: "university-of-arkansas", label: "Arkansas" },
  { slug: "auburn-university", label: "Auburn" },
  { slug: "university-of-georgia", label: "Georgia" },
  { slug: "university-of-kentucky", label: "Kentucky" },
  { slug: "university-of-florida", label: "Florida", cluster: "Florida cluster" },
  { slug: "florida-state-university", label: "Florida State", cluster: "Florida cluster" },
  { slug: "university-of-central-florida", label: "UCF", cluster: "Florida cluster" },
  { slug: "university-of-south-florida", label: "South Florida", cluster: "Florida cluster" },
  { slug: "florida-international-university", label: "FIU", cluster: "Florida cluster" },
  { slug: "florida-atlantic-university", label: "Florida Atlantic", cluster: "Florida cluster" },
  { slug: "florida-gulf-coast-university", label: "FGCU", cluster: "Florida cluster" },
  { slug: "university-of-missouri", label: "Mizzou" },
  { slug: "university-of-oklahoma", label: "Oklahoma" },
  // The rest of the SEC.
  { slug: "texas-aandm-university", label: "Texas A&M" },
  { slug: "university-of-south-carolina", label: "South Carolina" },
  { slug: "university-of-texas-at-austin", label: "Texas" },
  { slug: "vanderbilt-university", label: "Vanderbilt" },
  // The rest of the Power Four, Greek-heavy southern and midwestern campuses first.
  { slug: "clemson-university", label: "Clemson" },
  { slug: "university-of-miami", label: "Miami" },
  { slug: "baylor-university", label: "Baylor" },
  { slug: "texas-christian-university", label: "TCU" },
  { slug: "texas-tech-university", label: "Texas Tech" },
  { slug: "oklahoma-state-university", label: "Oklahoma State" },
  { slug: "southern-methodist-university", label: "SMU" },
  { slug: "georgia-institute-of-technology", label: "Georgia Tech" },
  { slug: "university-of-north-carolina-at-chapel-hill", label: "North Carolina" },
  { slug: "north-carolina-state-university", label: "NC State" },
  { slug: "university-of-virginia", label: "Virginia" },
  { slug: "virginia-tech", label: "Virginia Tech" },
  { slug: "university-of-louisville", label: "Louisville" },
  { slug: "university-of-kansas", label: "Kansas" },
  { slug: "kansas-state-university", label: "Kansas State" },
  { slug: "iowa-state-university", label: "Iowa State" },
  { slug: "university-of-iowa", label: "Iowa" },
  { slug: "university-of-nebraska-lincoln", label: "Nebraska" },
  { slug: "university-of-illinois-urbana-champaign", label: "Illinois" },
  { slug: "university-of-wisconsin-madison", label: "Wisconsin" },
  { slug: "ohio-state-university", label: "Ohio State" },
  { slug: "pennsylvania-state-university", label: "Penn State" },
  { slug: "purdue-university", label: "Purdue" },
  { slug: "michigan-state-university", label: "Michigan State" },
  { slug: "university-of-minnesota", label: "Minnesota" },
  { slug: "university-of-maryland", label: "Maryland" },
  { slug: "rutgers-university", label: "Rutgers" },
  { slug: "northwestern-university", label: "Northwestern" },
  { slug: "university-of-cincinnati", label: "Cincinnati" },
  { slug: "west-virginia-university", label: "West Virginia" },
  { slug: "university-of-houston", label: "Houston" },
  { slug: "university-of-arizona", label: "Arizona" },
  { slug: "arizona-state-university", label: "Arizona State" },
  { slug: "university-of-colorado-boulder", label: "Colorado" },
  { slug: "university-of-utah", label: "Utah" },
  { slug: "university-of-oregon", label: "Oregon" },
  { slug: "university-of-washington", label: "Washington" },
  { slug: "university-of-southern-california", label: "USC" },
  { slug: "university-of-pittsburgh", label: "Pittsburgh" },
  { slug: "syracuse-university", label: "Syracuse" },
  { slug: "indiana-university-bloomington", label: "Indiana" },
  { slug: "university-of-michigan", label: "Michigan" },
  { slug: "university-of-california-los-angeles-r", label: "UCLA" },
  { slug: "university-of-california-berkeley", label: "Cal" },
  { slug: "stanford-university", label: "Stanford" },
  { slug: "duke-university", label: "Duke" },
  { slug: "wake-forest-university", label: "Wake Forest" },
  // Not listed: Boston College, Notre Dame and BYU have no recognized fraternity/sorority life.
];

/** A saved order, with any priority campus it doesn't mention appended in the default order. */
export function mergeOrder(saved: readonly string[] | null | undefined): string[] {
  const known = new Set(V2_PRIORITY.map((c) => c.slug));
  const out = (saved ?? []).filter((s, i, a) => known.has(s) && a.indexOf(s) === i);
  for (const c of V2_PRIORITY) if (!out.includes(c.slug)) out.push(c.slug);
  return out;
}

/** Move one slug to a new index. */
export function moveSlug(order: readonly string[], slug: string, to: number): string[] {
  const from = order.indexOf(slug);
  if (from < 0) return [...order];
  const next = order.filter((s) => s !== slug);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, slug);
  return next;
}

export const OUTREACH_ORIGIN = "https://surviveaccounting.com";

// ── THE DM TEMPLATES (Lee, 2026-09-14) ─────────────────────────────────────────────────────────
// Two defaults, picked by recipient: a council gets the council ask, a chapter gets the chapter ask.
// Tokens resolve from the recipient's own data; "a professor at Ole Miss" is Lee and never changes.
// A template that can't be filled honestly (no campus, course code or link) is NOT copied — the
// caller shows what's missing instead of pasting a placeholder or a guess.

export const DM_TEMPLATES = {
  council: [
    "Hey y’all,",
    "",
    "I’m Lee Ingram, a professor at Ole Miss and the tutor behind SurviveAccounting.com.",
    "",
    "I help {{organizationTypePlural}} boost their GPAs by making accounting exams easier. With {{campusShorthand}}’s first {{courseCode}} exam coming up, my free Exam 1 prep is available now—quick cram videos and practice exams.",
    "",
    "Could you pass this along to your chapters’ scholarship chairs or presidents?",
    "",
    "{{outreachLink}}",
    "",
    "Really appreciate it!",
    "Lee",
  ].join("\n"),
  chapter: [
    "Hey y’all,",
    "",
    "I’m Lee Ingram, a professor at Ole Miss and the tutor behind SurviveAccounting.com.",
    "",
    "I help {{organizationTypePlural}} boost their GPAs by making accounting exams easier. With {{campusShorthand}}’s first {{courseCode}} exam coming up, my free Exam 1 prep is available now—quick cram videos and practice exams.",
    "",
    "Could you pass this along to {{chapterName}}’s scholarship chair or president?",
    "",
    "{{outreachLink}}",
    "",
    "Really appreciate it!",
    "Lee",
  ].join("\n"),
} as const;
export type DmKind = keyof typeof DM_TEMPLATES;

export type OrgType = "fraternity" | "sorority" | null;

/** {{organizationTypePlural}}: IFC → fraternities, Panhellenic → sororities, NPHC or mixed → both;
 *  a chapter by its own organization's type (its council's when the org has none); unknown → chapters. */
export function organizationTypePlural(o: { kind: DmKind; council: string | null; orgType?: OrgType }): string {
  const council = (o.council ?? "").toLowerCase();
  if (o.kind === "council") {
    if (council === "ifc") return "fraternities";
    if (council === "panhellenic") return "sororities";
    if (council === "nphc" || council === "mgc") return "fraternities and sororities";
    return "chapters";
  }
  if (o.orgType === "fraternity") return "fraternities";
  if (o.orgType === "sorority") return "sororities";
  if (council === "ifc") return "fraternities";
  if (council === "panhellenic") return "sororities";
  return "chapters";
}

export interface DmRecipient {
  kind: DmKind;
  /** Campus shorthand ("Ole Miss"); the full campus name when there's no shorthand. */
  campusShorthand: string | null;
  campusName?: string | null;
  courseCode: string | null;
  /** Organization display name ("Sigma Chi"); chapters only. */
  chapterName?: string | null;
  council: string | null;
  orgType?: OrgType;
  outreachLink: string | null;
}

export type DmResult = { ok: true; text: string } | { ok: false; missing: string[] };

/** Fill the recipient's template. Plain text, paragraph breaks kept, no Markdown. */
export function renderOutreachDm(r: DmRecipient): DmResult {
  const campus = (r.campusShorthand ?? "").trim() || (r.campusName ?? "").trim();
  const course = (r.courseCode ?? "").trim();
  const link = (r.outreachLink ?? "").trim();
  const missing = [!campus && "campus name", !course && "course code", !link && "outreach link"].filter((x): x is string => !!x);
  if (missing.length) return { ok: false, missing };
  let t: string = DM_TEMPLATES[r.kind];
  const chapter = (r.chapterName ?? "").trim();
  if (r.kind === "chapter" && !chapter) t = t.replace("{{chapterName}}’s scholarship chair or president", "your scholarship chair or president");
  const values: Record<string, string> = {
    campusShorthand: campus, courseCode: course, chapterName: chapter, outreachLink: link,
    organizationTypePlural: organizationTypePlural({ kind: r.kind, council: r.council, orgType: r.orgType ?? null }),
  };
  const text = t.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => values[k] ?? "");
  if (/\{\{\w+\}\}/.test(text)) return { ok: false, missing: ["template field"] };
  return { ok: true, text };
}

/** "Add the course code first." — what the copy button says when it can't copy. */
export function missingMessage(missing: readonly string[]): string {
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}` : missing[0];
  return `Can't copy yet — add the ${list} for this recipient first.`;
}

/** The link a slot carries: the contact's short tracked link when the contact exists, else the page. */
export function slotLink(page: string, contactCode: string | null | undefined): string {
  return contactCode ? `${OUTREACH_ORIGIN}/l/${contactCode}` : `${OUTREACH_ORIGIN}${page}`;
}
export const councilPage = (campusSlug: string, council: string): string => `/go/${campusSlug}/council/${council}`;
export const chapterPage = (campusSlug: string, chapterSlug: string): string => `/go/${campusSlug}/${chapterSlug}`;

/** The council key a roster row's free-text council column means (IFC, "Panhellenic", "nphc"…). */
export function v2CouncilOf(raw: string | null | undefined): V2CouncilKey | null {
  const k = (raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (k === "ifc" || k === "interfraternitycouncil" || k === "interfraternity") return "ifc";
  if (k === "panhellenic" || k === "phc" || k === "cph" || k === "collegiatepanhellenic" || k === "panhellenicassociation" || k === "panhellenicconference" || k === "npc") return "panhellenic";
  if (k === "nphc" || k === "nationalpanhellenic" || k === "nationalpanhelleniccouncil") return "nphc";
  return null;
}
