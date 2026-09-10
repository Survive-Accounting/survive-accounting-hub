// The /learn gate rules (learn-gate.ts) and the school-coloured top bar (learn-theme.ts) — pure
// functions, so these pin the decisions rather than the pixels.
import { describe, expect, test } from "bun:test";

import { emailGateNeeded, isUuid, practiceGateNeeded, questionCount, topicDetail, type GateSet } from "./learn-gate";
import { contrast, INK, themeFor, topBarFor } from "./learn-theme";
import { GENERATED_SCHOOLS } from "@/lib/schools.generated";

function gs(o: Partial<GateSet> = {}): GateSet {
  return { hasVideo: true, locked: false, started: false, runtimeSec: 100, ceqCount: 5, ...o };
}

describe("email gate", () => {
  test("Easy Points (index 0) is never gated", () => {
    expect(emailGateNeeded(0, false, false)).toBe(false);
  });
  test("later topics are gated for a signed-out, not-yet-unlocked visitor", () => {
    expect(emailGateNeeded(1, false, false)).toBe(true);
    expect(emailGateNeeded(4, false, false)).toBe(true);
  });
  test("a signed-in student skips it; so does a device that already unlocked", () => {
    expect(emailGateNeeded(1, true, false)).toBe(false);
    expect(emailGateNeeded(1, false, true)).toBe(false);
  });
});

describe("practice soft gate", () => {
  test("asks when the topic has watchable videos and none was started", () => {
    expect(practiceGateNeeded([gs(), gs()])).toBe(true);
  });
  test("does not ask once any watchable video was started", () => {
    expect(practiceGateNeeded([gs(), gs({ started: true })])).toBe(false);
  });
  test("does not ask when there is nothing to watch (no video, or only locked ones)", () => {
    expect(practiceGateNeeded([gs({ hasVideo: false }), gs({ hasVideo: false })])).toBe(false);
    expect(practiceGateNeeded([gs({ locked: true })])).toBe(false);
    expect(practiceGateNeeded([])).toBe(false);
  });
});

describe("topic detail", () => {
  test("counts videos, not question-only sets", () => {
    // Every set is a video, made or not; the minutes wait until every one is made and timed.
    expect(topicDetail([gs(), gs(), gs({ hasVideo: false })])).toBe("3 videos");
    expect(topicDetail([gs(), gs()])).toBe("2 videos · ~3 min");
    expect(topicDetail([gs({ runtimeSec: 90 })])).toBe("1 video · ~2 min");
  });
  test("never claims minutes unless every video has a runtime", () => {
    expect(topicDetail([gs(), gs({ runtimeSec: null })])).toBe("2 videos");
    expect(topicDetail([gs({ hasVideo: false, runtimeSec: null })])).toBe("1 video · coming soon");
    expect(topicDetail([])).toBe("0 videos");
  });
  test("questions are a plain sum of real counts", () => {
    expect(questionCount([gs({ ceqCount: 8 }), gs({ ceqCount: 0 }), gs({ ceqCount: 3 })])).toBe(11);
  });
});

describe("uuid guard for the intake campusId", () => {
  test("accepts a real campus id and rejects demo ids and empties", () => {
    expect(isUuid("b3af67c6-99a5-4677-83d5-aa7d11a89c17")).toBe(true);
    expect(isUuid("demo-campus")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("school-coloured top bar", () => {
  test("no school → the Blackboard's own black, border and chalk", () => {
    expect(topBarFor(null, null)).toEqual({ bg: INK.bg, border: INK.border, ink: INK.text, muted: INK.muted });
    expect(themeFor(null).topBg).toBe(INK.bg);
  });
  test("a school's c1 becomes the ground and c2 the rule, with readable ink", () => {
    const bar = topBarFor("#9E1B32", "#F1F2F3"); // Alabama
    expect(bar.bg).toBe("#9E1B32");
    expect(bar.border).toBe("#F1F2F3");
    expect(bar.ink).toBe(INK.text);
    expect(contrast(bar.bg, bar.ink)).toBeGreaterThanOrEqual(3);
  });
  test("a light c1 gets black ink", () => {
    const bar = topBarFor("#F1F2F3", "#9E1B32");
    expect(bar.ink).toBe("#111111");
    expect(contrast(bar.bg, bar.ink)).toBeGreaterThanOrEqual(3);
  });
  test("every generated school's bar clears 3:1 for its ink", () => {
    for (const s of GENERATED_SCHOOLS) {
      const bar = topBarFor(s.c1, s.c2);
      expect(contrast(bar.bg, bar.ink)).toBeGreaterThanOrEqual(3);
    }
  });
});
