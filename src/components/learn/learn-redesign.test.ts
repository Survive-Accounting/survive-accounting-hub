// THE /learn REDESIGN (2026-09-11) — the pure decisions behind the page, pinned: the hero's
// caption, a later row's own counts, the locked pill's price line, the practice art's tint and
// the Text Lee card's copy. Pixels are not tested here; the rules that produce the words are.
import { describe, expect, test } from "bun:test";

import { averageVideoCaption, examName, examWaitlistLine, LATER_EXAM_PRICE_USD, practiceMinutes, practiceTimeLabel, QUICK_ROUND_SIZE, quickRoundSize, SECONDS_PER_QUESTION, topicRowDetail, type GateSet } from "./learn-gate";
import { LEE_PHONE, LEE_TEL, TEXT_LEE_LINES } from "./LearnTextLee";
import { CARD_SHADOW, DISPLAY, SANS } from "./learn-theme";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

function gs(o: Partial<GateSet> = {}): GateSet {
  return { hasVideo: true, locked: false, started: false, runtimeSec: 100, ceqCount: 5, ...o };
}

describe("the hero's caption", () => {
  test("is the real average with 'per video' — and absent when nothing has a runtime", () => {
    expect(averageVideoCaption([gs({ runtimeSec: 120 }), gs({ runtimeSec: 180 })])).toBe("~2.5 min per video");
    expect(averageVideoCaption([gs({ runtimeSec: null })])).toBeNull();
    expect(averageVideoCaption([])).toBeNull();
  });
});

describe("a later row's own counts", () => {
  test("videos and the topic's practice questions, singulars included", () => {
    // Practice is off the page (2026-09-11, later): the row counts videos only.
    expect(topicRowDetail([gs({ ceqCount: 12 }), gs({ ceqCount: 9 }), gs({ ceqCount: 4 })])).toBe("3 videos");
    expect(topicRowDetail([gs({ ceqCount: 1 })])).toBe("1 video");
  });
  test("never advertises zero questions", () => {
    expect(topicRowDetail([gs({ ceqCount: 0 }), gs({ ceqCount: 0 })])).toBe("2 videos");
  });
  test("honest counts (09-11): unposted videos are not counted, a topic with none says nothing, locked sets add no questions", () => {
    expect(topicRowDetail([gs({ hasVideo: false, ceqCount: 12 }), gs({ hasVideo: false, ceqCount: 14 })])).toBeNull();
    expect(topicRowDetail([gs({ ceqCount: 5 }), gs({ hasVideo: false, ceqCount: 9 })])).toBe("1 video");
    expect(topicRowDetail([gs({ ceqCount: 5 }), gs({ locked: true, ceqCount: 9 })])).toBe("1 video");
  });
});

describe("the locked pill's line", () => {
  test("is the price copy as drafted, per exam", () => {
    expect(LATER_EXAM_PRICE_USD).toBe(50);
    expect(examWaitlistLine(2)).toBe("Exam 1 is free. Exam 2 is $50. Join the waitlist and I'll tell you the day it opens.");
    expect(examWaitlistLine(3)).toBe("Exam 1 is free. Exam 3 is $50. Join the waitlist and I'll tell you the day it opens.");
  });
  test("the Final is an exam too (Lee, 2026-09-11)", () => {
    expect(examName(4)).toBe("The Final");
    expect(examName(2)).toBe("Exam 2");
    expect(examWaitlistLine(4)).toBe("Exam 1 is free. The Final is $50. Join the waitlist and I'll tell you the day it opens.");
  });
});

describe("the quick round (Lee, 2026-09-11: a Practice card is access to the bank, not all of it)", () => {
  test("at most 15 questions, a minute each — ~15 mins for a full round, less for a short one, never the bank", () => {
    expect(QUICK_ROUND_SIZE).toBe(15);
    expect(SECONDS_PER_QUESTION).toBe(60);
    expect(quickRoundSize(97)).toBe(15);
    expect(quickRoundSize(8)).toBe(8);
    expect(practiceMinutes(97)).toBe(15);
    expect(practiceMinutes(8)).toBe(8);
    expect(practiceTimeLabel(97)).toBe("~15 mins to complete");
    expect(practiceTimeLabel(1)).toBe("~1 min to complete");
    expect(practiceTimeLabel(0)).toBeNull();
  });
});

describe("Text Lee", () => {
  test("the number, and the three lines as drafted", () => {
    expect(LEE_TEL).toBe("+16625658818");
    expect(LEE_PHONE).toBe("(662) 565-8818");
    expect([...TEXT_LEE_LINES]).toEqual(["I love hearing from students.", "Ask anything, or just introduce yourself.", "I do my best to answer every single one."]);
  });
});

describe("the home page's tokens", () => {
  test("the display and sans faces are the brand's, not /learn's own copies", () => {
    expect(DISPLAY).toBe(BRAND_DISPLAY);
    expect(SANS).toBe(BRAND_SANS);
  });
  test("the card shadow is the one the proposal drafted", () => {
    expect(CARD_SHADOW).toBe("0 10px 30px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)");
  });
});
