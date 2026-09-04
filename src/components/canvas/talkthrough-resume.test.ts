// IDEMPOTENT RESUME tests — the derived generation plan for one session.
//
// The contract under test: a pass that was interrupted resumes on exactly the
// work it never finished, and NOTHING already on the board is regenerated.
import { describe, expect, test } from "bun:test";

import {
  emptyDoc, makeSession, readGeneration,
  type BoardItem, type TTDoc, type TalkSegment, type TalkSession, type TalkTag,
} from "./talkthrough";
import {
  editTasksFor, findEditItem, generationPlan, isClosedEditStamp, matchesEditTask,
  progressLabel, statusOfEditItem, synthesisTaskFor,
} from "./talkthrough-resume";

const T0 = "2026-09-04T10:00:00.000Z";
const at = (m: number): string => new Date(Date.parse(T0) + m * 60_000).toISOString();

const mkSeg = (over: Partial<TalkSegment>): TalkSegment => ({
  id: `g-${Math.random()}`, sessionId: "s1", seq: 1, text: "", source: "live", whisperPending: false,
  audioPath: null, focusedCeqId: null, focusedCeqLabel: null,
  startedAt: T0, endedAt: null, createdAt: T0, updatedAt: T0, syncedAt: null, ...over,
});
const mkTag = (over: Partial<TalkTag>): TalkTag => ({
  id: `t-${Math.random()}`, sessionId: "s1", tag: "reword", at: T0, endedAt: at(1),
  focusedCeqId: "q1", focusedCeqLabel: "Q1 · Unearned → earned", source: "tap", note: null,
  createdAt: T0, updatedAt: T0, syncedAt: null, ...over,
});
const mkItem = (over: Partial<BoardItem>): BoardItem => ({
  id: `b-${Math.random()}`, sessionId: "s1", runId: "micro", kind: "ceq_edit", title: "Reword · Q1",
  payload: {}, quote: "", ceqIds: [], status: "suggested", comment: "",
  createdAt: T0, updatedAt: T0, syncedAt: null, ...over,
});
const mkSession = (over: Partial<TalkSession> = {}): TalkSession =>
  ({ ...makeSession("set-1", "Internal vs. external users"), id: "s1", ...over });

/** One session: two closed reword stamps with words inside them. */
function twoStampDoc(): TTDoc {
  const d = emptyDoc();
  d.sessions.push(mkSession());
  d.tags.push(
    mkTag({ id: "tag-a", at: at(0), endedAt: at(2), focusedCeqId: "q1", focusedCeqLabel: "Q1" }),
    mkTag({ id: "tag-b", at: at(4), endedAt: at(6), focusedCeqId: "q2", focusedCeqLabel: "Q2", tag: "revise_choices" }),
  );
  d.segments.push(
    mkSeg({ seq: 1, startedAt: at(1), text: "make the stem shorter" }),
    mkSeg({ seq: 2, startedAt: at(5), text: "drop the last distractor" }),
  );
  return d;
}

describe("what counts as one unit of generation", () => {
  test("a closed edit stamp on a CEQ with words is a task", () => {
    expect(isClosedEditStamp(mkTag({}))).toBe(true);
  });
  test("open contexts, stars, exhibits, archives and non-edit stamps are not", () => {
    expect(isClosedEditStamp(mkTag({ endedAt: null }))).toBe(false);          // still talking
    expect(isClosedEditStamp(mkTag({ starred: true }))).toBe(false);          // a bookmark
    expect(isClosedEditStamp(mkTag({ focusedCeqId: "exhibit:x" }))).toBe(false);
    expect(isClosedEditStamp(mkTag({ archivedAt: at(9) }))).toBe(false);
    expect(isClosedEditStamp(mkTag({ tag: "cheat_code" }))).toBe(false);      // not an edit lane
    expect(isClosedEditStamp(mkTag({ source: "ai" }))).toBe(false);           // AI proposals never fire drafts
  });
  test("a stamp with nothing spoken inside it produces no task", () => {
    const d = emptyDoc();
    d.sessions.push(mkSession());
    d.tags.push(mkTag({ id: "tag-a", at: at(0), endedAt: at(2) }));
    expect(editTasksFor(d, "s1")).toEqual([]);
  });
});

