// THE 9:16 POP-OUT's pure parts: the URL it opens, how the new window knows
// itself, and the one-line status the chrome shows for what OBS will capture.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { POPOUT_BLOCKED, POPOUT_FEATURES, POPOUT_NAME, captureStatus, isPopoutSearch, popoutHref } from "./popout";

const route = readFileSync(join(import.meta.dir, "../../../routes/v3.$topic.$set.blast-off.film.tsx"), "utf8").split("\r\n").join("\n");

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
    expect(route).toContain("{ popout: 1 }");
  });
  test("its own window name and a popup (not a tab), so OBS sees one window", () => {
    expect(POPOUT_NAME).toBe("sa-film-popout");
    expect(POPOUT_FEATURES).toBe("popup=yes,width=560,height=1000");
    expect(POPOUT_BLOCKED).toContain("allow pop-ups");
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
