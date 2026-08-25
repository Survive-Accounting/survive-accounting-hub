// Growth Contact Intelligence — pure extraction / classification / dedupe helpers.
//
// No network, no DB, no side effects: everything here is unit-tested and shared by
// the discovery server functions (growth-intel.functions.ts) and the batch runner.
// The discovery layer NEVER invents a value — these helpers scan the fetched public
// page so an email/handle can be verified verbatim before it is ever stored.

export type ContactType =
  | "role_inbox"
  | "student_officer"
  | "staff_advisor"
  | "organization_general"
  | "social_account"
  | "unknown";

export type ClubCategory = "women_in_business" | "investment_finance";

// Source types, ordered by §6 priority (index = rank; lower = more authoritative).
export const SOURCE_TYPES = [
  "university_org_directory", // 1 official university student-org directory
  "business_school_page", //     2 official business-school club page
  "university_hosted_org", //     3 official university-hosted org page
  "official_org_site", //         4 official organization website
  "indexed_social", //            5 publicly indexed IG/FB page
  "serp", //                      generic search result (unclassified)
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
export const IG_RE = /(?:instagram\.com|instagr\.am)\/([a-z0-9._]{2,30})/gi;
export const FB_RE = /facebook\.com\/([a-z0-9._-]{2,60})/gi;

// Role-inbox local-parts: a general address not tied to a person.
const ROLE_LOCALPARTS =
  /^(info|contact|hello|board|exec|officers?|president|vp|treasurer|secretary|membership|recruitment|admin|team|general|club|society|association|wib|womeninbusiness|investment|finance|fma|smif|sif)\b/i;

// IG paths that are never an org handle.
const IG_RESERVED = new Set([
  "p", "reel", "reels", "explore", "stories", "tv", "accounts", "about",
  "developer", "legal", "directory", "help", "web", "sitemap",
]);

const clean = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// ── Business-club category matching ────────────────────────────────────────
// V1 targets ONLY two categories. Broad org ingestion is explicitly avoided, and
// Beta Alpha Psi is excluded from the V1 set.
const WIB_PATTERNS = [
  /\bwomen in business\b/,
  /\bwomen s? business\b/,
  /\bundergraduate women in business\b/,
  /\bwomen in finance\b/,
  /\bwomen in banking\b/,
  /\bwomen in economics\b/,
  /\bwomen s? finance\b/,
  /\bfemale? leaders in business\b/,
];
const INVFIN_PATTERNS = [
  /\binvestment club\b/,
  /\binvestment banking\b/,
  /\binvestment group\b/,
  /\binvestment association\b/,
  /\bfinance club\b/,
  /\bfinance society\b/,
  /\bfinance association\b/,
  /\bfinancial management association\b/,
  /\bstudent investment fund\b/,
  /\bstudent managed investment fund\b/,
  /\bstudent managed fund\b/,
  /\basset management\b/,
  /\bportfolio management\b/,
  /\bcapital management\b/,
  /\bwall street\b/,
  /\bequity research\b/,
  /\bquant(itative)? finance\b/,
  /\btrading (club|society|group)\b/,
];
// Guardrails: things that LOOK finance-y but are out of the V1 target set.
const CLUB_EXCLUDE = [
  /\bbeta alpha psi\b/, //            honors accounting — excluded from V1
  /\baccounting (society|club|association)\b/,
  /\breal estate\b/,
  /\bconsulting\b/,
  /\bentrepreneur/,
  /\bmarketing\b/,
  /\bsupply chain\b/,
  /\bsports? (business|management)\b/,
  /\bactuarial\b/,
  /\bMBA\b/i,
  /\balumni\b/,
  /\bgraduate\b/, // undergraduate focus (but keep "undergraduate women in business")
];

/** Returns the V1 club category for an org name, or null if it is not a V1 target. */
export function classifyBusinessCategory(rawName: string): ClubCategory | null {
  const n = ` ${clean(rawName)} `;
  const isUndergradWIB = /\bundergraduate women in business\b/.test(n);
  if (!isUndergradWIB) {
    for (const ex of CLUB_EXCLUDE) if (ex.test(n)) return null;
  }
  for (const p of WIB_PATTERNS) if (p.test(n)) return "women_in_business";
  for (const p of INVFIN_PATTERNS) if (p.test(n)) return "investment_finance";
  return null;
}

/** Campus acronym from significant-word initials, e.g. "Middle Tennessee State University" -> "mtsu". */
export function campusAcronym(campusName: string): string {
  const stop = new Set(["of", "the", "at", "and", "for"]);
  return clean(campusName)
    .split(" ")
    .filter((w) => w.length > 1 && !stop.has(w))
    .map((w) => w[0])
    .join("");
}

/** Normalized org identity for dedupe: lowercased, punctuation-stripped, campus name + acronym removed. */
export function normalizeClubName(rawName: string, campusName = ""): string {
  // Drop trailing/parenthetical acronyms so "Finance Club (HUFIC)" == "Finance Club".
  let n = clean(rawName.replace(/\([^)]*\)/g, " "));
  const campus = clean(campusName);
  if (campus) {
    // Drop the campus name, its acronym, and common qualifiers so "UGA Women in
    // Business", "MTSU Women in Business" and "Women in Business at Georgia" collapse.
    for (const tok of campus.split(" ").filter((t) => t.length > 2)) {
      n = n.replace(new RegExp(`\\b${tok}\\b`, "g"), " ");
    }
    const ac = campusAcronym(campusName);
    if (ac.length >= 2) n = n.replace(new RegExp(`\\b${ac}\\b`, "g"), " ");
  }
  n = n
    .replace(/\b(the|at|of|university|college|student|undergraduate|chapter|organization|org|club|association|society)\b/g, " ")
    // Drop campus acronyms / abbreviations and stray short words (uga, osu, fau, "in").
    // Every distinguishing business term is >3 chars (women, finance, fund, asset...).
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .join(" ")
    .trim();
  return n || clean(rawName);
}

