import { describe, expect, it } from "bun:test";

import { greekChapterSlug } from "./greek-slug";

// These slugs go on printed flyers and QR codes. The point of the file is that the rule cannot
// drift silently: a change that would repoint an already-printed URL fails here first.
describe("greekChapterSlug", () => {
  it("uses the plain org name", () => {
    expect(greekChapterSlug("Phi Kappa Psi")).toBe("phi-kappa-psi");
    expect(greekChapterSlug("Delta Delta Delta")).toBe("delta-delta-delta");
  });

  it("strips the legal/organisational tail so one chapter gets ONE url", () => {
    // The reason this matters: GreekIntel records the same org both ways depending on the source
    // page it was scraped from. Without stripping, one chapter would own two URLs.
    expect(greekChapterSlug("Alpha Kappa Alpha Sorority, Inc.")).toBe("alpha-kappa-alpha");
    expect(greekChapterSlug("Alpha Phi Alpha Fraternity, Inc.")).toBe("alpha-phi-alpha");
    expect(greekChapterSlug("Kappa Kappa Gamma Fraternity Inc")).toBe("kappa-kappa-gamma");
    expect(greekChapterSlug("Alpha Kappa Alpha")).toBe(greekChapterSlug("Alpha Kappa Alpha Sorority, Inc."));
  });

  it("never emits a leading, trailing or doubled hyphen", () => {
    for (const n of ["  Sigma Chi  ", "Sigma  Chi", "Sigma Chi, Inc.", "Sorority Sigma Chi Fraternity"]) {
      const s = greekChapterSlug(n);
      expect(s.startsWith("-")).toBe(false);
      expect(s.endsWith("-")).toBe(false);
      expect(s.includes("--")).toBe(false);
    }
  });

  it("is url-safe: lowercase letters, digits and hyphens only", () => {
    for (const n of ["Zeta Phi Beta Sorority, Inc.", "Phi Beta Sigma Fraternity, Inc.", "Théta Chi", "Sigma Alpha Epsilon (SAE)"]) {
      expect(greekChapterSlug(n)).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("truncates long names without leaving a trailing hyphen", () => {
    const s = greekChapterSlug("Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa");
    expect(s.length).toBeLessThanOrEqual(48);
    expect(s.endsWith("-")).toBe(false);
  });

  it("is stable — the same name always produces the same slug", () => {
    expect(greekChapterSlug("Pi Beta Phi")).toBe(greekChapterSlug("Pi Beta Phi"));
  });
});
