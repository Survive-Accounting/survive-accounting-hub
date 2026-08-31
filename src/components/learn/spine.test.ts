// THE SPINE'S BAND MATH — which card counts as "what you are reading" (2026-08-31).
//
// This is the part of the scroll-tracking that can be subtly wrong, and it is the part a browser
// cannot check for us: a hidden document suspends requestAnimationFrame and IntersectionObserver
// outright, so the live surface cannot be scrolled in a headless pane at all. The plumbing around
// this function is a scroll listener and an rAF throttle; the judgement is here.
import { describe, expect, test } from "bun:test";

import { pickVisibleTopic, type VisibleCandidate } from "./Spine";

/** A rail 1000px tall starting at the top of the viewport — so the reading line sits at y=180. */
const RAIL = { top: 0, height: 1000 };

const card = (topicId: string, top: number, height = 230): VisibleCandidate =>
  ({ topicId, top, bottom: top + height });

describe("the card crossing the line wins", () => {
  test("the one straddling y=180, not the one above it", () => {
    const cards = [card("a", -200), card("b", 100), card("c", 400)];
    // "b" spans 100–330, which contains 180. "a" is higher on screen but mostly gone.
    expect(pickVisibleTopic(RAIL, cards)).toBe("b");
  });

  test("scrolling one card up hands the spine to the next topic", () => {
    const before = [card("cycle", 100), card("cycle", 340), card("analyzing", 580)];
    expect(pickVisibleTopic(RAIL, before)).toBe("cycle");
    // Everything shifts up 480px: the analyzing card now crosses the line.
    const after = before.map((c) => ({ ...c, top: c.top - 480, bottom: c.bottom - 480 }));
    expect(pickVisibleTopic(RAIL, after)).toBe("analyzing");
  });
});

describe("it never goes blank while anything is on screen", () => {
  test("no card crosses the line — the nearest one still answers", () => {
    // A gap straddling the line: nothing contains y=180, but "b" starts closest to it.
    const cards = [card("a", -400, 200), card("b", 260)];
    expect(pickVisibleTopic(RAIL, cards)).toBe("b");
  });

  test("cards entirely above or below the rail are ignored", () => {
    const cards = [card("above", -900, 200), card("below", 1400)];
    expect(pickVisibleTopic(RAIL, cards)).toBeNull();
  });

  test("an empty rail is null, not a crash", () => {
    expect(pickVisibleTopic(RAIL, [])).toBeNull();
  });
});

describe("ties resolve to the card the student reached first", () => {
  test("two cards equidistant from the line — the earlier one wins", () => {
    // Both 100px from the line, one above and one below.
    const cards: VisibleCandidate[] = [
      { topicId: "first", top: 80, bottom: 100 },
      { topicId: "second", top: 280, bottom: 300 },
    ];
    expect(pickVisibleTopic(RAIL, cards)).toBe("first");
  });
});

describe("the line tracks the rail, not the viewport", () => {
  test("a rail scrolled down the page still measures from its own top", () => {
    // Rail starts at y=300; its line is at 300 + 18% of 500 = 390.
    const rail = { top: 300, height: 500 };
    const cards = [card("a", 300, 60), card("b", 370, 60), card("c", 500, 60)];
    expect(pickVisibleTopic(rail, cards)).toBe("b");
  });

  test("a short rail still has a sensible band", () => {
    const rail = { top: 0, height: 200 }; // line at y=36
    expect(pickVisibleTopic(rail, [card("a", 20, 40), card("b", 120, 40)])).toBe("a");
  });
});
