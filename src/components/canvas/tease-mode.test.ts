// TEASE MODE — three states per exhibit node, and the note-frame eyebrow.
//
// This is filmed material, so the tests defend PREDICTABILITY above all: one
// click is exactly one advance, the order never varies, and nothing here can
// resize the card mid-take.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { EXHIBIT_GLOW, STATE_CYCLE, cycleState, toggleLit, type ExhibitStates } from "./exhibit-highlights";
import { NOTE_EYEBROW } from "./frame-copy";

const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const cycleCard = readFileSync(join(import.meta.dir, "cards", "CycleNode.tsx"), "utf8").split("\r\n").join("\n");
const base = readFileSync(join(import.meta.dir, "exhibit-base.tsx"), "utf8").split("\r\n").join("\n");

const m = (pairs: [string, "lit" | "blurred"][] = []): ExhibitStates => new Map(pairs);

describe("the note-frame eyebrow", () => {
  test("is the static line, from ONE constant", () => {
    expect(NOTE_EYEBROW).toBe("FOUND ON YOUR EXAM");
  });
  test("a NOTE frame uses it; a CEQ card keeps the topic kicker", () => {
    expect(previewer).toContain("const topic = cd.noteOnly ? NOTE_EYEBROW : student && topicName ? topicName : null;");
  });
  test("the film stack's note frames use it too — not just the live one", () => {
    expect(previewer).toContain("topic: od.noteOnly ? NOTE_EYEBROW : viewStudent && topicName ? topicName : null,");
  });
  test("no topic or exam number is hard-coded next to it", () => {
    // The whole point: footage that names a school can only be sold to that school.
    expect(NOTE_EYEBROW).not.toMatch(/exam\s*[123]|final|ole miss|accy|\d/i);
  });
});

describe("the click cycle", () => {
  test("normal → lit → blurred → normal, and it LOOPS", () => {
    let s: ExhibitStates = m();
    s = cycleState(s, "a"); expect(s.get("a")).toBe("lit");
    s = cycleState(s, "a"); expect(s.get("a")).toBe("blurred");
    s = cycleState(s, "a"); expect(s.get("a")).toBeUndefined();       // back to normal
    s = cycleState(s, "a"); expect(s.get("a")).toBe("lit");           // and round again
  });
  test("the order is fixed data, so it cannot drift", () => {
    expect([...STATE_CYCLE]).toEqual([undefined, "lit", "blurred"]);
  });
  test("one click is exactly ONE advance — never two", () => {
    // A double-advance mid-take would skip past the state Lee wanted on camera.
    const once = cycleState(m(), "a");
    expect([...once.entries()]).toEqual([["a", "lit"]]);
  });
  test("nodes are independent — any mix across nine steps is valid", () => {
    let s: ExhibitStates = m();
    s = cycleState(s, "a");                       // lit
    s = cycleState(cycleState(s, "b"), "b");      // blurred
    expect(s.get("a")).toBe("lit");
    expect(s.get("b")).toBe("blurred");
    expect(s.get("c")).toBeUndefined();
  });
  test("returning to normal DELETES the entry, so reset is an empty map", () => {
    const s = cycleState(cycleState(cycleState(m(), "a"), "a"), "a");
    expect(s.size).toBe(0);
  });
  test("it never mutates the map it was handed", () => {
    const before = m([["a", "lit"]]);
    const after = cycleState(before, "a");
    expect(before.get("a")).toBe("lit");
    expect(after.get("a")).toBe("blurred");
  });
  test("the legacy binary toggle still works for anything not on tease mode", () => {
    expect([...toggleLit(new Set(), "a")]).toEqual(["a"]);
    expect([...toggleLit(new Set(["a"]), "a")]).toEqual([]);
  });
});

