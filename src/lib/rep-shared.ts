// REP V1 — PURE shared types + helpers for the campus-rep workspace. No server imports; safe from
// client routes AND server modules. The server functions live in rep-auth.functions.ts /
// rep-workspace.functions.ts / rep-admin.functions.ts.
//
// THE JOB, in the order the product states it: find the right people → share free Exam 1 → get it
// into the chapter house. Everything here exists to make that legible: lifecycle states, chapter
// states, and the prebuilt share copy.

// ── rep lifecycle ────────────────────────────────────────────────────────────────────────────
// SELF-VERIFY (no admin approval): signup → phone verify → active. `approved` now just means
// "signed up, phone not verified yet"; `applied` only exists on legacy rows from the brief
// approval-gate era and behaves identically. `paused`/`deactivated` stay the admin brakes.
// This is rep_status on referral_partners; the engine's own `status` column stays the
// link-resolution switch and the server keeps the two in sync.
export const REP_STATUSES = ["applied", "approved", "active", "paused", "deactivated"] as const;
export type RepStatus = (typeof REP_STATUSES)[number];

export const REP_STATUS_LABEL: Record<RepStatus, string> = {
  applied: "Unverified (legacy)",
  approved: "Unverified — phone pending",
  active: "Active",
  paused: "Paused",
  deactivated: "Deactivated",
};