describe("matching an existing board item", () => {
  const task = { tagId: "tag-a", ceqId: "q1", stamp: "reword" };
  test("tagId is the exact key when the item carries one", () => {
    expect(matchesEditTask(mkItem({ payload: { tagId: "tag-a", ceqId: "q1", stamp: "reword" } }), task)).toBe(true);
    expect(matchesEditTask(mkItem({ payload: { tagId: "tag-z", ceqId: "q1", stamp: "reword" } }), task)).toBe(false);
  });
  test("legacy items with no tagId fall back to {ceq, stamp}", () => {
    expect(matchesEditTask(mkItem({ payload: { ceqId: "q1", stamp: "reword" } }), task)).toBe(true);
    expect(matchesEditTask(mkItem({ payload: { ceqId: "q2", stamp: "reword" } }), task)).toBe(false);
    expect(matchesEditTask(mkItem({ payload: { ceqId: "q1", stamp: "revise_choices" } }), task)).toBe(false);
  });
  test("other kinds never match; an ARCHIVED draft still does", () => {
    expect(matchesEditTask(mkItem({ kind: "idea", payload: { tagId: "tag-a" } }), task)).toBe(false);
    // A dismissed draft must stay dismissed — matching it is how a resume
    // knows not to resurrect (and re-bill) it.
    expect(matchesEditTask(mkItem({ payload: { tagId: "tag-a" }, archivedAt: at(9) }), task)).toBe(true);
    expect(statusOfEditItem(mkItem({ payload: { tagId: "tag-a", state: "drafting" }, archivedAt: at(9) }))).toBe("done");
  });
  test("a dismissed draft does not come back on resume", () => {
    const d = twoStampDoc();
    d.boardItems.push(
      mkItem({ payload: { tagId: "tag-a", state: "ready" } }),
      mkItem({ payload: { tagId: "tag-b", state: "drafting" }, archivedAt: at(9) }), // Lee threw it away
    );
    expect(generationPlan(d, mkSession()).resumable).toHaveLength(0);
  });
  test("findEditItem picks the covering item out of a mixed board", () => {
    const board = [mkItem({ kind: "script", payload: {} }), mkItem({ id: "hit", payload: { tagId: "tag-a" } })];
    expect(findEditItem(board, task)?.id).toBe("hit");
    expect(findEditItem(board, { tagId: "nope", ceqId: "zz", stamp: "reword" })).toBeNull();
  });
});

describe("the status an existing draft implies", () => {
  test("no item = pending, drafting = interrupted, error = failed, ready = done", () => {
    expect(statusOfEditItem(null)).toBe("pending");
    expect(statusOfEditItem(mkItem({ payload: { state: "drafting" } }))).toBe("interrupted");
    expect(statusOfEditItem(mkItem({ payload: { state: "error" } }))).toBe("failed");
    expect(statusOfEditItem(mkItem({ payload: { state: "ready" } }))).toBe("done");
  });
  test("a synthesis-minted edit (no booth state) counts as landed", () => {
    expect(statusOfEditItem(mkItem({ runId: "run-1", payload: { stamp: "synthesis", ceqId: "q1", state: "ready" } }))).toBe("done");
  });
});

