// feedback-audit.test.ts — the audit's helpers, pinned on fixtures shaped like the live bank.
//
// The script itself is read-only and only builds a DB client under import.meta.main, so
// importing it here touches nothing; that is the first thing this file proves.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type AuditCard,
  NEAR_DUPLICATE_THRESHOLD,
  auditCards,
  deckArgs,
  exactDuplicates,
  feedbackCounts,
  feedbackEntries,
  inheritedFeedback,
  jaccard,
  nearDuplicates,
  normalizeFeedback,
  staleCards,
  tokens,
} from "./feedback-audit";

const card = (id: string, feedback: (string | undefined)[], extra: Partial<AuditCard> = {}): AuditCard => ({
  id,
  label: id.toUpperCase(),
  stem: `stem of ${id}`,
  clonedFrom: null,
  feedbackStale: false,
  noteOnly: false,
  draft: false,
  // first choice correct, the rest wrong — the bank's usual shape
  choices: feedback.map((f, i) => ({ text: `choice ${i}`, correct: i === 0, feedback: f ?? "" })),
  ...extra,
});

describe("importing the script is side-effect free", () => {
  test("the DB client lives under import.meta.main, so a test import cannot hit Supabase", () => {
    const src = readFileSync(join(import.meta.dir, "feedback-audit.ts"), "utf8").split("\r\n").join("\n");
    expect(src).toContain("if (import.meta.main)");
    // createClient is imported lazily inside main(), never at module scope
    expect(src.split("\n").filter((l) => l.startsWith("import ")).join("\n")).not.toContain("@supabase/supabase-js");
  });
  test("it never writes: no update/insert/upsert/delete call anywhere in the script", () => {
    const src = readFileSync(join(import.meta.dir, "feedback-audit.ts"), "utf8").split("\r\n").join("\n");
    for (const verb of [".update(", ".insert(", ".upsert(", ".delete(", ".rpc("]) expect(src).not.toContain(verb);
  });
});

describe("normalizeFeedback / tokens", () => {
  test("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeFeedback("  Bonds, Payable!  are LONG-term.\n")).toBe("bonds payable are long term");
  });
  test("tokens are the distinct words", () => {
    expect([...tokens("a b, A. b c")].sort()).toEqual(["a", "b", "c"]);
    expect(tokens("").size).toBe(0);
    expect(tokens("!!!").size).toBe(0);
  });
});

describe("jaccard", () => {
  test("identical sentences score 1, disjoint ones 0", () => {
    expect(jaccard("Notes payable are current.", "notes PAYABLE are current")).toBe(1);
    expect(jaccard("one two", "three four")).toBe(0);
  });
  test("shared / union, on distinct words", () => {
    // {a,b,c} ∩ {b,c,d} = 2, ∪ = 4
    expect(jaccard("a b c", "b c d")).toBe(0.5);
    // repeats do not count twice
    expect(jaccard("a a a b", "a b")).toBe(1);
  });
  test("two empty sentences share nothing, so 0 — never a division by zero", () => {
    expect(jaccard("", "")).toBe(0);
    expect(jaccard("", "word")).toBe(0);
  });
  test("the threshold Lee named", () => {
    expect(NEAR_DUPLICATE_THRESHOLD).toBe(0.7);
  });
});

describe("feedbackEntries", () => {
  test("one entry per non-empty feedback, with its address; empties and whitespace are skipped", () => {
    const cards = [card("q1", ["Right.", "", "  "]), card("q2", [undefined, "Wrong because…"])];
    const es = feedbackEntries(cards);
    expect(es.map((e) => [e.ceqId, e.choice, e.correct, e.feedback])).toEqual([
      ["q1", 0, true, "Right."],
      ["q2", 1, false, "Wrong because…"],
    ]);
    expect(es[0].label).toBe("Q1");
    expect(es[0].stem).toBe("stem of q1");
  });
});

describe("exactDuplicates (a)", () => {
  test("groups the same trimmed string across cards and choices; singletons drop out", () => {
    const cards = [
      card("q1", ["Notes payable are current."]),
      card("q2", ["Notes payable are current. "]), // trailing space — still exact
      card("q3", ["notes payable are current."]),  // case differs — NOT exact
      card("q4", ["Something else."]),
    ];
    const groups = exactDuplicates(feedbackEntries(cards));
    expect(groups).toHaveLength(1);
    expect(groups[0].map((e) => e.ceqId)).toEqual(["q1", "q2"]);
  });
  test("no duplicates → no groups", () => {
    expect(exactDuplicates(feedbackEntries([card("q1", ["a"]), card("q2", ["b"])]))).toEqual([]);
  });
});

