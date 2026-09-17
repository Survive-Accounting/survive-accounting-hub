// ACCOUNTING PONG — the pure game. Rack building from the account registry,
// the run state machine (start a section, tap, timeout, continue, quit),
// scoring, heat and the recap data. No DOM, no timers: the component owns the
// clock and hands `now` in, so every rule here is testable to the millisecond.
//
// Rules (docs/ACCOUNTING-PONG.md, as Lee reshaped them on 2026-09-16):
//   · you pick a SECTION and play it as a run: racks ramp 3 → 6 → 6 → 10 → 15
//     cups, then the 15-cup final boss keeps coming; each rack draws a rule from
//     the section at random. A run ends only when the lives are gone (or you quit)
//   · clock starts on Begin (armClock), stops on the last required cup; every
//     cup sunk earns time back; a tap at or past the limit is a timeout
//   · a cup locks the moment it is tapped — no double score
//   · wrong cup → cup disabled, heat → 1× at once, round continues. NO life lost
//   · timeout → −1 life, and you TRY THAT RACK AGAIN (same rule, fresh scramble)
//   · 3 lives for the run
//   · score = POINTS_PER_CUP × multiplier at the moment of the tap; never
//     subtracts, never resets
//   · heat = consecutive perfect racks; the upgrade applies from the NEXT rack
import type { AccountDef } from "@/components/canvas/account-registry";
import { PONG_SECTIONS, cheatFor, pongLabel, poolFor, rulesOf, sectionOf, shortLabel, whyFor, type PongRule, type PongSection } from "./pong-content";

// ---- config -------------------------------------------------------------

export interface PongConfig {
  lives: number;
  pointsPerCup: number;
  /** Seconds on the clock for a rack of `cups` cups. */
  secondsFor: (cups: number) => number;
  /** Multiplier for a rack entered with `perfectStreak` consecutive perfect racks
   *  behind it. Index = min(streak, ladder.length − 1). */
  heatLadder: readonly number[];
  /** How many correct cups a rack of each size carries (min..max, inclusive). */
  correctRange: Record<number, readonly [number, number]>;
  /** Pyramid sizes that guarantee at least one trap cup. */
  trapFromCups: number;
  /** Time added to the clock for every cup you sink. */
  bonusMsPerHit: number;
}

/** Lee (2026-09-16): 15 s on every rack, 20 s on the boss. */
export const secondsDefault = (cups: number): number => (cups >= 15 ? 20 : 15);
/** The earlier scaled clock, kept in the drawer for comparison. */
export const secondsScaled = (cups: number): number => 10 + 0.75 * (cups - 3);

export const PONG_CONFIG: PongConfig = {
  lives: 3,
  pointsPerCup: 100,
  secondsFor: secondsDefault,
  // 1st perfect = 1×, 2nd = HEATING UP! 2×, 3rd+ = ON FIRE! 3×.
  heatLadder: [1, 1, 2, 3],
  // Lee: 2-1 → 2 to sink, 3-2-1 → 3, 4-3-2-1 → 5, 5-4-3-2-1 → 6. A rule whose registry
  // pool is smaller (equity has two accounts) just carries the whole pool.
  correctRange: { 3: [2, 2], 6: [3, 3], 10: [5, 5], 15: [6, 6] },
  trapFromCups: 6,
  bonusMsPerHit: 2000,
};

export const multiplierFor = (perfectStreak: number, cfg: PongConfig = PONG_CONFIG): number =>
  cfg.heatLadder[Math.min(Math.max(0, perfectStreak), cfg.heatLadder.length - 1)];

/** The arcade banner after a rack, from the streak AFTER that rack. */
export function heatLabel(perfectStreak: number): "PERFECT!" | "HEATING UP!" | "ON FIRE!" | null {
  if (perfectStreak <= 0) return null;
  if (perfectStreak === 1) return "PERFECT!";
  if (perfectStreak === 2) return "HEATING UP!";
  return "ON FIRE!";
}

