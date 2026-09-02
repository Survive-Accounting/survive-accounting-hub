// THE PLAN is what Lee films, so its two dangerous failures are: a card in the
// set that never becomes a frame (unfilmed), and a frame for a card that no
// longer exists (filmed for nothing). Both are pinned here.
//
// These tests were rewritten 2026-08-31 when the plan model was corrected. The
// old ones asserted the OLD contract — "the intro never leaves the front", "an
// insert lands inside the run" — which described generated bookends that turned
// out to BE the bug: sets already ship their own authored intro and outro cards,
// so generating a second pair duplicated them and the canvas spine read
// note, note, intro, note, Q1… The contract changed on purpose, so the tests
// describing it changed with it.
import { describe, expect, test } from "bun:test";

import {
  BLAST_FRAME_KINDS, generatePlan, insertFrame, INSERT_CALLOUT, INSERT_KINDS, insertStem, isInsert, isStandard, moveFrame, reconcilePlan,
  removeFrame, STANDARD_KINDS,
  type BlastFrame, type BlastPlan, type PlanCeq,
} from "./plan";

describe("BLAST_FRAME_KINDS — the one list the Zod schemas derive from", () => {
  // The bug (2026-09-02): the spine kinds were added to the type and never to
  // the server schema, so every set with a real spine failed to save. The
  // schemas now derive from this list; this pins that the list is complete.
  test("covers the spine, the set's own cards, and every insert", () => {
    for (const k of STANDARD_KINDS) expect(BLAST_FRAME_KINDS).toContain(k);
    for (const k of INSERT_KINDS) expect(BLAST_FRAME_KINDS).toContain(k);
    expect(BLAST_FRAME_KINDS).toContain("ceq");
    expect(BLAST_FRAME_KINDS).toHaveLength(STANDARD_KINDS.length + INSERT_KINDS.length + 1);
  });

  test("a generated plan only uses listed kinds", () => {
    const p = generatePlan([{ id: "ceq-a", label: "Q1", stem: "x" }]);
    for (const f of p.frames) expect(BLAST_FRAME_KINDS).toContain(f.kind);
  });
});

describe("insertStem — the detour card's words", () => {
  test("a cheat code marks its rule as the key phrase, body on its own line", () => {
    expect(insertStem({ id: "f", kind: "cheat", title: "Debits left", body: "always" })).toBe("==Debits left==\nalways");
  });
  test("a phrase IS the key phrase; Lee's own marks win", () => {
    expect(insertStem({ id: "f", kind: "phrase", text: "Cash is king" })).toBe("==Cash is king==");
    expect(insertStem({ id: "f", kind: "phrase", text: "Cash is ==king==" })).toBe("Cash is ==king==");
  });
  test("a tip stays plain; an exhibit names itself", () => {
    expect(insertStem({ id: "f", kind: "tip", text: "Read the stem twice" })).toBe("Read the stem twice");
    expect(insertStem({ id: "f", kind: "exhibit", exhibitRef: "cycle" })).toBe("Exhibit: cycle");
    expect(insertStem({ id: "f", kind: "exhibit", exhibitRef: "cycle", text: "The cycle" })).toBe("The cycle");
  });
});

/** A set shaped like the real ones: an authored note intro, questions, an
 *  authored note outro — the exact shape that exposed the duplication bug. */
const SET: PlanCeq[] = [
  { id: "ceq-intro", label: "Q1", stem: "\"Financial or managerial?\"", noteOnly: true },
  { id: "ceq-a", label: "Q2", stem: "Which statement distinguishes them?" },
  { id: "ceq-b", label: "Q3", stem: "Which side follows GAAP?" },
  { id: "ceq-outro", label: "Q4", stem: "\"Financial or managerial?\"", noteOnly: true },
];
const kinds = (p: BlastPlan) => p.frames.map((f) => f.kind);
const refs = (p: BlastPlan) => p.frames.map((f) => f.ceqId ?? f.kind);
/** Just the set's own cards — the standard spine stripped out. */
const setRefs = (p: BlastPlan) => refs(p).filter((r) => !isStandard(r as never));

