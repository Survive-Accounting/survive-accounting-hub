// growth-schedule-core.ts — the pure schedule engine. No IO. Turns a sender's campuses (with
// their contacts) plus the log of what's already been sent into a dated, per-day plan of
// cross-channel SEQUENCES. One sequence = one contact reached on every channel we hold for them,
// on the same day, with a follow-up seven days later if they don't reply.
//
// The plan is derived, never stored: enrichment adding a contact fills a gap on the next read.
// Everything here is deterministic given (campuses, contacts, touches, dates) so a single week
// can be computed on its own and still agree with its neighbours.

export const SEASON_START = "2026-09-01";
export const SEASON_END = "2026-12-12";
export const HANDOFF_DATE = "2026-09-13"; // King takes over; Lee drops off the schedule
export const FOLLOWUP_SHARE = 0.3; // follow-ups eat 30% of each track's daily budget
export const FOLLOWUP_START = "2026-09-08"; // day 8 — week one runs at full new-contact volume
export const FOLLOWUP_ELIGIBLE_DAYS = 7; // no reply after 7 days → eligible
export const FOLLOWUP_AGEOUT_DAYS = 21; // never scheduled by day 21 → dropped, not queued
export const ORG_COOLDOWN_DAYS = 14; // an org touched in the last 14 days can't be scheduled
export const REPLY_SUPPRESS_DAYS = 7; // a reply suppresses the whole org for 7 days

export type Sender = "lee" | "king";
export type Track = "dm" | "email"; // the two capacity tracks; story_reply is a send-time DM variant
export type Kind = "new" | "follow_up";

interface Ramp { from: string; dm: number; email: number }
const RAMP: Ramp[] = [
  { from: "2026-09-01", dm: 10, email: 25 }, // Lee, manual, inboxes warming
  { from: "2026-09-13", dm: 15, email: 100 }, // King, Instantly live
  { from: "2026-09-20", dm: 20, email: 100 }, // DM ceiling
];

// ── dates (explicit strings only; no Date.now / argless new Date) ────────────────────────
export const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const toYmd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number) => { const d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return toYmd(d); };
export const dowOf = (s: string) => parseYmd(s).getUTCDay(); // 0 Sun … 6 Sat
export const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
export const isSendingDay = (s: string) => dowOf(s) !== 6; // Saturday off
export function sendingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isSendingDay(d)) out.push(d);
  return out;
}
/** Monday-based week start for grouping (Sun belongs to the week that just started Sunday). */
export function weekStartOf(s: string): string {
  // Weeks run Sunday→Friday (Sat off). Anchor each week on its Sunday.
  const back = dowOf(s); // Sun=0 → already the anchor
  return addDays(s, -back);
}
export function seasonWeeks(): { start: string; end: string; index: number }[] {
  const weeks: { start: string; end: string; index: number }[] = [];
  let cur = weekStartOf(SEASON_START);
  let i = 1;
  while (cur <= SEASON_END) { weeks.push({ start: cur, end: addDays(cur, 6), index: i++ }); cur = addDays(cur, 7); }
  return weeks;
}
export const senderFor = (date: string): Sender => (date < HANDOFF_DATE ? "lee" : "king");
export function capsFor(date: string): { dm: number; email: number } {
  let r = RAMP[0];
  for (const row of RAMP) if (date >= row.from) r = row;
  return { dm: r.dm, email: r.email };
}
export const followupBudget = (cap: number) => Math.round(cap * FOLLOWUP_SHARE);

