// B8 — THE INCREMENTAL GENERATION QUEUE, pure surfaces only.
//
// What is guarded here: the queue's ORDER (script → edits → ideas), what it
// refuses to make a task out of (a star, an empty stamp, an excluded kind, an
// edit the booth already drafted), the partial-output prompt the script task
// uses, the per-stamp idea prompt and its parse, and the progress line the
// Booth prints. The runner itself writes to the store and calls the network,
// so it is not tested here — these are the parts that decide what it does.
import { describe, expect, test } from "bun:test";

import { GEN_TASK_TYPES, emptyProgress, isGenerating, progressLine, type GenerationProgress } from "./talkthrough";
import {
  buildGenerationQueue, buildIdeaMessages, buildReviewOnlyMessages, editTaskKey, parseIdeaDraft,
  queueCounts, scriptTaskKeys, type GenStamp, type ReviewContext,
} from "./talkthrough-pass";

const stamp = (over: Partial<GenStamp>): GenStamp => ({
  id: `t-${Math.random()}`, kind: "cheat_code", starred: false,
  ceqId: "q1", ceqLabel: "Q1 · Users", spoken: "the trick is to ask who is outside the company", note: null,
  ...over,
});

describe("the queue", () => {
  test("priority order: the script first, then every edit, then every idea", () => {
    const tasks = buildGenerationQueue({
      stamps: [
        stamp({ kind: "cheat_code" }),
        stamp({ kind: "reword", ceqId: "q2", ceqLabel: "Q2" }),
        stamp({ kind: "deeper_idea", ceqId: "q3", ceqLabel: "Q3" }),
        stamp({ kind: "revise_choices", ceqId: "q2", ceqLabel: "Q2" }),
      ],
      excludedKinds: [],
    });
    expect(tasks.map((t) => t.type)).toEqual(["script", "edit", "edit", "idea", "idea"]);
    expect(tasks[0].label).toBe("the script");
    expect(queueCounts(tasks)).toEqual({ script: 1, edit: 2, idea: 2 });
    // Every task knows its target.
    expect(tasks[1]).toMatchObject({ type: "edit", stampKind: "reword", ceqId: "q2" });
    expect(tasks[3]).toMatchObject({ type: "idea", stampKind: "cheat_code", ceqId: "q1" });
    expect(tasks[3].spoken).toContain("who is outside the company");
    // Ids are unique — the progress line and the error report name them.
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
  });

  test("the script task exists even with no stamps at all", () => {
    const tasks = buildGenerationQueue({ stamps: [], excludedKinds: [] });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe("script");
  });

  test("a star, an empty stamp and an excluded kind never become content", () => {
    const tasks = buildGenerationQueue({
      stamps: [
        stamp({ kind: "cheat_code", starred: true }),        // a bookmark, not a context
        stamp({ kind: "memorize_this", spoken: "   " }),      // nothing said
        stamp({ kind: "deeper_idea" }),                       // excluded below
        stamp({ kind: "visual" }),                            // the only survivor
      ],
      excludedKinds: ["deeper_idea"],
    });
    expect(tasks.map((t) => t.type)).toEqual(["script", "idea"]);
    expect(tasks[1].stampKind).toBe("visual");
  });

  test("blast_off and review_vibe are markers, not cards", () => {
    const tasks = buildGenerationQueue({
      stamps: [stamp({ kind: "blast_off" }), stamp({ kind: "review_vibe" })],
      excludedKinds: [],
    });
    expect(tasks.map((t) => t.type)).toEqual(["script"]);
  });

  test("an edit the booth already drafted is not drafted twice", () => {
    const stamps = [
      stamp({ kind: "reword", ceqId: "q2", ceqLabel: "Q2" }),
      stamp({ kind: "revise_choices", ceqId: "q2", ceqLabel: "Q2" }),
    ];
    const tasks = buildGenerationQueue({ stamps, excludedKinds: [], alreadyDrafted: [editTaskKey("q2", "reword")] });
    expect(tasks.map((t) => t.type)).toEqual(["script", "edit"]);
    expect(tasks[1].stampKind).toBe("revise_choices");
  });

  test("an edit stamp with no question behind it makes no edit task", () => {
    const tasks = buildGenerationQueue({ stamps: [stamp({ kind: "reword", ceqId: null, ceqLabel: null })], excludedKinds: [] });
    expect(tasks.map((t) => t.type)).toEqual(["script"]);
  });
});

