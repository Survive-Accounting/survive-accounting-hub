// The chain (D), pinned: video by video in play order — each split followed by what hangs off it —
// unplanned sets still listed, and the keys that Now / Later / Skip are saved under.
import { describe, expect, test } from "bun:test";

import { buildChain, chainCounts, chainTitle, videoKey } from "./chain";
import { layoutLanes, type LaneSet } from "./lane-map";

const sets: LaneSet[] = [
  { id: "cram1", name: "5 Types" },
  { id: "cram2", name: "Normal balances" },
  { id: "off-a", name: "Contra accounts", lane: "offshoot", branchFrom: "cram1", branchTakeHead: "h1" },
  { id: "off-whole", name: "Why A = L + E", lane: "offshoot", branchFrom: "cram1" },
  { id: "pitch-free", name: "Easy Points is free", lane: "pitch", branchFrom: "cram1" },
  { id: "pitch-after", name: "Your chapter", lane: "pitch", branchFrom: "cram1", branchTakeHead: "h0" },
];
const takes: Record<string, { headId: string; name: string; content: number; about: string }[]> = {
  cram1: [{ headId: "h0", name: "Assets", content: 8, about: "" }, { headId: "h1", name: "", content: 13, about: "Owe it = liability" }],
  "off-a": [{ headId: "oh", name: "", content: 2, about: "" }],
};
const takesOf = (id: string) => takes[id] ?? [];
const nameOf = (id: string) => sets.find((s) => s.id === id)?.name ?? "";

describe("the chain", () => {
  const chain = buildChain(layoutLanes(sets, takesOf), nameOf, takesOf);

  test("video by video, in play order, each split followed by what hangs off it", () => {
    expect(chain.map((e) => chainTitle(e))).toEqual([
      "Easy Points is free",        // a whole-set pitch plays before the set
      "Assets",                     // split 1
      "Your chapter",               // the pitch after split 1
      "Owe it = liability",         // split 2 (unnamed: what it's about)
      "Contra accounts",            // the offshoot off split 2
      "Why A = L + E",              // a whole-set offshoot after the last split
      "Normal balances",            // a set with no plan yet — still listed
    ]);
    expect(chain.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("keys survive re-splits: set + head frame, or the set when there's no plan", () => {
    expect(chain[1].key).toBe("cram1|h0");
    expect(chain[4].key).toBe("off-a|oh");
    expect(chain[6].key).toBe(videoKey("cram2", null));
    expect(chain[6]).toMatchObject({ takeIndex: null, content: null, splits: 0 });
    expect(chain[4].parent).toEqual({ setName: "5 Types", takeName: "Split 2" });
  });

  test("the counts", () => {
    const status = (k: string) => (k === "cram1|h0" ? "now" : k === "cram2|set" ? "skip" : "undecided");
    expect(chainCounts(chain, status)).toEqual({ now: 1, later: 0, skip: 1, undecided: 5 });
  });
});
