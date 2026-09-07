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
    // 2026-09-03: the title is the bold heading, nothing is auto-highlighted,
    // and the body is the first line UNDER it (frameBullets), uniform with the
    // other two kinds.
    expect(insertStem({ id: "f", kind: "cheat", title: "Debits left", body: "always" })).toBe("Debits left");
    expect(frameBullets({ id: "f", kind: "cheat", title: "Debits left", body: "always", bullets: [" and credits right ", ""] })).toEqual(["always", "and credits right"]);
  });
  test("a phrase IS the key phrase; Lee's own marks win", () => {
    expect(insertStem({ id: "f", kind: "phrase", text: "Cash is king" })).toBe("Cash is king");
    expect(insertStem({ id: "f", kind: "phrase", text: "Cash is ==king==" })).toBe("Cash is ==king==");   // his own marks stay
  });
  test("a tip is its heading, plain; an exhibit names itself", () => {
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
    expect(k.slice(0, 2)).toEqual(["open", "intro"]);   // the cold open leads (2026-09-03), then the intro
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
    expect(k.slice(0, 2)).toEqual(["open", "intro"]);   // the cold open leads (2026-09-03), then the intro
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
    // The cold open is restored at the front (index 0); Lee's moved intro
    // stays exactly where he put it — after the summary card, so index 2.
    expect(kinds(reconcilePlan(mine, SET)).slice(0, 3)).toEqual(["open", "ceq", "intro"]);
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

// ---- THE REVIEW STEP's verbs (2026-09-03) ----------------------------------
import { dropFrame, duplicateFrame, filmFrames, findMark, frameBullets, frameCount, markRanges, normalizeMarks, patchFrame, patchFramesOfKind, pruneMarks, toggleSkip, withMarks } from "./plan";

describe("the review step: skip, duplicate, patch — the set is never touched", () => {
  const ceqs: PlanCeq[] = [{ id: "c1", label: "Q1", stem: "one" }, { id: "c2", label: "Q2", stem: "two" }];
  const plan = generatePlan(ceqs, new Date("2026-09-03T00:00:00Z"));
  const ceqFrame = plan.frames.find((f) => f.kind === "ceq" && f.ceqId === "c1")!;

  test("dropping a card the set owns SKIPS it: it stays in the list, leaves the film, and reconcile does not resurrect it as a second copy", () => {
    const next = dropFrame(plan.frames, ceqFrame.id);
    expect(next.length).toBe(plan.frames.length);
    expect(next.find((f) => f.id === ceqFrame.id)?.skipped).toBe(true);
    expect(filmFrames(next).some((f) => f.ceqId === "c1")).toBe(false);
    const again = reconcilePlan({ frames: next, updatedAt: plan.updatedAt }, ceqs);
    expect(again.frames.filter((f) => f.ceqId === "c1").length).toBe(1);
    expect(again.frames.find((f) => f.ceqId === "c1")?.skipped).toBe(true);
    expect(frameCount(again)).toBe(plan.frames.length - 1);
  });

  test("dropping an insert removes it; skip toggles back", () => {
    const withInsert = insertFrame(plan.frames, { id: "ins-1", kind: "cheat", title: "rule" }, 1);
    expect(dropFrame(withInsert, "ins-1").some((f) => f.id === "ins-1")).toBe(false);
    const skipped = toggleSkip(plan.frames, ceqFrame.id);
    expect(toggleSkip(skipped, ceqFrame.id).find((f) => f.id === ceqFrame.id)?.skipped).toBe(false);
  });

  test("duplicate lands right after the original with its own id and its own prompter copy", () => {
    const src = { ...ceqFrame, prompter: ["say this"] };
    // 2026-09-07: the keyword prompter and the hand-off ride with the line.
    const frames = patchFrame(plan.frames, ceqFrame.id, { prompter: ["say this"], prompterKeys: ["say", "this"], prompterTransition: "Next question.", prompterMarks: { phrase: "say this", word: "this" } });
    const next = duplicateFrame(frames, src.id);
    const i = next.findIndex((f) => f.id === src.id);
    expect(next.length).toBe(frames.length + 1);
    expect(next[i + 1].kind).toBe("ceq");
    expect(next[i + 1].ceqId).toBe("c1");
    expect(next[i + 1].id).not.toBe(src.id);
    expect(next[i + 1].prompter).toEqual(["say this"]);
    expect(next[i + 1].prompter).not.toBe(next[i].prompter);
    expect(next[i + 1].prompterKeys).toEqual(["say", "this"]);
    expect(next[i + 1].prompterKeys).not.toBe(next[i].prompterKeys);
    expect(next[i + 1].prompterTransition).toBe("Next question.");
    // The timing marks (2026-09-07) ride too — their own copy, not a shared object.
    expect(next[i + 1].prompterMarks).toEqual({ phrase: "say this", word: "this" });
    expect(next[i + 1].prompterMarks).not.toBe(next[i].prompterMarks);
  });

  test("patchFrame writes one frame and leaves the rest identical", () => {
    const next = patchFrame(plan.frames, ceqFrame.id, { prompter: ["a", "b"] });
    expect(next.find((f) => f.id === ceqFrame.id)?.prompter).toEqual(["a", "b"]);
    expect(next.filter((f) => f.id !== ceqFrame.id)).toEqual(plan.frames.filter((f) => f.id !== ceqFrame.id));
    expect(patchFrame(plan.frames, "nope", { text: "x" })).toEqual(plan.frames);
  });

  test("patchFramesOfKind writes every frame of one kind, and skips one already resized by hand (2026-09-05: a camera-size bulk apply)", () => {
    const withInsert = insertFrame(plan.frames, { id: "ins-1", kind: "tip", title: "a tip" }, 1);
    const withSecond = insertFrame(withInsert, { id: "ins-2", kind: "tip", title: "another tip", camSize: 0.5 }, 2);
    const next = patchFramesOfKind(withSecond, "tip", { camSize: 0.34 });
    expect(next.find((f) => f.id === "ins-1")?.camSize).toBe(0.34);        // no prior override — gets the bulk value
    expect(next.find((f) => f.id === "ins-2")?.camSize).toBe(0.5);         // already resized by hand — untouched
    expect(next.filter((f) => f.kind !== "tip")).toEqual(withSecond.filter((f) => f.kind !== "tip"));
  });
});

// ---- THE TIMING MARKS (2026-09-07) ----------------------------------------
// Lee: "I can have the teleprompter have a certain piece highlighted, so already know it's
// coming and I can really make it land. I could even 'double highlight' the word I want to
// transition on. So it's like transition phrase is yellow but the word itself is orange."
describe("markRanges — the phrase yellow, the word orange, the word wins where they overlap", () => {
  const line = "External means outside the company. No paycheck? External. Next question.";
  test("phrase and word inside it: the phrase is split around the word", () => {
    expect(markRanges(line, { phrase: "No paycheck? External.", word: "External" })).toEqual([
      { start: 36, end: 49, tone: "phrase" },   // "No paycheck? "
      { start: 49, end: 57, tone: "word" },     // "External"
      { start: 57, end: 58, tone: "phrase" },   // "."
    ]);
    // Every range is exactly the text it says it is.
    expect(line.slice(49, 57)).toBe("External");
    expect(line.slice(36, 49)).toBe("No paycheck? ");
  });
  test("the word is looked for INSIDE the phrase first — the second 'External', not the first", () => {
    const [, w] = markRanges(line, { phrase: "No paycheck? External.", word: "External" });
    expect(w.start).toBe(49);
    // With no phrase, the first whole-word match in the line.
    expect(markRanges(line, { word: "External" })).toEqual([{ start: 0, end: 8, tone: "word" }]);
  });
  test("a whole word wins over a substring — 'on' is not the 'on' in 'money'", () => {
    expect(markRanges("money on the table", { word: "on" })).toEqual([{ start: 6, end: 8, tone: "word" }]);
    // No whole-word match at all → any match, so a mark Lee made by selecting part of a word still paints.
    expect(markRanges("money talks", { word: "mon" })).toEqual([{ start: 0, end: 3, tone: "word" }]);
  });
  test("a mark that isn't in the line paints nothing; blanks and no marks paint nothing", () => {
    expect(markRanges(line, { phrase: "Let's move on", word: "banana" })).toEqual([]);
    expect(markRanges(line, { phrase: "  ", word: "" })).toEqual([]);
    expect(markRanges(line, undefined)).toEqual([]);
    expect(markRanges("", { phrase: "x" })).toEqual([]);
  });
  test("a word that isn't in the phrase but is in the line still paints, and the two stay sorted", () => {
    const r = markRanges(line, { phrase: "Next question.", word: "paycheck" });
    expect(r).toEqual([{ start: 39, end: 47, tone: "word" }, { start: 59, end: 73, tone: "phrase" }]);
  });
  test("phrase only; word only; case-insensitive fallback keeps the line's own spelling", () => {
    expect(markRanges(line, { phrase: "Next question." })).toEqual([{ start: 59, end: 73, tone: "phrase" }]);
    expect(markRanges(line, { phrase: "next question." })).toEqual([{ start: 59, end: 73, tone: "phrase" }]);
    expect(markRanges(line, { word: "next" })).toEqual([{ start: 59, end: 63, tone: "word" }]);
  });
  test("findMark searches a window and never reads a regex-special character as syntax", () => {
    expect(findMark("a (b) c", "(b)")).toBe(2);
    expect(findMark(line, "External", 10)).toBe(49);
    expect(findMark(line, "External", 0, 40)).toBe(0);
    expect(findMark(line, "External", 10, 40)).toBe(-1);
    expect(findMark(line, "")).toBe(-1);
  });
});

describe("pruneMarks / normalizeMarks / withMarks — a shortened or edited line keeps what still fits", () => {
  test("marks that survived the cut stay; the rest go; nothing left → undefined", () => {
    expect(pruneMarks("External. No paycheck. Next.", { phrase: "No paycheck? External.", word: "External" })).toEqual({ word: "External" });
    expect(pruneMarks("External. No paycheck. Next.", { phrase: "No paycheck. Next.", word: "Next" })).toEqual({ phrase: "No paycheck. Next.", word: "Next" });
    expect(pruneMarks("Something else entirely", { phrase: "No paycheck", word: "paycheck" })).toBeUndefined();
    expect(pruneMarks("x", undefined)).toBeUndefined();
  });
  test("normalizeMarks trims and drops blanks; all-blank is undefined", () => {
    expect(normalizeMarks({ phrase: " a ", word: "" })).toEqual({ phrase: "a" });
    expect(normalizeMarks({})).toBeUndefined();
    expect(normalizeMarks(null)).toBeUndefined();
  });
  test("withMarks sets the field, or removes it when given none — nothing else on the frame moves", () => {
    const f: BlastFrame = { id: "f", kind: "ceq", ceqId: "c", prompter: ["say this"], prompterMarks: { phrase: "old" } };
    expect(withMarks(f, { phrase: "say this", word: "this" })).toEqual({ ...f, prompterMarks: { phrase: "say this", word: "this" } });
    expect(withMarks(f, {})).toEqual({ id: "f", kind: "ceq", ceqId: "c", prompter: ["say this"] });
    expect("prompterMarks" in withMarks(f, null)).toBe(false);
    expect(f.prompterMarks).toEqual({ phrase: "old" });   // the original is untouched
  });
});

// ---- THE BACKDROP RULE (2026-09-03) ----------------------------------------
import { backdropFor } from "./plan";

describe("backdropFor — the cold open, then quietly through the opening summary, then focus", () => {
  const isNote = (id: string) => id === "ceq-intro" || id === "ceq-outro";
  const frames: BlastFrame[] = [
    { id: "o", kind: "open" },
    { id: "i", kind: "intro" },
    { id: "s", kind: "ceq", ceqId: "ceq-intro" },   // the opening summary
    { id: "q", kind: "ceq", ceqId: "ceq-a" },
    { id: "c", kind: "cheat", title: "rule" },
    { id: "e", kind: "ceq", ceqId: "ceq-outro" },   // the closing summary — NOT the focus point again
    { id: "b", kind: "bio" },
    { id: "x", kind: "outro" },
  ];
  test("open → backdrop behind the intro → knockout on the opening summary → nothing after", () => {
    expect(frames.map((_, i) => backdropFor(frames, i, isNote))).toEqual(["open", "backdrop", "knockout", null, null, null, null, null]);
  });
  test("a frame's own override wins: off on the intro, zoom on a later cheat code", () => {
    const mine = frames.map((f) => (f.id === "i" ? { ...f, backdrop: "off" as const } : f.id === "c" ? { ...f, backdrop: "zoom" as const } : f));
    expect(backdropFor(mine, 1, isNote)).toBeNull();
    expect(backdropFor(mine, 4, isNote)).toBe("backdrop");
    // zoom on the closing summary is a knockout, because it is a summary card
    const late = frames.map((f) => (f.id === "e" ? { ...f, backdrop: "zoom" as const } : f));
    expect(backdropFor(late, 5, isNote)).toBe("knockout");
  });
  test("no cold open in the plan → nothing runs by default", () => {
    const noOpen = frames.filter((f) => f.kind !== "open");
    expect(noOpen.map((_, i) => backdropFor(noOpen, i, isNote)).every((b) => b === null)).toBe(true);
  });
  test("a skipped intro is walked past: the summary still knocks out", () => {
    const skipped = frames.map((f) => (f.id === "i" ? { ...f, skipped: true } : f));
    expect(backdropFor(skipped, 2, isNote)).toBe("knockout");
  });
});