// ---- seeded rng (tiny mulberry32 — deterministic racks in tests) ---------

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: readonly T[], r: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick `n` from `xs` without replacement, traps weighted `trapWeight`×. */
function pickWeighted(xs: readonly AccountDef[], n: number, isTrap: (a: AccountDef) => boolean, r: () => number, trapWeight = 3): AccountDef[] {
  const pool = xs.slice();
  const out: AccountDef[] = [];
  while (out.length < n && pool.length) {
    const weights = pool.map((a) => (isTrap(a) ? trapWeight : 1));
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = r() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      roll -= weights[idx];
      if (roll < 0) break;
    }
    out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return out;
}

// ---- racks ----------------------------------------------------------------

export interface Cup {
  id: string;
  label: string;
  shortLabel: string;
  correct: boolean;
  trap: boolean;
  /** "contra equity" — the few-words reason. */
  why: string;
  row: number;
  col: number;
}

export interface Rack {
  rule: PongRule;
  size: number;
  seconds: number;
  cups: Cup[];
  /** Row lengths, back row first: 15 → [5,4,3,2,1]. */
  rows: number[];
  /** The section's biggest rack — the final boss. */
  boss: boolean;
}

export function pyramidRows(size: number): number[] {
  const rows: number[] = [];
  let n = 1, total = 0;
  while (total < size) { rows.unshift(n); total += n; n++; }
  if (total !== size) throw new Error(`pong: ${size} cups is not a pyramid`);
  return rows;
}

export function buildRack(rule: PongRule, size: number, r: () => number, cfg: PongConfig = PONG_CONFIG, boss = false): Rack {
  const pool = poolFor(rule);
  const correctPool = pool.filter(rule.isCorrect);
  const distractorPool = pool.filter((a) => !rule.isCorrect(a));
  const isTrap = (a: AccountDef) => rule.traps.includes(a.id);
  const [lo, hi] = cfg.correctRange[size] ?? [2, 5];
  let k = lo + Math.floor(r() * (hi - lo + 1));
  k = Math.min(k, correctPool.length, size - 1);
  k = Math.max(k, size - distractorPool.length, 1);
  if (k > correctPool.length || size - k > distractorPool.length) {
    throw new Error(`pong: the registry cannot fill a ${size}-cup rack for ${rule.id}`);
  }

  // Forced cups: the rule's must-haves (Cost of Goods Sold on every expenses rack), plus
  // one trap from 6 cups up. A forced cup may be correct or a distractor.
  const forced: AccountDef[] = [];
  for (const id of rule.mustInclude ?? []) {
    const a = pool.find((x) => x.id === id);
    if (a && size >= cfg.trapFromCups) forced.push(a);
  }
  if (size >= cfg.trapFromCups && !forced.some(isTrap)) {
    const traps = pool.filter(isTrap);
    if (traps.length) forced.push(traps[Math.floor(r() * traps.length)]);
  }
  const forcedCorrect = forced.filter(rule.isCorrect);
  const forcedWrong = forced.filter((a) => !rule.isCorrect(a));

  const correct = [
    ...forcedCorrect,
    ...pickWeighted(correctPool.filter((a) => !forcedCorrect.includes(a)), Math.max(0, k - forcedCorrect.length), isTrap, r),
  ];
  const wrong = [
    ...forcedWrong,
    ...pickWeighted(distractorPool.filter((a) => !forcedWrong.includes(a)), Math.max(0, size - correct.length - forcedWrong.length), isTrap, r),
  ];

  const rows = pyramidRows(size);
  const placed = shuffle([...correct, ...wrong], r);
  const cups: Cup[] = [];
  let i = 0;
  rows.forEach((len, row) => {
    for (let col = 0; col < len; col++, i++) {
      const a = placed[i];
      cups.push({
        id: a.id, label: pongLabel(a), shortLabel: shortLabel(a),
        correct: rule.isCorrect(a), trap: isTrap(a), why: whyFor(rule, a), row, col,
      });
    }
  });
  return { rule, size, seconds: cfg.secondsFor(size), cups, rows, boss };
}

/** Rack size for the n-th rack of a section: the ramp, then the boss forever. */
export const sizeAt = (section: PongSection, rackNo: number): number =>
  section.ramp[Math.min(rackNo, section.ramp.length - 1)];

/** Rules whose registry pool can fill the rack's "to sink" count. Equity (two accounts)
 *  fits a 2-1 rack, never a boss. */