// ── assignment lifecycle ─────────────────────────────────────────────────────────────────────
export const ASSIGNMENT_STATUSES = ["reserved", "qualified", "expired", "reassigned", "revoked"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Assignment transition on a QC decision for its sourced contact. Pure — the server applies the
 *  result. A rejection only releases the reservation when the rep has NO other usable contact for
 *  the chapter (hasOtherUsableContact). */
export function assignmentAfterQc(
  current: AssignmentStatus,
  decision: "approve" | "reject",
  hasOtherUsableContact: boolean,
): AssignmentStatus {
  if (current !== "reserved" && current !== "qualified") return current; // terminal states never move
  if (decision === "approve") return "qualified";
  // rejection
  if (current === "qualified") return "qualified"; // already qualified via an earlier approval — a later reject of another contact doesn't demote
  return hasOtherUsableContact ? "reserved" : "revoked";
}

// ── chapter states (the leaderboard's one-glance status) ─────────────────────────────────────
export const CHAPTER_STATES = [
  "available", "reserved_other", "assigned", "contact_verified", "kit_shared", "flyer_posted", "engaged", "claimed",
] as const;
export type ChapterState = (typeof CHAPTER_STATES)[number];

export const CHAPTER_STATE_LABEL: Record<ChapterState, string> = {
  available: "Available",
  reserved_other: "Reserved",
  assigned: "Assigned to you",
  contact_verified: "Contact verified",
  kit_shared: "Kit shared",
  flyer_posted: "Flyer posted",
  engaged: "Engaged",
  claimed: "Claimed",
};

export type ChapterStateInput = {
  claimed: boolean;
  /** signups attributed via this chapter's rep link */
  signups: number;
  housePosted: boolean;
  kitShared: boolean;
  myAssignment: AssignmentStatus | null;
  otherAssignment: boolean;
};

/** Highest-signal state wins; a rep should read one word and know where the chapter stands. */
export function chapterState(i: ChapterStateInput): ChapterState {
  if (i.claimed) return "claimed";
  const live = i.myAssignment === "reserved" || i.myAssignment === "qualified";
  if (live && i.signups > 0) return "engaged";
  if (live && i.housePosted) return "flyer_posted";
  if (live && i.kitShared) return "kit_shared";
  if (i.myAssignment === "qualified") return "contact_verified";
  if (i.myAssignment === "reserved") return "assigned";
  if (i.otherAssignment) return "reserved_other";
  return "available";
}

// ── contact roles ────────────────────────────────────────────────────────────────────────────
export const CONTACT_ROLES = [
  "President", "Vice President", "Treasurer", "Academic / Scholarship Chair", "Advisor", "Other exec",
] as const;

/** growth_public_contacts.contact_type for a rep-entered role. Advisors are staff; everyone else a
 *  rep talks to is a student officer. */
export function contactTypeForRole(role: string): "student_officer" | "staff_advisor" {
  return /advisor/i.test(role) ? "staff_advisor" : "student_officer";
}

// ── share copy (the prebuilt message) ────────────────────────────────────────────────────────
/** One short message a rep can paste anywhere. Chapter-specific when we know the chapter. */
export function shareMessage(i: { campusName: string | null; chapterName: string | null; courseCode: string | null; shortUrl: string }): string {
  const course = i.courseCode ? `${i.courseCode} ` : "accounting ";
  const who = i.chapterName ? `${i.chapterName} — ` : "";
  return `${who}free ${course}Exam 1 prep from Survive Accounting: real exam-style questions worked start to finish. No card, no catch — Exam 1 is free: ${i.shortUrl}`;
}

/** Subject + body for the mailto: composer. */
export function shareEmail(i: { campusName: string | null; chapterName: string | null; courseCode: string | null; shortUrl: string }): { subject: string; body: string } {
  const course = i.courseCode ?? "Intro Accounting";
  return {
    subject: `Free ${course} Exam 1 prep for ${i.chapterName ?? "your chapter"}`,
    body: `Hey!\n\nWanted to pass this along for the chapter — Survive Accounting has free Exam 1 prep for ${course} at ${i.campusName ?? "our school"}: real exam-style questions, worked start to finish by a tutor who's helped 1,000+ students.\n\nExam 1 is completely free (no card): ${i.shortUrl}\n\nWorth sharing in the group chat before the first exam.`,
  };
}

export const smsHref = (msg: string) => `sms:?&body=${encodeURIComponent(msg)}`;
export const mailtoHref = (to: string | null, subject: string, body: string) =>
  `mailto:${to ? encodeURIComponent(to) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// ── activity kinds (mirror of the DB check — keep in sync with the migration) ────────────────
export const ACTIVITY_KINDS = [
  "contact_submitted", "contact_verified", "contact_qc_approved", "contact_qc_rejected",
  "chapter_reserved", "chapter_qualified", "chapter_released",
  "share_kit_opened", "share_kit_sms", "share_kit_email", "share_kit_shared",
  "link_copied", "flyer_downloaded", "qr_downloaded", "house_posted",
  "chapter_claimed", "admin_reassigned", "admin_view_as", "rep_login", "rep_logout",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Share methods recorded on kit actions. These log INITIATION, not delivery — the UI must say
 *  "share logged", never "delivered" (no provider confirms the rep's own SMS/email). */
export const SHARE_METHODS = ["sms_composer", "mailto", "web_share", "copy", "flyer"] as const;
export type ShareMethod = (typeof SHARE_METHODS)[number];

export const shareKindForMethod: Record<ShareMethod, ActivityKind> = {
  sms_composer: "share_kit_sms",
  mailto: "share_kit_email",
  web_share: "share_kit_shared",
  copy: "link_copied",
  flyer: "flyer_downloaded",
};

// ── contact validation (pure — mirrored server-side) ─────────────────────────────────────────
export type RepContactDraft = {
  name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  notes?: string | null;
};

/** V1 gate: a usable contact needs at least an email OR a phone. Name/role encouraged, not required. */
export function contactDraftProblem(d: RepContactDraft): string | null {
  const email = (d.email ?? "").trim();
  const phone = (d.phone ?? "").trim();
  if (!email && !phone) return "Add an email or a phone number — one of the two is required.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email doesn't look right.";
  return null;
}

/** Normalize an Instagram handle/URL to a canonical https URL, or null. */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = v.match(/(?:instagram\.com\/)?@?([A-Za-z0-9._]{2,40})\/?$/);
  return m ? `https://instagram.com/${m[1].toLowerCase()}` : null;
}

// ── workspace payload shapes ─────────────────────────────────────────────────────────────────
export type RepChapterRow = {
  id: string;                       // campus_greek_chapters.id
  slug: string;
  orgName: string;
  letters: string | null;
  nickname: string | null;
  council: string | null;           // normalized short name ("IFC") or null for non-social
  memberCount: number | null;       // greek_chapter_academic_metrics.latest_member_count
  claimed: boolean;
  state: ChapterState;
  myAssignment: AssignmentStatus | null;
  contactsMine: number;
  contactsTotal: number;
  clicks: number;
  signups: number;
  linkCode: string | null;          // my rep×chapter link when one exists
  housePosted: boolean;
};

export type RepImpact = {
  chaptersReserved: number;
  chaptersQualified: number;
  contactsSubmitted: number;
  contactsApproved: number;
  kitsInitiated: number;
  flyersDownloaded: number;
  housePosted: number;
  clicks: number;
  uniqueVisitors: number;
  signups: number;
  purchases: number;
  revenueCents: number;
  commissionPendingCents: number;
  commissionApprovedCents: number;
  commissionPaidCents: number;
};

