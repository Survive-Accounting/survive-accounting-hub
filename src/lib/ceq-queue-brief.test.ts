// THE CEQ QUEUE's pure half. A job's result is only as trustworthy as this parser: a card with two
// correct answers or no stem must never reach the deck, and a good card must never be lost to a
// stray emoji or a confidence of 1.4.
import { describe, expect, test } from "bun:test";

import {
  buildCeqQueueMessages, candidateToCardData, CEQ_QUEUE_SYSTEM, CEQ_QUEUE_WANT, normalizeCandidate, parseCandidateSet,
} from "./ceq-queue-brief";

const good = { stem: "Is prepaid rent an asset?", choices: [{ text: "Yes", correct: true, feedback: "Paid for, not yet used." }, { text: "No", correct: false }, { text: "None of these", correct: false }], kind: "tricky", confidence: 0.8, why: "the prepaid trap" };

describe("the brief", () => {
  test("what Lee said leads, the parent set is the style guide, feedback is memory", () => {
    const m = buildCeqQueueMessages({
      name: "Land isn't depreciated", blurb: "the contra account",
      segments: [{ text: "land never depreciates, ever" }],
      parentCards: [{ stem: "What type of account is Land?", choices: [{ text: "Asset", correct: true }] }],
      feedback: [{ stem: "kept one", action: "kept" }, { stem: "dropped one", action: "dropped" }],
      want: 6,
    });
    expect(m.system).toBe(CEQ_QUEUE_SYSTEM);
    expect(m.user.indexOf("WHAT LEE SAID")).toBeLessThan(m.user.indexOf("PARENT SET"));
    expect(m.user).toContain("land never depreciates, ever");
    expect(m.user).toContain("What type of account is Land? → Asset");
    expect(m.user).toContain("HE KEPT THESE");
    expect(m.user).toContain("kept one");
    expect(m.user).toContain("HE DROPPED THESE");
    expect(m.user).toContain("dropped one");
    expect(m.user).toContain("Write 6 candidates.");
  });
  test("no talk is said plainly, never faked", () => {
    const m = buildCeqQueueMessages({ name: "x", blurb: "", segments: [], parentCards: [], feedback: [], want: CEQ_QUEUE_WANT });
    expect(m.user).toContain("nothing recorded");
    expect(m.user).not.toContain("HE KEPT");
  });
  test("the system prompt carries the bank's four trap conventions and the register", () => {
    for (const s of ["None of these", "WHAT IF INSTEAD", "wrong side", "no emoji"]) expect(CEQ_QUEUE_SYSTEM).toContain(s);
  });
});

describe("normalizeCandidate", () => {
  test("a good card comes through, confidence rounded", () => {
    const c = normalizeCandidate({ ...good, confidence: 0.8449 })!;
    expect(c.stem).toBe(good.stem);
    expect(c.choices.length).toBe(3);
    expect(c.kind).toBe("tricky");
    expect(c.confidence).toBe(0.84);
    expect(c.choices[0].feedback).toBe("Paid for, not yet used.");
  });
  test("refused: no stem, too few choices, too many, zero correct, two correct", () => {
    expect(normalizeCandidate({ ...good, stem: "" })).toBeNull();
    expect(normalizeCandidate({ ...good, choices: good.choices.slice(0, 2) })).toBeNull();
    expect(normalizeCandidate({ ...good, choices: [...good.choices, { text: "d" }, { text: "e" }, { text: "f" }, { text: "g" }] })).toBeNull();
    expect(normalizeCandidate({ ...good, choices: good.choices.map((c) => ({ ...c, correct: false })) })).toBeNull();
    expect(normalizeCandidate({ ...good, choices: good.choices.map((c) => ({ ...c, correct: true })) })).toBeNull();
    expect(normalizeCandidate(null)).toBeNull();
    expect(normalizeCandidate("nope")).toBeNull();
  });
  test("normalised, not refused: emoji, wild confidence, unknown kind, duplicate choice text", () => {
    const c = normalizeCandidate({ ...good, stem: "Is it 🎉 an asset?", confidence: 1.4, kind: "riddle", choices: [...good.choices, { text: "yes", correct: false }] })!;
    expect(c.stem).toBe("Is it an asset?");
    expect(c.confidence).toBe(1);
    expect(c.kind).toBe("question");
    expect(c.choices.length).toBe(3); // "yes" duplicates "Yes"
    expect(normalizeCandidate({ ...good, confidence: "high" })!.confidence).toBe(0.5);
  });
});

describe("parseCandidateSet", () => {
  test("the model's JSON, with a bad card counted and a duplicate stem counted", () => {
    const text = `Here you go:\n${JSON.stringify({ name: "A name", blurb: "a blurb", cards: [good, { ...good, stem: "" }, good, { ...good, stem: "Another" }] })}`;
    const r = parseCandidateSet(text);
    expect(r.name).toBe("A name");
    expect(r.blurb).toBe("a blurb");
    expect(r.cards.map((c) => c.stem)).toEqual([good.stem, "Another"]);
    expect(r.dropped).toBe(2);
  });
  test("no JSON, or broken JSON, is an empty honest result rather than a throw", () => {
    expect(parseCandidateSet("I cannot help with that.")).toEqual({ cards: [], dropped: 0 });
    expect(parseCandidateSet("{ cards: [ oops")).toEqual({ cards: [], dropped: 0 });
  });
  test("null name/blurb are simply absent", () => {
    const r = parseCandidateSet(JSON.stringify({ name: null, blurb: null, cards: [good] }));
    expect("name" in r).toBe(false);
    expect("blurb" in r).toBe(false);
  });
});

describe("candidateToCardData", () => {
  test("it is the bank's card shape, marked draft and stamped with its origin", () => {
    const d = candidateToCardData(normalizeCandidate(good)!, "deck-x", 3.5, "job-1");
    expect(d.deckId).toBe("deck-x");
    expect(d.prompt).toBe(good.stem);
    expect(d.draft).toBe(true);
    expect(d.provenance).toBe("ceq-queue");
    expect(d.jobId).toBe("job-1");
    expect(d.stageOrder).toBe(3.5);
    expect((d.choices as { feedback?: string }[])[1].feedback).toBeUndefined(); // empty feedback is omitted
    expect((d.choices as { feedback?: string }[])[0].feedback).toBe("Paid for, not yet used.");
  });
});
