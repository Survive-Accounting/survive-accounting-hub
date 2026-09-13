// The frame ledger's pure rules, pinned: the take reference, a scrap's three moments, the cut list
// and its ffmpeg command, and the Editor's skip / remove diffs.
import { describe, expect, test } from "bun:test";

import { clockOf, cutRanges, ffmpegCutCommand, filmedEvents, matchRoll, parseTakeRef, removedFrames, rollAtFor, ROLL_MAX_AGE_MS, saveEvents, scrapFromRow, scrapReason, scrapTimes, skipFlips, takeRefOf } from "./frame-events";
import type { BlastFrame } from "./plan";

describe("the take reference", () => {
  test("round-trips the set, the split and the roll", () => {
    const at = Date.UTC(2026, 8, 13, 15, 4, 5, 250);
    const ref = takeRefOf("deck-e1s-2-1", 2, at);
    expect(ref).toBe("deck-e1s-2-1#2@2026-09-13T15:04:05.250Z");
    expect(parseTakeRef(ref)).toEqual({ setId: "deck-e1s-2-1", takeIndex: 2, rolledAt: "2026-09-13T15:04:05.250Z" });
    expect(parseTakeRef(takeRefOf("s", null, at))?.takeIndex).toBeNull();
    expect(parseTakeRef("rehearsal")).toBeNull();
  });
});

describe("a scrap", () => {
  test("three moments measured from the roll; the attempt can't start before the recording did", () => {
    const roll = 1_000_000;
    expect(scrapTimes(roll, roll + 12_000, roll + 20_500, roll + 31_000)).toEqual({ attemptStartMs: 12_000, scrapMs: 20_500, resumeMs: 31_000 });
    // arrived on the slide BEFORE pressing F4: the attempt starts at the recording's own start
    expect(scrapTimes(roll, roll - 5_000, roll + 4_000, roll + 9_000)?.attemptStartMs).toBe(0);
    // nothing recording: a learning signal with nothing to cut
    expect(scrapTimes(null, 1, 2, 3)).toBeNull();
  });

  test("the recording in progress: this set's roll, not stale, not from the future", () => {
    const now = 10_000_000;
    expect(rollAtFor({ setId: "s", at: now - 60_000 }, "s", now)).toBe(now - 60_000);
    expect(rollAtFor({ setId: "other", at: now - 60_000 }, "s", now)).toBeNull();
    expect(rollAtFor({ setId: "s", at: now - ROLL_MAX_AGE_MS - 1 }, "s", now)).toBeNull();
    expect(rollAtFor({ setId: "s", at: now + 60_000 }, "s", now)).toBeNull();
    expect(rollAtFor(null, "s", now)).toBeNull();
  });

  test("the reason is what he said, else an honest placeholder — never empty", () => {
    expect(scrapReason("that sounded ", "clunky", true)).toBe("that sounded clunky");
    expect(scrapReason("", "", true)).toBe("(no reason spoken)");
    expect(scrapReason("", "", false)).toContain("dictation isn't available");
    expect(scrapReason("x".repeat(3000), "", true)).toHaveLength(2000);
  });

  test("a row reads back as a mark; a rehearsal scrap (no times) does not", () => {
    const row = { frame_id: "f1", take_ref: "s#0@2026-09-13T15:04:05.250Z", reason: "too long", after: { attemptStartMs: 1000, scrapMs: 2000, resumeMs: 5000 }, created_at: "2026-09-13T15:05:00Z" };
    expect(scrapFromRow(row)).toEqual({ frameId: "f1", takeRef: row.take_ref, reason: "too long", at: row.created_at, attemptStartMs: 1000, scrapMs: 2000, resumeMs: 5000 });
    expect(scrapFromRow({ ...row, take_ref: "rehearsal", after: {} })).toBeNull();
  });
});

