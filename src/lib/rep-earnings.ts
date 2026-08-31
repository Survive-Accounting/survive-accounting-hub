// SIGNING BONUS — pure math for the rep compensation structure (Lee's 08-30 spec).
//
//   COMMISSION       10% of net collected revenue, ongoing, no cap (the existing ledger)
//   SIGNING BONUS    one-time · capped at $300 · UNLOCKED by the first $1,000+ chapter sale
//
// Every bonus event is verified by OUR OWN data — attribution rows, claim records, signup
// conversions. Nothing self-reported, nothing screenshot-based, nothing that pays activity
// instead of outcomes (DM logging is bonus-pool ELIGIBILITY, never a paid line item).
//
// The bonus is DERIVED, not ledgered: recomputed from source tables on every read, so a voided
// conversion or deleted claim reverses its bonus automatically. Money only ever moves through
// the existing referral_commissions ledger, via an explicit admin action after unlock.

export const BONUS_SIGNUP_CENTS = 100;            // $1 per free signup through their link
export const BONUS_FLYER_CENTS = 1_000;           // $10 per flyer producing ≥5 signups
export const BONUS_CLAIM_CENTS = 2_500;           // $25 per rep-attributed chapter page claim
export const BONUS_ACTIVATED_CENTS = 5_000;       // $50 per chapter reaching 10+ free signups
export const BONUS_CAP_CENTS = 30_000;            // $300 total, across all four events
export const FLYER_SIGNUP_THRESHOLD = 5;          // signups, NOT scans — scans are diagnostic only
export const CHAPTER_ACTIVATION_THRESHOLD = 10;   // free signups from ONE chapter
export const QUALIFYING_SALE_CENTS = 100_000;     // the $1,000+ chapter sale that unlocks payout

export type BonusCounts = {
  /** Free signups attributed to the rep (each $1). */
  signups: number;
  /** Flyers whose unique QR produced ≥ FLYER_SIGNUP_THRESHOLD signups (each $10). */
  flyersProducing: number;
  /** Rep-attributed chapter page claims (each $25). */
  pagesClaimed: number;
  /** Chapters with ≥ CHAPTER_ACTIVATION_THRESHOLD signups attributed to this rep (each $50). */
  chaptersActivated: number;
};

export type BonusLine = { label: string; count: number; eachCents: number; totalCents: number };

export type SigningBonus = {
  lines: BonusLine[];
  /** Sum of the lines BEFORE the cap. */
  rawCents: number;
  /** min(raw, $300) — what the rep actually sees accruing. */
  earnedCents: number;
  capCents: number;
  capped: boolean;
  /** Locked until the first qualifying chapter sale closes. */
  locked: boolean;
};

/** The one calculator. `locked` is the caller's determination (no qualifying sale yet). */
export function signingBonus(c: BonusCounts, locked: boolean): SigningBonus {
  const lines: BonusLine[] = [
    { label: "Free signups", count: c.signups, eachCents: BONUS_SIGNUP_CENTS, totalCents: c.signups * BONUS_SIGNUP_CENTS },
    { label: "Flyers producing", count: c.flyersProducing, eachCents: BONUS_FLYER_CENTS, totalCents: c.flyersProducing * BONUS_FLYER_CENTS },
    { label: "Pages claimed", count: c.pagesClaimed, eachCents: BONUS_CLAIM_CENTS, totalCents: c.pagesClaimed * BONUS_CLAIM_CENTS },
    { label: "Chapters activated", count: c.chaptersActivated, eachCents: BONUS_ACTIVATED_CENTS, totalCents: c.chaptersActivated * BONUS_ACTIVATED_CENTS },
  ];
  const rawCents = lines.reduce((s, l) => s + l.totalCents, 0);
  const earnedCents = Math.min(rawCents, BONUS_CAP_CENTS);
  return { lines, rawCents, earnedCents, capCents: BONUS_CAP_CENTS, capped: rawCents > BONUS_CAP_CENTS, locked };
}

/** Does a conversion qualify as THE unlocking sale? A $1,000+ chapter purchase. */
export function isQualifyingSale(kind: string, amountCents: number): boolean {
  return kind === "chapter_purchase" && amountCents >= QUALIFYING_SALE_CENTS;
}

/** ONE-TIME RULE: only events accrued BEFORE the first qualifying sale count. Given the sale's
 *  timestamp (null = not yet), an event at `atMs` is countable iff it precedes it. */
export function eventCounts(atMs: number, firstSaleAtMs: number | null): boolean {
  return firstSaleAtMs === null || atMs <= firstSaleAtMs;
}

/** Per-chapter signup rollup → which chapters are "activated". Input: signup counts by chapter. */
export function activatedChapters(signupsByChapter: Record<string, number>): string[] {
  return Object.entries(signupsByChapter)
    .filter(([, n]) => n >= CHAPTER_ACTIVATION_THRESHOLD)
    .map(([id]) => id);
}

/** Per-flyer rollup → which flyers pay. Input: signup counts by flyer link id. */
export function payingFlyers(signupsByFlyer: Record<string, number>): string[] {
  return Object.entries(signupsByFlyer)
    .filter(([, n]) => n >= FLYER_SIGNUP_THRESHOLD)
    .map(([id]) => id);
}

/** The signup-page / agreement statement — direct about the gate, never fine print. */
export const BONUS_PLAIN_STATEMENT =
  "You earn 10% of everything sold through your link, always. On top of that, there's a one-time bonus of up to $300 for getting your campus off the ground — paid when your first chapter signs up. If no chapter signs up, the bonus isn't paid.";

/** The under-QR caption every flyer carries — a bare QR on a corkboard gets ignored. */
export const flyerQrCaption = (courseCode: string | null): string =>
  `Free ${courseCode ?? "accounting"} exam prep — first exam free.`;
