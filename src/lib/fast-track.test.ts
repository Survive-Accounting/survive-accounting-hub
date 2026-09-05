import { describe, expect, test } from "bun:test";

import { FAST_TRACK_DAILY_LIMIT, chicagoDayKey, fastTrackAllowance, fastTrackPrompt, isFastTrack, queueStateOf } from "./fast-track";

const mk = (createdBy: string, createdAt: string, lane = "fast_track") => ({ status: "SUBMITTED", createdBy, createdAt, context: { lane } });

describe("fast track", () => {
  test("Lee is unlimited; King gets ten per Chicago day, resetting at Chicago midnight", () => {
    const now = new Date("2026-09-05T20:00:00Z");           // 3pm Chicago, Sep 5
    const ideas = [
      ...Array.from({ length: 4 }, (_, i) => mk("king", `2026-09-05T1${i}:00:00Z`)),
      mk("king", "2026-09-05T03:00:00Z"),                       // 10pm Chicago on Sep 4 — yesterday
      mk("lee", "2026-09-05T15:00:00Z"),
      { ...mk("king", "2026-09-05T16:00:00Z", "other"), context: {} },  // not fast track
    ];
    expect(fastTrackAllowance(ideas, "king", now)).toEqual({ used: 4, limit: FAST_TRACK_DAILY_LIMIT, left: 6 });
    expect(fastTrackAllowance(ideas, "lee", now).limit).toBeNull();
    expect(chicagoDayKey(new Date("2026-09-05T03:00:00Z"))).toBe("2026-09-04");
  });
  test("the lane and the state words", () => {
    expect(isFastTrack({ context: { lane: "fast_track" } })).toBe(true);
    expect(isFastTrack({ context: {} })).toBe(false);
    expect(queueStateOf({ status: "SUBMITTED", context: {} })).toBe("queued");
    expect(queueStateOf({ status: "SUBMITTED", context: { runStartedAt: "x" } })).toBe("building");
    expect(queueStateOf({ status: "SUBMITTED", context: { built: "1" } })).toBe("built");
    expect(queueStateOf({ status: "SUBMITTED", context: { runFailed: "1" } })).toBe("failed");
    expect(queueStateOf({ status: "APPROVED", context: { built: "1" } })).toBe("done");
  });
  test("the prompt carries the request, the page and who asked", () => {
    const p = fastTrackPrompt({ text: "Add a Bucerias time and a Philippines time top right.", path: "/admin/growth/v2", pageTitle: "Growth", who: "king" });
    expect(p).toContain("from king");
    expect(p).toContain("/admin/growth/v2");
    expect(p).toContain("Bucerias");
  });
});