export type CampusActivity = {
  /** last-7-day campus-wide numbers — labelled CAMPUS activity, never "yours". */
  students: number;            // distinct practice sessions
  identified: number;          // distinct signed-in users
  questionsAnswered: number;
  studyMs: number;             // SUM(ms) — an estimate, labelled as such
};

export type RepWorkspace = {
  ok: true;
  repId: string;
  name: string;
  repStatus: RepStatus;
  /** V2 program state — 'setup'/'submitted'/… gate the workspace into the onboarding flow. */
  applicationStatus: ApplicationStatus;
  /** V2: the chapters approval assigned to this rep (their working list). */
  assigned: AssignedChapter[];
  isTest: boolean;
  campusSlug: string | null;
  campusName: string | null;
  courseCode: string | null;
  termId: string;
  termLabel: string;
  mainLink: { code: string; shortUrl: string } | null;
  /** V2 comp: the campus flyer's own unique-QR link (utm_content='flyer', no chapter). */
  campusFlyerCode: string | null;
  impact: RepImpact;
  campus: CampusActivity;
  chapters: RepChapterRow[];
  venmo: string | null;
  ruleLabel: string;
  payout: { nextLabel: string; dueCents: number };
  onboardingVideoUrl: string | null;
};

export type RepWorkspaceResult = RepWorkspace | { ok: false; error: string; state?: "pending" | "paused" | "invalid" };

export type ShareKitContact = {
  id: string;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  qcState: "pending" | "approved" | "rejected";
};

export type ShareKit = {
  ok: true;
  chapterId: string;
  chapterName: string;
  chapterSlug: string;
  campusSlug: string;
  courseCode: string | null;
  shortUrl: string;
  code: string;
  qrDataUri: string;
  message: string;
  email: { subject: string; body: string };
  flyerUrl: string;        // /api/flyer/<school>/<chapter>?ref=<code>
  contacts: ShareKitContact[];
  housePosted: boolean;
};

export type ShareKitResult = ShareKit | { ok: false; error: string };

// ── signup (self-verify — no admin approval gate) ────────────────────────────────────────────
/** What submitting the signup form should do when a rep row already exists for this phone/email.
 *  · fresh            — nothing exists: create, then verify
 *  · resume           — an unverified signup exists: update it, then verify (never a duplicate row)
 *  · existing_active  — verified + active: "you already have an account — sign in"
 *  · blocked          — paused/deactivated: the admin brake wins; no self-service resurrection */
export type SignupResolution = "fresh" | "resume" | "existing_active" | "blocked";
export function signupResolution(existing: { repStatus: RepStatus | null; phoneVerifiedAt: string | null } | null): SignupResolution {
  if (!existing) return "fresh";
  const rs = existing.repStatus ?? "active";
  if (rs === "paused" || rs === "deactivated") return "blocked";
  if (existing.phoneVerifiedAt && rs === "active") return "existing_active";
  return "resume";
}

/** Progressive US phone formatting for the signup field: digits in → "(601) 201-8759" out.
 *  Display only — the server stores normalized E.164. Non-US-looking input (leading +) is left
 *  alone so an international number can still be typed verbatim. */
export function formatUsPhoneInput(raw: string): string {
  if (raw.trim().startsWith("+")) return raw;
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// ── V2: application-as-onboarding, coverage, and the DM workflow ─────────────────────────────

/** Program review state — separate from the AUTH lifecycle (rep_status). A verified rep lands in
 *  `setup`, submitting the coverage map moves them to `submitted`, Lee's call decides the rest.
 *  Chapter tools unlock only at `approved`. */
export const APPLICATION_STATUSES = ["setup", "submitted", "approved", "waitlisted", "declined"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  setup: "Setting up", submitted: "In review", approved: "Approved", waitlisted: "Waitlisted", declined: "Declined",
};

/** Who a rep can reach, by council — the axis campus capacity is gated on. */
export const REP_COVERAGES = ["ifc", "panhellenic", "both", "other"] as const;
export type RepCoverage = (typeof REP_COVERAGES)[number];
export const REP_COVERAGE_LABEL: Record<RepCoverage, string> = {
  ifc: "IFC (fraternities)", panhellenic: "Panhellenic (sororities)", both: "Both councils", other: "Other",
};

/** ONE REP PER CAMPUS BY DEFAULT; a second only when the first covers a single council; never
 *  more than two. The data model allows more — this predicate is the UI/signup gate. */
export function campusCapacity(approved: Array<RepCoverage | null>): { open: boolean; reason: "no_reps" | "one_single_council" | "covered_both" | "full" } {
  if (approved.length === 0) return { open: true, reason: "no_reps" };
  if (approved.length >= 2) return { open: false, reason: "full" };
  const c = approved[0];
  // An approved rep with unknown/other coverage is treated as covering the campus — Lee can
  // still approve a second manually; self-serve signup stays shut.
  if (c === "ifc" || c === "panhellenic") return { open: true, reason: "one_single_council" };
  return { open: false, reason: "covered_both" };
}

/** The role chips on step 2 — the highest-signal question on the form. `weighted` roles get the
 *  review-queue badge (role + access + motive). */
export const CAMPUS_ROLE_CHIPS = [
  { slug: "council_officer", label: "IFC or Panhellenic officer", weighted: true },
  { slug: "recruitment_counselor", label: "Recruitment counselor", weighted: true },
  { slug: "greek_life_office", label: "Greek Life office", weighted: false },
  { slug: "business_frat", label: "Business fraternity", weighted: false },
  { slug: "student_gov", label: "Student government", weighted: false },
] as const;
export type CampusRoleSlug = (typeof CAMPUS_ROLE_CHIPS)[number]["slug"];

export const COURSE_STATUSES = [
  { value: "taking_now", label: "Taking it now" },
  { value: "taken", label: "Already took it" },
  { value: "not_yet", label: "Haven't taken it" },
] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number]["value"];

