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
  /** Handles on file across every campus, after yesterday. */
  totalOnFile: number;
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

export function composeIgDigest(i: IgDigestInput): IgDigest {
  const total = i.byCampus.reduce((n, c) => n + c.n, 0);
  const who = i.byWho.length ? " (" + i.byWho.map((w) => `${firstName(w.who)} ${w.n}`).join(", ") + ")" : "";
  const topCampuses = i.byCampus.slice(0, 3).map((c) => `${c.campus} ${c.n}`).join(", ");
  const subject = total === 0 ? `No new IG handles ${i.dayLabel}` : `${total} new IG handle${total === 1 ? "" : "s"} ${i.dayLabel}`;
  const sms = total === 0
    ? `IG · ${i.dayLabel}: no new handles · ${i.totalOnFile.toLocaleString()} on file`
    : `IG · ${i.dayLabel}: ${total} new handle${total === 1 ? "" : "s"}${who} · ${topCampuses} · ${i.totalOnFile.toLocaleString()} on file`;
  const lines = [
    subject + ".",
    "",
    ...(i.byWho.length ? ["Added by", ...i.byWho.map((w) => `  ${firstName(w.who)}  ${w.n}`), ""] : []),
    ...(i.byCampus.length ? ["By campus", ...i.byCampus.map((c) => `  ${c.campus}  ${c.n}`), ""] : []),
    `${i.totalOnFile.toLocaleString()} handles on file across every campus.`,
    "",
    i.dashboardUrl,
  ];
  return { subject, sms, text: lines.join("\n"), total };
}
