// Shared classification helpers for the Campus Backfill scraper hardening pass.
// Pure functions (no I/O) so they can be unit-tested and reused across stages.
//
// Motivation (from the 2026-08-25 structural-backfill audit):
//  - Community colleges legitimately have no Greek councils and often no
//    dedicated accounting faculty page; running council/faculty on them burned
//    Firecrawl credits for near-zero yield. Gate them by default.
//  - greek_orgs.org_type was set purely from the GreekRank section a name
//    appeared under, so professional/honor orgs (Alpha Kappa Psi, Beta Alpha
//    Psi, …) were miscounted as social Greek. Classify by NAME.
//  - Council role inboxes (ifc@, panhellenic@, greeklife@) were under-tagged
//    (68 typed vs 381 look-alike). Tag them by local-part.

export type OrgType = "fraternity" | "sorority" | "professional" | "honor" | "service";
export type CouncilContactType = "role_inbox" | "staff_advisor" | "student_officer" | "unknown";

/** Community-college / two-year detection: institution_type OR name pattern. */
export function isCommunityCollege(campus: { institution_type?: string | null; school_type?: string | null; name?: string | null; display_name?: string | null }): boolean {
  const t = `${campus.institution_type ?? ""} ${campus.school_type ?? ""}`.toLowerCase();
  if (/community|two[-\s]?year|junior college|technical college/.test(t)) return true;
  const n = `${campus.display_name ?? campus.name ?? ""}`.toLowerCase();
  return /\b(community college|city college|technical college|junior college|county college|technical institute)\b/.test(n);
}

// Known non-social Greek-letter orgs (professional, honor, service). Matched on
// normalized org name. NOT exhaustive — a safety net over the section heuristic.
const PROFESSIONAL = [
  "alpha kappa psi", "delta sigma pi", "phi chi theta", "pi sigma epsilon", "phi beta lambda",
  "phi gamma nu", "sigma alpha epsilon pi", "alpha phi omega", "delta sigma theta business",
  "kappa psi", "phi delta chi", "alpha zeta", "sigma theta tau", "phi alpha delta", "delta theta phi",
];
const HONOR = [
  "beta alpha psi", "beta gamma sigma", "phi beta kappa", "phi kappa phi", "order of omega",
  "golden key", "alpha lambda delta", "phi eta sigma", "gamma iota sigma", "sigma beta delta",
  "national society of leadership", "tau beta pi", "phi theta kappa", "alpha chi", "omicron delta kappa",
];
const SERVICE = ["gamma sigma sigma", "omega phi alpha", "epsilon sigma alpha", "alpha phi omega"];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Classify a Greek org by NAME, overriding the section-based social default.
 * `sectionType` is the fraternity/sorority guess from the listing section.
 */
export function classifyOrgType(name: string, sectionType: "fraternity" | "sorority"): OrgType {
  const n = norm(name);
  if (!n) return sectionType;
  if (HONOR.some((k) => n.includes(k))) return "honor";
  if (SERVICE.some((k) => n.includes(k))) return "service";
  if (PROFESSIONAL.some((k) => n.includes(k))) return "professional";
  return sectionType;
}

/** True when an org should NOT count toward social Greek presence/density. */
export function isNonSocial(orgType: OrgType | string | null | undefined): boolean {
  return orgType === "professional" || orgType === "honor" || orgType === "service";
}

// Local-part patterns that indicate a durable, non-person role/office inbox.
const ROLE_INBOX_LOCAL = /^(ifc|interfraternity|panhel|cpanhel|cph|phc|panhellenic|nphc|panhellenic|mgc|multicultural|nalfo|npc|greek|greeklife|gogreek|fsl|fslife|ofsl|sfl|fandsl|fraternityandsoror|sorority|fraternity|studentlife|studentactivities)/;

/**
 * Classify a council contact. Role inboxes win when the LOCAL PART is a
 * role/office term (they survive officer turnover and are the best outreach
 * target) even if a current officer's name is attached. Named people with an
 * advisor/staff role → staff_advisor; other named people → student_officer.
 */
export function classifyCouncilContact(email: string, opts: { name?: string | null; role?: string | null; aiType?: string | null }): CouncilContactType {
  const local = (email.split("@")[0] || "").toLowerCase();
  if (ROLE_INBOX_LOCAL.test(local)) return "role_inbox";
  const role = (opts.role || "").toLowerCase();
  if (/advisor|advis|coordinator|director|assistant dean|dean of students|program manager|staff|fraternity.*sorority life/.test(role)) return "staff_advisor";
  if (opts.aiType === "staff_advisor") return "staff_advisor";
  if (opts.name && opts.name.trim()) return "student_officer";
  if (opts.aiType === "student_officer") return "student_officer";
  return "unknown";
}

/**
 * High-value campuses that should run the FULL stage set even if they'd
 * otherwise be gated (e.g. a community college with a real accounting program).
 * Populated from env HIGH_VALUE_CAMPUS_IDS (comma-separated UUIDs). Empty = none.
 */
export function highValueCampusIds(): Set<string> {
  const raw = process.env.HIGH_VALUE_CAMPUS_IDS || "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}
