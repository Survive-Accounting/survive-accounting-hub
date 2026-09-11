import { describe, expect, test } from "bun:test";

import { buildShareUrl, shareCaption } from "./share-url";

describe("buildShareUrl (2026-09-11: one builder, the site's own conventions)", () => {
  test("campus + chapter → the chapter's /go front door, public slugs only", () => {
    expect(buildShareUrl({ campusSlug: "university-of-mississippi", chapterSlug: "alpha-tau-omega" })).toBe("https://surviveaccounting.com/go/university-of-mississippi/alpha-tau-omega");
  });
  test("campus + chapter with a contact ref carries ?ref=", () => {
    expect(buildShareUrl({ campusSlug: "university-of-mississippi", chapterSlug: "alpha-tau-omega", contactRef: "b3af67c6-99a5-4677-83d5-aa7d11a89c17" })).toBe("https://surviveaccounting.com/go/university-of-mississippi/alpha-tau-omega?ref=b3af67c6-99a5-4677-83d5-aa7d11a89c17");
  });
  test("campus only → /s/<slug>, ?by= when the visitor is forwarding a contact link", () => {
    expect(buildShareUrl({ campusSlug: "university-of-mississippi" })).toBe("https://surviveaccounting.com/s/university-of-mississippi");
    expect(buildShareUrl({ campusSlug: "university-of-mississippi", contactRef: "abc" })).toBe("https://surviveaccounting.com/s/university-of-mississippi?by=abc");
  });
  test("nothing known → the site", () => {
    expect(buildShareUrl({})).toBe("https://surviveaccounting.com/");
    expect(buildShareUrl({ campusSlug: "  ", chapterSlug: null })).toBe("https://surviveaccounting.com/");
  });
  test("a chapter without a campus cannot be linked — the site", () => {
    expect(buildShareUrl({ chapterSlug: "alpha-tau-omega" })).toBe("https://surviveaccounting.com/");
  });
});

describe("shareCaption", () => {
  test("joins whatever is known with middots", () => {
    expect(shareCaption({ campusName: "Ole Miss", courseCode: "ACCY 201", examLabel: "Exam 1" })).toBe("Ole Miss · ACCY 201 · Exam 1");
    expect(shareCaption({ campusName: "Ole Miss", courseCode: null })).toBe("Ole Miss");
    expect(shareCaption({})).toBeNull();
  });
});
