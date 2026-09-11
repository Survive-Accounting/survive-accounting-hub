// The /learn gate rules (learn-gate.ts) and the school-coloured top bar (learn-theme.ts) — pure
// functions, so these pin the decisions rather than the pixels.
import { describe, expect, test } from "bun:test";

import { averageVideoLabel, averageVideoMinutes, emailGateNeeded, examTease, isUuid, practiceGateNeeded, questionCount, topicDetail, waitlistNeeded, type GateSet } from "./learn-gate";
import { CHALK, CHARCOAL, CREAM, DEFAULT_LOOK, INK, LOOKS, LOOK_NOTES, LOOK_ORDER, MONO, NAVY, PAPER, SPLIT, contrast, isLook, themeFor, topBarFor } from "./learn-theme";
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
  test("default is cream (Lee's pick, 2026-09-11); ?look=navy swaps every surface token", () => {
    expect(DEFAULT_LOOK).toBe("cream");
    expect(themeFor(null).look).toBe("cream");
    expect(themeFor(null).palette.bg).toBe(CREAM.bg);
    expect(themeFor(null, "black").palette.bg).toBe(INK.bg);
    const navy = themeFor(null, "navy");
    expect(navy.look).toBe("navy");
    expect(navy.palette.bg).toBe(NAVY.bg);
    expect(navy.topBg).toBe(NAVY.nav.bg);
    expect(navy.topInk).toBe(NAVY.nav.text);
  });
  test("no school → gold on navy, lime on black", () => {
    expect(themeFor(null, "navy").accent).toBe(NAVY.fallbackAccent);
    expect(themeFor(null, "black").accent).toBe(INK.lime);
  });
  test("every generated school's accent clears 3:1 on the navy ground, or falls back", () => {
    for (const s of GENERATED_SCHOOLS) {
      const t = themeFor(s, "navy");
      expect(contrast(t.accent, NAVY.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.topBg, t.topInk)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the eight looks (Lee, 2026-09-11: 'give me a bunch of possible options to try with ?look=')", () => {
  test("black and navy first, then Part E's build order; every name is a look", () => {
    expect([...LOOK_ORDER]).toEqual(["black", "navy", "cream", "paper", "chalk", "charcoal", "split", "mono"]);
    for (const k of LOOK_ORDER) { expect(isLook(k)).toBe(true); expect(LOOKS[k]).toBeDefined(); expect(LOOK_NOTES[k].length).toBeGreaterThan(10); }
    expect(isLook("orange")).toBe(false);
    expect(isLook("toString")).toBe(false);
  });
  test("the anchors are Part E's: canvas, surface, text, navbar", () => {
    expect(CREAM.bg).toBe("#F5F1E8"); expect(CREAM.surface).toBe("#FBF9F4"); expect(CREAM.text).toBe("#14213D"); expect(CREAM.nav.bg).toBe("#14213D");
    expect(PAPER.bg).toBe("#FAFAF7"); expect(PAPER.surface).toBe("#FFFFFF"); expect(PAPER.nav.bg).toBe("#14213D");
    expect(CHALK.bg).toBe("#111827"); expect(CHALK.nav.bg).toBe("#0B1220");
    expect(CHARCOAL.bg).toBe("#1C1B1A"); expect(CHARCOAL.nav.bg).toBe("#14213D");
    expect(SPLIT.bg).toBe("#F5F1E8"); expect(SPLIT.hero?.bg).toBe("#14213D"); expect(SPLIT.nav.bg).toBe("#14213D");
    expect(MONO.bg).toBe("#F7F7F5"); expect(MONO.nav.bg).toBe("#0B0B0B"); expect(MONO.accentFirst).toBe("c1");
    expect(INK.nav.bg).toBe("#0A0A0A");
  });
  test("every look reads: text 4.5:1 on canvas and surface, muted 3:1, bar ink 4.5:1, fallback accent 3:1", () => {
    for (const k of LOOK_ORDER) {
      const p = LOOKS[k];
      expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.nav.text, p.nav.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.nav.muted, p.nav.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.fallbackAccent, p.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.green, p.bg)).toBeGreaterThanOrEqual(3);
      if (p.hero) { expect(contrast(p.hero.text, p.hero.bg)).toBeGreaterThanOrEqual(4.5); expect(contrast(p.hero.muted, p.hero.bg)).toBeGreaterThanOrEqual(3); }
    }
  });
  test("every generated school, every look: the accent clears 3:1 on the canvas, ink clears 3:1 on the accent, the bar's ink reads", () => {
    for (const k of LOOK_ORDER) for (const s of GENERATED_SCHOOLS) {
      const t = themeFor(s, k);
      expect(contrast(t.accent, t.palette.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.accent, t.accentInk)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.topBg, t.topInk)).toBeGreaterThanOrEqual(4.5);
      expect(t.topBg).toBe(t.palette.nav.bg);
    }
  });
  test("light is the canvas's luminance: cream, paper, split, mono are light; the rest are dark", () => {
    expect(LOOK_ORDER.filter((k) => themeFor(null, k).light)).toEqual(["cream", "paper", "split", "mono"]);
  });
  test("on cream a red accent gets cream letters, not black ones", () => {
    const t = themeFor(null, "cream");
    expect(t.accent).toBe("#CE1126");
    expect(t.accentInk).toBe(CREAM.bg);
  });
  test("mono tries the school's primary first; with no school the accent is the ink", () => {
    expect(themeFor({ c1: "#9E1B32", c2: "#F1F2F3" }, "mono").accent).toBe("#9E1B32");
    expect(themeFor(null, "mono").accent).toBe(MONO.text);
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

describe("the shell's top bar (2026-09-11: the navbar no longer wears the school)", () => {
  test("no school → the look's own bar, its accent as the hairline", () => {
    expect(topBarFor(null, null)).toEqual({ bg: INK.nav.bg, border: INK.fallbackAccent, rule: INK.nav.border, ink: INK.nav.text, muted: INK.nav.muted });
    expect(themeFor(null, "black").topBg).toBe(INK.nav.bg);
    expect(themeFor(null, "black").topBorder).toBe(INK.lime);
    expect(themeFor(null).topBg).toBe(CREAM.nav.bg);
    expect(themeFor(null).topBorder).toBe(CREAM.fallbackAccent);
  });
  test("a school's c1 is the hairline when it shows on the bar; the ground and ink stay the bar's", () => {
    const bar = topBarFor("#9E1B32", "#F1F2F3", INK); // Alabama, on the Blackboard
    expect(bar.bg).toBe(INK.nav.bg);
    expect(bar.border).toBe("#9E1B32");
    expect(bar.ink).toBe(INK.nav.text);
    expect(contrast(bar.bg, bar.ink)).toBeGreaterThanOrEqual(4.5);
  });
  test("a c1 that vanishes on the bar hands the hairline to c2", () => {
    const bar = topBarFor("#14213D", "#CE1126", CREAM); // navy on the navy bar
    expect(bar.border).toBe("#CE1126");
  });
  test("neither school colour visible, nor the accent → the palette's own fallback accent", () => {
    const t = themeFor({ c1: "#14213D", c2: "#1A2A4A" }, "cream"); // two navies on the navy bar
    expect(t.topBorder).toBe(CREAM.fallbackAccent);
  });
  test("every generated school's hairline is visible on every look's bar", () => {
    for (const k of LOOK_ORDER) for (const s of GENERATED_SCHOOLS) {
      const t = themeFor(s, k);
      expect(contrast(t.topBorder, t.topBg)).toBeGreaterThanOrEqual(1.6);
    }
  });
});
