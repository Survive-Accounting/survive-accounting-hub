import { describe, expect, it } from "bun:test";

import { account } from "@/components/canvas/account-registry";
import { PONG_RULES, PONG_SECTIONS, RAMP, cheatFor, increaseSide, isTemporary, pongLabel, poolFor, ruleById, rulesOf, shortWhy, statementOf } from "./pong-content";
import {
  PONG_CONFIG, armClock, bossesCleared, buildRack, continueRun, createRun, heatLabel, isTapped, limitMs,
  multiplierFor, pyramidRows, quitRun, racksCleared, recapFor, restart, retryPending, rng, ruleAt, runPoints,
  secondsDefault, sizeAt, startSection, tap, timeout, type RunState,
} from "./pong";

// ---- helpers ----------------------------------------------------------------

const T0 = 1000;
/** A fresh run of a section, first rack drawn, clock armed at T0. */
function fresh(sectionId = "types", seed = 7): RunState {
  return armClock(startSection(createRun({ seed }), sectionId, seed), T0);
}
const correctIds = (s: RunState) => s.rack!.cups.filter((c) => c.correct).map((c) => c.id);
const wrongIds = (s: RunState) => s.rack!.cups.filter((c) => !c.correct).map((c) => c.id);
/** Sink every correct cup, in order, each `step` ms apart from the arm time. */
function clearRack(s: RunState, step = 100): RunState {
  let t = s.clockStartedAt! + step;
  for (const id of correctIds(s)) { s = tap(s, id, t); t += step; }
  return s;
}
/** From a recap, draw the next rack and arm it. */
const next = (s: RunState, at = T0) => armClock(continueRun(s), at);

// ---- content --------------------------------------------------------------------

describe("pong content rules", () => {
  it("contras flip the increase side", () => {
    expect(increaseSide(account("cash")!)).toBe("debit");
    expect(increaseSide(account("accumulated-depreciation")!)).toBe("credit");
    expect(increaseSide(account("dividends")!)).toBe("debit");
    expect(increaseSide(account("unearned-revenue")!)).toBe("credit");
  });
  it("statements: Dividends is on neither, Accumulated Depreciation rides on the balance sheet", () => {
    expect(statementOf(account("dividends")!)).toBe("neither");
    expect(statementOf(account("accumulated-depreciation")!)).toBe("balance-sheet");
    expect(statementOf(account("depreciation-expense")!)).toBe("income-statement");
    expect(statementOf(account("retained-earnings")!)).toBe("balance-sheet");
  });
  it("Retained Earnings is permanent, Dividends temporary", () => {
    expect(isTemporary(account("retained-earnings")!)).toBe(false);
    expect(isTemporary(account("dividends")!)).toBe(true);
  });
  it("revenue cups wear the confusing names Lee asked for", () => {
    expect(pongLabel(account("service-revenue")!)).toBe("Fees Earned");
    expect(pongLabel(account("sales-revenue")!)).toBe("Sales");
    expect(pongLabel(account("rent-revenue")!)).toBe("Rent Earned");
    expect(pongLabel(account("interest-revenue")!)).toBe("Interest Earned");
    expect(pongLabel(account("cash")!)).toBe("Cash");
  });
  it("the why is a few words, never a sentence", () => {
    expect(shortWhy(account("dividends")!)).toBe("contra equity");
    expect(shortWhy(account("wages-payable")!)).toBe("payable = liability");
    expect(shortWhy(account("cash")!)).toBe("an asset");
    for (const a of poolFor({ includeContras: true })) expect(shortWhy(a).split(" ").length).toBeLessThanOrEqual(5);
  });
  it("sections: five modes, each ramping 3 → 6 → 6 → 10 → 15; Know your accounts has five rules, the rest two", () => {
    expect(PONG_SECTIONS.map((s) => s.id)).toEqual(["types", "increases", "normal", "statements", "tempperm"]);
    for (const s of PONG_SECTIONS) {
      expect(s.ramp).toEqual(RAMP);
      expect(rulesOf(s.id).length).toBe(s.id === "types" ? 5 : 2);
      for (const r of rulesOf(s.id)) { expect(r.instruction.startsWith("Sink every")).toBe(true); expect(r.cheats.length).toBeGreaterThan(0); }
    }
    expect(rulesOf("types").every((r) => !r.includeContras)).toBe(true);
    expect(PONG_RULES.filter((r) => r.sectionId !== "types").every((r) => r.includeContras)).toBe(true);
  });
  it("the cheat code fits the cups that were on the rack", () => {
    const debit = ruleById("inc-debit");
    expect(cheatFor(debit, ["cash", "dividends", "supplies"])).toContain("Dividends");
    expect(cheatFor(debit, ["cash", "supplies", "accounts-payable"])).not.toContain("Dividends");
    expect(cheatFor(debit, ["accumulated-depreciation", "cash"])).toContain("Contra");
    const exp = ruleById("types-expenses");
    expect(cheatFor(exp, ["cost-of-goods-sold", "rent-expense"])).toContain("Cost of Goods Sold");
  });
});

