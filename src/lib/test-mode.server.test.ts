import { afterEach, describe, expect, it } from "bun:test";

import { checkTester, isAllowedTester, readTesterCookie, testModeOn, testerAllowList } from "./test-mode.server";

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

// THE RELAY BOUNDARY. These are the checks that stop test mode being a way to mail strangers, so
// they are worth pinning down even though the code is short.
describe("tester allow-list", () => {
  it("refuses an address nobody added, even one that parses fine", () => {
    process.env.TEST_MODE_EMAILS = "";
    expect(isAllowedTester("someone@example.com")).toBe(false);
  });

  it("always allows the admin addresses", () => {
    process.env.TEST_MODE_EMAILS = "";
    expect(isAllowedTester("lee@surviveaccounting.com")).toBe(true);
    expect(isAllowedTester("LEE@SurviveAccounting.com")).toBe(true);
  });

  it("adds testers from the env var, trimmed and lowercased", () => {
    process.env.TEST_MODE_EMAILS = " Tester@School.edu , second@school.edu ";
    expect(isAllowedTester("tester@school.edu")).toBe(true);
    expect(isAllowedTester("second@school.edu")).toBe(true);
    expect(isAllowedTester("third@school.edu")).toBe(false);
  });

  it("drops junk entries rather than admitting them", () => {
    process.env.TEST_MODE_EMAILS = "not-an-email,,   ,ok@school.edu";
    const list = testerAllowList();
    expect(list).toContain("ok@school.edu");
    expect(list).not.toContain("not-an-email");
    expect(list.every((e) => e.includes("@"))).toBe(true);
  });

  it("has no duplicates when the founder address is also listed", () => {
    process.env.FOUNDER_ALERT_EMAIL = "lee@surviveaccounting.com";
    process.env.TEST_MODE_EMAILS = "lee@surviveaccounting.com";
    const list = testerAllowList();
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("the env guard", () => {
  it("is off unless explicitly set", () => {
    delete process.env.TEST_MODE_ENABLED;
    expect(testModeOn()).toBe(false);
    process.env.TEST_MODE_ENABLED = "";
    expect(testModeOn()).toBe(false);
    process.env.TEST_MODE_ENABLED = "0";
    expect(testModeOn()).toBe(false);
    process.env.TEST_MODE_ENABLED = "no";
    expect(testModeOn()).toBe(false);
  });

  it("accepts the two spellings that mean yes", () => {
    process.env.TEST_MODE_ENABLED = "1";
    expect(testModeOn()).toBe(true);
    process.env.TEST_MODE_ENABLED = "TRUE";
    expect(testModeOn()).toBe(true);
  });
});

// The two halves of the cookie contract: what may be written, and what is trusted on the way back.
describe("checkTester", () => {
  it("refuses everything while the flag is off", () => {
    delete process.env.TEST_MODE_ENABLED;
    const r = checkTester("lee@surviveaccounting.com");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("TEST_MODE_ENABLED");
  });

  it("normalises the address it accepts", () => {
    process.env.TEST_MODE_ENABLED = "1";
    expect(checkTester("  LEE@SurviveAccounting.com ")).toEqual({ ok: true, email: "lee@surviveaccounting.com" });
  });

  it("names the env var when the address is not listed", () => {
    process.env.TEST_MODE_ENABLED = "1";
    process.env.TEST_MODE_EMAILS = "";
    expect(checkTester("stranger@example.com").error).toContain("TEST_MODE_EMAILS");
  });
});

describe("readTesterCookie", () => {
  it("stops trusting a cookie the moment the flag goes off", () => {
    process.env.TEST_MODE_ENABLED = "1";
    expect(readTesterCookie("lee@surviveaccounting.com")).toBe("lee@surviveaccounting.com");
    delete process.env.TEST_MODE_ENABLED;
    expect(readTesterCookie("lee@surviveaccounting.com")).toBeNull();
  });

  it("stops trusting a cookie for someone removed from the list", () => {
    process.env.TEST_MODE_ENABLED = "1";
    process.env.TEST_MODE_EMAILS = "friend@school.edu";
    expect(readTesterCookie("friend@school.edu")).toBe("friend@school.edu");
    process.env.TEST_MODE_EMAILS = "";
    expect(readTesterCookie("friend@school.edu")).toBeNull();
  });

  it("returns null for junk rather than passing it through", () => {
    process.env.TEST_MODE_ENABLED = "1";
    expect(readTesterCookie(undefined)).toBeNull();
    expect(readTesterCookie("")).toBeNull();
    expect(readTesterCookie("not-an-email")).toBeNull();
  });
});
