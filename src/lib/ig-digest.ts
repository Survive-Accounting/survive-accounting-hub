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
  /** DISTINCT personal (an individual's own) handles on file. Real today: 0 — the scraper
   *  finds ORG accounts only, so every handle in the table belongs to a chapter/council/club,
   *  never to a person, even on a row for a named officer or advisor. Kept as its own field,
   *  not folded into totalOrgIgs, so the day this changes the digest already has a place for it. */
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
    `Total Personal IG's: ${i.totalPersonalIgs.toLocaleString()}`
      + (i.totalPersonalIgs === 0 ? " (not tracked yet — every handle on file is an org's, never a person's)" : ""),
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
