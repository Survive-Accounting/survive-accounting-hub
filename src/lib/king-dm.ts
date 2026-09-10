// THE DM CONSOLE — pure helpers. No network, no React, deterministic.
//
// One page King can work from start to finish: the three campuses we are on now, the Florida
// cluster greyed out behind them, and a day's DM list that rebuilds itself every morning.
//
// WHY A ROLLING PLAN AND NOT A CALENDAR. The old "Upcoming Sends" surface laid a whole semester
// out in advance, so the moment a week slipped the schedule was fiction and King was reading a
// plan nobody was following. Today's list is DERIVED from the same rows the board already has —
// what is unsent, what is due a follow-up — so it can never go stale. Miss a day and the work
// is simply still there tomorrow.

/** A campus the DM console works, in the order Lee wants them worked. */
export interface TargetCampus {
  /** campuses.slug — the join key. Ids are regenerated per deploy; slugs are stable. */
  slug: string;
  label: string;
  stage: "active" | "upcoming";
  /** Groups the greyed-out rows under one heading. */
  cluster: string | null;
}

/** Ole Miss, LSU and Tennessee are live. The Florida cluster is next and shows greyed out — it is
 *  on the page so King can see where this is going, not so he can start on it. */
export const TARGET_CAMPUSES: readonly TargetCampus[] = [
  { slug: "university-of-mississippi", label: "Ole Miss", stage: "active", cluster: null },
  { slug: "louisiana-state-university", label: "LSU", stage: "active", cluster: null },
  { slug: "university-of-tennessee-knoxville", label: "Tennessee", stage: "active", cluster: null },
  { slug: "florida-international-university", label: "Florida International", stage: "upcoming", cluster: "Florida cluster" },
  { slug: "university-of-central-florida", label: "Central Florida", stage: "upcoming", cluster: "Florida cluster" },
  { slug: "university-of-south-florida", label: "South Florida", stage: "upcoming", cluster: "Florida cluster" },
  { slug: "florida-atlantic-university", label: "Florida Atlantic", stage: "upcoming", cluster: "Florida cluster" },
  { slug: "university-of-florida", label: "Florida", stage: "upcoming", cluster: "Florida cluster" },
  { slug: "florida-gulf-coast-university", label: "Florida Gulf Coast", stage: "upcoming", cluster: "Florida cluster" },
];

export const ACTIVE_SLUGS = TARGET_CAMPUSES.filter((c) => c.stage === "active").map((c) => c.slug);
export const UPCOMING_SLUGS = TARGET_CAMPUSES.filter((c) => c.stage === "upcoming").map((c) => c.slug);

// ---- the day's plan --------------------------------------------------------------------------

/** How long we leave a DM alone before it earns a nudge, and how many nudges it ever gets. */
export const FOLLOW_UP_AFTER_DAYS = 3;
export const MAX_FOLLOW_UPS = 2;
/** Default DMs per day. King can move it on the page; this is the number the plan opens with. */
export const DEFAULT_DAILY_TARGET = 20;

export interface PlannableContact {
  contactId: string;
  campusSlug: string;
  /** Sort weight — bigger chapters first. null sorts last. */
  size: number | null;
  sentAt: string | null;
  repliedAt: string | null;
  /** How many messages WE have put in the thread. 1 = the opener only. */
  outboundCount: number;
}

export type PlanReason = "new" | "follow_up";
export interface PlanItem {
  contactId: string;
  campusSlug: string;
  reason: PlanReason;
  /** Whole days since the opener went out. Only set on a follow-up. */
  daysSince?: number;
}

const dayMs = 86_400_000;
/** Whole days between two instants, floored. Negative clamps to 0. */
export function daysBetween(fromIso: string, to: Date): number {
  const t = new Date(fromIso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((to.getTime() - t) / dayMs));
}

/** Is this contact owed a nudge? Sent, never replied, quiet long enough, not already nudged out. */
export function followUpDue(c: PlannableContact, now: Date): boolean {
  if (!c.sentAt || c.repliedAt) return false;
  if (c.outboundCount > MAX_FOLLOW_UPS) return false;
  return daysBetween(c.sentAt, now) >= FOLLOW_UP_AFTER_DAYS;
}