export function rulesForSize(section: PongSection, size: number, cfg: PongConfig = PONG_CONFIG): PongRule[] {
  const need = cfg.correctRange[size]?.[0] ?? 2;
  const all = rulesOf(section.id);
  const fit = all.filter((r) => poolFor(r).filter(r.isCorrect).length >= need);
  return fit.length ? fit : all;
}

/** Which rule the n-th rack draws — random per run, never the same rule twice in a
 *  row when more than one fits the size. A retry keeps the rule. */
export function ruleAt(section: PongSection, rackNo: number, seed: number, cfg: PongConfig = PONG_CONFIG): PongRule {
  const pick = (n: number): PongRule => {
    const rules = rulesForSize(section, sizeAt(section, n), cfg);
    if (rules.length === 1) return rules[0];
    const r = rng(seed * 31 + n * 2654435761);
    if (n === 0) return rules[Math.floor(r() * rules.length)];
    const prev = pick(n - 1);
    const others = rules.filter((x) => x.id !== prev.id);
    return others[Math.floor(r() * others.length)];
  };
  return pick(rackNo);
}

// ---- run state --------------------------------------------------------------

export type Phase = "intro" | "playing" | "recap" | "results";
export type RoundResult = "perfect" | "cleared" | "timeout";

export interface Tap { cupId: string; correct: boolean; points: number; atMs: number }

export interface RoundRecord {
  /** Which rack of the run (0 = first). */
  index: number;
  /** Which try of this rack (0 = first). */
  attempt: number;
  rack: Rack;
  taps: Tap[];
  result: RoundResult;
  points: number;
  /** Multiplier the rack was entered with. */
  multiplier: number;
  elapsedMs: number;
}

export type PongEvent =
  | { type: "hit"; cupId: string; points: number; multiplier: number }
  | { type: "miss"; cupId: string }
  | { type: "round-end"; result: RoundResult; streak: number }
  | { type: "timeout" }
  | { type: "run-end" }
  | null;

export interface RunState {
  phase: Phase;
  /** The section being played; null on the intro. */
  sectionId: string | null;
  /** How many racks into the run (0 = first). */
  rackNo: number;
  /** How many times the current rack has been tried (0 = first). */
  attempt: number;
  lives: number;
  score: number;
  /** Consecutive perfect racks. */
  streak: number;
  /** Multiplier in force right now (drops to 1 on a wrong tap). */
  multiplier: number;
  /** Multiplier the current rack was entered with (for the record). */
  roundMultiplier: number;
  rack: Rack | null;
  taps: Tap[];
  /** Seconds earned back this rack (bonusMsPerHit × cups sunk). */
  bonusMs: number;
  /** null until the rack is drawn and armClock() is called. */
  clockStartedAt: number | null;
  history: RoundRecord[];
  seed: number;
  cfg: PongConfig;
  lastEvent: PongEvent;
  /** The run was ended by the player (quit), not by running out of lives. */
  quit: boolean;
}

export interface RunOptions {
  seed?: number;
  cfg?: PongConfig;
}

export function createRun(opts: RunOptions = {}): RunState {
  const cfg = opts.cfg ?? PONG_CONFIG;
  return {
    phase: "intro", sectionId: null, rackNo: -1, attempt: 0,
    lives: cfg.lives, score: 0, streak: 0, multiplier: multiplierFor(0, cfg), roundMultiplier: multiplierFor(0, cfg),
    rack: null, taps: [], bonusMs: 0, clockStartedAt: null, history: [],
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31), cfg, lastEvent: null, quit: false,
  };
}

export const currentSection = (s: RunState): PongSection | null => (s.sectionId ? sectionOf(s.sectionId) : null);

function rackAt(s: RunState, rackNo: number, attempt: number): Rack {
  const section = currentSection(s);
  if (!section) throw new Error("pong: no section");
  const size = sizeAt(section, rackNo);
  const boss = size === section.ramp[section.ramp.length - 1];
  return buildRack(ruleAt(section, rackNo, s.seed, s.cfg), size, rng(s.seed + rackNo * 7919 + attempt * 104729), s.cfg, boss);
}

