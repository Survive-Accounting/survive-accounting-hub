// The split run's rules, pinned: what the model is told, what comes back safely, and the two
// guarantees the build makes — no card is lost, and a placeholder is loud.
import { describe, expect, test } from "bun:test";

import { newFrameId, type BlastFrame } from "./plan";
import { buildSplitMessages, cardsIn, needsInPlan, parseSplitProposal, proposalToFrames, replaceRun } from "./split-run";

const opener = (): BlastFrame[] => [{ id: newFrameId("intro"), kind: "intro" }];
const closer = (): BlastFrame[] => [{ id: newFrameId("outro"), kind: "outro" }];

describe("what the model is told", () => {
  test("the formula, the kinds, and his own cards by id", () => {
    const { system, user } = buildSplitMessages({
      topicName: "Easy points", setName: "5 Types of Accounts", reelTitle: "Intro to Assets",
      slides: [{ kind: "cheat", words: "Own it = asset" }],
      cards: [{ id: "c1", stem: "What type of account is Prepaid Insurance?" }],
      note: "this one is really two videos",
    });
    expect(system).toContain("30-45 seconds");
    expect(system).toContain("ONE micro topic");
    expect(system).toContain("NEVER reference another video");
    expect(system).toContain("never invent a question");
    expect(user).toContain("Intro to Assets");
    expect(user).toContain("c1: What type of account is Prepaid Insurance?");
    expect(user).toContain("this one is really two videos");
  });
});

describe("reading the answer back", () => {
  test("unknown kinds and empty reels are dropped, not trusted", () => {
    const p = parseSplitProposal({
      reels: [
        { title: "A", slides: [{ kind: "cheat", text: "Own it" }, { kind: "wormhole", text: "nope" }] },
        { title: "B", slides: [{ kind: "nope" }] },
        { title: "C", slides: [{ kind: "ceq", card: "c2" }] },
      ],
      note: "split again later",
    });
    expect(p.reels.map((r) => r.title)).toEqual(["A", "C"]);
    expect(p.reels[0].slides).toHaveLength(1);
    expect(p.note).toBe("split again later");
  });
  test("garbage in is an empty proposal, never a throw", () => {
    expect(parseSplitProposal(null).reels).toEqual([]);
    expect(parseSplitProposal({ reels: "no" }).reels).toEqual([]);
    expect(parseSplitProposal({ reels: [{ slides: [{ kind: "cheat", text: "x" }] }] }).reels[0].title).toBe("Reel 1");
  });
});

describe("the build", () => {
  const cards = ["ceq-1", "ceq-2", "ceq-3"];
  const proposal = parseSplitProposal({
    reels: [
      { title: "Prepaids", slides: [{ kind: "cheat", text: "Paid early = asset", big: true }, { kind: "ceq", card: "c1" }] },
      { title: "Receivables", slides: [{ kind: "phrase", text: "They owe you" }, { kind: "ceq", card: "c2" }] },
    ],
  });

  test("one run per reel, cut between them, each opening the way a video opens", () => {
    const { frames } = proposalToFrames(proposal, { cards, opener, closer });
    expect(frames.filter((f) => f.kind === "intro")).toHaveLength(2);
    expect(frames.filter((f) => f.cutAfter)).toHaveLength(1);          // between them, not after the last
    expect(frames.at(-1)?.kind).toBe("outro");
    expect(frames.find((f) => f.kind === "intro")?.takeName).toBe("Prepaids");
    // the callout kept its big format
    expect(frames.find((f) => f.kind === "cheat")?.display).toBe("big");
  });

  test("NO CARD IS LOST — one the model forgot rides on the last reel", () => {
    const { frames, placed, appended } = proposalToFrames(proposal, { cards, opener, closer });
    expect(placed).toEqual(["ceq-1", "ceq-2"]);
    expect(appended).toEqual(["ceq-3"]);
    expect(cardsIn(frames).sort()).toEqual([...cards].sort());
  });

  test("a card claimed twice only lands once", () => {
    const twice = parseSplitProposal({ reels: [{ title: "A", slides: [{ kind: "ceq", card: "c1" }, { kind: "ceq", card: "c1" }] }] });
    const { frames } = proposalToFrames(twice, { cards: ["ceq-1"], opener, closer });
    expect(cardsIn(frames)).toEqual(["ceq-1"]);
  });

  test("a placeholder is a blank slide that says what it needs, and the plan can list them", () => {
    const p = parseSplitProposal({ reels: [{ title: "JE", slides: [{ kind: "blank", needs: "a JE card for this entry" }] }] });
    const { frames } = proposalToFrames(p, { cards: [], opener, closer });
    const ph = frames.find((f) => f.kind === "blank");
    expect(ph?.text).toBe("⚠ NEEDS BUILDING — a JE card for this entry");
    expect(ph?.needs).toBe("a JE card for this entry");
    expect(needsInPlan(frames)).toEqual([{ id: ph!.id, needs: "a JE card for this entry" }]);
  });

  test("an empty proposal builds nothing", () => {
    expect(proposalToFrames({ reels: [] }, { cards: [], opener, closer }).frames).toEqual([]);
  });
});

describe("swapping the run in", () => {
  const plan: BlastFrame[] = [
    { id: "a1", kind: "intro" }, { id: "a2", kind: "ceq", ceqId: "x" }, { id: "a3", kind: "outro", cutAfter: true },
    { id: "b1", kind: "intro" }, { id: "b2", kind: "ceq", ceqId: "y" }, { id: "b3", kind: "outro" },
  ];

  test("the new block lands where the old reel was, and keeps the cut that follows it", () => {
    const next: BlastFrame[] = [{ id: "n1", kind: "intro" }, { id: "n2", kind: "cheat", text: "new" }, { id: "n3", kind: "outro" }];
    const out = replaceRun(plan, ["a1", "a2", "a3"], next);
    expect(out.map((f) => f.id)).toEqual(["n1", "n2", "n3", "b1", "b2", "b3"]);
    expect(out.find((f) => f.id === "n3")?.cutAfter).toBe(true);      // the reel after it stays its own
  });

  test("swapping the LAST reel adds no trailing cut", () => {
    const next: BlastFrame[] = [{ id: "n1", kind: "intro" }, { id: "n2", kind: "outro" }];
    const out = replaceRun(plan, ["b1", "b2", "b3"], next);
    expect(out.map((f) => f.id)).toEqual(["a1", "a2", "a3", "n1", "n2"]);
    expect(out.at(-1)?.cutAfter).toBeUndefined();
  });

  test("ids it doesn't know leave the plan alone", () => {
    expect(replaceRun(plan, ["zz"], [{ id: "n", kind: "intro" }]).map((f) => f.id)).toEqual(plan.map((f) => f.id));
  });
});