describe("the script task's partial output", () => {
  const ctx: ReviewContext = {
    setName: "Internal vs. external users",
    ceqs: [{ id: "q1", label: "Q1", stem: "Who is external?", choices: [{ text: "a creditor", correct: true }, { text: "the CFO", correct: false }] }],
    segments: [{ id: "s1", seq: 1, text: "outside the company is the whole game", focusedCeqId: "q1", focusedCeqLabel: "Q1", source: "whisper", whisperPending: false }],
    tags: [],
    docs: { method: "METHOD", bible: "BIBLE", blastOff: "BLASTOFF" },
    stamps: [{ kind: "cheat_code", ceqLabel: "Q1", starred: false, spoken: "outside the company" }],
    excludedKinds: [],
    styleNotes: [],
    wantVibePlan: false,
  };

  test("keys: script alone, plus the vibe plan only when it was asked for", () => {
    expect(scriptTaskKeys(false)).toEqual(["script", "proposedStamps"]);
    expect(scriptTaskKeys(true)).toEqual(["script", "vibePlan", "proposedStamps"]);
  });

  test("the prompt names the keys and keeps the whole transcript + laws", () => {
    const { system, user } = buildReviewOnlyMessages(ctx, scriptTaskKeys(false));
    expect(system).toContain("PARTIAL OUTPUT MODE");
    expect(system).toContain(`"script"`);
    expect(system).toContain(`"proposedStamps"`);
    expect(system).toContain("LEE'S LAW");
    // The user half is untouched — same transcript, same CEQs.
    expect(user).toContain("outside the company is the whole game");
    expect(user).toContain("Internal vs. external users");
  });
});

describe("the per-stamp idea task", () => {
  test("the prompt carries his words, the question and the stamp's kind", () => {
    const { system, user } = buildIdeaMessages({
      stampKind: "memorize_this",
      setName: "Internal vs. external users",
      ceqLabel: "Q3 · Creditors",
      ceqStem: "Which user is external?",
      spoken: "creditors are outside, so they only get the published statements",
      note: null,
      styleNotes: ["keep it to one line"],
    });
    expect(system).toContain("memorize this");
    expect(system).toContain("LEE'S LAW");
    expect(system).toContain("keep it to one line");
    expect(user).toContain("Q3 · Creditors");
    expect(user).toContain("creditors are outside");
  });

  test("a visual's follow-up tap rides along", () => {
    const { user } = buildIdeaMessages({
      stampKind: "visual", setName: "S", ceqLabel: null, ceqStem: null,
      spoken: "show them side by side", note: "compare / contrast", styleNotes: [],
    });
    expect(user).toContain("compare / contrast");
    expect(user).toContain("THE SET AS A WHOLE");
  });

  test("parse: kind, title, body — retired kinds fold, junk is null", () => {
    const ok = parseIdeaDraft(`{"kind":"cheat_code","title":"Outside the company","body":"If they are outside, they are external.","visualKind":null}`, "cheat_code");
    expect(ok).toEqual({ kind: "cheat_code", title: "Outside the company", body: "If they are outside, they are external.", visualKind: null });
    // tip_trick is retired — it folds to cheat_code rather than minting a kind.
    expect(parseIdeaDraft(`{"kind":"tip_trick","title":"T","body":"B"}`, "tip_trick")?.kind).toBe("cheat_code");
    // A kind outside the vocabulary falls back to the stamp Lee actually pressed.
    expect(parseIdeaDraft(`{"kind":"wildcard","title":"T","body":"B"}`, "visual")?.kind).toBe("visual");
    expect(parseIdeaDraft("not json", "visual")).toBeNull();
    expect(parseIdeaDraft(`{"kind":"visual","title":"","body":""}`, "visual")).toBeNull();
  });

  test("a fenced reply still parses", () => {
    expect(parseIdeaDraft("```json\n{\"kind\":\"phrase\",\"title\":\"Outside\",\"body\":\"b\"}\n```", "phrase")?.title).toBe("Outside");
  });
});

describe("the progress line", () => {
  const p = (over: Partial<GenerationProgress>): GenerationProgress => ({ ...emptyProgress(), ...over });

  test("one line per phase, and a finish", () => {
    expect(progressLine(p({ total: 12, currentType: "script", counts: { script: 1, edit: 5, idea: 6 } })))
      .toBe("Generating: the script…");
    expect(progressLine(p({ total: 12, completed: 3, currentType: "edit", counts: { script: 1, edit: 5, idea: 6 }, done: { script: 1, edit: 2, idea: 0 } })))
      .toBe("Generating: edits 2/5 done");
    expect(progressLine(p({ total: 12, completed: 7, currentType: "idea", counts: { script: 1, edit: 5, idea: 6 }, done: { script: 1, edit: 5, idea: 1 } })))
      .toBe("Generating: ideas 1/6 done");
    expect(progressLine(p({ total: 12, completed: 12, currentType: null })))
      .toBe("Generation complete · 12 items");
    expect(progressLine(p({ total: 12, completed: 4, currentType: null, error: "the card for “visual” didn't parse" })))
      .toContain("Generation stopped:");
  });

  test("currentType is the running flag", () => {
    expect(isGenerating(p({ currentType: "idea" }))).toBe(true);
    expect(isGenerating(p({ currentType: null }))).toBe(false);
    expect(isGenerating(null)).toBe(false);
  });

  test("the phase list and the empty shape agree", () => {
    expect([...GEN_TASK_TYPES]).toEqual(["script", "edit", "idea"]);
    for (const t of GEN_TASK_TYPES) {
      expect(emptyProgress().counts[t]).toBe(0);
      expect(emptyProgress().done[t]).toBe(0);
    }
  });
});
