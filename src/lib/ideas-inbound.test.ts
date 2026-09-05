// INBOUND CAPTURE — the allowlist is the entire security model for two public
// URLs, so it is tested first and hardest. Everything else here is convenience.
import { afterEach, describe, expect, test } from "bun:test";

import {
  identifyEmail, identifyPhone, looksLikeCategoryReply, normalizeEmail, normalizePhone,
  parseCategoryReply, taggedReply, twiml,
} from "./ideas-inbound";

const ENV = ["IDEAS_SMS_LEE", "IDEAS_SMS_KING", "IDEAS_EMAIL_LEE"] as const;
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe("the allowlist", () => {
  test("a configured number matches however it is formatted", () => {
    process.env.IDEAS_SMS_LEE = "+1 (601) 555-1234";
    expect(identifyPhone("+16015551234")).toBe("lee");
    expect(identifyPhone("6015551234")).toBe("lee");
    expect(identifyPhone("(601) 555-1234")).toBe("lee");
  });
  test("an UNKNOWN number is nobody — no reply, no row", () => {
    process.env.IDEAS_SMS_LEE = "+16015551234";
    expect(identifyPhone("+15559998888")).toBeNull();
    expect(identifyPhone("")).toBeNull();
  });
  // A path that opens itself when unconfigured is how a vault leaks.
  test("with NOTHING configured, nobody matches — the path stays closed", () => {
    expect(identifyPhone("+16015551234")).toBeNull();
    expect(identifyEmail("lee@surviveaccounting.com")).toBeNull();
  });
  test("empty env values never match an empty-ish sender", () => {
    process.env.IDEAS_SMS_LEE = "";
    expect(identifyPhone("")).toBeNull();
    expect(identifyPhone("abc")).toBeNull();
  });
  test("email matches case-insensitively and through a display name", () => {
    process.env.IDEAS_EMAIL_LEE = "Lee@SurviveAccounting.com";
    expect(identifyEmail("lee@surviveaccounting.com")).toBe("lee");
    expect(identifyEmail("Lee Ingram <LEE@surviveaccounting.com>")).toBe("lee");
    expect(identifyEmail("someone@else.com")).toBeNull();
  });
  test("everyone gets in — the person who notices is usually not Lee", () => {
    process.env.IDEAS_SMS_KING = "+16015550000";
    expect(identifyPhone("+16015550000")).toBe("king");
  });
});

describe("normalisers", () => {
  test("phone drops formatting and a leading US 1", () => {
    expect(normalizePhone("+1 (601) 555-1234")).toBe("6015551234");
    expect(normalizePhone("6015551234")).toBe("6015551234");
    // a non-US number keeps its digits rather than losing a leading 1
    expect(normalizePhone("+44 1234 567890")).toBe("441234567890");
  });
  test("email unwraps a display name", () => {
    expect(normalizeEmail("Lee <lee@x.com>")).toBe("lee@x.com");
    expect(normalizeEmail("  LEE@X.com ")).toBe("lee@x.com");
  });
});

describe("the category reply", () => {
  test("loose words map to real categories", () => {
    expect(parseCategoryReply("ig")).toEqual(["INSTAGRAM"]);
    expect(parseCategoryReply("UI/UX")).toEqual(["SURVIVEACCOUNTING"]);
    expect(parseCategoryReply("reps youtube")).toEqual(["CAMPUS_REPS", "YOUTUBE"]);
  });
  test("unrecognised words are NOT guessed into a category", () => {
    expect(parseCategoryReply("billboard")).toEqual([]);
    expect(parseCategoryReply("")).toEqual([]);
  });
  // The distinction that decides tag-vs-new-idea, so both directions are pinned.
  test("only a short, fully-recognised message is a tag reply", () => {
    expect(looksLikeCategoryReply("ig")).toBe(true);
    expect(looksLikeCategoryReply("reps youtube")).toBe(true);
    expect(looksLikeCategoryReply("the design of the learn page feels off")).toBe(false);
    expect(looksLikeCategoryReply("billboard rail should rotate slower")).toBe(false);
    expect(looksLikeCategoryReply("")).toBe(false);
  });
  test("the reply text names the categories and the open count", () => {
    expect(taggedReply(["SURVIVEACCOUNTING"], 8)).toBe("Tagged SurviveAccounting.com. 8 ideas open.");
    expect(taggedReply(["CAMPUS_REPS"], 1)).toBe("Tagged Campus reps. 1 idea open.");
  });
});

describe("twiml", () => {
  test("an empty response is a silent ack — what a stranger gets", () => {
    expect(twiml()).toContain("<Response></Response>");
    expect(twiml()).not.toContain("<Message>");
  });
  test("a message is wrapped and escaped", () => {
    expect(twiml("Saved.")).toContain("<Message>Saved.</Message>");
    expect(twiml("a & b <c>")).toContain("a &amp; b &lt;c&gt;");
  });
});
