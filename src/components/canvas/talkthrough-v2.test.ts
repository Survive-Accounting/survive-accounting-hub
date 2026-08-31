// TALKTHROUGH v2 tests — the B0–B7 pure surfaces: micro-edit build/parse, the
// review build/parse, style memory, and the registry arithmetic.
import { describe, expect, test } from "bun:test";

import { AI_REGISTRY, costOf, sumUsage } from "@/lib/ai-registry";
import { isWhisperHallucination } from "./talkthrough-audio";
import {
  BOARD_KINDS, emptyDoc, ghostSegments, recentApprovedExamples, styleKindFor, styleNotesFor,
  type BoardItem, type TalkSegment,
} from "./talkthrough";
import {
  buildMicroEditMessages, buildReviewMessages, buildReviewRegenMessages, parseMicroEdit, parseReview,
  type ReviewContext,
} from "./talkthrough-pass";

const mkItem = (over: Partial<BoardItem>): BoardItem => ({
  id: `b-${Math.random()}`, sessionId: "s1", runId: "r", kind: "idea", title: "T",
  payload: {}, quote: "", ceqIds: [], status: "approved", comment: "",
  createdAt: "2026-08-29T01:00:00Z", updatedAt: "2026-08-29T01:00:00Z", syncedAt: null,
  ...over,
});

describe("B0 — the registry", () => {
  test("both entries exist as config; synthesis has the bigger lane", () => {
    expect(AI_REGISTRY.micro.model).toContain("/");
    expect(AI_REGISTRY.synthesis.model).toContain("/");
    expect(AI_REGISTRY.synthesis.maxOutput).toBeGreaterThan(AI_REGISTRY.micro.maxOutput);
  });
  test("cost arithmetic + session summing", () => {
    expect(costOf("micro", AI_REGISTRY.micro.model, 1_000_000, 0)).toBe(AI_REGISTRY.micro.inPerM);
    const total = sumUsage([
      { task: "micro", model: "m", inputTokens: 1000, outputTokens: 500, costUsd: 0.01 },
      { task: "synthesis", model: "s", inputTokens: 2000, outputTokens: 1000, costUsd: 0.05 },
    ]);
    expect(total.calls).toBe(2);
    expect(total.inputTokens).toBe(3000);
    expect(total.outputTokens).toBe(1500);
    expect(total.costUsd).toBeCloseTo(0.06, 10); // float sums, compared as floats
  });
});

describe("B2 — micro edits", () => {
  const ceq = { id: "q1", label: "Q1", stem: "Old stem?", choices: [{ text: "A", correct: true }, { text: "B", correct: false }] };
  test("messages carry the CEQ, the verbatim instruction, and style notes", () => {
    const { system, user } = buildMicroEditMessages({ stamp: "reword", ceq, instruction: "say it like the deck does", styleNotes: ["keep stems under 12 words"] });
    expect(system).toContain("Rewrite the STEM");
    expect(system).toContain("keep stems under 12 words");
    expect(user).toContain("Old stem?");
    expect(user).toContain(`"say it like the deck does"`);
  });
  test("parse: good stem-only, full choices, and garbage", () => {
    expect(parseMicroEdit(`{"proposedStem":"New stem?","proposedChoices":null,"note":"tightened"}`)).toEqual({ proposedStem: "New stem?", proposedChoices: null, note: "tightened" });
    const full = parseMicroEdit(`{"proposedStem":null,"proposedChoices":[{"text":"X","correct":true,"feedback":"fb"},{"text":"Y","correct":false,"feedback":null}],"note":""}`);
    expect(full?.proposedChoices).toHaveLength(2);
    expect(parseMicroEdit(`{"proposedStem":null,"proposedChoices":[{"text":"X","correct":true},{"text":"Y","correct":true}],"note":""}`)).toBeNull(); // two corrects
    expect(parseMicroEdit("not json")).toBeNull();
  });
});

