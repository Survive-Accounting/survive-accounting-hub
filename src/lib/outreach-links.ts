// OUTREACH LINKS — one link and one DM per contact, decided by WHO the contact is (2026-09-11).
//
// Pure and client-safe: the admin links page, the DM console and the Today list all build their
// links and messages here, so a council chair, a chapter chair and a campus club never get the
// same ask by accident again (the bug the HANDOFF-DM-LINKS note describes: every contact got the
// council wording and the campus feed link).
//
// WHERE EACH CONTACT GOES
//   council account / officer  → /go/<campus>/council/<ifc|panhellenic|nphc|mgc>   (the council chair page)
//   FSL office / staff         → /s/<campus>/council                                 (every council's chapters)
//   chapter, on the site       → /go/<campus>/<chapter>                              (the chapter chair page)
//   chapter not on the site,
//   campus club, or any org at a campus with no chapters on the site
//                              → /s/<campus>                                         (the campus /learn page)
// Every link carries ?ref=<contact uuid> so the click lands on the DM console as that contact's.
import { CONTACT_REF_PARAM } from "@/lib/contact-ref";

export const OUTREACH_HOST = "surviveaccounting.com";

export type OrgKind = "council" | "office" | "chapter" | "club";

/** A council as the contacts table labels it → the site's council slug. */
export const COUNCIL_SLUG: Record<string, string> = { IFC: "ifc", Panhellenic: "panhellenic", NPHC: "nphc", MGC: "mgc" };
export const COUNCIL_LABEL: Record<string, string> = { ifc: "IFC", panhellenic: "Panhellenic", nphc: "NPHC", mgc: "MGC" };
/** The order the links page groups by. */
export const GROUP_ORDER = ["IFC", "Panhellenic", "NPHC", "MGC", "Campus Club", "FSL Office"] as const;
export const GROUP_LABEL: Record<string, string> = { IFC: "IFC", Panhellenic: "Panhellenic", NPHC: "NPHC", MGC: "MGC", "Campus Club": "Campus clubs", "FSL Office": "FSL office", Other: "Other" };

/** One row of growth_contact_qc as the links page sees it. `id` is the row uuid (what ?ref= carries). */
export interface LinkContact {
  id: string;
  contactId: string | null;
  orgType: OrgKind | "";
  /** "IFC" | "Panhellenic" | "NPHC" | "MGC" | "Campus Club" | "FSL Office" | "Other" | "" */
  council: string;
  orgName: string;
  contactKind: "org_inbox" | "student_officer" | "staff" | "";
  execTitle: string;
  firstName: string;
  fullName: string;
  orgIg: string;
  personalIg: string;
  altIg: string;
  email: string;
  needsReview: boolean;
  reviewReason: string;
  dmStatus: string;
  dmChannel: string;
  dmSentAt: string | null;
  /** growth_ig_dm.sent_at — what the DM console's "sent" tick writes. */
  igSentAt: string | null;
  clicks: number;
}

export interface SiteChapter { slug: string; name: string; council: string | null; nickname: string | null; letters: string | null }

export interface LinkCampus {
  /** campuses.slug — the /go and /s namespace. */
  slug: string;
  /** "Ole Miss" */
  label: string;
  courseCode: string | null;
  campusId: string;
  siteChapters: number;
}

/** An org on the page: a council, the FSL office, a chapter (from the site's own list, whether or
 *  not it has contacts yet) or a campus club. */
export interface LinkOrg {
  key: string;
  kind: OrgKind;
  /** The group it sits under ("IFC", "Panhellenic", …, "Campus Club", "FSL Office", "Other"). */
  group: string;
  name: string;
  /** Council slug ("ifc") or the site chapter slug; "" when there is none. */
  slug: string;
  onSite: boolean;
  letters: string | null;
  nickname: string | null;
  /** The org's own account row (org_inbox), when there is one. */
  account: LinkContact | null;
  /** People at the org, scholarship chair first, then the president, then the rest. */
  people: LinkContact[];
}

// ── handles and names ──────────────────────────────────────────────────────────────────────────

