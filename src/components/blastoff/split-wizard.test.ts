import { describe, expect, test } from "bun:test";

import type { BlastFrame } from "./plan";
import { filmFrames, planTakes } from "./plan";
import { moveBucket, moveUnits, newBucket, readBuckets, removeBucket, renameBucket, splitProblem, writeBuckets } from "./split-wizard";

const f = (id: string, kind: BlastFrame["kind"], extra: Partial<BlastFrame> = {}): BlastFrame => ({ id, kind, ...extra });
// Two takes: [intro, q1, tip, q2, outro✂] [intro2, q3, outro]
const plan: BlastFrame[] = [
  f("i1", "intro", { text: "Account classification", takeName: "Assets" }), f("s1", "slogan"),
  f("q1", "ceq", { ceqId: "c1" }), f("t1", "tip", { text: "watch the word" }), f("q2", "ceq", { ceqId: "c2" }),
  f("o1", "outro", { cutAfter: true }),
  f("i2", "intro", { text: "Liabilities", takeName: "Liabilities" }), f("q3", "ceq", { ceqId: "c3" }), f("o2", "outro"),
];

describe("readBuckets", () => {
  test("a take is an opener, its cards (callouts ride with the card before them), a sign-off", () => {
    const b = readBuckets(plan);
    expect(b.map((x) => [x.key, x.name, x.units.map((u) => u.id), x.opener.map((x) => x.id), x.closer.map((x) => x.id)])).toEqual([
      ["i1", "Assets", ["q1", "q2"], ["i1", "s1"], ["o1"]],
      ["i2", "Liabilities", ["q3"], ["i2"], ["o2"]],
    ]);
    expect(b[0].units[0].frames.map((x) => x.id)).toEqual(["q1", "t1"]);
    expect(b[1].units[0].skipped).toBe(false);
  });
  test("no cuts = one bucket; an empty plan = one empty bucket", () => {
    expect(readBuckets([f("q", "ceq", { ceqId: "c" })]).length).toBe(1);
    expect(readBuckets([])).toEqual([{ key: "new-0", name: "", units: [], opener: [], closer: [] }]);
  });
});

describe("moving", () => {
  test("cards move between buckets in their current order; into the same bucket reorders", () => {
    const b = readBuckets(plan);
    const moved = moveUnits(b, ["q2", "q1"], "i2", 0);
    expect(moved[0].units.map((u) => u.id)).toEqual([]);
    expect(moved[1].units.map((u) => u.id)).toEqual(["q1", "q2", "q3"]);
    const re = moveUnits(moved, ["q3"], "i2", 0);
    expect(re[1].units.map((u) => u.id)).toEqual(["q3", "q1", "q2"]);
  });
  test("rename, reorder, and only an empty bucket can be removed", () => {
    let b = readBuckets(plan);
    b = renameBucket(b, "i2", "  Debts  ");
    expect(b[1].name).toBe("Debts");
    b = moveBucket(b, "i2", -1);
    expect(b.map((x) => x.key)).toEqual(["i2", "i1"]);
    expect(moveBucket(b, "i2", -1).map((x) => x.key)).toEqual(["i2", "i1"]);
    expect(removeBucket(b, "i1").length).toBe(2);
    const nb = newBucket("Equity");
    expect(removeBucket([...b, nb], nb.key).length).toBe(2);
  });
});

describe("splitProblem", () => {
  test("an empty split blocks the confirm", () => {
    const b = [...readBuckets(plan), newBucket("Equity")];
    expect(splitProblem(b)).toMatch(/no cards/);
    expect(splitProblem(readBuckets(plan))).toBeNull();
  });
});

