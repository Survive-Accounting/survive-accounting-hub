// THE DAILY IG DIGEST — pure: the numbers in, the text out. The cron route does the reading
// and the sending. Lee (2026-09-05): "a daily text and email that shares how many new IG's
// were added previous day". Daily even when the answer is zero — it is a pulse, not an alert.

export interface IgDigestInput {
  /** The day the numbers are for, already formatted for people ("Thu Sep 4"). */
  dayLabel: string;
  /** New handles yesterday, per campus, highest first. */
  byCampus: { campus: string; n: number }[];
  /** New handles yesterday, per person who added them, highest first. */
  byWho: { who: string; n: number }[];
  /** DISTINCT organization (chapter/council/club) Instagram handles on file, normalized —
   *  a chapter counted once no matter how many contact rows carry its account. */
  totalOrgIgs: number;
  /** DISTINCT personal (a named officer's own) handles on file — see classifyIgHandles below
   *  for exactly what counts. Real, not a placeholder: council officers Lee and King hand-enter
   *  (scholarship chairs, presidents) often have their own account on file, separate from the
   *  council's. The bulk-scraped chapter accounts never do — that path only ever finds a
   *  chapter's own page. */
  totalPersonalIgs: number;
  /** Campuses with at least one org IG on file, of campuses touched at all (any contact row). */
  campusesCovered: number;
  campusesTotal: number;
  /** Orgs (chapters/councils/clubs) with at least one IG on file, of orgs touched at all. */
  orgsCovered: number;
  orgsTotal: number;
  dashboardUrl: string;
}

export interface IgDigest { subject: string; sms: string; text: string; total: number }

function firstName(who: string): string {
  const local = who.split("@")[0] ?? who;
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : who;
}

/** Yesterday in America/Chicago, as "YYYY-MM-DD" plus a label — the digest's day, DST-proof. */
export function chicagoYesterday(now: Date): { ymd: string; label: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const todayUtcNoon = Date.UTC(get("year"), get("month") - 1, get("day"), 12);
  const y = new Date(todayUtcNoon - 864e5);
  const ymd = y.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(y);
  return { ymd, label };
}

/** The UTC instant of local midnight in a time zone for a "YYYY-MM-DD" — found by measuring the
 *  zone's offset at that date rather than assuming one, so a DST change day is still right. */
export function zoneMidnightUtc(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const asZone = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const g = (t: string) => Number(asZone.find((p) => p.type === t)?.value);
  const zoneMs = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  const offset = zoneMs - guess;          // how far ahead/behind the zone is at that instant
  return new Date(guess - offset);
}

/** "76%", or "n/a" when there is nothing to divide by yet — never a NaN or an Infinity. */
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "n/a";
}

/** ORG vs PERSONAL (2026-09-05, corrected — Lee: "we are getting personal IG's, no?" — he was
 *  right; the first cut of this digest missed them entirely).
 *
 *  Two very different pipelines feed growth_contact_qc:
 *   - the automated chapter scraper (contact_source "growth_public_contacts" /
 *     "growth_business_clubs") only ever FINDS a chapter's own social page — it has no way to
 *     find an individual's account, and `ig_role_account` is never set true or false with
 *     intent there (it just carries the column's default). Every handle from this path is an
 *     org account.
 *   - hand-entered council officers (contact_source "campus_council_contacts" — Lee and King
 *     typing in a scholarship chair or council president from a school's own directory) are the
 *     ONE place `ig_role_account` was ever deliberately reviewed and recorded. A named row
 *     there flagged `ig_role_account: false` is a person's own account, checked by hand.
 *
 *  So: a handle counts as PERSONAL only when it comes from that hand-entered path, has a name
 *  attached, and was reviewed as not a role account. Every other handle — including a named
 *  row anywhere else, and an unreviewed council row — counts as ORG, because nothing ever
 *  confirmed otherwise for it. This undercounts personal accounts a little (a handle could be
 *  personal and simply never reviewed) rather than ever overclaiming one. */
export interface IgRow {
  instagram: string | null;
  name: string | null;
  contactSource: string | null;
  igRoleAccount: boolean | null;
}

export function classifyIgHandles(rows: readonly IgRow[], normalize: (v: string) => string | null): { orgHandles: Set<string>; personalHandles: Set<string> } {
  const all = new Set<string>();
  const personal = new Set<string>();
  for (const r of rows) {
    const h = r.instagram ? normalize(r.instagram) : null;
    if (!h) continue;
    all.add(h);
    if (r.contactSource === "campus_council_contacts" && !!r.name?.trim() && r.igRoleAccount === false) personal.add(h);
  }
  const org = new Set([...all].filter((h) => !personal.has(h)));
  return { orgHandles: org, personalHandles: personal };
}

export function composeIgDigest(i: IgDigestInput): IgDigest {
  const total = i.byCampus.reduce((n, c) => n + c.n, 0);
  const who = i.byWho.length ? " (" + i.byWho.map((w) => `${firstName(w.who)} ${w.n}`).join(", ") + ")" : "";
  const topCampuses = i.byCampus.slice(0, 3).map((c) => `${c.campus} ${c.n}`).join(", ");
  const subject = total === 0 ? `No new IG handles ${i.dayLabel}` : `${total} new IG handle${total === 1 ? "" : "s"} ${i.dayLabel}`;
  const sms = `IG · ${i.dayLabel}: ${total === 0 ? "no new handles" : `${total} new${who}`}${topCampuses ? " · " + topCampuses : ""}`
    + ` · Org IGs ${i.totalOrgIgs.toLocaleString()} · Campuses ${i.campusesCovered}/${i.campusesTotal} (${pct(i.campusesCovered, i.campusesTotal)})`
    + ` · Orgs ${i.orgsCovered.toLocaleString()}/${i.orgsTotal.toLocaleString()} (${pct(i.orgsCovered, i.orgsTotal)})`;
  const lines = [
    subject + ".",
    "",
    `Total Org IG's: ${i.totalOrgIgs.toLocaleString()}`,
    `Total Personal IG's: ${i.totalPersonalIgs.toLocaleString()}`,
    "",
    `Campuses Covered vs Remaining: ${i.campusesCovered}/${i.campusesTotal} (${pct(i.campusesCovered, i.campusesTotal)})`,
    `Orgs Covered vs Remaining: ${i.orgsCovered.toLocaleString()}/${i.orgsTotal.toLocaleString()} (${pct(i.orgsCovered, i.orgsTotal)})`,
    "",
    `IG's found yesterday: ${total}`,
    ...(i.byWho.length ? ["Added by", ...i.byWho.map((w) => `  ${firstName(w.who)}  ${w.n}`), ""] : []),
    ...(i.byCampus.length ? ["By campus", ...i.byCampus.map((c) => `  ${c.campus}  ${c.n}`), ""] : []),
    i.dashboardUrl,
  ];
  return { subject, sms, text: lines.join("\n"), total };
}
