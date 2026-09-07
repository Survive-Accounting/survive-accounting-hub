import { describe, expect, test } from "bun:test";

import { emptyDoc, type BoardItem, type TalkSegment, type TalkSession, type TalkTag, type TTDoc } from "@/components/canvas/talkthrough";

import { rehearsalContextFor, TALKTHROUGH_SPEECH_CAP } from "./rehearsal-context";

const T = "2026-09-01T10:00:00.000Z";
const row = { createdAt: T, updatedAt: T, syncedAt: T };
const session = (id: string, setId: string, extra: Partial<TalkSession> = {}): TalkSession => ({ id, setId, setName: setId, startedAt: T, endedAt: null, ...row, ...extra });
const segment = (id: string, sessionId: string, ceqId: string | null, text: string, seq = 0, startedAt = T): TalkSegment =>
  ({ id, sessionId, seq, text, source: "live", whisperPending: false, audioPath: null, focusedCeqId: ceqId, focusedCeqLabel: ceqId, startedAt, endedAt: null, ...row });
const tag = (id: string, sessionId: string, ceqId: string | null, kind: TalkTag["tag"], note: string | null = null, at = T): TalkTag =>
  ({ id, sessionId, tag: kind, at, focusedCeqId: ceqId, focusedCeqLabel: ceqId, source: "tap", note, ...row });
const board = (id: string, sessionId: string, ceqIds: string[], title: string, quote: string, extra: Partial<BoardItem> = {}): BoardItem =>
  ({ id, sessionId, runId: "run", kind: "phrase", title, payload: {}, quote, ceqIds, status: "suggested", comment: "", ...row, ...extra });

function doc(): TTDoc {
  return {
    ...emptyDoc(),
    sessions: [session("s1", "set-a"), session("s2", "set-b"), session("s3", "set-a", { archivedAt: T })],
    segments: [
      segment("g1", "s1", "ceq-1", "so internal users, um, are the managers", 1, "2026-09-01T10:00:01.000Z"),
      segment("g2", "s1", "ceq-1", "they make the calls inside the company", 2, "2026-09-01T10:00:05.000Z"),
      segment("g3", "s1", "ceq-2", "external is investors", 3),
      segment("g4", "s2", "ceq-1", "a DIFFERENT set's session talking about the same node id", 1),
      segment("g5", "s3", "ceq-1", "an archived session", 1),
      segment("g6", "s1", null, "nothing focused", 4),
    ],
    tags: [tag("t1", "s1", "ceq-1", "phrase", "managers make the calls"), tag("t2", "s1", "ceq-1", "KEY"), tag("t3", "s1", "ceq-2", "short"), tag("t4", "s2", "ceq-1", "TEACH", "not this set")],
    boardItems: [
      board("b1", "s1", ["ceq-1", "ceq-2"], "Managers = internal", "they make the calls inside the company"),
      board("b2", "s1", ["ceq-1"], "Dismissed idea", "gone", { dismissed: true }),
      board("b3", "s2", ["ceq-1"], "Other set's item", "no"),
    ],
  };
}

describe("the talkthrough context for a rehearsal suggestion", () => {
  test("composes this set's speech, stamps and board items for one card, in order", () => {
    const out = rehearsalContextFor(doc(), "set-a", "ceq-1");
    expect(out).toBe([
      "Said during Talkthrough: so internal users, um, are the managers they make the calls inside the company",
      "Stamps: Phrase: managers make the calls · Tip/Trick",                 // a legacy KEY tap reads by its canonical stamp
      "Board: Managers = internal — they make the calls inside the company",
    ].join("\n"));
    expect(out).not.toContain("DIFFERENT set");
    expect(out).not.toContain("archived session");
    expect(out).not.toContain("nothing focused");
    expect(out).not.toContain("Dismissed idea");
    expect(out).not.toContain("Other set's item");
    expect(out).not.toContain("not this set");
  });
  test("a card with only stamps still gets a context; a card with nothing gets none", () => {
    expect(rehearsalContextFor(doc(), "set-a", "ceq-2")).toBe("Said during Talkthrough: external is investors\nStamps: Other Short\nBoard: Managers = internal — they make the calls inside the company");
    expect(rehearsalContextFor(doc(), "set-a", "ceq-none")).toBe("");
  });
  test("non-card frames and unknown sets have no talkthrough", () => {
    expect(rehearsalContextFor(doc(), "set-a", null)).toBe("");
    expect(rehearsalContextFor(doc(), "set-a", undefined)).toBe("");
    expect(rehearsalContextFor(doc(), "set-zzz", "ceq-1")).toBe("");
    expect(rehearsalContextFor(emptyDoc(), "set-a", "ceq-1")).toBe("");
  });
  test("speech is capped at a paragraph, cut on a word", () => {
    const d = doc();
    d.segments = [segment("long", "s1", "ceq-1", Array.from({ length: 300 }, (_, i) => `word${i}`).join(" "))];
    const out = rehearsalContextFor(d, "set-a", "ceq-1");
    const speech = out.split("\n")[0].replace("Said during Talkthrough: ", "");
    expect(speech.length).toBeLessThanOrEqual(TALKTHROUGH_SPEECH_CAP + 1);
    expect(speech.endsWith("…")).toBe(true);
    // Never cut mid-word: everything before the ellipsis is whole tokens.
    expect(speech.slice(0, -1).split(" ").every((w) => /^word\d+$/.test(w))).toBe(true);
  });
});