// ── contacts, orgs, targets ──────────────────────────────────────────────────────────────
export type OrgKind = "council" | "chapter" | "club";
export interface SchedContact {
  id: string;
  isPerson: boolean;
  isRoleAccount: boolean;
  name: string | null;
  role: string | null;
  email: string | null;
  instagram: string | null;
  prewarmedAt: string | null;
  igFollowed: boolean;
  igLiked: boolean;
}
export interface SchedOrg {
  orgKey: string; // council:ifc | chapter:<uuid> | club:<uuid>
  kind: OrgKind;
  label: string;
  councilType: string | null; // fsl/ifc/panhellenic/nphc/mgc when council
  orgType: "fraternity" | "sorority" | "other" | null; // chapters
  rank: number | null; // chapter rank within type
  needed: boolean; // top-5 chapter / any council / any club
  contacts: SchedContact[];
}
export interface SchedCampus {
  campusId: string;
  name: string;
  priority: number | null; // outreach send-order; lower first, null last
  orgs: SchedOrg[];
}
export interface PriorTouch {
  id: string;
  campusId: string;
  orgKey: string;
  contactId: string | null;
  channel: "dm" | "story_reply" | "email";
  kind: Kind;
  scheduledDate: string;
  sentAt: string | null;
  repliedAt: string | null;
  outcome: string | null;
}

// A resolved channel for a contact — what we'd actually send on.
export interface ChannelPlan { track: Track; kind: "personal_ig" | "personal_email" | "org_ig" | "org_email" | "office_email"; handle: string }

// Channel priority (S2). Highest available first. Personal IG always outranks any email.
export function rankChannels(org: SchedOrg): { contact: SchedContact; channels: ChannelPlan[] } | null {
  // Person outranks org (S5): pick the best person; only fall back to an org account if none.
  const persons = org.contacts.filter((c) => c.isPerson);
  const orgs = org.contacts.filter((c) => !c.isPerson);
  const pick = persons.length ? persons : orgs;
  if (!pick.length) return null;
  // Best contact: prefer one with a personal IG, then one with email.
  const chosen =
    pick.find((c) => c.instagram) ?? pick.find((c) => c.email) ?? pick[0];
  const isPerson = chosen.isPerson;
  const isOffice = org.councilType === "fsl";
  const channels: ChannelPlan[] = [];
  if (chosen.instagram) channels.push({ track: "dm", kind: isPerson ? "personal_ig" : "org_ig", handle: chosen.instagram });
  if (chosen.email) channels.push({ track: "email", kind: isPerson ? "personal_email" : isOffice ? "office_email" : "org_email", handle: chosen.email });
  if (!channels.length) return null;
  // Preferred channel first: personal IG > personal email > org IG > org email > office email.
  const order = ["personal_ig", "personal_email", "org_ig", "org_email", "office_email"];
  channels.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { contact: chosen, channels };
}

// ── the plan ─────────────────────────────────────────────────────────────────────────────
export interface SeqItem {
  order: number; // position in the day's priority-ordered fill (items + gaps share one sequence)
  date: string;
  campusId: string;
  campusName: string;
  orgKey: string;
  orgKind: OrgKind;
  orgLabel: string;
  roleTarget: string; // scholarship_chair | council_officer | chapter_exec | chapter_account | club | office
  kind: Kind;
  // resolved contact + channels, or null when this is a work-order gap
  contactId: string | null;
  contactName: string | null;
  contactRole: string | null;
  channels: ChannelPlan[];
  singleChannel: boolean; // budget forced one channel
  prewarmedAt: string | null;
  igFollowed: boolean;
  igLiked: boolean;
  followUpDate: string | null; // when a follow-up would fire if no reply
  gapLabel: string | null; // set when there's no contact — the work order text
}
export interface DayPlan {
  date: string;
  sender: Sender;
  dmCap: number;
  emailCap: number;
  items: SeqItem[]; // sequences scheduled this day (each may occupy dm and/or email)
  gaps: SeqItem[]; // targeted (campus, role) with no contact — work orders
}

// Role priority for follow-up ranking (lower = higher priority).
const ROLE_RANK: Record<string, number> = { scholarship_chair: 0, council_officer: 1, office: 1, chapter_exec: 2, chapter_account: 3, club: 4 };
const isScholarship = (role: string | null) => !!role && /scholar|academ/i.test(role);