describe("nearDuplicates (b)", () => {
  test("pairs at or above the threshold, highest first; exact matches are left to (a)", () => {
    const cards = [
      card("q1", ["Bonds payable are long-term liabilities due in more than a year."]),
      card("q2", ["Notes payable are long-term liabilities due in more than a year."]),
      card("q3", ["Bonds payable are long-term liabilities due in more than a year."]), // exact of q1
      card("q4", ["Cash is an asset."]),
    ];
    const pairs = nearDuplicates(feedbackEntries(cards));
    // q1↔q2 and q3↔q2 are near (one word swapped); q1↔q3 is exact and excluded
    expect(pairs.map((p) => [p.a.ceqId, p.b.ceqId])).toEqual([["q1", "q2"], ["q2", "q3"]]);
    for (const p of pairs) expect(p.score).toBeGreaterThanOrEqual(0.7);
    expect(pairs.every((p) => !(p.a.ceqId === "q1" && p.b.ceqId === "q3"))).toBe(true);
  });
  test("a custom threshold is honoured", () => {
    const cards = [card("q1", ["a b c d"]), card("q2", ["a b x y"])]; // 2/6 = 0.33
    expect(nearDuplicates(feedbackEntries(cards))).toHaveLength(0);
    expect(nearDuplicates(feedbackEntries(cards), 0.3)).toHaveLength(1);
  });
});

describe("inheritedFeedback (c)", () => {
  test("a clone that still says what its source said is identical at that choice", () => {
    const src = card("q9", ["Prepaid rent is an asset.", "", "Nope."]);
    const clone = card("q9-copy-abc", ["Prepaid rent is an asset.", "", "Nope."], { clonedFrom: "q9" });
    const [r] = inheritedFeedback([src, clone]);
    expect(r.clone.id).toBe("q9-copy-abc");
    expect(r.source?.id).toBe("q9");
    expect(r.identical).toEqual([0, 2]); // choice 1 is empty on both — nothing was inherited there
  });
  test("once Lee rewrites it, the card is no longer identical", () => {
    const src = card("q9", ["Prepaid rent is an asset."]);
    const clone = card("q9-copy-abc", ["Prepaid insurance is an asset."], { clonedFrom: "q9" });
    expect(inheritedFeedback([src, clone])[0].identical).toEqual([]);
  });
  test("a source that left the deck is reported, not skipped", () => {
    const clone = card("q9-copy-abc", ["x"], { clonedFrom: "gone" });
    const [r] = inheritedFeedback([clone]);
    expect(r.source).toBeNull();
    expect(r.identical).toEqual([]);
  });
  test("cards that were not cloned are not listed", () => {
    expect(inheritedFeedback([card("q1", ["a"]), card("q2", ["a"])])).toEqual([]);
  });
});

describe("feedbackCounts (d)", () => {
  test("questions exclude note-only cards; choice tallies split correct from wrong", () => {
    const cards = [
      card("q1", ["Right.", "", "", ""]),          // 1 correct with, 3 wrong without
      card("q2", ["Right.", "Wrong.", "", ""]),    // 1 correct with, 1 of 3 wrong with
      card("q3", ["", "", ""]),                    // correct without feedback
      card("note", ["ignored"], { noteOnly: true }),
    ];
    expect(feedbackCounts(cards)).toEqual({ questions: 3, correct: 3, correctWith: 2, wrong: 8, wrongWith: 1 });
  });
});

describe("staleCards (e)", () => {
  test("only the flagged ones", () => {
    const cards = [card("q1", ["a"]), card("q2", ["a"], { feedbackStale: true })];
    expect(staleCards(cards).map((c) => c.id)).toEqual(["q2"]);
  });
});

describe("auditCards — the bank's own filter and order", () => {
  test("drops archived cards and blast-off film frames, sorts by stageOrder, labels Q{n} by position", () => {
    const nodes = [
      { id: "b", type: "ceq", data: { stageOrder: 2, prompt: "second", choices: [{ text: "x", correct: true, feedback: "why" }] } },
      { id: "arch", type: "ceq", data: { stageOrder: 0, prompt: "gone", bankArchived: "2026-09-01" } },
      { id: "film", type: "ceq", data: { stageOrder: 0.5, prompt: "frame", provenance: "blast-off", noteOnly: true } },
      { id: "a", type: "ceq", data: { stageOrder: 1, prompt: "first", shorthand: "Q1 · Cash", choices: [{ text: "x", correct: true }] } },
      { id: "c", type: "ceq", data: { stageOrder: 2.5, prompt: "clone", clonedFrom: "b", feedbackStale: true, choices: [{ text: "x", correct: true, feedback: "why" }] } },
    ];
    const cards = auditCards(nodes);
    expect(cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(cards.map((c) => c.label)).toEqual(["Q1 · Cash", "Q2", "Q3"]);
    expect(cards[0].choices[0].feedback).toBe("");      // absent feedback reads as ""
    expect(cards[1].choices[0].feedback).toBe("why");
    expect(cards[2]).toMatchObject({ clonedFrom: "b", feedbackStale: true });
    expect(cards[1]).toMatchObject({ clonedFrom: null, feedbackStale: false });
  });
  test("a card with no choices array still audits (zero choices)", () => {
    expect(auditCards([{ id: "x", type: "ceq", data: { prompt: "p" } }])[0].choices).toEqual([]);
  });
});

describe("deckArgs", () => {
  test("collects every --deck id, ignores everything else", () => {
    expect(deckArgs(["bun", "script.ts", "--deck", "deck-e1s-2-1", "--verbose", "--deck", "deck-e1s-6-2"])).toEqual(["deck-e1s-2-1", "deck-e1s-6-2"]);
    expect(deckArgs(["bun", "script.ts"])).toEqual([]);
    expect(deckArgs(["bun", "script.ts", "--deck"])).toEqual([]); // dangling flag, no id
  });
});
