import { describe, expect, test } from "bun:test";

import { FAST_TRACK_DAILY_LIMIT, chicagoDayKey, fastTrackAllowance, fastTrackPrompt, fmtBuildTime, fmtCost, fmtStamp, isFastTrack, needsCheckout, queueStateOf, runnerOnline } from "./fast-track";

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

describe("fast track v2", () => {
  test("the stamp reads the way Lee writes it, in Chicago", () => {
    expect(fmtStamp("2026-09-05T19:31:00Z")).toBe("9/5/26 at 2:31PM");
    expect(fmtStamp("2026-09-06T04:05:00Z")).toBe("9/5/26 at 11:05PM");
  });
  test("no new prompt until the last one is checked out — Lee excepted", () => {
    const row = (id: string, createdAt: string, ctx: Record<string, string>, status = "SUBMITTED") => ({ id, title: id, status, createdBy: "king", createdAt, context: { lane: "fast_track", ...ctx } });
    expect(needsCheckout([row("a", "2026-09-05T10:00:00Z", {})], "king")).toEqual({ kind: "wait", id: "a", title: "a", state: "queued" });
    expect(needsCheckout([row("a", "2026-09-05T10:00:00Z", { runStartedAt: "x" })], "king")?.kind).toBe("wait");
    expect(needsCheckout([row("a", "2026-09-05T10:00:00Z", { built: "1" })], "king")?.kind).toBe("rate");
    expect(needsCheckout([row("a", "2026-09-05T10:00:00Z", { built: "1", rating: "up" })], "king")).toBeNull();
    expect(needsCheckout([row("a", "2026-09-05T10:00:00Z", { cancelled: "1" }, "PARKED")], "king")).toBeNull();
    // the NEWEST one decides
    expect(needsCheckout([row("old", "2026-09-04T10:00:00Z", { built: "1" }), row("new", "2026-09-05T10:00:00Z", { built: "1", rating: "down" })], "king")).toBeNull();
    expect(needsCheckout([row("a", "2026-09-05T10:00:00Z", {})], "lee")).toBeNull();
  });
  test("the build machine is online for eight minutes after its last heartbeat", () => {
    const now = new Date("2026-09-05T20:00:00Z");
    expect(runnerOnline("2026-09-05T19:55:00Z", now)).toBe(true);
    expect(runnerOnline("2026-09-05T19:50:00Z", now)).toBe(false);
    expect(runnerOnline(null, now)).toBe(false);
  });
  test("cost and build time read cleanly", () => {
    expect(fmtCost("0.4171")).toBe("$0.42");
    expect(fmtCost(0.001)).toBe("<$0.01");
    expect(fmtCost(null)).toBe("—");
    expect(fmtBuildTime(700)).toBe("12 min");
    expect(fmtBuildTime(45)).toBe("45 s");
  });
});
