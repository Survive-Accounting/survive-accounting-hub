import { describe, expect, it } from "bun:test";
import { makeTerm, termFor, termFromId, termId, purchasableTerms, priceCentsFor, nextTerm, isTermExpired, seatCoverageLine } from "./terms";
describe("terms", () => {
  it("fall expires Dec 31", () => { const t = makeTerm("fall", 2026); expect(t.label).toBe("Fall 2026"); expect(t.expiresLabel).toBe("Dec. 31, 2026"); expect(t.expiresAt.startsWith("2026-12-31")).toBe(true); });
  it("spring expires May 31", () => { const t = makeTerm("spring", 2027); expect(t.expiresLabel).toBe("May 31, 2027"); });
  it("summer expires Aug 31", () => { const t = makeTerm("summer", 2027); expect(t.expiresLabel).toBe("Aug. 31, 2027"); });
  it("round-trips ids", () => { const t = makeTerm("fall", 2026); expect(termId(t)).toBe("fall-2026"); expect(termFromId("fall-2026")?.label).toBe("Fall 2026"); expect(termFromId("nope")).toBeNull(); });
  it("classifies a date", () => { expect(termFor(new Date("2026-09-15")).label).toBe("Fall 2026"); expect(termFor(new Date("2027-02-01")).label).toBe("Spring 2027"); expect(termFor(new Date("2027-06-20")).label).toBe("Summer 2027"); });
  it("summer is not purchasable while the flag is off", () => { expect(purchasableTerms(new Date("2027-06-20")).some((t) => t.key === "summer")).toBe(false); });
  it("drops a nearly-over term", () => { const l = purchasableTerms(new Date("2026-12-20")).map((t) => t.label); expect(l).not.toContain("Fall 2026"); expect(l).toContain("Spring 2027"); });
  it("prices packs and custom", () => { expect(priceCentsFor(10)).toBe(100_000); expect(priceCentsFor(20)).toBe(200_000); expect(priceCentsFor(30)).toBe(270_000); expect(priceCentsFor(17)).toBe(170_000); });
  it("walks terms forward", () => { expect(nextTerm(makeTerm("fall", 2026)).label).toBe("Spring 2027"); expect(nextTerm(makeTerm("spring", 2027)).label).toBe("Summer 2027"); expect(nextTerm(makeTerm("summer", 2027)).label).toBe("Fall 2027"); });
  it("expires", () => { expect(isTermExpired(makeTerm("fall", 2026), new Date("2027-01-01"))).toBe(true); expect(isTermExpired(makeTerm("fall", 2026), new Date("2026-12-30"))).toBe(false); });
  it("states coverage with term and date", () => { expect(seatCoverageLine(makeTerm("fall", 2026), 20)).toBe("20 seats · Fall 2026 — member access through Dec. 31, 2026."); });
});