/** Draw rack `rackNo` (try `attempt`) with the run's current heat; clock NOT running yet. */
function enterRack(s: RunState, rackNo: number, attempt: number): RunState {
  const m = multiplierFor(s.streak, s.cfg);
  const base = { ...s, rackNo, attempt, taps: [], bonusMs: 0, clockStartedAt: null, multiplier: m, roundMultiplier: m, lastEvent: null as PongEvent, phase: "playing" as Phase };
  return { ...base, rack: rackAt(base, rackNo, attempt) };
}

/** Start (or restart) a section as a fresh run: full lives, zero score, a new seed so
 *  every rack scrambles again. */
export function startSection(s: RunState, sectionId: string, seed?: number): RunState {
  sectionOf(sectionId);
  return enterRack({
    ...s, sectionId, lives: s.cfg.lives, score: 0, streak: 0, history: [], quit: false,
    seed: seed ?? Math.floor(Math.random() * 2 ** 31),
  }, 0, 0);
}

/** The rack is drawn and interactive — start the clock. */
export function armClock(s: RunState, now: number): RunState {
  if (s.phase !== "playing" || s.clockStartedAt != null) return s;
  return { ...s, clockStartedAt: now };
}

/** The clock for this rack: the base seconds plus every second earned back by sinking cups. */
export const limitMs = (s: RunState): number => (s.rack ? Math.round(s.rack.seconds * 1000) + s.bonusMs : 0);

export function elapsedMs(s: RunState, now: number): number {
  return s.clockStartedAt == null ? 0 : Math.max(0, now - s.clockStartedAt);
}

export function remainingMs(s: RunState, now: number): number {
  return Math.max(0, limitMs(s) - elapsedMs(s, now));
}

export const isExpired = (s: RunState, now: number): boolean =>
  s.phase === "playing" && s.clockStartedAt != null && elapsedMs(s, now) >= limitMs(s);

export const remainingCorrect = (s: RunState): number =>
  s.rack ? s.rack.cups.filter((c) => c.correct && !s.taps.some((t) => t.cupId === c.id)).length : 0;

export const isTapped = (s: RunState, cupId: string): boolean => s.taps.some((t) => t.cupId === cupId);

function endRound(s: RunState, result: RoundResult, now: number): RunState {
  const rack = s.rack!;
  const points = s.taps.reduce((sum, t) => sum + t.points, 0);
  const record: RoundRecord = {
    index: s.rackNo, attempt: s.attempt, rack, taps: s.taps, result, points,
    multiplier: s.roundMultiplier,
    elapsedMs: Math.min(elapsedMs(s, now), limitMs(s)),
  };
  const streak = result === "perfect" ? s.streak + 1 : 0;
  const history = [...s.history, record];
  if (s.lives <= 0) {
    return { ...s, phase: "results", streak, history, clockStartedAt: null, lastEvent: { type: "run-end" } };
  }
  return { ...s, phase: "recap", streak, history, clockStartedAt: null, lastEvent: { type: "round-end", result, streak } };
}

/** A cup was tapped at `now`. Locked cups and un-armed racks are no-ops. */
export function tap(s: RunState, cupId: string, now: number): RunState {
  if (s.phase !== "playing" || !s.rack || s.clockStartedAt == null) return s;
  if (isExpired(s, now)) return timeout(s, now);
  const cup = s.rack.cups.find((c) => c.id === cupId);
  if (!cup || isTapped(s, cupId)) return s;

  if (cup.correct) {
    const points = s.cfg.pointsPerCup * s.multiplier;
    const taps = [...s.taps, { cupId, correct: true, points, atMs: elapsedMs(s, now) }];
    // Every sunk cup earns time back on the clock.
    const next: RunState = { ...s, taps, score: s.score + points, bonusMs: s.bonusMs + s.cfg.bonusMsPerHit, lastEvent: { type: "hit", cupId, points, multiplier: s.multiplier } };
    if (remainingCorrect(next) === 0) {
      const perfect = taps.every((t) => t.correct);
      return endRound(next, perfect ? "perfect" : "cleared", now);
    }
    return next;
  }

  // Wrong cup: locked, heat gone, no life lost (Lee, 2026-09-16).
  const taps = [...s.taps, { cupId, correct: false, points: 0, atMs: elapsedMs(s, now) }];
  return { ...s, taps, streak: 0, multiplier: multiplierFor(0, s.cfg), lastEvent: { type: "miss", cupId } };
}