// ---- racks ----------------------------------------------------------------------

describe("rack composition", () => {
  it("pyramid rows", () => {
    expect(pyramidRows(3)).toEqual([2, 1]);
    expect(pyramidRows(6)).toEqual([3, 2, 1]);
    expect(pyramidRows(10)).toEqual([4, 3, 2, 1]);
    expect(pyramidRows(15)).toEqual([5, 4, 3, 2, 1]);
  });

  it("every rule builds a legal rack at every size for many seeds", () => {
    for (const rule of PONG_RULES) {
      for (const size of [3, 6, 10, 15] as const) {
        for (let seed = 1; seed <= 25; seed++) {
          const rack = buildRack(rule, size, rng(seed));
          expect(rack.cups.length).toBe(size);
          expect(new Set(rack.cups.map((c) => c.id)).size).toBe(size);
          const correct = rack.cups.filter((c) => c.correct).length;
          const [lo, hi] = PONG_CONFIG.correctRange[size];
          const pool = poolFor(rule).filter(rule.isCorrect).length;
          // 2 / 3 / 5 / 6 to sink — or the whole pool when the rule has fewer accounts (equity: 2).
          expect(correct).toBeGreaterThanOrEqual(Math.min(lo, pool));
          expect(correct).toBeLessThanOrEqual(Math.min(hi, pool));
          expect(correct).toBeLessThan(size);
          if (size >= PONG_CONFIG.trapFromCups) expect(rack.cups.some((c) => c.trap)).toBe(true);
          if (!rule.includeContras) expect(rack.cups.some((c) => c.id === "dividends" || c.id === "accumulated-depreciation")).toBe(false);
          expect(rack.cups.some((c) => !!account(c.id)!.intangible)).toBe(false);
          // Every expenses rack from 6 cups up carries Cost of Goods Sold.
          if (rule.id === "types-expenses" && size >= 6) expect(rack.cups.some((c) => c.id === "cost-of-goods-sold")).toBe(true);
          for (const c of rack.cups) {
            expect(c.correct).toBe(rule.isCorrect(account(c.id)!));
            expect(c.label).toBe(pongLabel(account(c.id)!));
            expect(c.why.length).toBeGreaterThan(0);
          }
          expect(rack.rows.reduce((a, b) => a + b, 0)).toBe(size);
        }
      }
    }
  });

  it("racks are deterministic per seed", () => {
    const rule = PONG_RULES[3];
    expect(buildRack(rule, 10, rng(99)).cups.map((c) => c.id)).toEqual(buildRack(rule, 10, rng(99)).cups.map((c) => c.id));
  });

  it("a section ramps 3 → 6 → 6 → 10 → 15 and then the boss repeats; rules vary, never twice in a row", () => {
    const types = PONG_SECTIONS[0];
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => sizeAt(types, n))).toEqual([3, 6, 6, 10, 15, 15, 15]);
    for (let seed = 1; seed <= 30; seed++) {
      const ids = Array.from({ length: 12 }, (_, n) => ruleAt(types, n, seed).id);
      for (let n = 1; n < ids.length; n++) expect(ids[n]).not.toBe(ids[n - 1]);
      expect(new Set(ids).size).toBeGreaterThan(2);
      // Equity has two accounts: it fits the 2-1 opener only, never a 6-, 10- or 15-cup rack.
      for (let n = 1; n < ids.length; n++) expect(ids[n]).not.toBe("types-equity");
    }
    const two = PONG_SECTIONS[1];
    const ids = Array.from({ length: 6 }, (_, n) => ruleAt(two, n, 5).id);
    for (let n = 1; n < ids.length; n++) expect(ids[n]).not.toBe(ids[n - 1]);
  });
});

// ---- clock -------------------------------------------------------------------------