/** Today's list. Follow-ups first — someone who already saw a message is warmer than a stranger —
 *  then new chapters biggest-first. Campuses interleave round-robin so a big campus cannot eat the
 *  whole day and leave the other two untouched. */
export function planForDay(
  contacts: readonly PlannableContact[],
  opts: { now: Date; dailyTarget?: number; campusOrder?: readonly string[] },
): PlanItem[] {
  const target = Math.max(1, opts.dailyTarget ?? DEFAULT_DAILY_TARGET);
  const order = opts.campusOrder ?? ACTIVE_SLUGS;
  const rank = (slug: string) => { const i = order.indexOf(slug); return i === -1 ? order.length : i; };

  const follow: PlanItem[] = [];
  const fresh: PlanItem[] = [];
  for (const c of contacts) {
    if (c.repliedAt) continue;                       // they answered: it is a conversation, not a task
    if (followUpDue(c, opts.now)) {
      follow.push({ contactId: c.contactId, campusSlug: c.campusSlug, reason: "follow_up", daysSince: daysBetween(c.sentAt!, opts.now) });
    } else if (!c.sentAt) {
      fresh.push({ contactId: c.contactId, campusSlug: c.campusSlug, reason: "new" });
    }
  }

  const sizeOf = new Map(contacts.map((c) => [c.contactId, c.size ?? -1]));
  follow.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0) || rank(a.campusSlug) - rank(b.campusSlug));
  fresh.sort((a, b) => rank(a.campusSlug) - rank(b.campusSlug) || (sizeOf.get(b.contactId)! - sizeOf.get(a.contactId)!));

  // Round-robin the new ones across campuses so every active campus moves every day.
  const byCampus = new Map<string, PlanItem[]>();
  for (const item of fresh) {
    const list = byCampus.get(item.campusSlug) ?? [];
    list.push(item);
    byCampus.set(item.campusSlug, list);
  }
  const queues = [...byCampus.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([, v]) => v);
  const interleaved: PlanItem[] = [];
  for (let i = 0; queues.some((q) => q.length > i); i++) {
    for (const q of queues) if (q[i]) interleaved.push(q[i]);
  }

  return [...follow, ...interleaved].slice(0, target);
}

// ---- the roster paste / import --------------------------------------------------------------

/** One row of the bulk paste. A row is either a COUNCIL row (no chapter) or a CHAPTER row.
 *  Everything except the handle columns is optional, because half a row is still worth keeping. */
export interface RosterRow {
  council: string;          // ifc | panhellenic | nphc | mgc | fsl
  chapter: string;          // "" for a council-level row
  orgIg: string;            // the chapter's or council's own account
  presidentName: string;
  presidentIg: string;
  chairName: string;
  chairIg: string;
  /** Line number in the pasted text, for reporting a bad row back. */
  line: number;
}

const COUNCIL_ALIASES: Record<string, string> = {
  ifc: "ifc", interfraternity: "ifc", fraternity: "ifc", frat: "ifc",
  panhellenic: "panhellenic", panhel: "panhellenic", cpc: "panhellenic", npc: "panhellenic", sorority: "panhellenic",
  nphc: "nphc", divine9: "nphc", d9: "nphc",
  mgc: "mgc", multicultural: "mgc",
  fsl: "fsl", greeklife: "fsl", greek: "fsl",
};

/** Map anything a human might type into the council key the tables use. */
export function councilKeyOf(raw: string | null | undefined): string | null {
  const k = (raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return COUNCIL_ALIASES[k] ?? null;
}

/** The bare instagram handle from a handle, an @handle or a full URL.
 *  ANCHORED AT BOTH ENDS: unanchored, this matches the tail of any string, so a name landing in a
 *  handle column would silently become a handle ("John Smith" → "smith"). Not a handle ⇒ "". */
export function bareIg(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s || s === "-") return "";
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/)?@?([A-Za-z0-9._]{2,40})\/?$/);
  return m ? m[1].toLowerCase() : "";
}