/** Coverage-map entry: 'member' | 'knows_someone'. No-connection is the absence of an entry. */
export type ReachLevel = "member" | "knows_someone";
export type ReachMap = Record<string, ReachLevel>; // chapterId → level

export function reachCount(m: ReachMap): { total: number; member: number; knows: number } {
  let member = 0, knows = 0;
  for (const v of Object.values(m)) { if (v === "member") member++; else knows++; }
  return { total: member + knows, member, knows };
}

/** Step-4 + basics validation for the onboarding submit. */
export function onboardingProblem(d: { graduationYear: number | null; courseStatus: string | null; reach: ReachMap }): string | null {
  const y = d.graduationYear ?? 0;
  if (y < 2026 || y > 2032) return "Pick your graduation year.";
  if (!d.courseStatus) return "Tell us where you are with the course.";
  if (reachCount(d.reach).total === 0) return "Mark at least one chapter you could reach — that's the whole job.";
  return null;
}

/** DM status ladder on an assignment. Self-reported, like house_posted. */
export type DmStatus = "not_contacted" | "dm_sent" | "replied";
export function nextDmStatus(current: DmStatus, action: "copy_dm" | "mark_replied"): DmStatus {
  if (action === "copy_dm") return current === "not_contacted" ? "dm_sent" : current;
  return "replied"; // mark_replied always lands on replied (re-marking is idempotent)
}

/** Suggested pace, with the why — shown as guidance, never enforced. */
export const DM_PACE_NOTE = "Suggested pace: ~10 DMs a day. Blasting 40 chapters in an hour is how Instagram restricts YOUR account — slow is what keeps it working.";

/** The prewritten DM a rep copies. Editable in the UI before copying; the tracked link is the
 *  part that must survive edits. */
export function dmMessage(i: { chapterName: string; courseCode: string | null; shortUrl: string }): string {
  const course = i.courseCode ?? "intro accounting";
  return `Hey! I'm the Survive Accounting rep on campus — we make free ${course} Exam 1 prep (real exam-style questions, worked start to finish). Totally free for ${i.chapterName}, no card or catch. Would you share it with the chapter? ${i.shortUrl}`;
}

/** Vanity /r/<slug> candidate for a rep's main link: "sarah-olemiss". The caller must still
 *  guarantee uniqueness (suffix or fall back to a random code). */
export function repSlugCandidate(name: string, campusSlug: string | null): string {
  const first = (name.trim().split(/\s+/)[0] || "rep").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const campus = (campusSlug ?? "").toLowerCase().replace(/^university-of-/, "").replace(/[^a-z0-9]/g, "").slice(0, 12);
  return [first || "rep", campus].filter(Boolean).join("-");
}

export type AssignedChapter = {
  chapterId: string;
  name: string;              // nickname preferred
  letters: string | null;
  igHandle: string | null;   // from enrichment; null renders as "no handle on file"
  igUrl: string | null;
  dmStatus: DmStatus;
  dmSentAt: string | null;
  repliedAt: string | null;
  claimed: boolean;
  linkCode: string | null;
  shortUrl: string | null;
};

export const fmtMs = (ms: number): string => {
  const h = ms / 3_600_000;
  if (h >= 1) return `${h.toFixed(h >= 10 ? 0 : 1)}h`;
  return `${Math.round(ms / 60_000)}m`;
};