describe("clock", () => {
  it("15 s on every rack, 20 s on the boss", () => {
    expect(secondsDefault(3)).toBe(15);
    expect(secondsDefault(10)).toBe(15);
    expect(secondsDefault(15)).toBe(20);
  });

  it("a tap 1 ms before the limit counts, a tap at the limit is a timeout", () => {
    const s = fresh();
    const limit = limitMs(s);
    expect(limit).toBe(15000);
    const ok = tap(s, correctIds(s)[0], T0 + limit - 1);
    expect(ok.score).toBe(100);
    expect(ok.lives).toBe(3);

    const late = tap(s, correctIds(s)[0], T0 + limit);
    expect(late.score).toBe(0);
    expect(late.lives).toBe(2);
    expect(late.phase).toBe("recap");
    expect(late.history[0].result).toBe("timeout");
  });

  it("taps before the clock is armed are ignored", () => {
    const s = startSection(createRun({ seed: 7 }), "types", 7);
    expect(s.clockStartedAt).toBeNull();
    expect(tap(s, correctIds(s)[0], 5)).toBe(s);
  });

  it("every sunk cup adds 2 s; a wrong cup adds nothing; the bonus does not carry over", () => {
    let s = fresh();
    const base = limitMs(s);
    s = tap(s, correctIds(s)[0], T0 + 100);
    expect(limitMs(s)).toBe(base + 2000);
    s = tap(s, wrongIds(s)[0], T0 + 200);
    expect(limitMs(s)).toBe(base + 2000);
    const id = correctIds(s).find((x) => !isTapped(s, x))!;
    const late = tap(s, id, T0 + base + 1500);
    expect(late.taps[late.taps.length - 1].correct).toBe(true);
    let t = fresh();
    t = clearRack(t); t = next(t);
    expect(limitMs(t)).toBe(15000);
  });
});

// ---- taps -------------------------------------------------------------------------------

describe("taps", () => {
  it("a cup locks the moment it is tapped — no double score", () => {
    const s = fresh();
    const id = correctIds(s)[0];
    const once = tap(s, id, T0 + 100);
    expect(tap(once, id, T0 + 200)).toBe(once);
    expect(once.score).toBe(100);
  });

  it("a wrong cup costs NO life; it resets heat, disables the cup, rack continues", () => {
    let s = fresh();
    s = clearRack(s); s = next(s); s = clearRack(s); s = next(s); s = clearRack(s); s = next(s);
    expect(s.multiplier).toBe(3);
    const bad = wrongIds(s)[0];
    const after = tap(s, bad, T0 + 100);
    expect(after.lives).toBe(3);
    expect(after.multiplier).toBe(1);
    expect(after.streak).toBe(0);
    expect(after.phase).toBe("playing");
    expect(isTapped(after, bad)).toBe(true);
    expect(tap(after, bad, T0 + 200)).toBe(after);
    const hit = tap(after, correctIds(after)[0], T0 + 300);
    expect(hit.score).toBe(after.score + 100);
  });

  it("clearing a rack after a mistake is not perfect", () => {
    let s = fresh();
    s = tap(s, wrongIds(s)[0], T0 + 50);
    s = clearRack(s);
    expect(s.history[0].result).toBe("cleared");
    expect(s.streak).toBe(0);
  });
});

// ---- lives, retries, the endless boss ------------------------------------------------------