describe("B3 — the review pass", () => {
  const ctx: ReviewContext = {
    setName: "Closing",
    ceqs: [{ id: "q1", label: "Q1", stem: "Which close?", choices: [{ text: "Revenues", correct: true }] }],
    segments: [{ id: "g1", seq: 0, text: "revenues reset, that is the whole game", focusedCeqId: "q1", focusedCeqLabel: "Q1", source: "whisper", whisperPending: false }],
    tags: [],
    docs: { method: "METHOD", bible: "BIBLE", blastOff: "BLAST" },
    stamps: [{ kind: "blast_off", ceqLabel: null, starred: false, spoken: "open with the reset" }],
    excludedKinds: ["short"],
    styleNotes: ["quote me verbatim"],
    wantVibePlan: true,
  };
  test("messages carry stamps with spoken windows, exclusions and the vibe flag", () => {
    const { system, user } = buildReviewMessages(ctx);
    expect(system).toContain("quote me verbatim");
    expect(user).toContain(`blast_off — said: "open with the reset"`);
    expect(user).toContain("EXCLUDED KINDS");
    expect(user).toContain("short");
    expect(user).toContain("VIBE PLAN WANTED: YES");
  });
  test("regen narrows to one key and carries the comment thread", () => {
    const { system, user } = buildReviewRegenMessages(ctx, "script", { beats: [] }, ["punchier", "keep beat 2"]);
    expect(system).toContain(`output ONLY the "script" key`);
    expect(user).toContain("- punchier");
    expect(user).toContain("- keep beat 2");
  });
  test("parseReview: script beats, edits, ideas, vibe plan, proposed stamps", () => {
    const raw = {
      script: { title: "The Close", beats: [{ title: "Reset", coversCeqIds: ["q1", "bogus"], voice: ["revenues reset, that is the whole game"], emphasize: "reset", notes: "" }], triggerWords: ["reset"], compareContrasts: [] },
      ceqEdits: [{ ceqId: "q1", proposedStem: "Which accounts close?", proposedChoices: null, why: "plainer", quote: "revenues reset" }],
      ideas: [{ kind: "memo", title: "The reset memo", body: "Revenues reset to zero.", quote: "revenues reset", ceqIds: ["q1"] }, { kind: "bogus", title: "x", body: "y", quote: "", ceqIds: [] }],
      vibePlan: { title: "Vibe", beats: [{ title: "Why reset?", why: "gray area", talkPrompt: "you tell me", quote: "q" }] },
      proposedStamps: [{ kind: "short", quote: "that is the whole game", seq: 0 }],
    };
    const { items, proposedTags } = parseReview(raw as never, "s1", "run", ["q1"], new Date("2026-08-29T02:00:00Z"));
    expect(items.map((i) => i.kind).sort()).toEqual(["ceq_edit", "idea", "script", "vibe_plan"]);
    const script = items.find((i) => i.kind === "script")!;
    expect((script.payload as { beats: { coversCeqIds: string[] }[] }).beats[0].coversCeqIds).toEqual(["q1"]); // bogus dropped
    const edit = items.find((i) => i.kind === "ceq_edit")!;
    expect(edit.ceqIds).toEqual(["q1"]);
    expect(proposedTags).toEqual([{ tag: "short", quote: "that is the whole game", seq: 0 }]);
    for (const k of items.map((i) => i.kind)) expect(BOARD_KINDS).toContain(k);
  });
  test("garbage degrades to zero items", () => {
    expect(parseReview({} as never, "s", "r", []).items).toEqual([]);
  });
});

describe("whisper hallucination filter (the ghost-segment bug)", () => {
  test("stock outros with no live text are noise", () => {
    expect(isWhisperHallucination("If you like this video, don't forget to like it and subscribe to my channel. Thank you for watching!", "")).toBe(true);
    expect(isWhisperHallucination("ご視聴ありがとうございました", "")).toBe(true);
    expect(isWhisperHallucination("Thank you.", "")).toBe(true);
    expect(isWhisperHallucination("❤❤❤❤❤", "")).toBe(true);
    expect(isWhisperHallucination("Subtitles by the Amara.org community", "")).toBe(true);
  });
  test("live-text corroboration always wins — never drop words Lee said", () => {
    expect(isWhisperHallucination("Thank you.", "thank you")).toBe(false);
    expect(isWhisperHallucination("subscribe to my channel", "I would never say subscribe to my channel in a CEQ")).toBe(false);
  });
  test("real dictation passes, digits included", () => {
    expect(isWhisperHallucination("Debits on the left, credits on the right.", "")).toBe(false);
    expect(isWhisperHallucination("5. 6. 7. 8. 9. 10. 11. 13.", "")).toBe(false);
    expect(isWhisperHallucination("", "")).toBe(false);
  });

  // Seen in Lee's own transcript on 2026-08-30, after the first gate shipped.
  test("the social-CTA family Lee actually hit", () => {
    expect(isWhisperHallucination("📢 Share this video with your friends on social media.", "")).toBe(true);
    expect(isWhisperHallucination("Please hit the bell icon.", "")).toBe(true);
    expect(isWhisperHallucination("Link in the description below.", "")).toBe(true);
    expect(isWhisperHallucination("Let me know in the comments below.", "")).toBe(true);
    expect(isWhisperHallucination("Follow us on social media!", "")).toBe(true);
  });
  // Every string here was pulled from Lee's real 2026-08-29 session, where 13
  // of 32 segments were Whisper filling silence.
  test("other-language subtitle credits and stray training-data fragments", () => {
    for (const ghost of [
      "İzlediğiniz için teşekkür ederim.",   // Turkish, ×5 in one session
      "Субтитры предоставил DimaTorzok",     // Russian subtitle credit
      "시청 해주셔서 감사합니다.",
      "Bon Appetit.",
      "1 tsp of salt.",
    ]) expect(isWhisperHallucination(ghost, ""), ghost).toBe(true);
  });
  // These patterns must stay narrow — each phrase below is real accounting talk.
  test("accounting sentences that merely share vocabulary survive", () => {
    for (const real of [
      "Comment below the line on the balance sheet.",
      "They spend a lot on social media advertising.",
      "Share the load between the two columns.",
      "We share revenue with the partner.",
      "The bell curve of exam scores.",
      // Lee's actual words from the same session the ghosts came from
      "So, very interesting. This one will be fun. It's quite simple.",
      "In the real world with analyzing transactions, there may be source documents.",
      "Being sales receipts or things of that nature, you know old-school stuff.",
      "5. 6. 7. 8. 9. 10.    11.  13.",
    ]) expect(isWhisperHallucination(real, ""), real).toBe(false);
  });
});