export const cleanHandle = (h: string | null | undefined): string =>
  String(h ?? "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?].*$/, "").toLowerCase();

/** "Luke Habeeb" → "Luke"; an org name, an all-caps handle or a blank → "". */
export function firstNameOf(name: string | null | undefined): string {
  const t = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[A-Z][a-z'’-]+$/.test(t) ? t : "";
}

const norm = (s: string | null | undefined): string => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** The site chapter a contact's org name refers to, by name, nickname or letters. */
export function matchChapter(orgName: string, chapters: readonly SiteChapter[]): SiteChapter | null {
  const n = norm(orgName);
  if (!n) return null;
  return chapters.find((c) => norm(c.name) === n)
    ?? chapters.find((c) => c.nickname && norm(c.nickname) === n)
    ?? chapters.find((c) => c.letters && norm(c.letters) === n)
    ?? null;
}

/** The chair rank: scholarship / academic chairs first, presidents next, everyone else after. */
export function rankTitle(title: string | null | undefined): number {
  const t = (title ?? "").toLowerCase();
  if (/scholar|academ|chapter\s*develop/.test(t)) return 0;
  if (/president/.test(t) && !/vice|\bvp\b/.test(t)) return 1;
  return 2;
}
export const isChairTitle = (title: string | null | undefined): boolean => rankTitle(title) === 0;

// ── links ──────────────────────────────────────────────────────────────────────────────────────

export interface OutreachLink {
  /** Path only, no host: "/go/university-of-mississippi/council/ifc". */
  path: string;
  /** Why this contact gets this page — shown next to the link. */
  why: string;
}

/** Which page an org's contacts get. `campusHasChapters` is the site's own count, so a campus with
 *  nothing on the site (FGCU today) sends every contact to the campus page rather than an empty
 *  council. */
export function linkFor(campusSlug: string, org: Pick<LinkOrg, "kind" | "slug" | "onSite" | "group">, campusHasChapters: boolean): OutreachLink {
  if (org.kind === "council" && org.slug && campusHasChapters) return { path: `/go/${campusSlug}/council/${org.slug}`, why: `${GROUP_LABEL[org.group] ?? org.group} council page` };
  if (org.kind === "office" && campusHasChapters) return { path: `/s/${campusSlug}/council`, why: "all-council page" };
  if (org.kind === "chapter" && org.onSite && org.slug) return { path: `/go/${campusSlug}/${org.slug}`, why: "chapter page" };
  return { path: `/s/${campusSlug}`, why: org.kind === "chapter" ? "campus page (chapter not on the site)" : "campus page" };
}

/** The path with the contact's ref on it. */
export function withContactRef(path: string, contactId: string | null | undefined): string {
  if (!contactId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${CONTACT_REF_PARAM}=${encodeURIComponent(contactId)}`;
}
/** THE SHORT LINK a DM carries: /l/<12-hex contact_id> → 302 to the contact's page with ?ref=. */
export const shortPath = (code: string): string => `/l/${code}`;
export const bareUrl = (path: string): string => `${OUTREACH_HOST}${path}`;
export const fullUrl = (path: string): string => `https://${OUTREACH_HOST}${path}`;

// ── the DM ─────────────────────────────────────────────────────────────────────────────────────

export interface DmContext {
  campusLabel: string;
  courseCode: string | null;
  org: Pick<LinkOrg, "kind" | "group" | "name" | "onSite">;
  /** The person's first name, or "" for an org account (then "Hey!"). */
  firstName: string;
  /** TRUE for the org's own account — the chapter ask adds "or pass it to your scholarship chair". */
  isOrg: boolean;
  /** Bare link, host included, ref included: "surviveaccounting.com/go/…?ref=…". */
  link: string;
  campusHasChapters: boolean;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Lee's DM, in the voice the DM console already uses, with the ask that fits the contact. */
export function contactDm(c: DmContext): string {
  const hey = c.firstName ? `Hey ${c.firstName}!` : "Hey!";
  const course = c.courseCode ? `intro accounting (${c.courseCode})` : "intro accounting";
  const tutored = c.courseCode || "intro accounting";
  const intro = `I'm an Ole Miss accounting grad and I've tutored ${tutored} since 2015. I make cram videos and practice exams built around what's actually on the exam. Everything for Exam 1 is free.`;
  let open: string;
  let ask: string;
  if (c.org.kind === "council" || c.org.kind === "office") {
    const noun = c.org.group === "IFC" ? "fraternities" : c.org.group === "Panhellenic" ? "sororities" : "chapters";
    open = `${hey} ${cap(course)} is one of the biggest drags on GPAs across your ${c.org.kind === "office" ? "chapters" : noun}, and it's a fixable one.`;
    ask = !c.campusHasChapters
      ? "Could you pass this to your chapter scholarship chairs so they can share it with their members?"
      : c.org.kind === "office"
        ? "Could you pass this along to your council and chapter scholarship chairs? Every chapter has its own page here:"
        : `Could you pass this to your chapter scholarship chairs? Every ${GROUP_LABEL[c.org.group] ?? c.org.group} chapter has its own page here:`;
  } else if (c.org.kind === "chapter") {
    open = `${hey} ${cap(course)} is one of the biggest drags on chapter GPAs, and it's a fixable one.`;
    ask = c.org.onSite
      ? (c.isOrg
        ? `I set up a page just for ${c.org.name} at ${c.campusLabel}. Could you share it with your members or pass it to your scholarship chair?`
        : `I set up a page just for ${c.org.name} at ${c.campusLabel}. Could you share it with your members?`)
      : "Could you share this with your members?";
  } else {
    open = `${hey} ${cap(course)} is one of the biggest drags on GPAs at ${c.campusLabel}, and it's a fixable one.`;
    ask = "Could you share this with your members?";
  }
  return [open, "", intro, "", ask, "", c.link, "", "Happy to answer any questions. Thanks!", "", "— Lee"].join("\n");
}

// ── grouping the contacts table into orgs ──────────────────────────────────────────────────────

export const orgKeyOf = (kind: OrgKind, group: string, name: string): string => `${kind}~${group}~${norm(name)}`;

/** The council label a contact belongs to, from its `council` column or a legacy council_type. */
export function groupOf(c: Pick<LinkContact, "council" | "orgType">): string {
  if (c.orgType === "office") return "FSL Office";
  if (c.orgType === "club") return "Campus Club";
  const label = c.council || "";
  if (GROUP_ORDER.includes(label as (typeof GROUP_ORDER)[number])) return label;
  const byKey = COUNCIL_LABEL[label.toLowerCase()];
  return byKey ?? (label || "Other");
}

/** Every org for a campus: the councils (always, all four), the office, each site chapter (with
 *  its contacts when it has them), chapters that only exist in the contacts table, and clubs. */
export function buildOrgs(contacts: readonly LinkContact[], chapters: readonly SiteChapter[]): LinkOrg[] {
  const orgs = new Map<string, LinkOrg>();
  const ensure = (kind: OrgKind, group: string, name: string, slug: string, onSite: boolean, extra?: Partial<LinkOrg>): LinkOrg => {
    const key = orgKeyOf(kind, group, name);
    let o = orgs.get(key);
    if (!o) { o = { key, kind, group, name, slug, onSite, letters: null, nickname: null, account: null, people: [], ...extra }; orgs.set(key, o); }
    return o;
  };
  // The four councils and the office exist even with no contact yet — that IS the "needs a contact" row.
  for (const g of ["IFC", "Panhellenic", "NPHC", "MGC"]) ensure("council", g, `${g === "IFC" ? "Interfraternity" : g === "Panhellenic" ? "Panhellenic" : g === "NPHC" ? "National Pan-Hellenic" : "Multicultural Greek"} Council`, COUNCIL_SLUG[g], true);
  ensure("office", "FSL Office", "Fraternity and Sorority Life Office", "", true);
  // Every chapter on the site, under its council.
  for (const ch of chapters) {
    const group = groupOf({ council: ch.council ?? "", orgType: "chapter" });
    ensure("chapter", group, ch.name, ch.slug, true, { letters: ch.letters, nickname: ch.nickname });
  }
  // The contacts, each onto its org (a chapter contact whose chapter is on the site joins that row).
  for (const c of contacts) {
    const group = groupOf(c);
    let o: LinkOrg;
    if (c.orgType === "chapter" || (!c.orgType && c.orgName && !/council|office|life/i.test(c.orgName))) {
      const hit = matchChapter(c.orgName, chapters);
      o = hit
        ? ensure("chapter", groupOf({ council: hit.council ?? "", orgType: "chapter" }), hit.name, hit.slug, true, { letters: hit.letters, nickname: hit.nickname })
        : ensure("chapter", group, c.orgName || "Unnamed chapter", "", false);
    } else if (c.orgType === "office") {
      o = ensure("office", "FSL Office", "Fraternity and Sorority Life Office", "", true);
    } else if (c.orgType === "club") {
      o = ensure("club", "Campus Club", c.orgName || "Campus club", "", false);
    } else {
      const g = COUNCIL_SLUG[group] ? group : "Other";
      o = g === "Other"
        ? ensure("council", "Other", c.orgName || "Council", "", false)
        : ensure("council", g, `${g === "IFC" ? "Interfraternity" : g === "Panhellenic" ? "Panhellenic" : g === "NPHC" ? "National Pan-Hellenic" : "Multicultural Greek"} Council`, COUNCIL_SLUG[g], true);
    }
    if (c.contactKind === "org_inbox" || (!c.contactKind && !c.fullName)) { if (!o.account) o.account = c; else o.people.push(c); }
    else o.people.push(c);
  }
  for (const o of orgs.values()) o.people.sort((a, b) => rankTitle(a.execTitle) - rankTitle(b.execTitle) || a.fullName.localeCompare(b.fullName));
  return [...orgs.values()];
}

/** The org's account handle: its own org_inbox row's org_ig, else any org_ig its people carry. */
export function orgHandle(o: LinkOrg): string {
  return cleanHandle(o.account?.orgIg || o.account?.personalIg || o.people.find((p) => p.orgIg)?.orgIg || "");
}
export const hasChair = (o: LinkOrg): boolean => o.people.some((p) => isChairTitle(p.execTitle));
export const reachable = (o: LinkOrg): boolean => !!orgHandle(o) || o.people.some((p) => !!cleanHandle(p.personalIg));
export const sentCount = (o: LinkOrg): number => [o.account, ...o.people].filter((c) => c && (c.igSentAt || c.dmSentAt || c.dmStatus === "sent")).length;
/** A chapter needs a contact when it has no account handle or no scholarship chair; any other org when nobody is reachable. */
export const needsContact = (o: LinkOrg): boolean => o.kind === "chapter" ? (!orgHandle(o) || !hasChair(o)) : !reachable(o);

/** Search: chapter, person, title, @handle, email, letters. */
export function orgMatches(o: LinkOrg, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [o.name, o.nickname, o.letters, o.group, orgHandle(o), o.account?.email, ...o.people.flatMap((p) => [p.fullName, p.execTitle, p.personalIg, p.email])].join(" ").toLowerCase();
  return needle.split(/\s+/).every((t) => hay.includes(t.replace(/^@/, "")));
}
