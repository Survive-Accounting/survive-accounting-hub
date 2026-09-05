import { describe, expect, test } from "bun:test";

import { buildFastTrackBriefMessages, FAST_TRACK_BRIEF_SYSTEM, parseFastTrackBrief } from "./fast-track-brief";

describe("the fast track brief", () => {
  test("the messages carry the request, the page, the screenshot flag, and a revision", () => {
    const m = buildFastTrackBriefMessages({
      brainstorm: "make the camera bigger on my slides", path: "/v3", pageTitle: "Blast Off",
      hasScreenshot: true, previous: { title: "x", prompt: "y" }, revision: "make it even bigger",
    });
    expect(m.system).toBe(FAST_TRACK_BRIEF_SYSTEM);
    for (const s of ["THE REQUEST", "camera bigger", "PAGE: /v3", "Blast Off", "A SCREENSHOT IS ATTACHED", "PREVIOUS DRAFT", "CHANGE REQUESTED: make it even bigger"]) {
      expect(m.user).toContain(s);
    }
    expect(m.system).toMatch(/UI\/UX ONLY/);
    expect(m.system).toMatch(/OUT OF SCOPE/);
  });

  test("an in-scope answer parses to a title, bullets, and the prompt", () => {
    const b = parseFastTrackBrief('{"title":"Bigger slide camera","bullets":["Camera on /v3 slides","Made larger, per the screenshot"],"prompt":"On /v3 slide templates, increase the default webcam size per the attached screenshot.","outOfScope":false,"outOfScopeReason":null}');
    expect(b?.title).toBe("Bigger slide camera");
    expect(b?.bullets).toHaveLength(2);
    expect(b?.outOfScope).toBe(false);
    expect(b?.prompt).toContain("webcam size");
  });

  test("an out-of-scope answer carries no prompt and a reason", () => {
    const b = parseFastTrackBrief('{"title":"x","bullets":[],"prompt":"","outOfScope":true,"outOfScopeReason":"This needs a new database table for storing payment methods."}');
    expect(b?.outOfScope).toBe(true);
    expect(b?.prompt).toBe("");
    expect(b?.outOfScopeReason).toContain("payment");
  });

  test("junk does not parse", () => {
    expect(parseFastTrackBrief("no json here")).toBeNull();
    expect(parseFastTrackBrief('{"title":"t"}')).toBeNull(); // in-scope but no prompt at all
  });
});
