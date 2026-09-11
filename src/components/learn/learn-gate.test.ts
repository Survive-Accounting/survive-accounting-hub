// The /learn gate rules (learn-gate.ts) and the school-coloured top bar (learn-theme.ts) — pure
// functions, so these pin the decisions rather than the pixels.
import { describe, expect, test } from "bun:test";

import { averageVideoLabel, averageVideoMinutes, emailGateNeeded, examTease, isUuid, practiceGateNeeded, questionCount, topicDetail, waitlistNeeded, type GateSet } from "./learn-gate";
import { contrast, INK, NAVY, themeFor, topBarFor } from "./learn-theme";
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

describe("waitlist ask (no posted video yet)", () => {
  test("asks only when nothing is posted and no email is on file", () => {
    expect(waitlistNeeded(0, false, false)).toBe(true);
    expect(waitlistNeeded(2, false, false)).toBe(false);
    expect(waitlistNeeded(0, true, false)).toBe(false);
    expect(waitlistNeeded(0, false, true)).toBe(false);
  });
  test("teases the whole exam with real counts, singulars included", () => {
    expect(examTease(3, [gs({ ceqCount: 8 }), gs({ ceqCount: 4 }), gs({ ceqCount: 0 })])).toBe("3 topics · 3 videos · 12 exam questions");
    expect(examTease(1, [gs({ ceqCount: 1 })])).toBe("1 topic · 1 video · 1 exam question");
    expect(examTease(0, [])).toBe("0 topics · 0 videos · 0 exam questions");
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
    // No "coming soon" anywhere on the page (Lee, 2026-09-10): an unposted topic is just its count.
    expect(topicDetail([gs({ hasVideo: false, runtimeSec: null })])).toBe("1 video");
    expect(topicDetail([])).toBe("0 videos");
  });
  test("questions are a plain sum of real counts", () => {
    expect(questionCount([gs({ ceqCount: 8 }), gs({ ceqCount: 0 }), gs({ ceqCount: 3 })])).toBe(11);
  });
});

describe("average video length (the number Lee wants to keep beating)", () => {
  test("is the mean over the sets that have a runtime, in minutes", () => {
    expect(averageVideoMinutes([gs({ runtimeSec: 120 }), gs({ runtimeSec: 180 })])).toBe(2.5);
  });
  test("leaves untimed sets out of the mean instead of counting them as zero", () => {
    expect(averageVideoMinutes([gs({ runtimeSec: 120 }), gs({ runtimeSec: null }), gs({ runtimeSec: 0 })])).toBe(2);
  });
  test("is null — never invented — when nothing has a runtime", () => {
    expect(averageVideoMinutes([gs({ runtimeSec: null })])).toBeNull();
    expect(averageVideoMinutes([])).toBeNull();
    expect(averageVideoLabel([])).toBeNull();
  });
  test("labels one decimal under ten minutes, whole minutes from ten up", () => {
    expect(averageVideoLabel([gs({ runtimeSec: 102 }), gs({ runtimeSec: 98 }), gs({ runtimeSec: 120 }), gs({ runtimeSec: 115 }), gs({ runtimeSec: 90 })])).toBe("~1.8 min");
    expect(averageVideoLabel([gs({ runtimeSec: 150 })])).toBe("~2.5 min");
    expect(averageVideoLabel([gs({ runtimeSec: 745 })])).toBe("~12 min");
    expect(averageVideoLabel([gs({ runtimeSec: 599 })])).toBe("~10 min");
    expect(averageVideoLabel([gs({ runtimeSec: 596 })])).toBe("~9.9 min");
  });
});

describe("the navy look (the home page's palette)", () => {
  test("default is the Blackboard; ?look=navy swaps every surface token", () => {
    expect(themeFor(null).look).toBe("black");
    expect(themeFor(null).palette.bg).toBe(INK.bg);
    const navy = themeFor(null, "navy");
    expect(navy.look).toBe("navy");
    expect(navy.palette.bg).toBe(NAVY.bg);
    expect(navy.topBg).toBe(NAVY.bg);
    expect(navy.topInk).toBe(NAVY.text);
  });
  test("no school → gold on navy, lime on black", () => {
    expect(themeFor(null, "navy").accent).toBe(NAVY.fallbackAccent);
    expect(themeFor(null, "black").accent).toBe(INK.lime);
  });
  test("the school-coloured top bar still works in navy", () => {
    const t = themeFor({ c1: "#9E1B32", c2: "#F1F2F3" }, "navy"); // Alabama
    expect(t.topBg).toBe("#9E1B32");
    expect(contrast(t.topBg, t.topInk)).toBeGreaterThanOrEqual(3);
  });
  test("every generated school's accent clears 3:1 on the navy ground, or falls back", () => {
    for (const s of GENERATED_SCHOOLS) {
      const t = themeFor(s, "navy");
      expect(contrast(t.accent, NAVY.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.topBg, t.topInk)).toBeGreaterThanOrEqual(3);
    }
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