describe("ghost sweep — the ones written before the gate existed", () => {
  const seg = (over: Partial<TalkSegment>): TalkSegment => ({
    id: `s-${Math.random()}`, sessionId: "s1", seq: 0, text: "", source: "whisper",
    whisperPending: false, audioPath: null, focusedCeqId: null, focusedCeqLabel: null,
    startedAt: "2026-08-29T02:25:00Z", endedAt: null,
    createdAt: "2026-08-29T02:25:00Z", updatedAt: "2026-08-29T02:25:00Z", syncedAt: null,
    ...over,
  });

  test("finds whisper-sourced ghosts, never live-sourced words", () => {
    const d = emptyDoc();
    d.segments.push(
      seg({ seq: 21, text: "If you like the video, don't forget to like it and subscribe to the channel." }),
      seg({ seq: 22, text: "📢 Share this video with your friends on social media." }),
      seg({ seq: 24, text: "😊😊😊😊😊😊😊😊" }),
      seg({ seq: 25, text: "Revenues reset to zero at year end." }),
      // the SAME text, but the live mic heard it — Lee's words, never offered
      seg({ seq: 26, text: "Thanks for watching!", source: "live" }),
    );
    const ghosts = ghostSegments(d, "s1", isWhisperHallucination);
    expect(ghosts.map((g) => g.seq)).toEqual([21, 22, 24]);
  });
  test("archived segments are already gone", () => {
    const d = emptyDoc();
    d.segments.push(seg({ seq: 1, text: "Thank you for watching!", archivedAt: "2026-08-30T00:00:00Z" }));
    expect(ghostSegments(d, "s1", isWhisperHallucination)).toHaveLength(0);
  });
});

describe("B7 — style memory", () => {
  test("styleKindFor maps item kinds to the five buckets", () => {
    expect(styleKindFor(mkItem({ kind: "script" }))).toBe("script");
    expect(styleKindFor(mkItem({ kind: "idea", payload: { kind: "exhibit" } }))).toBe("exhibit");
    expect(styleKindFor(mkItem({ kind: "idea", payload: { kind: "memo" } }))).toBe("memo");
    expect(styleKindFor(mkItem({ kind: "idea", payload: { kind: "nerdout" } }))).toBe("short");
    expect(styleKindFor(mkItem({ kind: "ceq_edit" }))).toBe("general");
  });
  test("styleNotesFor reads global style_note items; pruned notes drop out", () => {
    const d = emptyDoc();
    d.boardItems.push(
      mkItem({ kind: "style_note", sessionId: "global", title: "quote verbatim", payload: { forKind: "script", line: "quote verbatim" } }),
      mkItem({ kind: "style_note", sessionId: "global", title: "pruned", status: "archived", payload: { forKind: "script", line: "pruned" } }),
      mkItem({ kind: "style_note", sessionId: "global", title: "other kind", payload: { forKind: "memo", line: "other kind" } }),
    );
    expect(styleNotesFor(d, "script")).toEqual(["quote verbatim"]);
  });
  test("recentApprovedExamples: newest N of the kind, approved-family only", () => {
    const d = emptyDoc();
    for (let i = 0; i < 5; i++) d.boardItems.push(mkItem({ kind: "idea", payload: { kind: "short", body: `pitch ${i}` }, title: `S${i}`, updatedAt: `2026-08-29T0${i}:00:00Z` }));
    d.boardItems.push(mkItem({ kind: "idea", payload: { kind: "short", body: "nope" }, title: "SUG", status: "suggested" }));
    const ex = recentApprovedExamples(d, "short", 3);
    expect(ex).toHaveLength(3);
    expect(ex[0]).toContain("S4"); // newest first
    expect(ex.join(" ")).not.toContain("SUG");
  });
});
