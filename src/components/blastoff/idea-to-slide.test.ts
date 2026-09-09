import { describe, expect, test } from "bun:test";

import { addSlideFromIdea, afterFrameForCeq, buildDraftFromIdeas, frameForIdea, ideaLines } from "./idea-to-slide";
import { frameBullets, insertStem, type BlastFrame } from "./plan";

// Lee, 2026-09-08: "When I added slide it also made cheat codes as a batch. I want an individual
// cheat code slide for each… they just ended up all in the title. Not the list part."
describe("an idea from the board becomes a slide", () => {
  const body = "Ask what the company received.\nThen ask what it gave up.\n- Never the owner's view.";

  test("the lines under a callout are the body, one per line, markers stripped", () => {
    expect(ideaLines(body)).toEqual(["Ask what the company received.", "Then ask what it gave up.", "Never the owner's view."]);
    expect(ideaLines(undefined)).toEqual([]);
    expect(ideaLines("\n\n  \n")).toEqual([]);
  });

  test("a cheat code: the item's title is the heading, the body is the bullets", () => {
    const f = frameForIdea({ kind: "cheat_code", text: body, itemId: "b1", title: "Think from inside the company" });
    expect(f.kind).toBe("cheat");
    expect(f.title).toBe("Think from inside the company");
    expect(f.bullets).toEqual(["Ask what the company received.", "Then ask what it gave up.", "Never the owner's view."]);
    expect(f.bankItemId).toBe("b1");
    // What the card actually draws — the whole point of the fix.
    expect(insertStem(f)).toBe("Think from inside the company");
    expect(frameBullets(f)).toHaveLength(3);
  });

  // THE REGRESSION, named: the old call site put payload.body into `title` and set nothing else.
  test("the whole body never lands in the heading", () => {
    const f = frameForIdea({ kind: "cheat_code", text: body, itemId: "b1", title: "Think from inside the company" });
    expect(insertStem(f)).not.toContain("\n");
    expect(insertStem(f).length).toBeLessThan(body.length);
    expect(frameBullets(f).length).toBeGreaterThan(0);   // it used to be []
  });

  test("with no title of its own, the first line is the heading and does not repeat as a bullet", () => {
    const f = frameForIdea({ kind: "cheat_code", text: body, itemId: "b1" });
    expect(f.title).toBe("Ask what the company received.");
    expect(f.bullets).toEqual(["Then ask what it gave up.", "Never the owner's view."]);
  });

  test("every other callout puts its heading in `text`, not `title`", () => {
    const f = frameForIdea({ kind: "memorize_this", text: body, itemId: "b2", title: "Internal users" });
    expect(f.kind).toBe("phrase");
    expect(f.text).toBe("Internal users");
    expect(f.title).toBeUndefined();
    expect(f.bullets).toHaveLength(3);
  });

  test("a tricky stamp becomes a tricky slide", () => {
    expect(frameForIdea({ kind: "tricky", text: "x", itemId: "b3", title: "Dividends are contra-EQUITY" }).kind).toBe("tricky");
  });

  test("an illustration idea is a bare slide carrying the brief, not a callout", () => {
    const f = frameForIdea({ kind: "illustration", text: "a scale tipping", itemId: "b4" });
    expect(f.kind).toBe("blank");
    expect(f.illustration?.prompt).toBe("a scale tipping");
  });

  test("a one-line idea is a heading with no bullets", () => {
    const f = frameForIdea({ kind: "cheat_code", text: "Debits go left.", itemId: "b5" });
    expect(f.title).toBe("Debits go left.");
    expect(f.bullets).toBeUndefined();
  });
});

describe("where the slide lands", () => {
  const frames: BlastFrame[] = [
    { id: "f1", kind: "open" },
    { id: "f2", kind: "ceq", ceqId: "c1" },
    { id: "f3", kind: "outro" },
  ];
  const idea = { kind: "cheat_code", text: "Debits go left.", itemId: "b1" };

  test("after the slide you had selected", () => {
    expect(addSlideFromIdea(frames, "f2", idea).map((f) => f.id).slice(0, 3)).toEqual(["f1", "f2", expect.any(String) as unknown as string]);
    expect(addSlideFromIdea(frames, "f2", idea)[2].kind).toBe("cheat");
  });

  // "The end" is ahead of the sign-off: a slide after the outro is a slide nobody sees.
  test("at the end — ahead of the outro — when nothing is selected (the Suggestions page has no deck to point at)", () => {
    const next = addSlideFromIdea(frames, null, idea);
    expect(next).toHaveLength(4);
    expect(next.map((f) => f.kind)).toEqual(["open", "ceq", "cheat", "outro"]);
  });

  test("at the end when the selected slide is gone", () => {
    expect(addSlideFromIdea(frames, "nope", idea).map((f) => f.kind)).toEqual(["open", "ceq", "cheat", "outro"]);
  });

  test("the original list is never mutated", () => {
    addSlideFromIdea(frames, "f2", idea);
    expect(frames).toHaveLength(3);
  });
});

// Lee, 2026-09-09: "when I stamp in for memorize this, I wanna be more clear: this can go in
// between this question and this question." The booth already knows the card he was on, so the
// anchor is automatic — a cheat code stamped on Q3 lands after Q3.
describe("the anchor", () => {
  const frames: BlastFrame[] = [
    { id: "open", kind: "open" }, { id: "intro", kind: "intro" },
    { id: "q1", kind: "ceq", ceqId: "c1" },
    { id: "q2", kind: "ceq", ceqId: "c2" }, { id: "memo-after-q2", kind: "phrase", text: "x" },
    { id: "q3", kind: "ceq", ceqId: "c3" },
    { id: "bio", kind: "bio" }, { id: "outro", kind: "outro" },
  ];
  test("a card with nothing after it: the card itself", () => {
    expect(afterFrameForCeq(frames, "c1")).toBe("q1");
  });
  test("a card that already has inserts after it: the LAST of them, so new ones keep the spoken order", () => {
    expect(afterFrameForCeq(frames, "c2")).toBe("memo-after-q2");
  });
  test("the spine is never 'after a card' — a card followed by the bio anchors on the card", () => {
    expect(afterFrameForCeq(frames, "c3")).toBe("q3");
  });
  test("no card, no anchor", () => {
    expect(afterFrameForCeq(frames, "nope")).toBeNull();
    expect(afterFrameForCeq(frames, null)).toBeNull();
  });

  // "It should just have suggested slides and put them IN THEIR PLACE already."
  test("Build the draft: every idea at its anchor, three from one window in order, the unanchored at the end", () => {
    const next = buildDraftFromIdeas(frames, [
      { kind: "cheat_code", text: "a", itemId: "b1", title: "Code one", anchorCeqId: "c1" },
      { kind: "cheat_code", text: "b", itemId: "b2", title: "Code two", anchorCeqId: "c1" },
      { kind: "memorize_this", text: "c", itemId: "b3", title: "Remember", anchorCeqId: "c3" },
      { kind: "tricky", text: "d", itemId: "b4", title: "Loose", anchorCeqId: null },
    ]);
    const ids = next.map((f) => f.bankItemId ?? f.id);
    // The unanchored one lands ahead of the sign-off, never after "Start cramming free".
    expect(ids).toEqual(["open", "intro", "q1", "b1", "b2", "q2", "memo-after-q2", "q3", "b3", "b4", "bio", "outro"]);
    expect(frames).toHaveLength(8);   // pure
  });
});
