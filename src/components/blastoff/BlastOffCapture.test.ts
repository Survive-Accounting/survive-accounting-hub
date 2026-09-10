// BlastOffCapture's pure parts. FILM FROM HERE (2026-09-10) — Lee: "'Film from here' is
// essential. I'm sick of scrolling all the way through. If that can be a popout from right
// there, that'd be epic." The film route's ?frame=<id> becomes the capture's `startFrameId`,
// and startIndexOf says where the walk opens. The route pins are source-text, the same way
// capture/popout.test.ts pins ?take= — TanStack drops any search param the route does not
// declare, and the pop-out inherits the URL, so the declaration IS the feature.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { startIndexOf } from "./BlastOffCapture";

const route = readFileSync(join(import.meta.dir, "../../routes/v3.$topic.$set.blast-off.film.tsx"), "utf8").split("\r\n").join("\n");
const capture = readFileSync(join(import.meta.dir, "BlastOffCapture.tsx"), "utf8").split("\r\n").join("\n");

const frames = [{ id: "open" }, { id: "q1" }, { id: "q2" }, { id: "outro" }];

describe("startIndexOf — where the walk opens", () => {
  test("no id is slide 1 (index 0), exactly as before", () => {
    expect(startIndexOf(frames, undefined)).toBe(0);
    expect(startIndexOf(frames, null)).toBe(0);
    expect(startIndexOf(frames, "")).toBe(0);
  });
  test("an id in the walked list is that slide's index", () => {
    expect(startIndexOf(frames, "open")).toBe(0);
    expect(startIndexOf(frames, "q2")).toBe(2);
    expect(startIndexOf(frames, "outro")).toBe(3);
  });
  test("an id the list does not have is ignored — slide 1, never a throw", () => {
    expect(startIndexOf(frames, "nope")).toBe(0);
    expect(startIndexOf([], "q1")).toBe(0);
  });
  test("with a split, only that split's slides count (an id from another split is ignored)", () => {
    const split2 = [{ id: "q2" }, { id: "outro" }];
    expect(startIndexOf(split2, "outro")).toBe(1);
    expect(startIndexOf(split2, "q1")).toBe(0);
  });
});

describe("the wiring", () => {
  test("the film route declares ?frame= as a non-empty string and hands it to the capture surface", () => {
    expect(route).toContain("frame?: string");
    expect(route).toContain('typeof s.frame === "string" && s.frame');
    expect(route).toContain("startFrameId={frame}");
  });
  test("the capture seeds its walk from startFrameId once, off the frames it walks", () => {
    expect(capture).toContain("startFrameId?: string");
    expect(capture).toContain("startIndexOf(frames, startFrameId)");
  });
  test("the count-in and the rounds still go to slide 0 — film-from-here moves only the start", () => {
    // C: "go to slide 0 and count in"; rounds: "from slide 1". Three setI(0)s, none replaced.
    expect(capture).toContain("const startRound = useCallback(() => { setI(0);");
    expect(capture).toContain("const startOver = useCallback(() => { setI(0);");
    expect(capture).toContain("useCountdown(useCallback(() => { setI(0);");
  });
});
