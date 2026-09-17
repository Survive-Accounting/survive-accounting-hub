import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { betaCookieValue, betaSignature, readTesterSession, verifyBetaSignature } from "./beta-invite.server";

const saved = { ...process.env };
beforeEach(() => {
  process.env.BETA_INVITE_SECRET = "a-test-secret-that-is-long-enough";
  process.env.TEST_MODE_ENABLED = "1";
});
afterEach(() => { process.env = { ...saved }; });

describe("beta invites", () => {
  test("a signature verifies for its own address only, case-insensitively", () => {
    const k = betaSignature("Friend@Example.com")!;
    expect(k).toHaveLength(24);
    expect(verifyBetaSignature("friend@example.com", k)).toBe(true);
    expect(verifyBetaSignature("other@example.com", k)).toBe(false);
    expect(verifyBetaSignature("friend@example.com", `${k.slice(0, 23)}x`)).toBe(false);
    expect(verifyBetaSignature("friend@example.com", undefined)).toBe(false);
  });

  test("the cookie reads back as a beta session while test mode is on", () => {
    const k = betaSignature("friend@example.com")!;
    expect(readTesterSession(betaCookieValue("friend@example.com", k))).toEqual({ email: "friend@example.com", beta: true });
    process.env.TEST_MODE_ENABLED = "";
    expect(readTesterSession(betaCookieValue("friend@example.com", k))).toBeNull();
  });

  test("a forged or re-addressed cookie is no session", () => {
    const k = betaSignature("friend@example.com")!;
    expect(readTesterSession(`beta:someone@else.com:${k}`)).toBeNull();
    expect(readTesterSession("beta:friend@example.com:")).toBeNull();
    expect(readTesterSession("beta:")).toBeNull();
  });

  test("a QA tester cookie still reads as a non-beta session; a stranger's bare address does not", () => {
    expect(readTesterSession("lee@surviveaccounting.com")).toEqual({ email: "lee@surviveaccounting.com", beta: false });
    expect(readTesterSession("stranger@example.com")).toBeNull();
  });

  test("no secret, no invites", () => {
    process.env.BETA_INVITE_SECRET = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    expect(betaSignature("friend@example.com")).toBeNull();
    expect(verifyBetaSignature("friend@example.com", "anything-at-all-24-chars")).toBe(false);
  });
});
