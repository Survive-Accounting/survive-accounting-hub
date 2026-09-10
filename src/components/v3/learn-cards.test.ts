// /v3/learn's CARDS. A card per cram video, keyed the way /v3/post keys its rows — a wrong key
// here would show a student "coming soon" on a video that is posted, or the reverse.
import { describe, expect, test } from "bun:test";

import { cramCardsOf, offshootsUnderCard, videoKey } from "./learn-cards";

const equity = { id: "eq", name: "Equity" };

describe("cramCardsOf — one card per cram video", () => {
  test("a set with no plan is one card named the set, keyed by the set id", () => {
    expect(cramCardsOf(equity, [])).toEqual([{ key: "eq", title: "Equity", setId: "eq", takeIndex: 0, headId: "" }]);
  });
  test("a set with a single take is still one card, and keeps that take's head", () => {
    const cards = cramCardsOf(equity, [{ headId: "h1", name: "" }]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: "eq", title: "Equity", headId: "h1" });
  });
  test("each named split is its own card, keyed setId / setId#2 / setId#3 like /v3/post", () => {
    const cards = cramCardsOf({ id: "bs", name: "Balance sheet" }, [
      { headId: "h-a", name: "Assets" }, { headId: "h-l", name: "Liabilities" }, { headId: "h-e", name: "Equity" },
    ]);
    expect(cards.map((c) => [c.key, c.title, c.takeIndex, c.headId])).toEqual([
      ["bs", "Assets", 0, "h-a"], ["bs#2", "Liabilities", 1, "h-l"], ["bs#3", "Equity", 2, "h-e"],
    ]);
  });
  test("an unnamed split reads '<set> · part N', never a blank title", () => {
    const cards = cramCardsOf(equity, [{ headId: "h1", name: "Common stock" }, { headId: "h2", name: "  " }]);
    expect(cards[1].title).toBe("Equity · part 2");
  });
  test("videoKey is the publish key rule in one place", () => {
    expect(videoKey("s", 0)).toBe("s");
    expect(videoKey("s", 1)).toBe("s#2");
  });
});

describe("offshootsUnderCard — which card an offshoot hangs under", () => {
  const cards = cramCardsOf(equity, [{ headId: "h-cs", name: "Common stock" }, { headId: "h-re", name: "Retained earnings" }]);

  test("an offshoot goes under the card whose split it names; every card gets an entry", () => {
    const m = offshootsUnderCard(cards, [{ id: "div", headId: "h-re" }, { id: "par", headId: "h-cs" }]);
    expect([...m.keys()]).toEqual(["eq", "eq#2"]);
    expect(m.get("eq")!.map((h) => h.item.id)).toEqual(["par"]);
    expect(m.get("eq#2")!.map((h) => h.item.id)).toEqual(["div"]);
    expect(m.get("eq")![0].whole).toBe(false);
  });
  test("one hung on the whole set goes under the first card, flagged whole", () => {
    const m = offshootsUnderCard(cards, [{ id: "why", headId: null }]);
    expect(m.get("eq")).toEqual([{ item: { id: "why", headId: null }, whole: true }]);
    expect(m.get("eq#2")).toEqual([]);
  });
  test("a split the plan no longer has lands on the first card rather than vanishing", () => {
    const m = offshootsUnderCard(cards, [{ id: "lost", headId: "h-gone" }]);
    expect(m.get("eq")!.map((h) => h.item.id)).toEqual(["lost"]);
    expect(m.get("eq")![0].whole).toBe(true);
  });
  test("a single-card set never says 'anywhere in' — there is only one place to be", () => {
    const one = cramCardsOf(equity, []);
    const m = offshootsUnderCard(one, [{ id: "a", headId: null }, { id: "b", headId: "h-x" }]);
    expect(m.get("eq")!.map((h) => [h.item.id, h.whole])).toEqual([["a", false], ["b", false]]);
  });
  test("input order is kept within a card — it is already Lee's arrangement", () => {
    const m = offshootsUnderCard(cards, [{ id: "z", headId: "h-cs" }, { id: "a", headId: "h-cs" }]);
    expect(m.get("eq")!.map((h) => h.item.id)).toEqual(["z", "a"]);
  });
  test("no cards → nothing to hang on, and nothing thrown", () => {
    expect(offshootsUnderCard([], [{ id: "x", headId: null }]).size).toBe(0);
  });
});
