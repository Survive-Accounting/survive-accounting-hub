import { describe, expect, test } from "bun:test";

import { blastOffStepFromPath, fmtDuration, fmtElapsed, isProductionStep, PRODUCTION_STEPS, STEP_LABEL } from "./production-time";

describe("the production timer's pure helpers", () => {
  test("Brainstorm (talkthrough), Editor (results) and Rehearse & Film auto-detect from the URL; Arrange folds into review; Improve is not timed", () => {
    expect(blastOffStepFromPath("/v3/easy-points/internal-vs-external-users/blast-off/improve")).toBeNull();
    expect(blastOffStepFromPath("/v3/easy-points/internal-vs-external-users/blast-off/talkthrough")).toEqual({ topicSlug: "easy-points", setSlug: "internal-vs-external-users", step: "talkthrough" });
    expect(blastOffStepFromPath("/v3/easy-points/internal-vs-external-users/blast-off/results")).toEqual({ topicSlug: "easy-points", setSlug: "internal-vs-external-users", step: "review" });
    expect(blastOffStepFromPath("/v3/easy-points/internal-vs-external-users/blast-off/arrange")).toEqual({ topicSlug: "easy-points", setSlug: "internal-vs-external-users", step: "review" });
    expect(blastOffStepFromPath("/v3/easy-points/internal-vs-external-users/blast-off/film")).toEqual({ topicSlug: "easy-points", setSlug: "internal-vs-external-users", step: "film" });
  });
  test("everything else is null — no auto-start off a Blast Off page", () => {
    expect(blastOffStepFromPath("/v3/easy-points/internal-vs-external-users/blast-off")).toBeNull();
    expect(blastOffStepFromPath("/v3/easy-points/internal-vs-external-users")).toBeNull();
    expect(blastOffStepFromPath("/admin/ideas")).toBeNull();
    expect(blastOffStepFromPath("/")).toBeNull();
  });
  test("every step has a label; 'post' is a real step even with no page yet", () => {
    for (const s of PRODUCTION_STEPS) expect(STEP_LABEL[s]).toBeTruthy();
    expect(isProductionStep("post")).toBe(true);
    expect(isProductionStep("nope")).toBe(false);
  });
  test("fmtElapsed: a running clock, under and over an hour", () => {
    expect(fmtElapsed(0)).toBe("0:00");
    expect(fmtElapsed(65)).toBe("1:05");
    expect(fmtElapsed(3661)).toBe("1:01:01");
    expect(fmtElapsed(-5)).toBe("0:00");
  });
  test("fmtDuration: a report's coarser label", () => {
    expect(fmtDuration(45)).toBe("45s");
    expect(fmtDuration(150)).toBe("2m");
    expect(fmtDuration(8000)).toBe("2h 13m");
  });
});
