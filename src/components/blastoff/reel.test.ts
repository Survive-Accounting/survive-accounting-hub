// What a Reel is, pinned: its ranked callouts, the star that says what it's ABOUT, the question
// count, the length estimate and the budget nudge.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { planTakes, type BlastFrame } from "./plan";
import { REEL_BUDGET, reelClock, reelSummary, reelTitle, setLead, takeSummary } from "./reel";

const f = (id: string, kind: BlastFrame["kind"], extra: Partial<BlastFrame> = {}): BlastFrame => ({ id, kind, ...extra });

const run: BlastFrame[] = [
  f("i", "intro"),
  f("q1", "ceq", { ceqId: "c1" }),
  f("ch", "cheat", { title: "The paycheck test" }),
  f("q2", "ceq", { ceqId: "c2" }),
  f("ph", "phrase", { text: "Internal = inside" }),
  f("o", "outro"),
];

describe("a reel", () => {
  test("its callouts rank in filming order until one is starred", () => {
    const plain = reelSummary(run);
    expect(plain.callouts.map((c) => c.frameId)).toEqual(["ch", "ph"]);
    expect(plain.lead?.text).toBe("The paycheck test");
    expect(plain.lead?.label).toBe("Cheat code");
    const starred = reelSummary(run.map((x) => (x.id === "ph" ? { ...x, lead: true as const } : x)));
    expect(starred.callouts.map((c) => c.frameId)).toEqual(["ph", "ch"]);
    expect(starred.lead?.text).toBe("Internal = inside");
  });

  test("questions are the cards it covers — note-only cards are breath, not questions", () => {
    expect(reelSummary(run).questions).toBe(2);
    const withNote = [...run, f("n", "ceq", { ceqId: "note1" })];
    expect(reelSummary(withNote, (id) => id === "note1").questions).toBe(2);
    // a rubric made from a card counts as that card's question, once
    const withRubric = [...run, f("r", "rubric", { ceqId: "c3" }), f("dup", "ceq", { ceqId: "c3" })];
    expect(reelSummary(withRubric).questions).toBe(3);
  });

  test("the estimate adds up and says when it's over Lee's 45 seconds", () => {
    const short = reelSummary([f("i", "intro"), f("ch", "cheat"), f("o", "outro")]);
    expect(short.seconds).toBe(16);
    expect(short.over).toBe(false);
    expect(reelSummary(run).over).toBe(true);            // 6 slides with two cards is already past it
    expect(REEL_BUDGET.target).toBe(30);
    expect(REEL_BUDGET.max).toBe(45);
    // a callout drawn BIG is a wall, not a card to read
    const big = reelSummary([f("ch", "cheat", { display: "big" })]);
    expect(big.seconds).toBeLessThan(reelSummary([f("ch", "cheat")]).seconds);
  });

  test("a reel is called what it's about, unless Lee named it", () => {
    const [take] = planTakes(run);
    expect(reelTitle(take, takeSummary(take))).toBe("The paycheck test");
    const named = planTakes(run.map((x) => (x.id === "i" ? { ...x, takeName: "Prepaids" } : x)))[0];
    expect(reelTitle(named, takeSummary(named))).toBe("Prepaids");
    const bare = planTakes([f("i", "intro"), f("q", "ceq", { ceqId: "c" })])[0];
    expect(reelTitle(bare, takeSummary(bare))).toBe("Reel 1");
  });

  test("starring is one per run, and starring the star again clears it", () => {
    const ids = run.map((x) => x.id);
    const one = setLead(run, ids, "ph");
    expect(one.filter((x) => x.lead).map((x) => x.id)).toEqual(["ph"]);
    const moved = setLead(one, ids, "ch");
    expect(moved.filter((x) => x.lead).map((x) => x.id)).toEqual(["ch"]);
    expect(setLead(moved, ids, "ch").some((x) => x.lead)).toBe(false);
    // another run's star is left alone
    const two = [...one, f("ch2", "cheat", { lead: true })];
    expect(setLead(two, ids, "ch").filter((x) => x.lead).map((x) => x.id)).toEqual(["ch", "ch2"]);
  });

  test("the clock reads for a strip", () => {
    expect(reelClock(38)).toBe("38s");
    expect(reelClock(75)).toBe("1:15");
    expect(reelClock(120)).toBe("2:00");
  });
});

// REELS MODE (2026-09-12) — the Editor wiring, pinned at the source the way the other Editor
// behaviours are. Lee: "Looking at only one at a time. Like we can 'ghost' one portion of the
// chain for a while."
describe("reels mode in the Editor", () => {
  const deck = readFileSync(join(import.meta.dir, "ReviewDeck.tsx"), "utf8").split("\r\n").join("\n");

  test("one Reel is open — the one holding the selection — and it is remembered per browser", () => {
    expect(deck).toContain('const REELS_KEY = "sa-review-reels"');
    expect(deck).toContain("reelsMode ? take.headId !== openHead : collapsed.has(take.headId)");
    expect(deck).toContain("takeOf.get(selId)?.take.headId");
  });

  test("every other run is a ghosted bar that opens on a click, not a fold", () => {
    expect(deck).toContain("...(reelsMode ? { opacity: 0.5, maxWidth: 210 } : {})");
    expect(deck).toContain("onClick={() => (reelsMode ? setSelId(take.headId) : toggleGroup(take.headId))}");
    // the manual fold button steps aside while the mode owns the folds
    expect(deck).toContain("{hasCuts && !reelsMode && (");
  });

  test("the open Reel says what it is: the estimate, its questions, its callouts ranked", () => {
    expect(deck).toContain("reelClock(r.seconds)");
    expect(deck).toContain('r.over ? " · split it" : ""');
    expect(deck).toContain("commit(setLead(frames, take.frames.map((x) => x.id), c.frameId))");
  });
});