// ── Exec-role normalization ────────────────────────────────────────────────
// The roles that matter for academic / scholarship outreach.
const ROLE_MAP: Array<[RegExp, string]> = [
  [/\bpresident\b/, "President"],
  [/\bvp\b.*acad|vice president.*acad|academic.*vice|vp of academics/i, "VP Academics"],
  [/\bscholarship chair|\bchair.*scholarship\b|\bvp.*scholarship\b|scholarship director/i, "Scholarship Chair"],
  [/\bacademic chair|\bchair.*academic\b|academics? chair|director of academics/i, "Academic Chair"],
  [/\bvp\b.*scholar|vice president.*scholar/i, "VP Scholarship"],
  [/\btreasurer\b|\bvp.*finance\b|\bcfo\b/, "Treasurer"],
  [/\badvisor\b|\badviser\b|\bcoordinator\b|\bdirector\b|\bstaff\b/, "Advisor"],
  [/\bvice president\b|\bvp\b/, "Vice President"],
];

/** Canonical role label, or the trimmed original if nothing matches. */
export function normalizeRole(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  for (const [re, label] of ROLE_MAP) if (re.test(s)) return label;
  return s.slice(0, 80) || null;
}

/** Is this one of the academic/scholarship roles we especially want? */
export function isPriorityRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ["VP Academics", "Scholarship Chair", "Academic Chair", "VP Scholarship", "President"].includes(
    normalizeRole(role) || "",
  );
}

// ── Contact-type classification ────────────────────────────────────────────
/**
 * Decide the §8 contact classification. `hasName` = a person's name is attached;
 * `isOrgLevel` = the value describes the org itself (general inbox / social).
 */
export function classifyContactType(opts: {
  email?: string | null;
  name?: string | null;
  role?: string | null;
  isSocial?: boolean;
  isStaff?: boolean;
}): ContactType {
  if (opts.isSocial) return "social_account";
  const local = (opts.email || "").split("@")[0].toLowerCase();
  const hasName = !!(opts.name && opts.name.trim());
  const staffHint = opts.isStaff || /advisor|adviser|coordinator|director|staff|faculty/i.test(opts.role || "");
  if (staffHint && hasName) return "staff_advisor";
  if (opts.email && !hasName && ROLE_LOCALPARTS.test(local)) {
    // A general address with no person attached: role inbox (person-less) vs org general.
    return /president|vp|treasurer|secretary|officer|recruitment|membership/.test(local)
      ? "role_inbox"
      : "organization_general";
  }
  if (hasName && opts.email) return "student_officer";
  if (opts.email) return "role_inbox";
  if (hasName) return "student_officer";
  return "unknown";
}

