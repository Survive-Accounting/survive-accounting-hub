// Launch Campaign — the pure rules. Two things that must be exactly right and are worth
// testing on their own: WHEN a campaign sends, and WHETHER it may enter the queue.
//
// Because nothing blocks on human review (auto-approve), pre-send validation is what
// makes the delay a formality instead of a gate. Every check names the recipient and the
// fixable problem.

// ── SCHEDULING ──────────────────────────────────────────────────────────────────────
//
// Sends go out at 9:00 AM CT the next business day, never same-day. Saturday is skipped;
// Sunday is allowed. So: tomorrow at 9am CT, and if that's a Saturday, roll to Sunday.

const CHICAGO = "America/Chicago";

/** CT clock offset from UTC in hours for a given instant (-5 CDT / -6 CST). */
function chicagoOffsetHours(at: Date): number {
  const asCt = new Date(at.toLocaleString("en-US", { timeZone: CHICAGO }));
  const asUtc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((asCt.getTime() - asUtc.getTime()) / 3_600_000);
}

/** The CT calendar parts (year, month 1-12, day, weekday 0=Sun) of an instant. */
function chicagoParts(at: Date): { y: number; m: number; d: number; wd: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    wd: wdMap[parts.weekday as string],
  };
}

/** The UTC instant for 09:00 CT on the given CT calendar date, DST-correct. */
function chicago9amUtc(y: number, m: number, d: number): Date {
  // Guess with a fixed offset, then correct once using that day's real offset.
  let guess = new Date(Date.UTC(y, m - 1, d, 9 + 6, 0, 0)); // assume CST (-6)
  const off = chicagoOffsetHours(guess); // -5 or -6
  guess = new Date(Date.UTC(y, m - 1, d, 9 - off, 0, 0));
  return guess;
}

/** Next send time: 9:00 AM CT on the next day, skipping Saturday. */
export function nextBusinessSendTime(now: Date): Date {
  const p = chicagoParts(now);
  // Move to the next CT calendar day (never same-day) via a noon-CT anchor to dodge DST edges.
  const anchor = chicago9amUtc(p.y, p.m, p.d);
  let next = new Date(anchor.getTime() + 24 * 3_600_000);
  let np = chicagoParts(next);
  if (np.wd === 6) {
    // Saturday — roll to Sunday
    next = new Date(next.getTime() + 24 * 3_600_000);
    np = chicagoParts(next);
  }
  return chicago9amUtc(np.y, np.m, np.d);
}

/** Human label for a scheduled time, e.g. "Tuesday 9:00 AM". */
export function sendTimeLabel(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

// ── PRE-SEND VALIDATION ─────────────────────────────────────────────────────────────

export type Channel = "email" | "ig_dm";

export interface CampaignRecipient {
  id: string;
  name: string | null;
  channel: Channel;
  /** email address or instagram handle for the targeted channel. */
  address: string | null;
  subject?: string | null;
  body: string | null;
}

export interface ValidationContext {
  /** Addresses contacted by ANY partner in the last 14 days (lowercased). */
  recentlyContacted: Set<string>;
  campusDailyCount: number;
  campusDailyLimit: number;
  globalDailyCount: number;
  globalDailyLimit: number;
}

export interface ValidationFailure {
  recipientId: string | null;
  recipient: string | null;
  problem: string;
}

const MERGE_FIELD = /\{\{?\s*[a-z0-9_.]+\s*\}?\}/i; // {{chapter_name}} or {chapter_name}

/** Returns the blocking failures. Empty array = clear to queue. */
export function validateCampaign(
  recipients: CampaignRecipient[],
  ctx: ValidationContext,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const seen = new Set<string>();

  for (const r of recipients) {
    const who = r.name || r.address || r.id;
    const addr = (r.address ?? "").trim().toLowerCase();

    // Missing the channel this campaign targets.
    if (!addr) {
      failures.push({
        recipientId: r.id,
        recipient: who,
        problem: `${who} has no ${r.channel === "email" ? "email address" : "Instagram handle"} for this ${r.channel === "email" ? "email" : "DM"} campaign.`,
      });
      continue;
    }

    // Unresolved merge field in subject or body.
    const text = `${r.subject ?? ""}\n${r.body ?? ""}`;
    if (MERGE_FIELD.test(text)) {
      const m = text.match(MERGE_FIELD)?.[0] ?? "a merge field";
      failures.push({
        recipientId: r.id,
        recipient: who,
        problem: `${who}'s message still has an unresolved field ${m}.`,
      });
    }

    // Duplicate recipient inside the campaign.
    if (seen.has(addr)) {
      failures.push({
        recipientId: r.id,
        recipient: who,
        problem: `${who} (${addr}) appears more than once in this campaign.`,
      });
    }
    seen.add(addr);

    // Contacted by any partner in the last 14 days.
    if (ctx.recentlyContacted.has(addr)) {
      failures.push({
        recipientId: r.id,
        recipient: who,
        problem: `${who} (${addr}) was already contacted by a partner in the last 14 days.`,
      });
    }
  }

  // Daily send limits — campus, then global.
  const n = recipients.length;
  if (ctx.campusDailyCount + n > ctx.campusDailyLimit) {
    failures.push({
      recipientId: null,
      recipient: null,
      problem: `This campaign (${n}) would put the campus over its daily send limit of ${ctx.campusDailyLimit} (already ${ctx.campusDailyCount}).`,
    });
  }
  if (ctx.globalDailyCount + n > ctx.globalDailyLimit) {
    failures.push({
      recipientId: null,
      recipient: null,
      problem: `This campaign (${n}) would exceed the global daily send limit of ${ctx.globalDailyLimit} (already ${ctx.globalDailyCount}).`,
    });
  }

  return failures;
}

/** Recipient counts by channel — for the "14 emails, 6 DMs" confirmation line. */
export function countByChannel(recipients: { channel: Channel }[]): { emails: number; dms: number } {
  return {
    emails: recipients.filter((r) => r.channel === "email").length,
    dms: recipients.filter((r) => r.channel === "ig_dm").length,
  };
}
