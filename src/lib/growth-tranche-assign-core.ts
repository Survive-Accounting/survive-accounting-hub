// Full-semester tranche assignment — pure, so the draft and the balance can be tested.
//
// Buckets: FOUNDER (Ole Miss + the Florida cluster, Lee's, excluded here), KING (tranches
// 1–5) and UNASSIGNED (A–E, owned by nobody). 20 per tranche.
//
//   · Tranche 1 & A are FLAGSHIP tranches — filled with the most recognizable schools first
//     (strong-Greek flagships), because they set the perception of how established this is
//     and appear in the student picker first. Recognizability outranks marginal seats here.
//   · Tranches 2–5 / B–E: snake draft by greek_priority, alternating the King and Unassigned
//     pools, so neither gets a run of the best remaining campuses.
//   · Each matched pair (1↔A, 2↔B, …) is then balanced within 10% on total seats, mean
//     readiness, and count of zero-contact campuses — by swapping members between the pair.
import { greekPriority, type GreekStatus } from "./growth-tranche-core";

export interface AssignCampus {
  campusId: string;
  name: string;
  seats: number | null;
  greekStatus: GreekStatus;
  readiness: number; // 0–100
  contacts: number;
}
export interface AssignTranche {
  pool: "king" | "unassigned";
  number: number; // 1–5
  label: string; // "T1" / "A"
  campuses: AssignCampus[];
  totals: { seats: number; meanReadiness: number; zeroContacts: number };
}
export interface AssignResult {
  king: AssignTranche[];
  unassigned: AssignTranche[];
}

const PER_TRANCHE = 20;
const LETTERS = ["A", "B", "C", "D", "E"];

// Recognizability: strong-Greek flagships first (that's the manual classification's payoff),
// then present, then by market size. Used only to seed the two flagship tranches.
const flagshipScore = (c: AssignCampus): number =>
  (c.greekStatus === "strong" ? 1e9 : c.greekStatus === "present" ? 1e6 : 0) + (c.seats ?? 0);

const totalsOf = (cs: AssignCampus[]) => ({
  seats: cs.reduce((n, c) => n + (c.seats ?? 0), 0),
  meanReadiness: cs.length ? cs.reduce((n, c) => n + c.readiness, 0) / cs.length : 0,
  zeroContacts: cs.filter((c) => c.contacts === 0).length,
});

const within10 = (a: number, b: number): boolean => {
  const hi = Math.max(a, b);
  return hi === 0 ? true : Math.abs(a - b) / hi <= 0.1;
};

/** Swap members between a matched pair until the three metrics are within 10% (or no swap
 *  helps). Greedy: repeatedly make the single swap that most reduces the worst gap. */
function balancePair(x: AssignCampus[], y: AssignCampus[]): void {
  const gap = () => {
    const tx = totalsOf(x), ty = totalsOf(y);
    const seatGap = Math.abs(tx.seats - ty.seats) / Math.max(1, tx.seats, ty.seats);
    const readGap = Math.abs(tx.meanReadiness - ty.meanReadiness) / Math.max(1, tx.meanReadiness, ty.meanReadiness);
    const zcGap = Math.abs(tx.zeroContacts - ty.zeroContacts) / Math.max(1, tx.zeroContacts, ty.zeroContacts);
    return Math.max(seatGap, readGap, zcGap);
  };
  for (let iter = 0; iter < 200; iter++) {
    const tx = totalsOf(x), ty = totalsOf(y);
    if (within10(tx.seats, ty.seats) && within10(tx.meanReadiness, ty.meanReadiness) && within10(tx.zeroContacts, ty.zeroContacts))
      return;
    let best = gap(), bi = -1, bj = -1;
    for (let i = 0; i < x.length; i++) for (let j = 0; j < y.length; j++) {
      const xi = x[i], yj = y[j];
      x[i] = yj; y[j] = xi;
      const g = gap();
      x[i] = xi; y[j] = yj;
      if (g < best - 1e-9) { best = g; bi = i; bj = j; }
    }
    if (bi < 0) return; // no improving swap
    const t = x[bi]; x[bi] = y[bj]; y[bj] = t;
  }
}

export function assignSemester(eligible: AssignCampus[]): AssignResult {
  const pool = [...eligible].filter((c) => greekPriority(c.seats, c.greekStatus) > 0); // never a 'none'
  // ── flagship tranches: top 40 by recognizability, split into T1 and A ────────────────
  const flags = [...pool].sort((a, b) => flagshipScore(b) - flagshipScore(a)).slice(0, PER_TRANCHE * 2);
  const flagIds = new Set(flags.map((c) => c.campusId));
  const t1: AssignCampus[] = [], tA: AssignCampus[] = [];
  flags.forEach((c, i) => (i % 2 === 0 ? t1 : tA).push(c)); // interleave so both get top-tier
  balancePair(t1, tA);

  // ── tranches 2–5 / B–E: snake draft the rest by greek_priority ────────────────────────
  const rest = pool
    .filter((c) => !flagIds.has(c.campusId))
    .sort((a, b) => greekPriority(b.seats, b.greekStatus) - greekPriority(a.seats, a.greekStatus));
  const kingRest: AssignCampus[] = [], unRest: AssignCampus[] = [];
  // snake: K, U, U, K, K, U, U, K … keeps the pools even on quality
  rest.forEach((c, i) => {
    const phase = i % 4; // 0→K 1→U 2→U 3→K
    (phase === 0 || phase === 3 ? kingRest : unRest).push(c);
  });
  const chunk = (arr: AssignCampus[], n: number): AssignCampus[][] =>
    Array.from({ length: n }, (_, k) => arr.slice(k * PER_TRANCHE, (k + 1) * PER_TRANCHE));
  const kChunks = chunk(kingRest, 4); // tranches 2–5
  const uChunks = chunk(unRest, 4); // tranches B–E
  for (let p = 0; p < 4; p++) balancePair(kChunks[p], uChunks[p]);

  const mk = (pool: "king" | "unassigned", number: number, campuses: AssignCampus[]): AssignTranche => ({
    pool,
    number,
    label: pool === "king" ? `T${number}` : LETTERS[number - 1],
    campuses,
    totals: totalsOf(campuses),
  });
  return {
    king: [mk("king", 1, t1), ...kChunks.map((c, i) => mk("king", i + 2, c))],
    unassigned: [mk("unassigned", 1, tA), ...uChunks.map((c, i) => mk("unassigned", i + 2, c))],
  };
}
