// REP V1 — PURE shared types + helpers for the campus-rep workspace. No server imports; safe from
// client routes AND server modules. The server functions live in rep-auth.functions.ts /
// rep-workspace.functions.ts / rep-admin.functions.ts.
//
// THE JOB, in the order the product states it: find the right people → share free Exam 1 → get it
// into the chapter house. Everything here exists to make that legible: lifecycle states, chapter
// states, and the prebuilt share copy.

// ── rep lifecycle ────────────────────────────────────────────────────────────────────────────
// applicant → approved → (phone verified) → active. `paused`/`deactivated` are admin brakes.
// This is rep_status on referral_partners; the engine's own `status` column stays the
// link-resolution switch and the server keeps the two in sync.
export const REP_STATUSES = ["applied", "approved", "active", "paused", "deactivated"] as const;
export type RepStatus = (typeof REP_STATUSES)[number];

export const REP_STATUS_LABEL: Record<RepStatus, string> = {
  applied: "Applied",
  approved: "Approved — needs phone verify",
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
  isTest: boolean;
  campusSlug: string | null;
  campusName: string | null;
  courseCode: string | null;
  termId: string;
  termLabel: string;
  mainLink: { code: string; shortUrl: string } | null;
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

export const fmtMs = (ms: number): string => {
  const h = ms / 3_600_000;
  if (h >= 1) return `${h.toFixed(h >= 10 ? 0 : 1)}h`;
  return `${Math.round(ms / 60_000)}m`;
};
