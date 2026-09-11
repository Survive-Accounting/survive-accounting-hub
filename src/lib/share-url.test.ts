import { describe, expect, test } from "bun:test";

import { buildShareUrl, pageShareUrl, shareCaption } from "./share-url";

describe("buildShareUrl (2026-09-11: pretty /learn links, public ids only)", () => {
  test("campus + chapter → /learn/<id>/<chapter>", () => {
    expect(buildShareUrl({ campus: "ole-miss", chapter: "alpha-tau-omega" })).toBe("https://surviveaccounting.com/learn/ole-miss/alpha-tau-omega");
  });
  test("campus + chapter with a contact ref carries ?ref=", () => {
    expect(buildShareUrl({ campus: "ole-miss", chapter: "alpha-tau-omega", contactRef: "b3af67c6-99a5-4677-83d5-aa7d11a89c17" })).toBe("https://surviveaccounting.com/learn/ole-miss/alpha-tau-omega?ref=b3af67c6-99a5-4677-83d5-aa7d11a89c17");
  });
  test("campus only → /learn/<id>, ?by= when the visitor is forwarding a contact link", () => {
    expect(buildShareUrl({ campus: "ole-miss" })).toBe("https://surviveaccounting.com/learn/ole-miss");
    expect(buildShareUrl({ campus: "ole-miss", contactRef: "abc" })).toBe("https://surviveaccounting.com/learn/ole-miss?by=abc");
  });
  test("nothing known → the site; a chapter without a campus cannot be linked", () => {
    expect(buildShareUrl({})).toBe("https://surviveaccounting.com/");
    expect(buildShareUrl({ chapter: "alpha-tau-omega" })).toBe("https://surviveaccounting.com/");
  });
});

describe("pageShareUrl (the page they're on, cleaned, with the share UTM)", () => {
  test("keeps the pretty path and the link's context, drops the page's own state, stamps the utm", () => {
    expect(pageShareUrl({ origin: "https://surviveaccounting.com", pathname: "/learn/ole-miss/alpha-tau-omega", search: "?set=deck-1&stage=practice&look=navy&looks=1&by=abc" }))
      .toBe("https://surviveaccounting.com/learn/ole-miss/alpha-tau-omega?by=abc&utm_source=share&utm_medium=link&utm_campaign=learn");
    expect(pageShareUrl({ origin: "http://localhost:8097", pathname: "/learn", search: "" }))
      .toBe("http://localhost:8097/learn?utm_source=share&utm_medium=link&utm_campaign=learn");
  });
});

describe("shareCaption", () => {
  test("joins whatever is known with middots", () => {
    expect(shareCaption({ campusName: "Ole Miss", courseCode: "ACCY 201", examLabel: "Exam 1" })).toBe("Ole Miss · ACCY 201 · Exam 1");
    expect(shareCaption({})).toBeNull();
  });
});
