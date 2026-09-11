// THE DM SCHEDULE (2026-09-11) — which contacts get a DM on which day, who sends them, and the
// hand-off email to King. Pure and client-safe; the store is lib/dm-schedule.functions.ts.
//
// Lee: "on /links, set up each of these days in the schedule and I'll get to work grabbing the
// contacts for each DM … the goal is for me to build schedules myself in the future, and assign
// them to King. When I assign them to King, I'd like to have an email template pop out."
import { COUNCIL_SLUG, type LinkOrg, type OrgKind } from "@/lib/outreach-links";

export type DmOwner = "lee" | "king";

export interface DmItem {
  id: string;
  /** campuses.slug */
  campus: string;
  /** LinkOrg.key — resolved against the campus's orgs at render time. */
  orgKey: string;
  /** A specific contact row (uuid); null → the org's default (a council's chair, a chapter's account). */
  contactId: string | null;
  kind: "send" | "follow_up";
  note?: string;
  doneAt?: string | null;
}

export interface DmDay {
  /** YYYY-MM-DD, local to Lee (Central). Also the id. */
  date: string;
  owner: DmOwner;
  /** Free text — "11:30 PM PHT" by default (King's evening). */
  sendAt: string;
  note?: string;
  assignedAt?: string | null;
  items: DmItem[];
}

export interface DmSchedule { days: DmDay[] }

export const DEFAULT_SEND_AT = "11:30 PM PHT";
export const KING_TO = "jking.cim@gmail.com";

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
/** Same key rule as lib/outreach-links buildOrgs. */
export const orgKeyOf = (kind: OrgKind, group: string, name: string): string => `${kind}~${group}~${norm(name)}`;
export const councilName = (group: string): string =>
  `${group === "IFC" ? "Interfraternity" : group === "Panhellenic" ? "Panhellenic" : group === "NPHC" ? "National Pan-Hellenic" : "Multicultural Greek"} Council`;

