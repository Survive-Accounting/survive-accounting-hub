import { describe, expect, it } from "bun:test";

import { chapterSmsLabel, firstNonGsm7, greekLettersForSms, isGsm7, smsSegments } from "./greek-letters";

describe("greekLettersForSms", () => {
  it("emits real Greek only for the ten capitals GSM-7 carries, Latin lookalikes for the rest", () => {
    expect(greekLettersForSms("Sigma Chi")).toBe("ΣX");
    expect(greekLettersForSms("Kappa Alpha Theta")).toBe("KAΘ");
    expect(greekLettersForSms("Alpha Delta Chi")).toBe("AΔX");
    expect(greekLettersForSms("Phi Gamma Delta")).toBe("ΦΓΔ");
    expect(greekLettersForSms("Pi Beta Phi")).toBe("ΠBΦ");
  });

  it("skips non-Greek words instead of failing on them", () => {
    expect(greekLettersForSms("Kappa Alpha Order")).toBe("KA");
    expect(greekLettersForSms("Alpha Epsilon Phi Sorority, Incorporated")).toBe("AEΦ");
    expect(greekLettersForSms("Alpha Kappa Alpha Sorority, Inc.")).toBe("AKA");
  });

  it("returns null for names with no Greek word, so callers can fall back", () => {
    expect(greekLettersForSms("FarmHouse")).toBeNull();
    expect(greekLettersForSms("Acacia")).toBeNull();
    expect(greekLettersForSms("")).toBeNull();
    expect(greekLettersForSms(null)).toBeNull();
  });

  it("never produces a character outside GSM-7 for any of the 24 letters", () => {
    const all = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega";
    const letters = greekLettersForSms(all)!;
    expect(letters).toHaveLength(24);
    expect(isGsm7(letters)).toBe(true);
  });
});

describe("chapterSmsLabel", () => {
  it("prefers Greek, then the roster's Latin shorthand, then a capped name", () => {
    expect(chapterSmsLabel("Sigma Chi", "SX")).toBe("ΣX");
    expect(chapterSmsLabel("FarmHouse", "FH")).toBe("FH");
    expect(chapterSmsLabel("FarmHouse International Fraternity Chapter", null)).toBe("FarmHouse International Fr");
    expect(chapterSmsLabel(null, null)).toBe("chapter");
  });
});

describe("toGsm7", () => {
  it("flattens punctuation, keeps the Greek capitals, drops what cannot be encoded", () => {
    const { toGsm7 } = require("./greek-letters") as typeof import("./greek-letters");
    expect(toGsm7("“Hey” — it’s Lee…")).toBe("\"Hey\" - it's Lee...");
    expect(toGsm7("#241 CLAIM ΣX Ole Miss")).toBe("#241 CLAIM ΣX Ole Miss");
    expect(toGsm7("José ⚡ Ωmega")).toBe("Jose  Ωmega");
    expect(isGsm7(toGsm7("Α Β Γ emoji 🔥 done"))).toBe(true);
  });
});

describe("GSM-7 accounting", () => {
  it("knows the ten Greek capitals are GSM-7 and the other capitals are not", () => {
    expect(isGsm7("ΔΦΓΛΩΠΨΣΘΞ")).toBe(true);
    expect(isGsm7("Α")).toBe(false); // U+0391 GREEK CAPITAL ALPHA
    expect(firstNonGsm7("ok Χ")).toBe("Χ"); // U+03A7 GREEK CAPITAL CHI
  });

  it("flags the punctuation autocorrect sneaks in", () => {
    expect(isGsm7("a — b")).toBe(false);
    expect(isGsm7("a – b")).toBe(false);
    expect(isGsm7("wait…")).toBe(false);
    expect(isGsm7("a · b")).toBe(false);
    expect(isGsm7("a - b, ok")).toBe(true);
  });

  it("counts segments the way Twilio bills them", () => {
    expect(smsSegments("x".repeat(160))).toEqual({ encoding: "GSM-7", units: 160, segments: 1 });
    expect(smsSegments("x".repeat(161)).segments).toBe(2);
    expect(smsSegments("€").units).toBe(2); // extension char = two septets
    expect(smsSegments("Α".repeat(70))).toEqual({ encoding: "UCS-2", units: 70, segments: 1 });
    expect(smsSegments("Α".repeat(71)).segments).toBe(2);
  });
});