// ── Source classification (host + URL → §6 source_type + base confidence) ───
export function classifySource(url: string, campusDomain: string | null | undefined): {
  source_type: SourceType;
  confidence: "high" | "medium" | "low";
} {
  const host = hostOf(url);
  const path = safePath(url);
  const onCampus = !!campusDomain && (host === campusDomain || host.endsWith(`.${campusDomain}`) || host.endsWith(".edu"));
  const isEdu = host.endsWith(".edu");
  if (isEdu || onCampus) {
    if (/business|bschool|b-school|commerce|terry|kelley|mccombs|kenan|fisher|owen/.test(host + path))
      return { source_type: "business_school_page", confidence: "high" };
    if (/orgs?|involve|getinvolved|studentlife|student-?orgs|campuslabs|engage|directory|clubs?/.test(host + path))
      return { source_type: "university_org_directory", confidence: "high" };
    return { source_type: "university_hosted_org", confidence: "high" };
  }
  if (/campuslabs\.com|presence\.io|anthology|engage/.test(host))
    return { source_type: "university_org_directory", confidence: "high" };
  if (host.includes("instagram.com") || host.includes("facebook.com"))
    return { source_type: "indexed_social", confidence: "medium" };
  if (/\.(org|com|net)$/.test(host)) return { source_type: "official_org_site", confidence: "medium" };
  return { source_type: "serp", confidence: "low" };
}

/** Lower rank = more authoritative. Used to keep the best source when merging evidence. */
export function sourceRank(t: SourceType): number {
  const i = SOURCE_TYPES.indexOf(t);
  return i < 0 ? SOURCE_TYPES.length : i;
}

// ── Verbatim scanners (hallucination guard inputs) ─────────────────────────
export function scanEmails(md: string): Set<string> {
  return new Set(
    Array.from(md.matchAll(EMAIL_RE))
      .map((m) => m[0].toLowerCase().replace(/\.$/, "").replace(/^mailto:/, ""))
      .filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e))
      .filter((e) => !/@(example|sentry|wixpress|\d)/.test(e)),
  );
}
export function scanInstagram(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(IG_RE)) {
    const h = m[1].toLowerCase().replace(/[.\/]+$/, "");
    if (h.length >= 2 && !IG_RESERVED.has(h) && !out.includes(h)) out.push(h);
  }
  return out;
}
export function scanFacebook(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(FB_RE)) {
    const h = m[1].toLowerCase().replace(/[.\/]+$/, "");
    if (h.length >= 2 && !["p", "pages", "events", "groups", "sharer", "profile.php", "login"].includes(h) && !out.includes(h)) out.push(h);
  }
  return out;
}
export const igUrl = (handle: string) => `https://instagram.com/${handle.replace(/^@/, "").toLowerCase()}`;

// ── Confidence combiner ────────────────────────────────────────────────────
/**
 * Final confidence for a stored contact from its best source + how the value was
 * verified. Verbatim on an official page => high; social-only => capped medium.
 */
export function combineConfidence(opts: {
  best: SourceType;
  verbatim: boolean;
  identityAgides?: boolean; // org identity independently corroborated
}): "high" | "medium" | "low" {
  const rank = sourceRank(opts.best);
  if (!opts.verbatim) return "low";
  if (rank <= 2 && (opts.identityAgides ?? true)) return "high"; // official uni/bschool page, verbatim
  if (rank <= 3) return "medium";
  if (opts.best === "indexed_social") return "medium";
  return "low";
}

// ── URL helpers ────────────────────────────────────────────────────────────
export function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
function safePath(u: string): string {
  try {
    return new URL(u).pathname.toLowerCase();
  } catch {
    return "";
  }
}
/** First domain from a campuses.domains array or email_domain (mirrors council-contacts). */
export function firstDomain(d: unknown, emailDomain?: string | null): string {
  const fromArr = Array.isArray(d)
    ? String(d[0] ?? "")
    : String(d ?? "").replace(/[{}"]/g, "").split(",")[0].trim();
  return (fromArr || emailDomain || "").toLowerCase().replace(/^www\./, "");
}

// ── Chapter IG handle precision filter ─────────────────────────────────────
// Naive SERP for "<school> <chapter> instagram" also returns the NATIONAL org
// account and, occasionally, a DIFFERENT school's chapter. For CHAPTER_DISTRIBUTION
// we want the campus chapter's own account, so require a campus signal token in
// the handle. Higher precision at some recall cost (a campus-token-less chapter
// handle is dropped — but it is indistinguishable from the national account).
export function handleHasCampusSignal(handle: string, campusSignals: string[]): boolean {
  const h = handle.toLowerCase().replace(/[^a-z0-9]/g, "");
  return campusSignals.some((s) => s.length >= 3 && h.includes(s));
}

// ── Dedupe key ─────────────────────────────────────────────────────────────
/** Identity for a contact within an entity: email if present, else social handle, else name. */
export function contactDedupeKey(c: { email?: string | null; instagram_url?: string | null; name?: string | null; contact_type?: string }): string {
  if (c.email) return `email:${c.email.toLowerCase()}`;
  if (c.instagram_url) return `ig:${hostOf(c.instagram_url)}${safePath(c.instagram_url)}`;
  if (c.name) return `name:${clean(c.name)}`;
  return `ctype:${c.contact_type || "unknown"}`;
}
