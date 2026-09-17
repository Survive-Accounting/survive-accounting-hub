import { describe, expect, test } from "bun:test";

import { isRealSignup, mergeOrder, missingMessage, moveSlug, organizationTypePlural, renderOutreachDm, slotLink, V2_PRIORITY, v2CouncilOf, type DmRecipient } from "./outreach-v2";

describe("outreach v2", () => {
  test("priority starts with Lee's order", () => {
    expect(V2_PRIORITY.slice(0, 4).map((c) => c.label)).toEqual(["Ole Miss", "LSU", "Tennessee", "Mississippi State"]);
    expect(new Set(V2_PRIORITY.map((c) => c.slug)).size).toBe(V2_PRIORITY.length);
  });
  test("a saved order keeps its moves and gains new campuses at the end", () => {
    const saved = ["louisiana-state-university", "university-of-mississippi", "not-a-campus"];
    const m = mergeOrder(saved);
    expect(m.slice(0, 2)).toEqual(["louisiana-state-university", "university-of-mississippi"]);
    expect(m).not.toContain("not-a-campus");
    expect(m.length).toBe(V2_PRIORITY.length);
    expect(moveSlug(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });
  const olemissIfc: DmRecipient = { kind: "council", campusShorthand: "Ole Miss", courseCode: "ACCY 201", council: "ifc", outreachLink: "https://surviveaccounting.com/l/aaaaaaaaaaaa" };
  const text = (r: DmRecipient) => { const x = renderOutreachDm(r); if (!x.ok) throw new Error(x.missing.join()); return x.text; };

  test("council template: Lee's copy, verbatim", () => {
    expect(text({ ...olemissIfc, campusShorthand: "Indiana", courseCode: "BUS-A 201", outreachLink: "https://surviveaccounting.com/l/8e39e4744b56" })).toBe([
      "Hey y’all,", "",
      "I’m Lee Ingram, an accounting professor at Ole Miss and the tutor behind Survive Accounting. I’ve helped 1,000+ students with Intro Accounting.", "",
      "I put together free BUS-A 201 exam prep specifically for Indiana students — short cram videos and practice exams:", "",
      "https://surviveaccounting.com/l/8e39e4744b56", "",
      "Would you mind passing this along to your chapters’ scholarship chairs or presidents?", "",
      "If you have any questions about it, feel free to text or call me at 601-201-8759.", "",
      "Really appreciate it!", "", "Lee",
    ].join("\n"));
    // IFC, Panhellenic and NPHC all read the same; only campus, course and link change.
    for (const council of ["ifc", "panhellenic", "nphc"]) expect(text({ ...olemissIfc, council })).toBe(text(olemissIfc));
    expect(text(olemissIfc)).not.toMatch(/\{\{|\[|\/go\//);
  });

  test("chapter template: Lee's copy, Greek letters, then the name, then 'your members'", () => {
    const ka = text({ kind: "chapter", campusShorthand: "Ole Miss", courseCode: "ACCY 201", chapterName: "Kappa Alpha Order", greekLetters: "ΚΑ", council: "ifc", outreachLink: "https://surviveaccounting.com/l/bbbbbbbbbbbb" });
    expect(ka).toBe([
      "Hey! I’m Lee — an accounting tutor and professor, and I’ve helped 1,000+ students get through Intro Accounting.", "",
      "I put together a page specifically for ΚΑ members taking ACCY 201, with short cram videos and practice exams.", "",
      "They can access everything here:", "https://surviveaccounting.com/l/bbbbbbbbbbbb", "",
      "I’d be happy to hop on a quick 5-minute call and show you how it works. Just text me at 601-201-8759.", "",
      "Happy to answer any questions!", "", "— Lee",
    ].join("\n"));
    expect(text({ kind: "chapter", campusShorthand: "Indiana", courseCode: "BUS-A 201", chapterName: "Acacia", greekLetters: null, council: "ifc", outreachLink: "x" }))
      .toContain("specifically for Acacia members taking BUS-A 201,");
    expect(text({ kind: "chapter", campusShorthand: "Indiana", courseCode: "BUS-A 201", chapterName: "", council: "ifc", outreachLink: "x" }))
      .toContain("specifically for your members taking BUS-A 201,");
  });

  test("switching recipients changes every field and the link", () => {
    const a = text(olemissIfc);
    const b = text({ kind: "chapter", campusShorthand: "Tennessee", courseCode: "ACCT 200", chapterName: "Kappa Delta", greekLetters: "ΚΔ", council: "panhellenic", orgType: "sorority", outreachLink: "https://surviveaccounting.com/l/cccccccccccc" });
    expect(b).not.toContain("aaaaaaaaaaaa"); expect(b).toContain("cccccccccccc"); expect(b).toContain("ΚΔ members taking ACCT 200");
    expect(a).not.toContain("ΚΔ");
  });

  test("never copies placeholders or guesses: missing campus, course code or link", () => {
    const r = renderOutreachDm({ ...olemissIfc, courseCode: null, outreachLink: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.missing).toEqual(["course code", "outreach link"]); expect(missingMessage(r.missing)).toBe("Can't copy yet — add the course code and outreach link for this recipient first."); }
    expect(renderOutreachDm({ ...olemissIfc, campusShorthand: "", campusName: "University of Mississippi" }).ok).toBe(true);
    expect(organizationTypePlural({ kind: "council", council: null })).toBe("chapters");
  });
  test("signups: blank and test rows don't count", () => {
    expect(isRealSignup({ name: null, phone: null, user_id: null })).toBe(false);
    expect(isRealSignup({ name: "Hook Test", phone: "(555) 111-2222" })).toBe(false);
    expect(isRealSignup({ name: "Jordan", phone: "(555) 111-2222" })).toBe(false);
    expect(isRealSignup({ name: null, phone: "email:someone@test.com" }, (e) => e.endsWith("@test.com"))).toBe(false);
    expect(isRealSignup({ name: null, phone: "email:jordan@go.olemiss.edu" })).toBe(true);
    expect(isRealSignup({ name: "Jordan Ellis", phone: "(662) 555-0000" })).toBe(true);
  });
  test("links: tracked short link when the contact exists", () => {
    expect(slotLink("/go/a/b", "123456789abc")).toBe("https://surviveaccounting.com/l/123456789abc");
    expect(slotLink("/go/a/b", null)).toBe("https://surviveaccounting.com/go/a/b");
  });
  test("council names", () => {
    expect(v2CouncilOf("IFC")).toBe("ifc");
    expect(v2CouncilOf("Panhellenic")).toBe("panhellenic");
    expect(v2CouncilOf("nphc")).toBe("nphc");
    expect(v2CouncilOf("MGC")).toBeNull();
  });
});