describe("generatePlan", () => {
  // THE REGRESSION. The old generator filtered note-only cards OUT and invented
  // a found-on-your-exam of its own, so a synced set ended up with two sets of
  // bookends. The standard spine below is a different thing: brand frames that
  // no set owns, which is why they cannot duplicate anything.
  test("the set's OWN note frames are in the plan, and none are invented", () => {
    expect(setRefs(generatePlan(SET))).toEqual(["ceq-intro", "ceq-a", "ceq-b", "ceq-outro"]);
  });

  test("every plan opens and closes with the standard spine", () => {
    const k = kinds(generatePlan(SET));
    expect(k[0]).toBe("intro");
    expect(k.slice(-2)).toEqual(["bio", "outro"]);
  });

  test("the spine appears exactly once each — never doubled", () => {
    const k = kinds(generatePlan(SET));
    for (const std of STANDARD_KINDS) expect(k.filter((x) => x === std), std).toHaveLength(1);
  });

  test("the bio sits before the sign-off, which is the whole point of the slot", () => {
    const k = kinds(generatePlan(SET));
    expect(k.indexOf("bio")).toBeLessThan(k.indexOf("outro"));
  });

  test("drafts never reach a running order", () => {
    const p = generatePlan([...SET, { id: "ceq-wip", label: "Q5", stem: "half-written", draft: true }]);
    expect(refs(p)).not.toContain("ceq-wip");
  });

  test("bank order is the default running order", () => {
    expect(setRefs(generatePlan(SET))).toEqual(SET.map((c) => c.id));
  });
});

describe("reconcilePlan", () => {
  const stored = (frames: BlastFrame[]): BlastPlan => ({ frames, updatedAt: "2026-08-31T00:00:00.000Z" });

  test("no stored plan generates one", () => {
    expect(setRefs(reconcilePlan(null, SET))).toEqual(SET.map((c) => c.id));
  });

  // A plan written before the spine existed must gain it, or Lee films a set
  // with no intro and no sign-off — which is exactly what he hit.
  test("a plan from before the spine gets it back", () => {
    const old = stored([{ id: "f1", kind: "ceq", ceqId: "ceq-a" }]);
    const k = kinds(reconcilePlan(old, SET));
    for (const std of STANDARD_KINDS) expect(k, std).toContain(std);
    expect(k[0]).toBe("intro");
    expect(k.slice(-2)).toEqual(["bio", "outro"]);
  });

  // Guaranteed, not pinned: reconcile restores a MISSING one, it does not drag
  // one Lee deliberately moved.
  test("a spine frame Lee moved stays where he put it", () => {
    const mine = stored([
      { id: "f0", kind: "ceq", ceqId: "ceq-intro" },
      { id: "f1", kind: "intro" },
      { id: "f2", kind: "ceq", ceqId: "ceq-a" },
      { id: "f3", kind: "ceq", ceqId: "ceq-b" },
      { id: "f4", kind: "ceq", ceqId: "ceq-outro" },
      { id: "f5", kind: "bio" },
      { id: "f6", kind: "outro" },
    ]);
    expect(kinds(reconcilePlan(mine, SET))[1]).toBe("intro");
  });

  test("Lee's inserts and his order survive untouched", () => {
    const mine = stored([
      { id: "f1", kind: "ceq", ceqId: "ceq-b" },          // deliberately out of bank order
      { id: "f2", kind: "cheat", title: "DEBIT LEFT" },
      { id: "f3", kind: "ceq", ceqId: "ceq-a" },
      { id: "f4", kind: "ceq", ceqId: "ceq-intro" },
      { id: "f5", kind: "ceq", ceqId: "ceq-outro" },
    ]);
    expect(setRefs(reconcilePlan(mine, SET))).toEqual(["ceq-b", "cheat", "ceq-a", "ceq-intro", "ceq-outro"]);
  });

  test("a card removed from the set drops out, so no ghost gets filmed", () => {
    const mine = stored([
      { id: "f1", kind: "ceq", ceqId: "ceq-a" },
      { id: "f2", kind: "ceq", ceqId: "ceq-gone" },
      { id: "f3", kind: "ceq", ceqId: "ceq-b" },
    ]);
    expect(refs(reconcilePlan(mine, SET))).not.toContain("ceq-gone");
  });

  test("a card added to the set lands next to its BANK neighbour, not at the end", () => {
    // The plan holds intro + outro only; ceq-a and ceq-b are new to it. They must
    // land between them — appending would put questions after the set's outro.
    const mine = stored([
      { id: "f1", kind: "ceq", ceqId: "ceq-intro" },
      { id: "f2", kind: "ceq", ceqId: "ceq-outro" },
    ]);
    expect(setRefs(reconcilePlan(mine, SET))).toEqual(["ceq-intro", "ceq-a", "ceq-b", "ceq-outro"]);
  });

  test("a card added at the FRONT of the bank lands first, not after the intro", () => {
    const withNew: PlanCeq[] = [{ id: "ceq-new", label: "Q0", stem: "brand new" }, ...SET];
    const mine = stored(SET.map((c, i) => ({ id: `f${i}`, kind: "ceq" as const, ceqId: c.id })));
    expect(setRefs(reconcilePlan(mine, withNew))[0]).toBe("ceq-new");
  });

  test("reconciling is stable — running it twice changes nothing", () => {
    const once = reconcilePlan(null, SET);
    expect(refs(reconcilePlan(once, SET))).toEqual(refs(once));
  });
});

