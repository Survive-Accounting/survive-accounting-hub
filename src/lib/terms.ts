// ACADEMIC TERMS + CHAPTER SEAT CONFIG — the one place any of this is written down.
//
// WHY THIS FILE EXISTS. A seat is not a credit, it is a semester. That means every purchase,
// invoice, seat pool, assignment, entitlement and email has to agree on which term it belongs to
// and the exact day it ends. Those dates WILL move (a campus calendar shifts, we extend a term as
// a goodwill gesture), and the failure mode of scattering them is a chapter whose dashboard says
// one date while their members' access ends on another.
//
// So: expiry dates, term windows, the Summer switch, seat pricing and the presale disclosure all
// live here, and nothing downstream hardcodes any of them.
//
// NO ROLLOVER. Seats belong to their term and expire with it. Unused seats do not carry forward;
// the chapter buys the next term. Everything that describes a purchase must say so before money
// is asked for — see PRESALE_DISCLOSURE.

export type TermKey = "fall" | "spring" | "summer";

export type Term = {
  key: TermKey;
  /** "Fall 2026" — what a human is buying. */
  label: string;
  academicYear: number;
  /** ISO instants. Access is live between these; expiresAt is the END of the last day. */
  startsAt: string;
  expiresAt: string;
  /** "Dec. 31, 2026" — the date shown wherever access length is stated. */
  expiresLabel: string;
};

/** TERM SHAPES. `endMonth`/`endDay` are the expiry the brief fixes:
 *    Fall   → December 31
 *    Spring → May 31
 *    Summer → August 31
 *  `startMonth` is when the term's seats become sellable/active. Change a date HERE and every
 *  screen, invoice and entitlement follows. */
const TERM_SHAPES: Record<TermKey, { label: string; startMonth: number; endMonth: number; endDay: number }> = {
  // Fall runs Aug–Dec of its own academic year.
  fall: { label: "Fall", startMonth: 8, endMonth: 12, endDay: 31 },
  // Spring runs Jan–May of the year AFTER the academic year opens (Spring 2027 is in 2027).
  spring: { label: "Spring", startMonth: 1, endMonth: 5, endDay: 31 },
  // Summer runs Jun–Aug. Architecturally first-class; sales gated by the flag below.
  summer: { label: "Summer", startMonth: 6, endMonth: 8, endDay: 31 },
};

/** SUMMER IS BUILT BUT NOT SOLD. Flip to true when summer packs are ready; nothing else changes —
 *  the pools, assignment, expiry and dashboards already understand the term. */
export const CHAPTER_SUMMER_SEATS_ENABLED = false;

const iso = (y: number, m: number, d: number, endOfDay = false) =>
  new Date(Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0)).toISOString();

const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

/** Build a term. `year` is the CALENDAR year the term's label carries (Spring 2027 → 2027). */
export function makeTerm(key: TermKey, year: number): Term {
  const s = TERM_SHAPES[key];
  return {
    key,
    label: `${s.label} ${year}`,
    academicYear: key === "fall" ? year : year - 1, // the academic year Fall opens
    startsAt: iso(year, s.startMonth, 1),
    expiresAt: iso(year, s.endMonth, s.endDay, true),
    expiresLabel: `${MONTHS[s.endMonth - 1]} ${s.endDay}, ${year}`,
  };
}

/** The term a date falls in — Jan–May Spring, Jun–Jul Summer, Aug–Dec Fall. */
export function termFor(date = new Date()): Term {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  if (m >= 8) return makeTerm("fall", y);
  if (m >= 6) return makeTerm("summer", y);
  return makeTerm("spring", y);
}

/** WHAT A CHAPTER CAN BUY RIGHT NOW. The current term while it is still worth buying, plus the
 *  next one once the current is nearly over — a chapter arriving in December is buying Spring,
 *  not four days of Fall. Summer only appears when the flag allows it. */
export function purchasableTerms(now = new Date()): Term[] {
  const cur = termFor(now);
  const out: Term[] = [];
  // "Nearly over" = inside the last 21 days. Before that the current term is the default.
  const daysLeft = (Date.parse(cur.expiresAt) - now.getTime()) / 864e5;
  if (daysLeft > 21) out.push(cur);
  out.push(nextTerm(cur));
  return out.filter((t) => (t.key === "summer" ? CHAPTER_SUMMER_SEATS_ENABLED : true));
}

export function nextTerm(t: Term): Term {
  const year = Number(t.label.split(" ")[1]);
  if (t.key === "fall") return makeTerm("spring", year + 1);
  if (t.key === "spring") return makeTerm("summer", year);
  return makeTerm("fall", year);
}

/** Parse a stored term id ("fall-2026") back into a Term. Returns null for anything unknown —
 *  a seat pool that cannot name its term must fail loudly rather than default to "now". */
export function termFromId(id: string | null | undefined): Term | null {
  const m = /^(fall|spring|summer)-(\d{4})$/.exec((id ?? "").trim().toLowerCase());
  if (!m) return null;
  return makeTerm(m[1] as TermKey, Number(m[2]));
}

/** The id stored on pools, orders and invoices. */
export const termId = (t: Term) => `${t.key}-${t.label.split(" ")[1]}`;

export const isTermExpired = (t: Term, now = new Date()) => Date.parse(t.expiresAt) < now.getTime();

// ── seat pricing ───────────────────────────────────────────────────────────────────────────────
/** $100 per seat, ten minimum — the same numbers the chapter pages already quote (SEAT_PRICE /
 *  SEAT_MINIMUM in ChapterAccess). Packs are the presented tiers; custom uses the per-seat rate,
 *  except the 30-pack which is deliberately cheaper per seat. */
export const SEAT_PRICE_CENTS = 10_000;
export const SEAT_MINIMUM = 10;

export type SeatPack = { seats: number; priceCents: number; badge?: string };

export const SEAT_PACKS: SeatPack[] = [
  { seats: 10, priceCents: 100_000 },
  { seats: 20, priceCents: 200_000, badge: "Most chapters" },
  { seats: 30, priceCents: 270_000, badge: "Best value · $90/seat" },
];

/** Price for any seat count: a pack's price when it matches a pack exactly, otherwise the flat
 *  per-seat rate. One function so a quote, an invoice and a receipt cannot disagree. */
export function priceCentsFor(seats: number): number {
  const pack = SEAT_PACKS.find((p) => p.seats === seats);
  return pack ? pack.priceCents : seats * SEAT_PRICE_CENTS;
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// ── presale ────────────────────────────────────────────────────────────────────────────────────
/** THE DISCLOSURE. Exams 2, 3 and the Final are still being filmed, and this sentence must appear
 *  anywhere a chapter is asked to commit money — the offer block, the pack screen, the checkout
 *  review, the invoice, the check instructions, the treasurer email and the share-kit PDF. A
 *  chapter discovering the gap after paying is the trust failure this exists to prevent. */
export const PRESALE_DISCLOSURE =
  "Exam 2, Exam 3 and the Final are still being filmed. Buying now reserves your chapter's seats, and your members get each exam the day it lands.";

/** When each remaining exam is expected. Kept beside the disclosure so the promise and the timing
 *  can never drift apart, and changed HERE when filming moves. */
export const CHAPTER_PRESALE_TIMING_COPY = "Exam 2 lands first, then Exam 3, then the Final — each one the week it finishes filming.";

/** One line describing what a purchase covers, for any surface that needs it in a sentence. */
export const seatCoverageLine = (t: Term, seats: number) =>
  `${seats} seat${seats === 1 ? "" : "s"} · ${t.label} — member access through ${t.expiresLabel}.`;