describe("writeBuckets", () => {
  test("round trip: reading then writing an untouched plan keeps every frame, in order", () => {
    const out = writeBuckets(readBuckets(plan), "cram");
    expect(out.map((x) => x.id)).toEqual(plan.map((x) => x.id));
    expect(planTakes(out).map((t) => t.name)).toEqual(["Assets", "Liabilities"]);
    expect(out.find((x) => x.id === "o1")?.cutAfter).toBe(true);
    expect(out.find((x) => x.id === "o2")?.cutAfter).toBeUndefined();
  });
  test("a new split gets a standard opener and a sign-off; the cut moves to the new last take", () => {
    let b = readBuckets(plan);
    const nb = newBucket("Equity");
    b = moveUnits([...b, nb], ["q2"], nb.key, 0);
    const out = writeBuckets(b, "the cram line");
    const takes = planTakes(out);
    expect(takes.map((t) => [t.name, t.frames.filter((x) => x.kind === "ceq").length])).toEqual([["Assets", 1], ["Liabilities", 1], ["Equity", 1]]);
    const eq = takes[2].frames;
    expect(eq[0].kind).toBe("intro");
    expect(eq[0].text).toBe("Equity");
    expect(eq.some((x) => x.kind === "slogan" && x.text === "the cram line")).toBe(true);
    expect(eq[eq.length - 1].kind).toBe("outro");
    expect(eq[eq.length - 1].cutAfter).toBeUndefined();
    // the middle take now carries the cut it did not have before
    expect(takes[1].frames[takes[1].frames.length - 1].cutAfter).toBe(true);
    // the callout rode with ITS card (q1, which stayed) — not with the card that moved
    expect(eq.map((x) => x.id)).not.toContain("t1");
    expect(takes[0].frames.map((x) => x.id)).toContain("t1");
  });
  test("a removed split's opener and sign-off are gone; its cards live on where they were moved", () => {
    let b = readBuckets(plan);
    b = moveUnits(b, ["q3"], "i1", 99);
    b = removeBucket(b, "i2");
    const out = writeBuckets(b, "x");
    expect(out.map((x) => x.id)).toEqual(["i1", "s1", "q1", "t1", "q2", "q3", "o1"]);
    expect(out[out.length - 1].cutAfter).toBeUndefined();
  });
});

describe("skipped frames", () => {
  // A skipped first frame, a skipped outro carrying a stale cut, a skipped card: the film view
  // (planTakes over filmFrames) is the truth, and nothing skipped is lost.
  const messy: BlastFrame[] = [
    f("x0", "open", { skipped: true }), f("i1", "intro", { takeName: "Assets" }), f("q1", "ceq", { ceqId: "c1" }),
    f("o0", "outro", { skipped: true, cutAfter: true }), f("o1", "outro", { cutAfter: true }),
    f("i2", "intro", { takeName: "Liabilities" }), f("q2", "ceq", { ceqId: "c2", skipped: true }), f("q3", "ceq", { ceqId: "c3" }), f("o2", "outro"),
  ];
  test("reading follows the filmed runs; skipped frames ride along", () => {
    const b = readBuckets(messy);
    expect(b.map((x) => [x.name, x.units.map((u) => u.id)])).toEqual([["Assets", ["q1"]], ["Liabilities", ["q2", "q3"]]]);
    expect(b[0].opener.map((x) => x.id)).toEqual(["x0", "i1"]);
    expect(b[0].closer.map((x) => x.id)).toEqual(["o0", "o1"]);
  });
  test("writing puts the name on the first filmed frame and the cut on the last filmed one", () => {
    const out = writeBuckets(readBuckets(messy), "x");
    expect(out.map((x) => x.id)).toEqual(messy.map((x) => x.id));
    expect(out.find((x) => x.id === "x0")?.takeName).toBeUndefined();
    expect(out.find((x) => x.id === "i1")?.takeName).toBe("Assets");
    expect(out.find((x) => x.id === "o0")?.cutAfter).toBeUndefined();
    expect(out.find((x) => x.id === "o1")?.cutAfter).toBe(true);
    expect(planTakes(filmFrames(out)).map((t) => t.name)).toEqual(["Assets", "Liabilities"]);
  });
  test("a split of only skipped cards is refused", () => {
    let b = readBuckets(messy);
    b = moveUnits(b, ["q3"], b[0].key, 99);
    expect(splitProblem(b)).toMatch(/every card is skipped/);
  });
});