describe("the plan resumes exactly the unfinished work", () => {
  test("nothing generated yet: every task is pending", () => {
    const plan = generationPlan(twoStampDoc(), mkSession());
    expect(plan.total).toBe(2);
    expect(plan.completed).toBe(0);
    expect(plan.resumable.map((t) => t.tagId)).toEqual(["tag-a", "tag-b"]);
    expect(progressLabel(plan)).toBe("0/2 done · 2 to go");
  });

  test("THE ACCEPTANCE CASE: one landed, one died mid-flight — only the dead one resumes", () => {
    const d = twoStampDoc();
    d.boardItems.push(
      mkItem({ payload: { tagId: "tag-a", ceqId: "q1", stamp: "reword", state: "ready" } }),
      mkItem({ id: "stranded", payload: { tagId: "tag-b", ceqId: "q2", stamp: "revise_choices", state: "drafting" } }),
    );
    const plan = generationPlan(d, mkSession());
    expect(plan.total).toBe(2);
    expect(plan.completed).toBe(1);
    expect(plan.resumable).toHaveLength(1);
    expect(plan.resumable[0].tagId).toBe("tag-b");
    expect(plan.resumable[0].status).toBe("interrupted");
    expect(plan.resumable[0].item?.id).toBe("stranded"); // resume REUSES the row, never doubles it
    expect(progressLabel(plan)).toBe("1/2 done · 1 to go");
  });

  test("a failed item stays failed — a resume never re-bills it (out of scope by design)", () => {
    const d = twoStampDoc();
    d.boardItems.push(
      mkItem({ payload: { tagId: "tag-a", state: "error", error: "draft didn't parse" } }),
      mkItem({ payload: { tagId: "tag-b", state: "ready" } }),
    );
    const plan = generationPlan(d, mkSession());
    expect(plan.resumable).toHaveLength(0);
    expect(plan.failed).toBe(1);
    expect(progressLabel(plan)).toBe("2/2 done · 1 failed");
  });

  test("re-running with everything present asks for no work at all (idempotent)", () => {
    const d = twoStampDoc();
    d.boardItems.push(
      mkItem({ payload: { tagId: "tag-a", state: "ready" } }),
      mkItem({ payload: { tagId: "tag-b", state: "ready" } }),
    );
    expect(generationPlan(d, mkSession()).resumable).toHaveLength(0);
    expect(generationPlan(d, mkSession()).completed).toBe(2);
  });

  test("the task carries the verbatim instruction its stamp window holds", () => {
    const tasks = editTasksFor(twoStampDoc(), "s1");
    expect(tasks[0].instruction).toBe("make the stem shorter");
    expect(tasks[1].instruction).toBe("drop the last distractor");
  });

  test("tasks are scoped to their own session", () => {
    const d = twoStampDoc();
    d.tags.push(mkTag({ id: "other", sessionId: "s2", at: at(0), endedAt: at(2) }));
    d.segments.push(mkSeg({ sessionId: "s2", startedAt: at(1), text: "another set entirely" }));
    expect(editTasksFor(d, "s1").map((t) => t.tagId)).toEqual(["tag-a", "tag-b"]);
    expect(editTasksFor(d, "s2").map((t) => t.tagId)).toEqual(["other"]);
  });
});

describe("the synthesis lane", () => {
  test("no request on record = no task", () => {
    expect(synthesisTaskFor(twoStampDoc(), mkSession())).toBeNull();
  });
  test("requested, no script on the board = interrupted", () => {
    const s = mkSession({ generation: { requestedAt: at(7), excludedKinds: [], wantVibePlan: false } });
    expect(synthesisTaskFor(twoStampDoc(), s)?.status).toBe("interrupted");
  });
  test("a script on the board is done, whatever the session says", () => {
    const d = twoStampDoc();
    d.boardItems.push(mkItem({ kind: "script", payload: {} }));
    const s = mkSession({ generation: { requestedAt: at(7), excludedKinds: [], wantVibePlan: false } });
    expect(synthesisTaskFor(d, s)?.status).toBe("done");
  });
  test("a recorded failure is failed, not resumable", () => {
    const s = mkSession({ generation: { requestedAt: at(7), excludedKinds: [], wantVibePlan: false, error: "model returned non-JSON" } });
    expect(synthesisTaskFor(twoStampDoc(), s)?.status).toBe("failed");
  });
  test("it joins the same plan, so the count covers both lanes", () => {
    const s = mkSession({ generation: { requestedAt: at(7), excludedKinds: ["short"], wantVibePlan: true } });
    const plan = generationPlan(twoStampDoc(), s);
    expect(plan.total).toBe(3);
    expect(plan.resumable.map((t) => t.key)).toEqual(["tag-a", "tag-b", "synthesis"]);
  });
});

describe("the pre-flight request round-trips", () => {
  test("readGeneration keeps the choices and defaults the rest", () => {
    expect(readGeneration({ requestedAt: T0, excludedKinds: ["short", 3], wantVibePlan: 1 })).toEqual({
      requestedAt: T0, excludedKinds: ["short"], wantVibePlan: true, completedAt: null, error: null,
    });
  });
  test("junk, nulls and a missing requestedAt read as no request", () => {
    expect(readGeneration(null)).toBeNull();
    expect(readGeneration("nope")).toBeNull();
    expect(readGeneration([])).toBeNull();
    expect(readGeneration({ excludedKinds: [] })).toBeNull();
  });
});
