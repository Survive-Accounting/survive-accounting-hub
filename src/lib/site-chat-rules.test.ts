import { describe, expect, test } from "bun:test";

import { fillName, inboxState, isTyping, keywordHit, pickAutoReplies, typingSeconds, type ChatRule } from "./site-chat-rules";

const rule = (p: Partial<ChatRule>): ChatRule => ({ id: "r", name: "", trigger: "first_message", keywords: [], body: "Hey {name}! Give me a minute.", delaySeconds: 30, enabled: true, sort: 0, ...p });
const now = new Date("2026-09-13T20:00:00Z");

describe("site chat auto-replies", () => {
  test("names read naturally with and without a nickname", () => {
    expect(fillName("Hey {name}! Give me a minute.", "Sarah Jones")).toBe("Hey Sarah! Give me a minute.");
    expect(fillName("Hey {name}! Give me a minute.", null)).toBe("Hey! Give me a minute.");
    expect(fillName("Thanks, {name}.", "")).toBe("Thanks.");
  });

  test("keywords match whole words, any case", () => {
    expect(keywordHit("Is this FREE?", ["free"])).toBe(true);
    expect(keywordHit("freedom", ["free"])).toBe(false);
    expect(keywordHit("when is exam 1", ["exam 1"])).toBe(true);
  });

  test("first message rule fires once, after its delay", () => {
    const r = pickAutoReplies([rule({ id: "a" })], { isFirst: true, body: "hi", fired: new Set(), hasAdminReply: false, nickname: "Sam" }, now);
    expect(r).toHaveLength(1);
    expect(r[0].body).toBe("Hey Sam! Give me a minute.");
    expect(r[0].deliverAt.getTime() - now.getTime()).toBe(30_000);
    expect(pickAutoReplies([rule({ id: "a" })], { isFirst: true, body: "hi", fired: new Set(["a"]), hasAdminReply: false, nickname: null }, now)).toHaveLength(0);
    expect(pickAutoReplies([rule({ id: "a" })], { isFirst: false, body: "hi", fired: new Set(), hasAdminReply: false, nickname: null }, now)).toHaveLength(0);
  });

  test("two replies never land in the same breath", () => {
    const rules = [rule({ id: "a", delaySeconds: 10 }), rule({ id: "b", trigger: "keyword", keywords: ["price"], body: "It's free for now.", delaySeconds: 10 })];
    const r = pickAutoReplies(rules, { isFirst: true, body: "what's the price", fired: new Set(), hasAdminReply: false, nickname: null }, now);
    expect(r.map((x) => x.ruleId)).toEqual(["a", "b"]);
    expect(r[1].deliverAt.getTime() - r[0].deliverAt.getTime()).toBeGreaterThanOrEqual(typingSeconds("It's free for now.") * 1000);
  });

  test("no-reply rule only while nobody has answered; disabled rules never fire", () => {
    const nr = rule({ id: "n", trigger: "no_reply" });
    expect(pickAutoReplies([nr], { isFirst: false, body: "x", fired: new Set(), hasAdminReply: true, nickname: null }, now)).toHaveLength(0);
    expect(pickAutoReplies([{ ...nr, enabled: false }], { isFirst: false, body: "x", fired: new Set(), hasAdminReply: false, nickname: null }, now)).toHaveLength(0);
  });

  test("typing shows just before a reply lands", () => {
    const soon = new Date(now.getTime() + 2000);
    const later = new Date(now.getTime() + 60_000);
    expect(isTyping([{ body: "ok", deliverAt: soon }], now)).toBe(true);
    expect(isTyping([{ body: "ok", deliverAt: later }], now)).toBe(false);
  });

  test("inbox state", () => {
    expect(inboxState({ last_visitor_at: "2026-09-13T20:00:00Z", last_admin_at: null, admin_read_at: null, status: "open" })).toEqual({ unread: true, needsReply: true, replied: false });
    expect(inboxState({ last_visitor_at: "2026-09-13T20:00:00Z", last_admin_at: "2026-09-13T20:05:00Z", admin_read_at: "2026-09-13T20:01:00Z", status: "open" })).toEqual({ unread: false, needsReply: false, replied: true });
  });
});
