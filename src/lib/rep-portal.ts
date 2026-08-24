// REP PORTAL — client-safe shared bits (payout schedule + pure helpers). The server functions
// live in rep-portal.functions.ts.
//
// PAYOUT SCHEDULE. Commissions are paid by hand (Venmo) on the 1st of Oct, Nov, Dec and Jan. A
// rep's dashboard shows the next date and what is due then, so "when do I get paid" is never a
// question they have to ask. Dates are the 1st in the site's timezone; we compare by calendar day.
export const PAYOUT_MONTHS = [
  { label: "October 1", month: 9 },   // JS month index (0 = Jan)
  { label: "November 1", month: 10 },
  { label: "December 1", month: 11 },
  { label: "January 1", month: 0 },   // of the following year
] as const;

/** The next payout date on/after `now`, as { label, iso }. January rolls to next year. Given a
 *  fixed "now" (passed in — the server stamps it) so this stays pure and testable. */
export function nextPayout(nowMs: number): { label: string; iso: string } {
  const now = new Date(nowMs);
  const y = now.getUTCFullYear();
  const candidates = [
    { label: "October 1", d: Date.UTC(y, 9, 1) },
    { label: "November 1", d: Date.UTC(y, 10, 1) },
    { label: "December 1", d: Date.UTC(y, 11, 1) },
    { label: "January 1", d: Date.UTC(y + 1, 0, 1) },
    { label: "January 1", d: Date.UTC(y, 0, 1) },   // in case we're in early January
  ].sort((a, b) => a.d - b.d);
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const next = candidates.find((c) => c.d >= todayStart) ?? candidates[candidates.length - 1];
  return { label: next.label, iso: new Date(next.d).toISOString().slice(0, 10) };
}

/** A Venmo handle, normalized to a bare username (strip a leading @ and any venmo.com/ prefix). */
export function normalizeVenmo(raw: string): string {
  return raw.trim().replace(/^https?:\/\/(www\.)?venmo\.com\//i, "").replace(/^@/, "").trim();
}

// ── the dashboard shape ──────────────────────────────────────────────────────────────────────
export type RepLinkStat = {
  code: string;
  label: string | null;
  shortUrl: string;
  destinationUrl: string;
  destinationLabel: string;   // human: "Ole Miss · Kappa Alpha Theta" or "Ole Miss"
  clicks: number;
  signups: number;
  purchases: number;
  earnedCents: number;        // commission attributed to this link (any status)
};

export type RepDashboard = {
  ok: true;
  repId: string;
  name: string;
  email: string | null;
  campusSlug: string | null;
  campusName: string | null;
  venmo: string | null;
  isTest: boolean;
  ruleLabel: string;          // "10%" etc — what they earn
  links: RepLinkStat[];
  totals: { clicks: number; signups: number; purchases: number };
  earnings: { pendingCents: number; approvedCents: number; paidCents: number };
  payout: { nextLabel: string; nextIso: string; dueCents: number };
};

export type RepDashboardResult = RepDashboard | { ok: false; error: string };