describe("the cut", () => {
  test("sorted, overlaps merged, empties dropped — in seconds", () => {
    const ranges = cutRanges([
      { attemptStartMs: 40_000, scrapMs: 45_000, resumeMs: 52_000 },
      { attemptStartMs: 10_000, scrapMs: 15_000, resumeMs: 20_000 },
      { attemptStartMs: 50_000, scrapMs: 55_000, resumeMs: 60_000 },   // overlaps the first
      { attemptStartMs: 70_000, scrapMs: 70_000, resumeMs: 70_000 },   // empty
    ]);
    expect(ranges).toEqual([{ start: 10, end: 20 }, { start: 40, end: 60 }]);
  });

  test("the command keeps everything outside the cuts and names the output beside the take", () => {
    const cmd = ffmpegCutCommand("Assets.mp4", [{ start: 10, end: 20 }, { start: 40, end: 60 }]);
    expect(cmd).toContain(`-i "Assets.mp4"`);
    expect(cmd).toContain("select='not(between(t,10.00,20.00)+between(t,40.00,60.00))'");
    expect(cmd).toContain("aselect='not(between(t,10.00,20.00)+between(t,40.00,60.00))'");
    expect(cmd).toContain(`"Assets.cut.mp4"`);
    expect(ffmpegCutCommand("Assets.mp4", [])).toBe("");
  });

  test("a take file finds its roll by start time, within its split", () => {
    const roll = Date.UTC(2026, 8, 13, 15, 0, 0);
    const mk = (ref: string) => ({ frameId: "f", takeRef: ref, reason: "", at: "", attemptStartMs: 0, scrapMs: 0, resumeMs: 1 });
    const marks = [mk(takeRefOf("s", 1, roll)), mk(takeRefOf("s", 1, roll + 3_600_000)), mk(takeRefOf("s", 2, roll + 1000))];
    // a 5-minute file that finished 5:02 after the first roll
    expect(matchRoll(marks, 1, roll + 302_000, 300)).toBe(takeRefOf("s", 1, roll));
    expect(matchRoll(marks, 2, roll + 302_000, 300)).toBe(takeRefOf("s", 2, roll + 1000));
    expect(matchRoll(marks, 1, roll + 10_000_000, 300)).toBeNull();
  });

  test("the clock reads like a scrubber", () => {
    expect(clockOf(63.5)).toBe("1:03.5");
    expect(clockOf(4.04)).toBe("0:04.0");
  });
});

describe("the Editor's diffs", () => {
  const a: BlastFrame = { id: "a", kind: "phrase" };
  const b: BlastFrame = { id: "b", kind: "ceq", ceqId: "c" };
  test("skip flips are logged both ways, and a moved frame isn't a flip", () => {
    expect(skipFlips([a, b], [{ ...b, skipped: true }, a])).toEqual([{ frameId: "b", event: "skipped" }]);
    expect(skipFlips([{ ...a, skipped: true }], [a])).toEqual([{ frameId: "a", event: "unskipped" }]);
  });
  test("one save's events: deleted with the frame, restored only if deleted before, skips", () => {
    const c: BlastFrame = { id: "c", kind: "tip" };
    expect(saveEvents("s", [a, b], [{ ...b, skipped: true }, c], new Set())).toEqual([
      { frameId: "a", setId: "s", event: "deleted", before: a, source: "manual" },
      { frameId: "b", setId: "s", event: "skipped", source: "manual" },
    ]);
    expect(saveEvents("s", [b], [a, b], new Set(["a"]))).toEqual([{ frameId: "a", setId: "s", event: "restored", after: a, source: "manual" }]);
    expect(saveEvents("s", [a, b], [b, a], new Set())).toEqual([]);
  });
  test("filmed = the posted split's filmed frames, skips excluded, re-posts deduped", () => {
    const frames: BlastFrame[] = [a, { ...b, cutAfter: true }, { id: "c", kind: "tip", skipped: true }, { id: "d", kind: "tip" }];
    expect(filmedEvents("s", frames, 0, "s#0").map((e) => e.frameId)).toEqual(["a", "b"]);
    expect(filmedEvents("s", frames, 1, "s#1").map((e) => e.frameId)).toEqual(["d"]);
    expect(filmedEvents("s", frames, 0, "s#0", new Set(["a"])).map((e) => e.frameId)).toEqual(["b"]);
    expect(filmedEvents("s", frames, 5, "s#5")).toEqual([]);
  });
  test("a removed frame comes back with its last state", () => {
    expect(removedFrames([a, b], [b])).toEqual([a]);
    expect(removedFrames([a, b], [b, a])).toEqual([]);
  });
});

describe("restarting from another slide (G)", () => {
  test("the cut starts at the last arrival on the restart slide before the scrap", async () => {
    const { restartAttemptStart } = await import("./frame-events");
    const arrivals = [{ frameId: "s4", at: 100 }, { frameId: "s5", at: 200 }, { frameId: "s6", at: 300 }, { frameId: "s4", at: 400 }];
    // filmed 4·5·6, scrapped on 6 at 350, walked back to 4 (arrived at 400), F3 there → cut from 100
    expect(restartAttemptStart(arrivals, "s4", 350, 300)).toBe(100);
    // restarting on the slide it went wrong on keeps that slide's attempt
    expect(restartAttemptStart(arrivals, "s6", 350, 300)).toBe(300);
    // a slide not reached before the scrap: the scrapped slide's attempt start
    expect(restartAttemptStart(arrivals, "s9", 350, 300)).toBe(300);
  });
});
