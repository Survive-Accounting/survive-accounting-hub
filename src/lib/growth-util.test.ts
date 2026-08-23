import { describe, expect, it } from "bun:test";
import { councilSlugOf, intro1Code, orgSlugify } from "./growth-util";

describe("councilSlugOf", () => {
  it("normalises free-text council variants to a canonical slug", () => {
    expect(councilSlugOf("IFC").slug).toBe("ifc");
    expect(councilSlugOf("ifc").slug).toBe("ifc");
    expect(councilSlugOf("Interfraternity Council").slug).toBe("ifc");
    expect(councilSlugOf("Panhellenic").slug).toBe("panhellenic");
    expect(councilSlugOf("College Panhellenic Council").slug).toBe("panhellenic");
    expect(councilSlugOf("NPHC").slug).toBe("nphc");
    expect(councilSlugOf("Divine Nine").slug).toBe("nphc");
    expect(councilSlugOf("Multicultural Greek Council").slug).toBe("mgc");
  });
  it("falls back to other for unknown / empty", () => {
    expect(councilSlugOf(null).slug).toBe("other");
    expect(councilSlugOf("").slug).toBe("other");
    expect(councilSlugOf("Some Local Council").slug).toBe("other");
  });
  it("returns a display name", () => {
    expect(councilSlugOf("panhellenic").name).toBe("Panhellenic");
    expect(councilSlugOf(null).name).toBe("Other");
  });
});

describe("orgSlugify", () => {
  it("slugifies national org names to match /partners/national/<slug>", () => {
    expect(orgSlugify("Kappa Kappa Gamma")).toBe("kappa-kappa-gamma");
    expect(orgSlugify("Alpha Tau Omega")).toBe("alpha-tau-omega");
    expect(orgSlugify("  Sigma Chi  ")).toBe("sigma-chi");
    expect(orgSlugify("Pi Beta Phi!")).toBe("pi-beta-phi");
  });
  it("handles empty input", () => {
    expect(orgSlugify("")).toBe("");
  });
});

describe("intro1Code", () => {
  it("reads the intro_1 code from string or array shapes", () => {
    expect(intro1Code({ intro_1: "ACCT 2010" })).toBe("ACCT 2010");
    expect(intro1Code({ intro_1: ["ACCT 2010", "ACC 200"] })).toBe("ACCT 2010");
    expect(intro1Code({ intro_1: "  ACC 200  " })).toBe("ACC 200");
  });
  it("returns null when missing / blank / wrong shape", () => {
    expect(intro1Code(null)).toBeNull();
    expect(intro1Code({})).toBeNull();
    expect(intro1Code({ intro_1: "" })).toBeNull();
    expect(intro1Code({ intro_1: [] })).toBeNull();
    expect(intro1Code("nope")).toBeNull();
  });
});
