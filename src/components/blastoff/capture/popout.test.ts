// THE 9:16 POP-OUT's pure parts: the URL it opens, how the new window knows
// itself, and the one-line status the chrome shows for what OBS will capture.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { COUNTDOWN_GOLD_FROM, COUNTDOWN_SECONDS, POPOUT_BLOCKED, POPOUT_FEATURES, POPOUT_NAME, captureStatus, countdownCue, countdownStep, countdownTone, isPopoutSearch, popoutHref } from "./popout";

const route = readFileSync(join(import.meta.dir, "../../../routes/v3.$topic.$set.blast-off.film.tsx"), "utf8").split("\r\n").join("\n");
const capture = readFileSync(join(import.meta.dir, "../BlastOffCapture.tsx"), "utf8").split("\r\n").join("\n");

describe("the URL", () => {
  test("the same page, popout=1 added, everything else on it kept", () => {
    expect(popoutHref("https://sa.test/v3/t/s/blast-off/film")).toBe("https://sa.test/v3/t/s/blast-off/film?popout=1");
    expect(popoutHref("https://sa.test/v3/t/s/blast-off/film?ref=x")).toBe("https://sa.test/v3/t/s/blast-off/film?ref=x&popout=1");
    expect(popoutHref(popoutHref("https://sa.test/v3/t/s/blast-off/film"))).toBe("https://sa.test/v3/t/s/blast-off/film?popout=1");
  });
  test("the window knows itself by ?popout=1 alone", () => {
    expect(isPopoutSearch("?popout=1")).toBe(true);
    expect(isPopoutSearch("?ref=x&popout=1")).toBe(true);
    expect(isPopoutSearch("")).toBe(false);
    expect(isPopoutSearch("?popout=0")).toBe(false);
  });
  test("the film route declares the flag, so TanStack's search handling keeps it", () => {
    expect(route).toContain("validateSearch");
    expect(route).toContain("popout?: 1");
    expect(route).toContain("popout: 1");
  });
  test("its own window name and a popup (not a tab), so OBS sees one window", () => {
    expect(POPOUT_NAME).toBe("sa-film-popout");
    expect(POPOUT_FEATURES).toBe("popup=yes,width=560,height=1000");
    expect(POPOUT_BLOCKED).toContain("allow pop-ups");
  });
});

// Lee, 2026-09-07: "a 10 second countdown… like we're on slide 0 at that point."
describe("the countdown", () => {
  test("ten seconds, the last three in gold", () => {
    expect(COUNTDOWN_SECONDS).toBe(10);
    expect(COUNTDOWN_GOLD_FROM).toBe(3);
    expect(countdownTone(10)).toBe("cream");
    expect(countdownTone(4)).toBe("cream");
    expect(countdownTone(3)).toBe("gold");
    expect(countdownTone(1)).toBe("gold");
  });
  test("counts 10 → 1, then done", () => {
    const seen: number[] = [];
    let s: number | null = COUNTDOWN_SECONDS;
    while (s !== null) { seen.push(s); s = countdownStep(s); }
    expect(seen).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
  // Lee, 2026-09-08: "When will I start talking?" The count is a readout of the cold open, not a
  // 3-2-1 to start on: the camera flies in at the TOP of it and the wordmark lands on zero.
  // 2026-09-09: the count is a LEAD-IN now — nothing assembles until F4, which is also the OBS
  // record hotkey. "The countdown from 10, at 0 I hit my recording hotkey F4. Animation begins."
  test("the cue counts down to F4, not to talking", () => {
    expect(countdownCue(COUNTDOWN_SECONDS)).toContain("deep breath");
    expect(countdownCue(5)).not.toContain("NOW");
    expect(countdownCue(1)).toContain("F4 NOW");
    // The key is named at every second — the count exists to land that one press.
    for (const s of [COUNTDOWN_SECONDS, 5, 3, 1]) expect(countdownCue(s)).toContain("F4");
  });
  // Lee, 2026-09-09: "I press it mid-split and it wrecks the take." F4 is the OBS record key and
  // nothing about the slide: `roll` bumps the assembly run and leaves `i` alone, in both windows
  // (the other window's useRollSignal calls the same `roll`). The count's own `setI(0)` stays —
  // C is the key that goes to the top.
  test("F4 records where you are — roll never resets the slide", () => {
    const line = capture.split("\n").find((l) => l.trim().startsWith("const roll = "));
    expect(line).toBeDefined();
    expect(line).not.toContain("setI(0)");
    expect(line).toContain("ASSEMBLY_TOTAL_MS");
  });
});

describe("the status — physical pixels, what OBS captures", () => {
  test("exact 1080×1920 at any Windows scaling", () => {
    expect(captureStatus(1080, 1920, 1)).toBe("1080×1920 · exact");
    expect(captureStatus(720, 1280, 1.5)).toBe("1080×1920 · exact");
    expect(captureStatus(864, 1536, 1.25)).toBe("1080×1920 · exact");
  });
  test("the tallest 9:16 that fits a landscape monitor — OBS scales it up", () => {
    expect(captureStatus(540, 960, 1)).toBe("540×960 · tallest 9:16 that fits — set OBS to scale to 1080×1920 · F = fullscreen");
    expect(captureStatus(608, 1080, 1)).toBe("608×1080 · tallest 9:16 that fits — set OBS to scale to 1080×1920 · F = fullscreen");
  });
  test("not 9:16 says so, carrying the snap's reason when it gave one", () => {
    expect(captureStatus(1920, 1080, 1, "the browser refused to resize this window — press F for fullscreen"))
      .toBe("1920×1080 · not 9:16 — the browser refused to resize this window — press F for fullscreen");
    expect(captureStatus(1920, 1080, 1)).toContain("1920×1080 · not 9:16 — ");
  });
});