export const newId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** "Fri 9/11" */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return `${dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${m}/${d}`;
}
export function longDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}
/** Today in Central time, YYYY-MM-DD. */
export function todayCentral(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// ── the first week, as Lee wrote it (2026-09-11) ─────────────────────────────────────────────

const OM = "university-of-mississippi";
const chair = (campus: string, group: string): Omit<DmItem, "id"> => ({ campus, orgKey: orgKeyOf("council", group, councilName(group)), contactId: null, kind: "send" });
const chapter = (campus: string, group: string, name: string): Omit<DmItem, "id"> => ({ campus, orgKey: orgKeyOf("chapter", group, name), contactId: null, kind: "send" });
const followUp = (note: string): Omit<DmItem, "id"> => ({ campus: OM, orgKey: "", contactId: null, kind: "follow_up", note });

export function seedSchedule(): DmSchedule {
  const mk = (date: string, owner: DmOwner, items: Array<Omit<DmItem, "id">>, note?: string): DmDay =>
    ({ date, owner, sendAt: DEFAULT_SEND_AT, note, assignedAt: null, items: items.map((i) => ({ ...i, id: newId() })) });
  return {
    days: [
      mk("2026-09-11", "lee", [
        chair(OM, "IFC"),
        ...["Sigma Chi", "Sigma Nu", "Phi Kappa Psi", "Phi Delta Theta", "Alpha Tau Omega", "Delta Psi", "Sigma Pi", "Delta Kappa Epsilon", "Kappa Sigma"].map((n) => chapter(OM, "IFC", n)),
      ], "IFC scholarship chair (personal IG), then the chapter accounts."),
      mk("2026-09-12", "lee", [
        chair(OM, "NPHC"),
        ...["Alpha Phi Alpha", "Kappa Alpha Psi", "Omega Psi Phi", "Phi Beta Sigma", "Iota Phi Theta", "Alpha Kappa Alpha", "Delta Sigma Theta", "Zeta Phi Beta", "Sigma Gamma Rho"].map((n) => chapter(OM, "NPHC", n)),
      ], "NPHC scholarship chair (personal IG), then the chapter accounts."),
      mk("2026-09-13", "lee", [
        chair(OM, "Panhellenic"),
        ...["Kappa Kappa Gamma", "Delta Gamma", "Phi Mu", "Kappa Delta", "Chi Omega", "Delta Delta Delta", "Alpha Phi", "Alpha Delta Pi", "Alpha Omicron Pi"].map((n) => chapter(OM, "Panhellenic", n)),
      ], "Panhellenic scholarship chair (personal IG), then the chapter accounts."),
      mk("2026-09-14", "lee", [
        { ...chair(OM, "IFC"), kind: "follow_up" }, { ...chair(OM, "Panhellenic"), kind: "follow_up" }, { ...chair(OM, "NPHC"), kind: "follow_up" },
        ...Array.from({ length: 7 }, (_, i) => followUp(`Follow-up ${i + 1}: an Ole Miss scholarship chair (pick from replies)`)),
      ], "The three Ole Miss council chairs, then seven follow-ups to chapter scholarship chairs."),
      mk("2026-09-15", "lee", [
        { ...chapter("louisiana-state-university", "IFC", "LSU fraternity (pick one)"), orgKey: "" , note: "LSU fraternity — pick one" },
        { ...chapter("louisiana-state-university", "Panhellenic", "LSU sorority (pick one)"), orgKey: "", note: "LSU sorority — pick one" },
        { ...chapter("university-of-tennessee-knoxville", "IFC", "Tennessee fraternity (pick one)"), orgKey: "", note: "Tennessee fraternity — pick one" },
        { ...chapter("university-of-tennessee-knoxville", "Panhellenic", "Tennessee sorority (pick one)"), orgKey: "", note: "Tennessee sorority — pick one" },
        ...Array.from({ length: 6 }, (_, i) => followUp(`Follow-up ${i + 1}: an Ole Miss IFC / Panhellenic scholarship chair`)),
      ], "One LSU fraternity, one LSU sorority, one Tennessee fraternity, one Tennessee sorority, then follow-ups."),
      mk("2026-09-16", "lee", [], "TBD — follow-ups."),
      mk("2026-09-17", "lee", [], "TBD — follow-ups."),
    ],
  };
}

// ── the hand-off email ───────────────────────────────────────────────────────────────────────

export interface AssignmentPreview { handle: string; org: string; dm: string }

export function assignmentSubject(day: DmDay, count: number): string {
  const [, m, d] = day.date.split("-").map(Number);
  return `SURVIVE ACCOUNTING: ${count} DM${count === 1 ? "" : "s"} to Send ${m}/${d} at ${day.sendAt}`;
}

export function assignmentText(day: DmDay, previews: AssignmentPreview[]): string {
  const link = `https://surviveaccounting.com/links?day=${day.date}`;
  const list = previews.map((p, i) => `${i + 1}. ${p.handle ? `@${p.handle}` : "(no handle yet)"} — ${p.org}\n\n${p.dm}`).join("\n\n— — —\n\n");
  return [
    `Hey King — here's ${longDayLabel(day.date)}'s list: ${previews.length} DM${previews.length === 1 ? "" : "s"}, send at ${day.sendAt}.`,
    "",
    `Go to this link (it opens that day's schedule):`,
    link,
    "",
    "For each contact: click Copy DM, click Open DM (it opens the Instagram thread), paste, send, then Mark sent. I will monitor replies and keep you updated.",
    day.note ? `\nNotes: ${day.note}` : "",
    "",
    "Preview of the DMs you're sending, for context:",
    "",
    list,
    "",
    "Thanks!",
    "— Lee",
  ].join("\n");
}

/** Which contact on an org a schedule item means: a council's scholarship chair (personal IG),
 *  else the council account; a chapter's account, else its chair. */
export function defaultContactFor(org: LinkOrg): { contact: LinkOrg["account"]; isOrg: boolean } {
  if (org.kind === "council" || org.kind === "office") {
    const chairP = org.people.find((p) => /scholar|academ/i.test(p.execTitle)) ?? null;
    if (chairP) return { contact: chairP, isOrg: false };
    return { contact: org.account, isOrg: true };
  }
  if (org.account) return { contact: org.account, isOrg: true };
  const chairP = org.people.find((p) => /scholar|academ/i.test(p.execTitle)) ?? org.people[0] ?? null;
  return { contact: chairP, isOrg: false };
}

export const COUNCIL_GROUPS = Object.keys(COUNCIL_SLUG);