/** The clock ran out. −1 life, rack over — Continue tries the same rack again. */
export function timeout(s: RunState, now: number): RunState {
  if (s.phase !== "playing" || !s.rack) return s;
  const next: RunState = { ...s, lives: s.lives - 1, streak: 0, multiplier: multiplierFor(0, s.cfg), lastEvent: { type: "timeout" } };
  return endRound(next, "timeout", now);
}

/** Was the last recorded rack a timeout of the current rack (→ Continue retries it)? */
export function retryPending(s: RunState): boolean {
  const last = s.history[s.history.length - 1];
  return !!last && last.result === "timeout" && last.index === s.rackNo;
}

/** Continue from the recap: retry the timed-out rack, or draw the next one. Runs never
 *  end by count — the boss keeps coming until the lives are gone. */
export function continueRun(s: RunState): RunState {
  if (s.phase !== "recap") return s;
  if (retryPending(s)) return enterRack(s, s.rackNo, s.attempt + 1);
  return enterRack(s, s.rackNo + 1, 0);
}

/** End the run on purpose (bank the score). Allowed from a rack or a recap. */
export function quitRun(s: RunState): RunState {
  if (s.phase !== "playing" && s.phase !== "recap") return s;
  return { ...s, phase: "results", clockStartedAt: null, quit: true, lastEvent: { type: "run-end" } };
}

/** Same section, fresh seed — every rack scrambles again. */
export function restart(s: RunState): RunState {
  if (!s.sectionId) return s;
  return startSection(s, s.sectionId);
}

// ---- recap data ---------------------------------------------------------------

export type CupOutcome = "hit" | "wrong" | "missed" | "left";

export function cupOutcome(record: Pick<RoundRecord, "taps">, cup: Cup): CupOutcome {
  const tapped = record.taps.some((t) => t.cupId === cup.id);
  if (cup.correct) return tapped ? "hit" : "missed";
  return tapped ? "wrong" : "left";
}

export interface Recap {
  result: RoundResult;
  points: number;
  perfect: boolean;
  /** Continue retries this rack (it timed out) instead of moving on. */
  retry: boolean;
  /** "Dividends — contra equity" for the first wrong cup, else the first missed; null on a clean rack. */
  explanation: string | null;
  explanationCup: Cup | null;
  /** A cheat code that applies to the cups that were on this rack. */
  cheat: string;
  wrong: Cup[];
  missed: Cup[];
  /** The boss rack was cleared — the celebration moment. */
  bossCleared: boolean;
  /** Size of the rack Continue draws (null on a retry: same rack). */
  nextSize: number | null;
}

export function recapFor(s: RunState, record: RoundRecord): Recap {
  const wrong = record.rack.cups.filter((c) => cupOutcome(record, c) === "wrong");
  const missed = record.rack.cups.filter((c) => cupOutcome(record, c) === "missed");
  const cup = wrong[0] ?? missed[0] ?? null;
  const retry = record.result === "timeout" && s.lives > 0;
  const section = currentSection(s);
  return {
    result: record.result, points: record.points, perfect: record.result === "perfect", retry,
    explanation: cup ? `${cup.label} — ${cup.why}` : null,
    explanationCup: cup,
    cheat: cheatFor(record.rack.rule, record.rack.cups.map((c) => c.id)),
    wrong, missed,
    bossCleared: record.rack.boss && record.result !== "timeout",
    nextSize: retry || !section ? null : sizeAt(section, record.index + 1),
  };
}

/** Racks cleared (perfect or cleared) this run. */
export const racksCleared = (s: RunState): number =>
  s.history.filter((r) => r.result === "perfect" || r.result === "cleared").length;

/** Boss racks cleared this run. */
export const bossesCleared = (s: RunState): number =>
  s.history.filter((r) => r.rack.boss && r.result !== "timeout").length;

/** Points earned by every rack in the run — what a device banks toward its total. */
export const runPoints = (s: RunState): number => s.history.reduce((sum, r) => sum + r.points, 0);

export const formatScore = (n: number): string => n.toLocaleString("en-US");

export { PONG_SECTIONS };