export const ROSTER_HEADERS = ["Council", "Chapter", "Org IG", "President", "President IG", "Scholarship Chair", "Chair IG"] as const;

/** Header cell → field, so a pasted sheet can carry its columns in any order. */
const HEADER_MAP: Record<string, keyof RosterRow> = {
  council: "council", chapter: "chapter", org: "orgIg", orgig: "orgIg", chapterig: "orgIg", handle: "orgIg", instagram: "orgIg",
  president: "presidentName", presidentname: "presidentName", presidentig: "presidentIg", presig: "presidentIg",
  scholarshipchair: "chairName", chair: "chairName", chairname: "chairName", scholarship: "chairName",
  chairig: "chairIg", scholarshipchairig: "chairIg", scholarshipig: "chairIg",
};

const splitCells = (line: string): string[] =>
  (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

const normHeader = (c: string) => c.toLowerCase().replace(/[^a-z]/g, "");

/** Parse pasted or imported roster text. Accepts tab- or comma-separated, with or without a header
 *  row; without one, columns are read in ROSTER_HEADERS order. Blank lines and rows carrying no
 *  handle at all are dropped — a chapter with no account yet is not a contact. */
export function parseRoster(text: string): { rows: RosterRow[]; skipped: number } {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  if (!lines.length) return { rows: [], skipped: 0 };

  const first = splitCells(lines[0]).map(normHeader);
  const hasHeader = first.some((c) => c === "council" || c === "chapter") && first.some((c) => HEADER_MAP[c] === "orgIg" || HEADER_MAP[c] === "presidentIg" || HEADER_MAP[c] === "chairIg");
  const order: (keyof RosterRow | null)[] = hasHeader
    ? first.map((c) => HEADER_MAP[c] ?? null)
    : (["council", "chapter", "orgIg", "presidentName", "presidentIg", "chairName", "chairIg"] as (keyof RosterRow)[]);

  const rows: RosterRow[] = [];
  let skipped = 0;
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    const row: RosterRow = { council: "", chapter: "", orgIg: "", presidentName: "", presidentIg: "", chairName: "", chairIg: "", line: i + 1 };
    order.forEach((field, idx) => {
      if (!field || field === "line") return;
      const v = cells[idx] ?? "";
      if (field === "orgIg" || field === "presidentIg" || field === "chairIg") row[field] = bareIg(v);
      else if (field === "council") row.council = councilKeyOf(v) ?? "";
      else row[field] = v.trim();
    });
    if (!row.orgIg && !row.presidentIg && !row.chairIg) { skipped++; continue; }
    if (!row.council) { skipped++; continue; }
    rows.push(row);
  }
  return { rows, skipped };
}

/** What one parsed row will actually write: up to three contacts, each with its role. */
export interface RosterContact {
  council: string;
  chapter: string;          // "" = council-level
  slot: "org" | "pres" | "chair";
  role: string;
  name: string;
  handle: string;
  isOrg: boolean;
}

export function contactsFromRow(r: RosterRow): RosterContact[] {
  const out: RosterContact[] = [];
  const base = { council: r.council, chapter: r.chapter };
  if (r.orgIg) out.push({ ...base, slot: "org", role: r.chapter ? "Chapter account" : "Council account", name: "", handle: r.orgIg, isOrg: true });
  if (r.presidentIg) out.push({ ...base, slot: "pres", role: "President", name: r.presidentName, handle: r.presidentIg, isOrg: false });
  if (r.chairIg) out.push({ ...base, slot: "chair", role: "Scholarship Chair", name: r.chairName, handle: r.chairIg, isOrg: false });
  return out;
}

/** A blank sheet for King to fill in, one line per chapter we already know about. */
export function rosterTemplate(chapters: readonly { council: string; name: string }[]): string {
  const header = ROSTER_HEADERS.join(",");
  const body = chapters.map((c) => [c.council, c.name, "", "", "", "", ""].join(","));
  return [header, ...body].join("\n");
}
