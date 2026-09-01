import { describe, expect, it } from "bun:test";

import { chairContextFrom, chairLearnPath, validateChairSearch } from "./chair-landing";

// The whole contract is round-trip safety: a URL chairLearnPath writes must be a URL
// validateChairSearch + chairContextFrom can read back into the same context. If those two ever
// drift, a chair link redirects onto /learn and the panel silently fails to mount.

describe("chairContextFrom", () => {
  it("reads a well-formed chapter context", () => {
    expect(chairContextFrom({ chair: "chapter", chairSchool: "ole-miss", chairChapter: "alpha-chi-omega" }))
      .toEqual({ mode: "chapter", school: "ole-miss", chapter: "alpha-chi-omega", council: null });
  });

  it("reads a council context with a named council", () => {
    expect(chairContextFrom({ chair: "council", chairSchool: "alabama", chairCouncil: "panhellenic" }))
      .toEqual({ mode: "council", school: "alabama", council: "panhellenic", chapter: null });
  });

  it("allows a council context with no council (campus-wide fallback)", () => {
    expect(chairContextFrom({ chair: "council", chairSchool: "alabama" }))
      .toEqual({ mode: "council", school: "alabama", council: null, chapter: null });
  });

  it("returns null for a chapter mode missing its chapter — a half-formed URL is not a panel", () => {
    expect(chairContextFrom({ chair: "chapter", chairSchool: "ole-miss" })).toBeNull();
  });

  it("returns null when there is no school", () => {
    expect(chairContextFrom({ chair: "chapter", chairChapter: "x" })).toBeNull();
  });

  it("returns null for a plain /learn visit (no chair param)", () => {
    expect(chairContextFrom({})).toBeNull();
  });
});

describe("validateChairSearch", () => {
  it("drops every chair key when chair itself is absent", () => {
    expect(validateChairSearch({ chairSchool: "x", chairChapter: "y" })).toEqual({});
  });

  it("rejects an unknown chair mode", () => {
    expect(validateChairSearch({ chair: "president", chairSchool: "x" })).toEqual({});
  });

  it("keeps the keys for a valid mode", () => {
    expect(validateChairSearch({ chair: "council", chairSchool: "x", chairCouncil: "ifc" }))
      .toEqual({ chair: "council", chairSchool: "x", chairChapter: undefined, chairCouncil: "ifc" });
  });
});

describe("chairLearnPath round-trips through the validator", () => {
  const roundTrip = (href: string) => {
    const raw = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
    return chairContextFrom(validateChairSearch(raw));
  };

  it("chapter link → same chapter context", () => {
    const href = chairLearnPath({ mode: "chapter", school: "ole-miss", chapter: "adpi", council: null });
    expect(roundTrip(href)).toEqual({ mode: "chapter", school: "ole-miss", chapter: "adpi", council: null });
  });

  it("council link with a council → same council context", () => {
    const href = chairLearnPath({ mode: "council", school: "alabama", chapter: null, council: "nphc" });
    expect(roundTrip(href)).toEqual({ mode: "council", school: "alabama", chapter: null, council: "nphc" });
  });

  it("council link without a council → campus-wide council context", () => {
    const href = chairLearnPath({ mode: "council", school: "alabama", chapter: null, council: null });
    expect(roundTrip(href)).toEqual({ mode: "council", school: "alabama", chapter: null, council: null });
  });

  it("carries a contact ref through the hop", () => {
    const href = chairLearnPath({ mode: "chapter", school: "s", chapter: "c", council: null }, "abc-123");
    expect(href).toContain("ref=abc-123");
  });
});