describe("what the states LOOK like on camera", () => {
  test("blurred is heavy enough to survive a pause-and-zoom", () => {
    const px = Number(/blur\((\d+(?:\.\d+)?)px\)/.exec(EXHIBIT_GLOW.blurFilter)?.[1]);
    expect(px).toBeGreaterThanOrEqual(10);          // pill text is ~10–16px
    expect(EXHIBIT_GLOW.blurFilter).toContain("contrast");  // stops letterforms reassembling when scaled
  });
  test("a blurred node stays PRESENT — visible border, near-full opacity", () => {
    expect(EXHIBIT_GLOW.blurredOpacity).toBeGreaterThan(0.8);
    expect(EXHIBIT_GLOW.blurredBorder).not.toBe("transparent");
  });
  test("the blur lands on the TEXT, not the node box — the shape must stay crisp", () => {
    expect(cycleCard).toContain("filter: ns.contentFilter");
    expect(base).toContain("...(blurred ? { contentFilter: EXHIBIT_GLOW.blurFilter } : {}),");
  });
  test("lit reads at thumbnail size: glow plus a SLIGHT scale, nothing dramatic", () => {
    expect(EXHIBIT_GLOW.litScale).toBeGreaterThan(1);
    expect(EXHIBIT_GLOW.litScale).toBeLessThanOrEqual(1.1);
  });
  test("transitions are fast and have no bounce", () => {
    const ms = Number(/(\d+)ms/.exec(EXHIBIT_GLOW.transition)?.[1]);
    expect(ms).toBeGreaterThanOrEqual(150);
    expect(ms).toBeLessThanOrEqual(250);
    expect(EXHIBIT_GLOW.transition).not.toMatch(/cubic-bezier|bounce|elastic/);
  });
  test("the scale is on the NODE, and the card's own box is never touched", () => {
    expect(cycleCard).toContain("transform: `translate(-50%, -50%) scale(${ns.scale})`");
    // the exhibit law: no width/height/position writes from emphasis
    expect(base).not.toMatch(/nodeStyle[\s\S]{0,400}(width|height):/);
  });
  test("a blurred node is NOT dimmed as well — that would hide it, not tease it", () => {
    expect(base).toContain("const dimmed = hl.any && !lit && !blurred;");
  });
  test("blurring alone does not dim the other steps — only LIT drives the recede", () => {
    // `any` counts lit nodes only.
    const src = readFileSync(join(import.meta.dir, "exhibit-highlights.ts"), "utf8").split("\r\n").join("\n");
    expect(src).toContain("any: lit.size > 0,");
  });
});

describe("the keys", () => {
  test("backtick still does the full global wipe — and it GREW, it did not shrink", () => {
    // 08-17: the boss reveal joined the wipe. Every clear that was there before
    // is still there; asserting each one individually means a future edit can add
    // to this list but never quietly drop something out of it.
    const line = previewer.split("\n").find((l) => l.includes('if (e.code === "Backquote" || e.key === "`")')) ?? "";
    for (const clear of ["resetPractice()", "setSpots(EMPTY_SPOTS)", "resetArrows()", "setPerfArrows([])", "setSelPerf(null)", "clearExhibitHighlights()", "clearAllTextHls()", "setReveal(null)"]) {
      expect(line).toContain(clear);
    }
  });
  test("0 resets every exhibit node — in BOTH keymaps (recording surface + film)", () => {
    expect((previewer.match(/if \(e\.code === "Digit0" \|\| e\.key === "0"\)/g) ?? []).length).toBe(2);
  });
  test("0 is narrow: it clears exhibit state and nothing else", () => {
    const line = previewer.split("\n").find((l) => l.includes('e.code === "Digit0"')) ?? "";
    expect(line).toContain("clearExhibitHighlights()");
    expect(line).not.toContain("resetPractice");
    expect(line).not.toContain("clearAllTextHls");
  });
  test("0 does not collide: no digit key is bound anywhere else in the canvas", () => {
    // The audit that chose this binding, kept executable (CHANGES.md records it).
    const dir = join(import.meta.dir);
    const files = readFileSync(join(dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n") + previewer;
    const digitBinds = [...files.matchAll(/e\.key === "([1-9])"/g)].map((x) => x[1]);
    expect(digitBinds).toEqual([]);
  });
  test("tease state is session-only — nothing persists it", () => {
    const src = readFileSync(join(import.meta.dir, "exhibit-highlights.ts"), "utf8").split("\r\n").join("\n");
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("sessionStorage");
    expect(src).not.toContain("update(");   // no card-data write ⇒ nothing reaches the DB
  });
});
