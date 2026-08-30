// CONTACT ATTRIBUTION — the rules that keep it from touching rep commissions (2026-08-30).
//
// `?ref=` was already the campus rep system's parameter, and `sa_ref` is the cookie an order
// reads at submit time to pay commission. Every assertion here is about the boundary between the
// two: a contact ref must be recognisable, must never look like a rep code, and must never
// overwrite a tag that is already on a link.
import { describe, expect, test } from "bun:test";

import { CONTACT_REF_COOKIE, isContactRef, readRefFromSearch, withRef } from "./contact-ref";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("telling a contact ref from a rep code", () => {
  test("a uuid is ours", () => {
    expect(isContactRef(UUID)).toBe(true);
    expect(isContactRef(UUID.toUpperCase())).toBe(true);
  });

  test("a rep code is NOT — rep links win, so we never claim one", () => {
    // The shapes rep codes actually take: short readable slugs.
    for (const code of ["jordan", "ole-miss-3", "AXO24", "r7Kq2", ""]) {
      expect(isContactRef(code)).toBe(false);
    }
  });

  test("null and undefined are not refs", () => {
    expect(isContactRef(null)).toBe(false);
    expect(isContactRef(undefined)).toBe(false);
  });

  test("a uuid-ish string that isn't one is refused", () => {
    expect(isContactRef("11111111-2222-3333-4444")).toBe(false);
    expect(isContactRef(`${UUID}-extra`)).toBe(false);
  });
});

describe("the cookie is not the rep cookie", () => {
  test("contact refs live in their own jar", () => {
    // If this ever equals "sa_ref", commissions get reassigned to cold contacts.
    expect(CONTACT_REF_COOKIE).toBe("sa_cref");
    expect(CONTACT_REF_COOKIE).not.toBe("sa_ref");
  });
});

describe("reading the tag off a URL", () => {
  test("finds it", () => {
    expect(readRefFromSearch(`?ref=${UUID}`)).toBe(UUID);
    expect(readRefFromSearch(new URLSearchParams({ ref: UUID }))).toBe(UUID);
  });
  test("absent or blank is null, never an empty string", () => {
    expect(readRefFromSearch("?via=groupme")).toBeNull();
    expect(readRefFromSearch("?ref=")).toBeNull();
  });
});

describe("withRef — tagging the links a share screen hands out", () => {
  test("adds the tag to a bare url", () => {
    expect(withRef("https://surviveaccounting.com/go/a/b", UUID))
      .toBe(`https://surviveaccounting.com/go/a/b?ref=${UUID}`);
  });

  test("keeps an existing query intact", () => {
    const out = withRef("https://surviveaccounting.com/go/a/b?via=groupme", UUID);
    expect(out).toContain("via=groupme");
    expect(out).toContain(`ref=${UUID}`);
  });

  test("NEVER overwrites a ref already on the link — a rep tag put there deliberately wins", () => {
    const repLink = "https://surviveaccounting.com/go/a/b?ref=jordan";
    expect(withRef(repLink, UUID)).toBe(repLink);
  });

  test("no ref means the url is returned untouched", () => {
    expect(withRef("/go/a/b", null)).toBe("/go/a/b");
    expect(withRef("/go/a/b", undefined)).toBe("/go/a/b");
  });

  test("a relative path stays relative — these go into href attributes", () => {
    expect(withRef("/s/alabama/council", UUID)).toBe(`/s/alabama/council?ref=${UUID}`);
  });

  test("a hash survives, because #materials is an email anchor we ship", () => {
    expect(withRef("/partners/council/a/panhellenic#materials", UUID))
      .toBe(`/partners/council/a/panhellenic?ref=${UUID}#materials`);
  });

  test("garbage in, same garbage out — never throws on a caller's bad url", () => {
    expect(withRef("::::", UUID)).toBe(`/::::?ref=${UUID}`);
  });
});
