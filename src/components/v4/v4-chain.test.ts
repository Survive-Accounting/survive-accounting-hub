// v4's chain and split rules, pinned — especially Lee's: un-cutting is one click and leaves nothing
// behind; the outro sits just before every cut; the intro defaults to the bio and can be swapped.
import { describe, expect, test } from "bun:test";

import type { BlastFrame } from "@/components/blastoff/plan";

import { NO_SPLITS, applySplits, arrangeChain, cleanSplits, contentOf, inferSlideGroups, placeholderSlide, splitRows, suggestCuts } from "./v4-chain";

const f = (id: string, kind: BlastFrame["kind"], extra: Partial<BlastFrame> = {}): BlastFrame => ({ id, kind, ...extra });
const groups: Record<string, string> = { c1: "g1", c2: "g1", c3: "g2" };
const cardGroup = (id: string) => groups[id] ?? null;

describe("slides and the chain", () => {
  test("migrated slides take the group of the card before them", () => {
    const frames = [f("s0", "cheat"), f("q1", "ceq", { ceqId: "c1" }), f("s1", "phrase"), f("q3", "ceq", { ceqId: "c3" }), f("s3", "tip")];
    expect(inferSlideGroups(frames, cardGroup)?.map((x) => x.v4Group ?? null)).toEqual(["g1", undefined, "g1", undefined, "g2"].map((x) => x ?? null));
    expect(inferSlideGroups([f("q1", "ceq", { ceqId: "c1" })], cardGroup)).toBeNull();
  });

  test("the chain: each group's teaching slides, then its questions; ungrouped at the end", () => {
    const frames = [f("q3", "ceq", { ceqId: "c3" }), f("q1", "ceq", { ceqId: "c1" }), f("t2", "cheat", { v4Group: "g2" }), f("t1", "phrase", { v4Group: "g1" }), f("loose", "tip"), f("q2", "ceq", { ceqId: "c2" })];
    expect(arrangeChain(frames, ["g1", "g2"], cardGroup).map((x) => x.id)).toEqual(["t1", "q1", "q2", "t2", "q3", "loose"]);
  });

  test("an opening video of ungrouped slides (with a speed run of any group's cards) stays first", () => {
    const frames = [f("hype", "found"), f("q3", "ceq", { ceqId: "c3" }), f("q1", "ceq", { ceqId: "c1" }), f("tease", "teaser"), f("t2", "cheat", { v4Group: "g2" }), f("t1", "phrase", { v4Group: "g1" }), f("q1b", "ceq", { ceqId: "c1" }), f("practice", "blank")];
    expect(arrangeChain(frames, ["g1", "g2"], cardGroup).map((x) => x.id)).toEqual(["hype", "q3", "q1", "tease", "t1", "q1b", "t2", "practice"]);
  });

  test("a placeholder slide says what to build and is listable", () => {
    expect(placeholderSlide("p1", "journal entry for prepaid rent", "g1")).toEqual({ id: "p1", kind: "blank", text: "⚠ BUILD THIS LATER — journal entry for prepaid rent", needs: "journal entry for prepaid rent", v4Group: "g1" });
  });
});

describe("splits", () => {
  const chain = [f("a", "cheat"), f("q1", "ceq", { ceqId: "c1" }), f("b", "tip"), f("q3", "ceq", { ceqId: "c3" })];

  test("no cuts: one video, no intro added (only the outro), outro last", () => {
    const { frames } = applySplits(chain, NO_SPLITS, "Equation effects");
    expect(frames.map((x) => `${x.id}${x.cutAfter ? "|" : ""}`)).toEqual(["a", "q1", "b", "q3", "v4out-end"]);
    // a saved bio intro still draws
    expect(applySplits(chain, { startIntro: "bio", cuts: [] }, "E").frames[0]).toMatchObject({ kind: "bio", v4Bound: "intro" });
  });

  test("a cut: outro just before it, the next run's intro after it — and un-cutting leaves nothing", () => {
    const cut = applySplits(chain, { startIntro: "bio", cuts: [{ after: "q1", intro: "title", name: "Part 2" }] }, "Equation effects");
    expect(cut.frames.map((x) => `${x.id}${x.cutAfter ? "|" : ""}`)).toEqual(["v4in-start", "a", "q1", "v4out-q1|", "v4in-q1", "b", "q3", "v4out-end"]);
    expect(cut.frames.find((x) => x.id === "v4in-q1")).toMatchObject({ kind: "intro", text: "Equation effects", takeName: "Part 2" });
    const uncut = applySplits(cut.frames, { startIntro: "bio", cuts: [] }, "Equation effects");
    expect(uncut.frames.map((x) => x.id)).toEqual(["v4in-start", "a", "q1", "b", "q3", "v4out-end"]);
    expect(contentOf(uncut.frames).map((x) => x.id)).toEqual(chain.map((x) => x.id));
  });

  test("edits on a bound slide survive re-splitting; swapping the intro swaps the slide", () => {
    const one = applySplits(chain, { startIntro: "bio", cuts: [{ after: "q1", intro: "bio" }] }, "S");
    const edited = one.frames.map((x) => (x.id === "v4out-q1" ? { ...x, text: "See you next time" } : x));
    const again = applySplits(edited, { startIntro: "none", cuts: [{ after: "q1", intro: "bio" }, { after: "b", intro: "title" }] }, "S");
    expect(again.frames.find((x) => x.id === "v4out-q1")?.text).toBe("See you next time");
    expect(again.frames[0].id).toBe("a");                               // no intro on the first run
    expect(again.frames.filter((x) => x.v4Bound).map((x) => x.id)).toEqual(["v4out-q1", "v4in-q1", "v4out-b", "v4in-b", "v4out-end"]);
  });

  test("cuts that point at nothing, at the last slide, or twice are dropped", () => {
    expect(cleanSplits(chain, { startIntro: "bio", cuts: [{ after: "gone", intro: "bio" }, { after: "q3", intro: "bio" }, { after: "a", intro: "bio" }, { after: "a", intro: "none" }] }).cuts).toEqual([{ after: "a", intro: "bio" }]);
  });

  test("suggested cuts: every group boundary", () => {
    const tagged = [f("a", "cheat", { v4Group: "g1" }), f("q1", "ceq", { ceqId: "c1" }), f("b", "tip", { v4Group: "g2" }), f("q3", "ceq", { ceqId: "c3" })];
    expect(suggestCuts(tagged, cardGroup)).toEqual(["q1"]);
  });

  test("ready or blocked: a placeholder question or slide blocks its split, and says what it needs", () => {
    const frames = applySplits([...chain, f("ph", "blank", { needs: "T-account for rent" })], { startIntro: "bio", cuts: [{ after: "q1", intro: "bio" }] }, "S").frames;
    const rows = splitRows(frames, (id) => (id === "c3" ? { note: "sort into buckets", stem: "Sort these" } : null));
    expect(rows.map((r) => r.blockers.length)).toEqual([0, 2]);
    expect(rows[1].blockers.map((b) => [b.kind, b.note])).toEqual([["question", "sort into buckets"], ["slide", "T-account for rent"]]);
  });
});
