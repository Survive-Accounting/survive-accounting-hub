// THE TELEPROMPTER COLUMN's brain: the candidates for a slide are Lee's own
// words for THAT slide — the segments captured while its CEQ was focused, or
// inside a stamp context of its kind — never someone else's, never invented.
import { describe, expect, test } from "bun:test";

import type { TTDoc } from "@/components/canvas/talkthrough";
import { buildTidyMessages, frameKindForStamp, parseTidy, prompterCandidates } from "./prompter";
import type { BlastFrame } from "./plan";

const row = (id: string, createdAt = "2026-09-03T10:00:00.000Z") => ({ id, createdAt, updatedAt: createdAt, archivedAt: null, syncedAt: null });

function doc(): TTDoc {
  return {
    sessions: [
      { ...row("s1"), setId: "set-A", setName: "A", startedAt: "2026-09-03T10:00:00.000Z", endedAt: null },
      { ...row("s2"), setId: "set-B", setName: "B", startedAt: "2026-09-03T11:00:00.000Z", endedAt: null },
    ],
    segments: [
      { ...row("g1"), sessionId: "s1", seq: 1, text: "Internal users are inside the company.", source: "live", whisperPending: false, focusedCeqId: "ceq-1", focusedCeqLabel: "Q1", startedAt: "2026-09-03T10:00:10.000Z" },
      { ...row("g2"), sessionId: "s1", seq: 2, text: "External users are the bank and investors.", source: "live", whisperPending: false, focusedCeqId: "ceq-2", focusedCeqLabel: "Q2", startedAt: "2026-09-03T10:00:20.000Z" },
      { ...row("g3"), sessionId: "s1", seq: 3, text: "Memorize: managers are internal.", source: "live", whisperPending: false, focusedCeqId: "ceq-1", focusedCeqLabel: "Q1", startedAt: "2026-09-03T10:00:30.000Z" },
      { ...row("g4"), sessionId: "s1", seq: 4, text: "internal users are inside the company.", source: "whisper", whisperPending: false, focusedCeqId: "ceq-1", focusedCeqLabel: "Q1", startedAt: "2026-09-03T10:00:40.000Z" },
      { ...row("g5"), sessionId: "s2", seq: 1, text: "This is another set entirely.", source: "live", whisperPending: false, focusedCeqId: "ceq-1", focusedCeqLabel: "Q1", startedAt: "2026-09-03T11:00:10.000Z" },
      { ...row("g6", "2026-09-03T10:00:00.000Z"), sessionId: "s1", seq: 5, text: "", source: "live", whisperPending: true, focusedCeqId: "ceq-1", focusedCeqLabel: "Q1", startedAt: "2026-09-03T10:00:50.000Z" },
    ],
    tags: [
      // a memorize-this context open from :25 to :35 — only g3 falls inside
      { ...row("t1"), sessionId: "s1", tag: "memorize_this", at: "2026-09-03T10:00:25.000Z", endedAt: "2026-09-03T10:00:35.000Z", source: "tap", focusedCeqId: "ceq-1", focusedCeqLabel: "Q1" },
    ],
    boardItems: [
      { ...row("b1"), sessionId: "s1", runId: "r", kind: "idea", title: "Managers are internal", payload: { kind: "memorize_this", body: "Managers are internal users." }, quote: "Memorize: managers are internal.", ceqIds: ["ceq-1"], status: "approved", comment: "" },
    ],
  };
}

describe("prompterCandidates", () => {
  test("a CEQ slide gets the segments said while THAT card was focused, in this set only, de-duplicated", () => {
    const f: BlastFrame = { id: "f1", kind: "ceq", ceqId: "ceq-1" };
    const c = prompterCandidates(f, doc(), "set-A");
    expect(c.map((x) => x.id)).toEqual(["g1", "g3"]);       // g4 is a duplicate of g1, g5 is another set, g6 is empty
    expect(c.every((x) => x.source === "ceq")).toBe(true);
  });

  test("a detour slide gets the segments inside a stamp context of its kind", () => {
    const f: BlastFrame = { id: "f2", kind: "phrase" };
    const c = prompterCandidates(f, doc(), "set-A");
    expect(c.map((x) => x.id)).toEqual(["g3"]);
    expect(c[0].source).toBe("stamp");
  });

  test("a slide picked from the bank also carries the bank item's quote and body", () => {
    const f: BlastFrame = { id: "f3", kind: "phrase", bankItemId: "b1" };
    const c = prompterCandidates(f, doc(), "set-A");
    // In the order they were said: the bank item was minted at 10:00:00, g3 at
    // 10:00:30. The item's quote duplicates g3 and is dropped.
    expect(c.map((x) => x.id)).toEqual(["b1:body", "g3"]);
  });

  test("a slide with nothing said about it has no candidates — nothing is invented", () => {
    expect(prompterCandidates({ id: "f4", kind: "ceq", ceqId: "ceq-9" }, doc(), "set-A")).toEqual([]);
    expect(prompterCandidates({ id: "f5", kind: "cheat" }, doc(), "set-A")).toEqual([]);
    expect(prompterCandidates({ id: "f6", kind: "bio" }, doc(), "set-A")).toEqual([]);
  });
});

describe("frameKindForStamp — a stamp becomes the slide of its kind", () => {
  test("the three standard kinds, the visual, and the old names", () => {
    expect(frameKindForStamp("memorize_this")).toBe("phrase");
    expect(frameKindForStamp("cheat_code")).toBe("cheat");
    expect(frameKindForStamp("deeper_idea")).toBe("tip");
    expect(frameKindForStamp("visual")).toBe("exhibit");
    expect(frameKindForStamp("tip_trick")).toBe("cheat");
    expect(frameKindForStamp("KEY")).toBe("cheat");          // legacy → tip_trick → cheat
    expect(frameKindForStamp("something_else")).toBe("tip");
  });
});

describe("the proofread call", () => {
  test("carries Lee's law, the kept lines, and every candidate by id", () => {
    const f: BlastFrame = { id: "f1", kind: "ceq", ceqId: "ceq-1" };
    const cands = prompterCandidates(f, doc(), "set-A");
    const { system, user } = buildTidyMessages({ slideLabel: "Q1", slideText: "Who are internal users?", candidates: cands, kept: ["Already kept"] });
    expect(system).toContain("NEVER add facts");
    expect(system).toContain("ONE suggestion at most");
    expect(user).toContain("[g1] Internal users are inside the company.");
    expect(user).toContain("- Already kept");
  });

  test("parseTidy keeps only known ids with text, and one suggestion", () => {
    const f: BlastFrame = { id: "f1", kind: "ceq", ceqId: "ceq-1" };
    const cands = prompterCandidates(f, doc(), "set-A");
    const r = parseTidy('Sure! {"lines":[{"id":"g1","text":"Internal users work inside the company."},{"id":"g3","text":""},{"id":"nope","text":"x"}],"suggestion":"  Say who is NOT internal.  "}', cands);
    expect(r.lines).toEqual([{ id: "g1", text: "Internal users work inside the company." }]);
    expect(r.suggestion).toBe("Say who is NOT internal.");
    expect(parseTidy('{"lines":[],"suggestion":null}', cands)).toEqual({ lines: [], suggestion: null });
    expect(() => parseTidy("no json here", cands)).toThrow();
  });
});