describe("reordering", () => {
  const base: BlastFrame[] = [
    { id: "a", kind: "ceq", ceqId: "ceq-intro" },
    { id: "b", kind: "ceq", ceqId: "ceq-a" },
    { id: "c", kind: "tip", text: "watch the sign" },
    { id: "d", kind: "ceq", ceqId: "ceq-outro" },
  ];

  // The old model pinned the intro first and the outro last. They are ordinary
  // cards now, so Lee can open on a cheat code if that is what he wants.
  test("every frame moves, the set's own bookends included", () => {
    expect(moveFrame(base, 0, 2).map((f) => f.id)).toEqual(["b", "c", "a", "d"]);
    expect(moveFrame(base, 3, 0).map((f) => f.id)).toEqual(["d", "a", "b", "c"]);
  });

  test("out-of-range moves clamp instead of dropping a frame", () => {
    expect(moveFrame(base, 1, -9).map((f) => f.id)).toEqual(["b", "a", "c", "d"]);
    expect(moveFrame(base, 1, 99).map((f) => f.id)).toEqual(["a", "c", "d", "b"]);
    expect(moveFrame(base, 9, 0)).toHaveLength(base.length);
  });

  test("an insert lands right after the frame Lee had selected", () => {
    const f: BlastFrame = { id: "n", kind: "tip", text: "t" };
    expect(insertFrame(base, f, 0).map((x) => x.id)).toEqual(["a", "n", "b", "c", "d"]);
    expect(insertFrame(base, f, 99).map((x) => x.id)).toEqual(["a", "b", "c", "d", "n"]);
  });
});

describe("removal", () => {
  const base: BlastFrame[] = [
    { id: "a", kind: "ceq", ceqId: "ceq-intro" },
    { id: "c", kind: "tip", text: "watch the sign" },
  ];

  test("an insert can be removed", () => {
    expect(removeFrame(base, "c").map((f) => f.id)).toEqual(["a"]);
  });

  // Dropping a card the set owns would mean not filming it — that is a set edit,
  // made in the canvas, not a running-order edit made here.
  test("a card the set owns cannot be removed from the running order", () => {
    expect(removeFrame(base, "a").map((f) => f.id)).toEqual(["a", "c"]);
  });
});

describe("inserts", () => {
  test("isInsert separates Lee's cards from the set's", () => {
    expect(isInsert("cheat")).toBe(true);
    expect(isInsert("ceq")).toBe(false);
  });

  // The spine is neither an insert nor a set card — it cannot be deleted, which
  // is what stops a Blast Off going out with no sign-off.
  test("the spine is not an insert, so it cannot be removed", () => {
    for (const std of STANDARD_KINDS) {
      expect(isStandard(std), std).toBe(true);
      expect(isInsert(std), std).toBe(false);
      expect(removeFrame([{ id: "x", kind: std }], "x")).toHaveLength(1);
    }
  });

  // The preview and the sync BOTH read this map, which is the whole point of it
  // living here: the card Lee arranges is the card that lands in the set.
  test("insert kinds map onto the canvas's real callout kinds", () => {
    expect(INSERT_CALLOUT.cheat).toBe("cheat-code");
    expect(INSERT_CALLOUT.phrase).toBe("memorize-this");
    expect(INSERT_CALLOUT.tip).toBe("deeper-idea");
    // A blank is a BARE frame, not a kind of callout.
    expect(INSERT_CALLOUT.blank).toBeUndefined();
  });
});
