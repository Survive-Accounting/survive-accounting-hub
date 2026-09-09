import { describe, expect, test } from "bun:test";

import { addSlideFromIdea, frameForIdea, ideaLines } from "./idea-to-slide";
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

  test("at the end when nothing is selected — the Suggestions page has no deck to point at", () => {
    const next = addSlideFromIdea(frames, null, idea);
    expect(next).toHaveLength(4);
    expect(next[3].kind).toBe("cheat");
  });

  test("at the end when the selected slide is gone", () => {
    expect(addSlideFromIdea(frames, "nope", idea)[3].kind).toBe("cheat");
  });

  test("the original list is never mutated", () => {
    addSlideFromIdea(frames, "f2", idea);
    expect(frames).toHaveLength(3);
  });
});