describe("lives and the run", () => {
  it("a timed-out rack is tried again — same rule, fresh scramble, same score", () => {
    let s = fresh();
    s = tap(s, correctIds(s)[0], T0 + 100);
    const firstRack = s.rack!.cups.map((c) => c.id);
    const rule = s.rack!.rule.id;
    s = timeout(s, T0 + 20000);
    expect(s.lives).toBe(2);
    expect(retryPending(s)).toBe(true);
    const recap = recapFor(s, s.history[0]);
    expect(recap.retry).toBe(true);
    expect(recap.nextSize).toBeNull();
    const again = next(s);
    expect(again.rackNo).toBe(0);
    expect(again.attempt).toBe(1);
    expect(again.score).toBe(100);
    expect(again.rack!.rule.id).toBe(rule);
    expect(again.rack!.cups.map((c) => c.id)).not.toEqual(firstRack);
    const done = clearRack(again);
    expect(racksCleared(done)).toBe(1);
    expect(next(done).rackNo).toBe(1);
  });

  it("three timed-out racks end the run", () => {
    let s = fresh();
    s = timeout(s, T0 + 20000); s = next(s);
    s = timeout(s, T0 + 20000); s = next(s);
    s = timeout(s, T0 + 20000);
    expect(s.lives).toBe(0);
    expect(s.phase).toBe("results");
    expect(s.quit).toBe(false);
  });

  it("the boss keeps coming: 20 clean racks never end the run; quitting banks the score", () => {
    let s = fresh("increases", 3);
    for (let i = 0; i < 20; i++) {
      expect(s.phase).toBe("playing");
      expect(s.rackNo).toBe(i);
      expect(s.rack!.size).toBe(sizeAt(PONG_SECTIONS[1], i));
      expect(s.rack!.boss).toBe(i >= 4);
      s = clearRack(s);
      const recap = recapFor(s, s.history[s.history.length - 1]);
      expect(recap.bossCleared).toBe(i >= 4);
      expect(recap.nextSize).toBe(sizeAt(PONG_SECTIONS[1], i + 1));
      s = next(s);
    }
    expect(bossesCleared(s)).toBe(16);
    const q = quitRun(s);
    expect(q.phase).toBe("results");
    expect(q.quit).toBe(true);
    expect(runPoints(q)).toBe(q.score);
    expect(q.score).toBeGreaterThan(0);
  });

  it("restart reseeds the same section; starting another section resets lives and score", () => {
    let s = fresh("normal", 9);
    s = clearRack(s); s = next(s);
    s = timeout(s, T0 + 20000);
    const r = restart(s);
    expect(r.sectionId).toBe("normal");
    expect(r.seed).not.toBe(s.seed);
    expect(r.lives).toBe(3);
    expect(r.score).toBe(0);
    expect(r.history.length).toBe(0);
    const o = startSection(s, "tempperm");
    expect(o.sectionId).toBe("tempperm");
    expect(o.lives).toBe(3);
    expect(o.rackNo).toBe(0);
    expect(o.rack!.size).toBe(3);
  });
});

// ---- heat ---------------------------------------------------------------------------------

describe("heat", () => {
  it("ladder: 1st perfect 1×, 2nd 2×, 3rd+ 3×, applied from the NEXT rack", () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(1)).toBe(1);
    expect(multiplierFor(2)).toBe(2);
    expect(multiplierFor(3)).toBe(3);
    expect(heatLabel(1)).toBe("PERFECT!");
    expect(heatLabel(2)).toBe("HEATING UP!");
    expect(heatLabel(3)).toBe("ON FIRE!");

    let s = fresh();
    s = clearRack(s); expect(s.streak).toBe(1);
    s = next(s); expect(s.roundMultiplier).toBe(1);
    s = clearRack(s); expect(s.streak).toBe(2);
    s = next(s); expect(s.roundMultiplier).toBe(2);
    s = clearRack(s);
    expect(s.history[2].points).toBe(200 * s.history[2].taps.length);
    s = next(s); expect(s.roundMultiplier).toBe(3);
    const before = s.score;
    s = tap(s, correctIds(s)[0], T0 + 100);
    expect(s.score - before).toBe(300);
  });

  it("a timeout drops heat to 1× for the retry", () => {
    let s = fresh();
    s = clearRack(s); s = next(s); s = clearRack(s); s = next(s);
    expect(s.roundMultiplier).toBe(2);
    s = timeout(s, T0 + 20000);
    s = next(s);
    expect(s.roundMultiplier).toBe(1);
  });
});

// ---- recap ----------------------------------------------------------------------------------

describe("recap", () => {
  it("explains the first wrong cup in a few words, else the first missed cup; the cheat fits the rack", () => {
    let s = fresh();
    const bad = wrongIds(s)[0];
    s = tap(s, bad, T0 + 50);
    s = clearRack(s);
    const recap = recapFor(s, s.history[0]);
    expect(recap.explanationCup?.id).toBe(bad);
    expect(recap.explanation).toBe(`${recap.explanationCup!.label} — ${recap.explanationCup!.why}`);
    expect(recap.cheat.length).toBeGreaterThan(0);
    const ids = s.history[0].rack.cups.map((c) => c.id);
    if (!ids.includes("dividends")) expect(recap.cheat).not.toContain("Dividends");

    let t = fresh();
    t = tap(t, correctIds(t)[0], T0 + 50);
    t = timeout(t, T0 + 20000);
    const missed = recapFor(t, t.history[0]);
    expect(missed.missed.length).toBeGreaterThan(0);
    expect(missed.explanationCup?.id).toBe(missed.missed[0].id);

    let p = fresh();
    p = clearRack(p);
    expect(recapFor(p, p.history[0]).explanation).toBeNull();
  });
});