function roleTargetFor(org: SchedOrg, contact: SchedContact | null): string {
  if (org.kind === "club") return "club";
  if (org.kind === "council") {
    if (org.councilType === "fsl") return "office";
    if (contact && isScholarship(contact.role)) return "scholarship_chair";
    return "council_officer";
  }
  // chapter
  return contact?.isPerson ? "chapter_exec" : "chapter_account";
}

// Ordering of a campus's orgs for scheduling: councils (fsl,ifc,panhel,nphc,mgc), then top-5
// chapters by rank, then the rest, then clubs. Stable so adding a contact doesn't reshuffle.
const COUNCIL_ORDER = ["fsl", "ifc", "panhellenic", "nphc", "mgc"];
export function orderedOrgs(c: SchedCampus): SchedOrg[] {
  const councils = c.orgs.filter((o) => o.kind === "council").sort((a, b) => COUNCIL_ORDER.indexOf(a.councilType ?? "") - COUNCIL_ORDER.indexOf(b.councilType ?? ""));
  const chapters = c.orgs.filter((o) => o.kind === "chapter").sort((a, b) => Number(b.needed) - Number(a.needed) || (a.rank ?? 99) - (b.rank ?? 99));
  const clubs = c.orgs.filter((o) => o.kind === "club");
  return [...councils, ...chapters, ...clubs];
}

// Suppression + cooldown from the touch log. Only touches scheduled STRICTLY BEFORE `date` block:
// a touch dated `date` itself is this day's own send, so marking it sent must not make its row
// vanish from the day it belongs to — cooldown/suppression apply to later days only.
function orgBlockedUntil(touches: PriorTouch[], campusId: string, orgKey: string, date: string): { cooldownUntil: string | null; suppressedUntil: string | null; hostile: boolean } {
  let cooldownUntil: string | null = null;
  let suppressedUntil: string | null = null;
  let hostile = false;
  for (const t of touches) {
    if (t.campusId !== campusId || t.orgKey !== orgKey) continue;
    if (t.scheduledDate >= date) continue; // this-day or future touch doesn't block this day
    if (t.outcome === "hostile") hostile = true;
    if (t.sentAt) { const c = addDays(t.scheduledDate, ORG_COOLDOWN_DAYS); if (!cooldownUntil || c > cooldownUntil) cooldownUntil = c; }
    if (t.repliedAt) { const s = addDays(t.scheduledDate, REPLY_SUPPRESS_DAYS); if (!suppressedUntil || s > suppressedUntil) suppressedUntil = s; }
  }
  return { cooldownUntil, suppressedUntil, hostile };
}

