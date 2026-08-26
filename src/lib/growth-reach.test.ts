import { describe, expect, it } from "bun:test";
import { extractContactsFromText } from "./growth-reach-core";
import { isTestEmail, isTestRow } from "./growth-testdata";
import { estimateCost, sumCost } from "./growth-enrichment-cost";

describe("extractContactsFromText — paste a URL", () => {
  // The real case: LWIB's contact block on the UNLV involvement page.
  const page = `
    <h1>Lee Women in Business</h1>
    <p>Contact Information</p>
    <p>4505 Maryland Parkway, Las Vegas, NV 89154</p>
    <p>E: leewomenib@gmail.com</p>
    <a href="https://instagram.com/leewomeninbusiness">Instagram</a>
    <img src="/assets/logo@2x.png" />
  `;

  it("pulls the email and the Instagram handle off the page", () => {
    const found = extractContactsFromText(page);
    expect(found.some((c) => c.kind === "email" && c.value === "leewomenib@gmail.com")).toBe(true);
    expect(
      found.some((c) => c.kind === "instagram" && c.value.endsWith("/leewomeninbusiness")),
    ).toBe(true);
  });

  it("keeps the surrounding text so you can tell whose address it is", () => {
    const email = extractContactsFromText(page).find((c) => c.kind === "email");
    expect(email?.context).toContain("Contact");
  });

  it("ignores asset filenames and Instagram's own routes", () => {
    const junk = extractContactsFromText(`
      <a href="https://instagram.com/explore/tags/greek">tags</a>
      <a href="https://instagram.com/p/abc123">post</a>
      <img src="hero@2x.png"> noreply@sentry.io someone@example.com
    `);
    expect(junk.find((c) => c.value.includes("explore"))).toBeUndefined();
    expect(junk.find((c) => c.value.includes("/p/"))).toBeUndefined();
    expect(junk.find((c) => c.value.includes("sentry"))).toBeUndefined();
    expect(junk.find((c) => c.value.includes("example.com"))).toBeUndefined();
  });

  it("deduplicates repeats and lowercases addresses", () => {
    const found = extractContactsFromText("A@School.EDU and again a@school.edu");
    expect(found.filter((c) => c.kind === "email")).toHaveLength(1);
    expect(found[0].value).toBe("a@school.edu");
  });

  it("returns nothing for a page with no contacts, rather than guessing", () => {
    expect(extractContactsFromText("<p>Welcome to our chapter page.</p>")).toEqual([]);
  });
});

describe("test-data predicate", () => {
  it("catches the rows that slipped past is_test", () => {
    // This exact address was stored with is_test = false and showed as real demand at Ole Miss.
    expect(isTestEmail("lee+waitlisttest@surviveaccounting.com")).toBe(true);
    expect(isTestEmail("exec@testchapter.example")).toBe(true);
    expect(isTestEmail("lee@survivestudios.com")).toBe(true);
  });
  it("leaves real students alone", () => {
    expect(isTestEmail("maxellis22@gmail.com")).toBe(false);
    expect(isTestEmail("student@olemiss.edu")).toBe(false);
    expect(isTestEmail(null)).toBe(false);
  });
  it("honours an explicit is_test flag regardless of address", () => {
    expect(isTestRow({ is_test: true, email: "real@olemiss.edu" })).toBe(true);
    expect(isTestRow({ is_test: false, email: "real@olemiss.edu" })).toBe(false);
  });
});

describe("enrichment cost estimates", () => {
  it("prices the free runner as free", () => {
    const rmp = estimateCost("rmp_qualify");
    expect(rmp.usd).toBe(0);
    expect(rmp.summary).toContain("free");
  });
  it("makes council discovery the expensive one (it is SERP-dominated)", () => {
    expect(estimateCost("council_contacts").usd).toBeGreaterThan(estimateCost("course_code").usd);
    expect(estimateCost("council_contacts").serp).toBeGreaterThan(
      estimateCost("syllabi_docs").serp,
    );
  });
  it("sums a multi-category run", () => {
    const total = sumCost(["course_code", "syllabi_docs"]);
    expect(total.usd).toBeCloseTo(
      estimateCost("course_code").usd + estimateCost("syllabi_docs").usd,
      6,
    );
    expect(total.summary).toContain("SERP");
  });
  it("never returns a negative or NaN cost for an unknown category", () => {
    const unknown = estimateCost("does_not_exist");
    expect(unknown.usd).toBe(0);
    expect(Number.isNaN(unknown.usd)).toBe(false);
  });
});