// Follow-up eligibility: a NEW touch, sent, no reply, 7–21 days old, no follow-up yet.
export function followUpsDue(touches: PriorTouch[], onDate: string): { campusId: string; orgKey: string; contactId: string | null }[] {
  const hasFollow = new Set(touches.filter((t) => t.kind === "follow_up").map((t) => `${t.campusId}|${t.orgKey}`));
  const replied = new Set(touches.filter((t) => t.repliedAt).map((t) => `${t.campusId}|${t.orgKey}`));
  const out: { campusId: string; orgKey: string; contactId: string | null; age: number }[] = [];
  for (const t of touches) {
    if (t.kind !== "new" || !t.sentAt) continue;
    const key = `${t.campusId}|${t.orgKey}`;
    if (hasFollow.has(key) || replied.has(key)) continue;
    const age = daysBetween(t.scheduledDate, onDate);
    if (age >= FOLLOWUP_ELIGIBLE_DAYS && age <= FOLLOWUP_AGEOUT_DAYS) out.push({ campusId: t.campusId, orgKey: t.orgKey, contactId: t.contactId, age });
  }
  // de-dupe by org, oldest first (closest to age-out)
  const seen = new Set<string>();
  return out.sort((a, b) => b.age - a.age).filter((x) => { const k = `${x.campusId}|${x.orgKey}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export interface PlanInput {
  from: string; // week start (a Sunday)
  to: string; // week end (Friday+1 fine)
  campuses: SchedCampus[]; // the viewing sender's tranche campuses
  touches: PriorTouch[];
}

// Build the plan for a date range. Campus-depth ordering (all of a campus, then the next) — the
// role-batched IG variant for weeks 1–2 is layered in the UI copy; the engine schedules by campus
// depth which keeps council-forwarding intact and is stable. One org → one sequence per week.
export function planRange(input: PlanInput): DayPlan[] {
  // Clamp to the season so a week whose Sunday falls before Sept 1 (or after Dec 12) doesn't
  // render pre/post-season sending days.
  const from = input.from < SEASON_START ? SEASON_START : input.from;
  const to = input.to > SEASON_END ? SEASON_END : input.to;
  const days = sendingDays(from, to);
  const scheduledOrgThisWeek = new Set<string>(); // campusId|orgKey — one contact per org per week (S4)
  const plans: DayPlan[] = [];

  // Campuses in outreach-priority order (lower first, NULL last, stable within a tie). Then each
  // campus's orgs in their fixed council→chapter→club order. This flat list is THE priority ranking
  // the day-fill deals from.
  const orderedCampuses = [...input.campuses].sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9));
  const targets: { campus: SchedCampus; org: SchedOrg }[] = [];
  for (const campus of orderedCampuses) for (const org of orderedOrgs(campus)) targets.push({ campus, org });

  for (const date of days) {
    const sender = senderFor(date);
    const { dm: dmCap, email: emailCap } = capsFor(date);
    const doFollow = date >= FOLLOWUP_START;
    const dmFollowBudget = doFollow ? followupBudget(dmCap) : 0;
    const emailFollowBudget = doFollow ? followupBudget(emailCap) : 0;
    let dmUsed = 0, emailUsed = 0, dmFollowUsed = 0, emailFollowUsed = 0;
    let seq = 0; // priority position within the day, shared by items and gaps
    const items: SeqItem[] = [];
    const gaps: SeqItem[] = [];

    // 1) Follow-ups first (they have a deadline), within their share.
    if (doFollow) {
      const due = followUpsDue(input.touches, date);
      for (const f of due) {
        if (scheduledOrgThisWeek.has(`${f.campusId}|${f.orgKey}`)) continue;
        const campus = input.campuses.find((c) => c.campusId === f.campusId);
        const org = campus?.orgs.find((o) => o.orgKey === f.orgKey);
        if (!campus || !org) continue;
        const resolved = rankChannels(org);
        if (!resolved) continue;
        const chans = resolved.channels;
        const wantDm = chans.some((c) => c.track === "dm");
        const wantEmail = chans.some((c) => c.track === "email");
        const canDm = wantDm && dmFollowUsed < dmFollowBudget && dmUsed < dmCap;
        const canEmail = wantEmail && emailFollowUsed < emailFollowBudget && emailUsed < emailCap;
        if (!canDm && !canEmail) continue;
        const use = chans.filter((c) => (c.track === "dm" ? canDm : canEmail));
        if (canDm) { dmUsed++; dmFollowUsed++; }
        if (canEmail) { emailUsed++; emailFollowUsed++; }
        scheduledOrgThisWeek.add(`${f.campusId}|${f.orgKey}`);
        items.push(makeItem(seq++, date, campus, org, resolved.contact, use, use.length < chans.length, "follow_up"));
      }
    }

    // 2) New sequences — RE-SCAN the whole priority list each day, filling both tracks up to their
    // caps with real contacts (items) and contactless orgs (gaps, which occupy a slot too). One org
    // per week (scheduledOrgThisWeek). An org that can't fit today's caps is DEFERRED (continue) to a
    // later day, never breaking the day early — so email keeps filling when DM is full, and every
    // slot in the day's budget renders in priority order.
    for (const { campus, org } of targets) {
      if (dmUsed >= dmCap && emailUsed >= emailCap) break;
      const wk = `${campus.campusId}|${org.orgKey}`;
      if (scheduledOrgThisWeek.has(wk)) continue;
      const block = orgBlockedUntil(input.touches, campus.campusId, org.orgKey, date);
      if (block.hostile) continue;
      if (block.cooldownUntil && date < block.cooldownUntil) continue;
      if (block.suppressedUntil && date < block.suppressedUntil) continue;

      const resolved = rankChannels(org);
      if (!resolved) {
        // Work order — a target with no contact. Occupies a slot on its natural channel.
        const natural: Track = org.kind === "council" ? "email" : "dm";
        if (natural === "dm" ? dmUsed >= dmCap : emailUsed >= emailCap) continue; // that track full — another day
        if (natural === "dm") dmUsed++; else emailUsed++;
        scheduledOrgThisWeek.add(wk);
        gaps.push(makeGap(seq++, date, campus, org));
        continue;
      }
      const chans = resolved.channels;
      const wantDm = chans.some((c) => c.track === "dm");
      const wantEmail = chans.some((c) => c.track === "email");
      // Budget (S6): reserve both, or single-channel on the track with room.
      const roomDm = dmUsed < dmCap, roomEmail = emailUsed < emailCap;
      let use: ChannelPlan[] = [];
      if (wantDm && wantEmail) {
        if (roomDm && roomEmail) { use = chans; dmUsed++; emailUsed++; }
        else if (roomDm) { use = chans.filter((c) => c.track === "dm"); dmUsed++; }
        else if (roomEmail) { use = chans.filter((c) => c.track === "email"); emailUsed++; }
        else continue; // both full — a later target with a free track may still fit
      } else if (wantDm) {
        if (!roomDm) continue; // defer to a day with DM room
        use = chans; dmUsed++;
      } else {
        if (!roomEmail) continue; // defer to a day with email room
        use = chans; emailUsed++;
      }
      scheduledOrgThisWeek.add(wk);
      items.push(makeItem(seq++, date, campus, org, resolved.contact, use, use.length < chans.length, "new"));
    }

    plans.push({ date, sender, dmCap, emailCap, items, gaps });
  }
  return plans;
}

function makeItem(order: number, date: string, campus: SchedCampus, org: SchedOrg, contact: SchedContact, channels: ChannelPlan[], single: boolean, kind: Kind): SeqItem {
  return {
    order, date, campusId: campus.campusId, campusName: campus.name, orgKey: org.orgKey, orgKind: org.kind, orgLabel: org.label,
    roleTarget: roleTargetFor(org, contact), kind,
    contactId: contact.id, contactName: contact.name, contactRole: contact.role,
    channels, singleChannel: single,
    prewarmedAt: contact.prewarmedAt, igFollowed: contact.igFollowed, igLiked: contact.igLiked,
    followUpDate: kind === "new" ? addDays(date, FOLLOWUP_ELIGIBLE_DAYS + 3) : null,
    gapLabel: null,
  };
}
function makeGap(order: number, date: string, campus: SchedCampus, org: SchedOrg): SeqItem {
  const roleLabel = org.kind === "council" ? (org.councilType === "fsl" ? "Greek Life / FSL Office" : `${org.label} (officer)`) : org.kind === "chapter" ? org.label : org.label;
  return {
    order, date, campusId: campus.campusId, campusName: campus.name, orgKey: org.orgKey, orgKind: org.kind, orgLabel: org.label,
    roleTarget: roleTargetFor(org, null), kind: "new",
    contactId: null, contactName: null, contactRole: null, channels: [], singleChannel: false,
    prewarmedAt: null, igFollowed: false, igLiked: false, followUpDate: null,
    gapLabel: `${roleLabel} · ${campus.name}`,
  };
}

// Rank a set of gaps by role priority (for the "top N" cut and the enrichment deadline).
export function gapRank(g: SeqItem): number { return ROLE_RANK[g.roleTarget] ?? 5; }
