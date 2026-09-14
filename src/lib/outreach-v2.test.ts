import { describe, expect, test } from "bun:test";

import { mergeOrder, missingMessage, moveSlug, organizationTypePlural, renderOutreachDm, slotLink, V2_PRIORITY, v2CouncilOf, type DmRecipient } from "./outreach-v2";

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

  test("council template: IFC, Panhellenic, NPHC", () => {
    const ifc = text(olemissIfc);
    expect(ifc).toBe([
      "Hey y’all,", "", "I’m Lee Ingram, a professor at Ole Miss and the tutor behind SurviveAccounting.com.", "",
      "I help fraternities boost their GPAs by making accounting exams easier. With Ole Miss’s first ACCY 201 exam coming up, my free Exam 1 prep is available now—quick cram videos and practice exams.", "",
      "Could you pass this along to your chapters’ scholarship chairs or presidents?", "", "https://surviveaccounting.com/l/aaaaaaaaaaaa", "", "Really appreciate it!", "Lee",
    ].join("\n"));
    const phc = text({ ...olemissIfc, campusShorthand: "Tennessee", courseCode: "ACCT 200", council: "panhellenic", outreachLink: "https://surviveaccounting.com/go/university-of-tennessee-knoxville/council/panhellenic" });
    expect(phc).toContain("I help sororities boost");
    expect(phc).toContain("With Tennessee’s first ACCT 200 exam");
    expect(phc).toContain("\n\nhttps://surviveaccounting.com/go/university-of-tennessee-knoxville/council/panhellenic\n\n");
    expect(phc).toContain("a professor at Ole Miss");
    expect(text({ ...olemissIfc, council: "nphc" })).toContain("I help fraternities and sororities boost");
    for (const t of [ifc, phc]) { expect(t).not.toMatch(/\{\{|\*|#|\[/); }
  });

  test("chapter template: by the organization's own type, name in the ask, fallback without a name", () => {
    const sigmaChi = text({ kind: "chapter", campusShorthand: "LSU", courseCode: "ACCT 2001", chapterName: "Sigma Chi", council: "ifc", orgType: "fraternity", outreachLink: "https://surviveaccounting.com/l/bbbbbbbbbbbb" });
    expect(sigmaChi).toContain("I help fraternities boost");
    expect(sigmaChi).toContain("Could you pass this along to Sigma Chi’s scholarship chair or president?");
    expect(sigmaChi).toContain("With LSU’s first ACCT 2001 exam");
    const aka = text({ kind: "chapter", campusShorthand: "Ole Miss", courseCode: "ACCY 201", chapterName: "Alpha Kappa Alpha", council: "nphc", orgType: "sorority", outreachLink: "x" });
    expect(aka).toContain("I help sororities boost");
    expect(text({ kind: "chapter", campusShorthand: "Ole Miss", courseCode: "ACCY 201", chapterName: "", council: "nphc", orgType: null, outreachLink: "x" }))
      .toContain("I help chapters boost");
    expect(text({ kind: "chapter", campusShorthand: "Ole Miss", courseCode: "ACCY 201", chapterName: null, council: "ifc", outreachLink: "x" }))
      .toContain("Could you pass this along to your scholarship chair or president?");
  });

  test("switching recipients changes every field and the link", () => {
    const a = text(olemissIfc);
    const b = text({ kind: "chapter", campusShorthand: "Tennessee", courseCode: "ACCT 200", chapterName: "Kappa Delta", council: "panhellenic", orgType: "sorority", outreachLink: "https://surviveaccounting.com/l/cccccccccccc" });
    expect(b).not.toContain("Ole Miss’s"); expect(b).not.toContain("aaaaaaaaaaaa"); expect(b).toContain("cccccccccccc");
    expect(a).not.toContain("Kappa Delta");
  });

  test("never copies placeholders or guesses: missing campus, course code or link", () => {
    const r = renderOutreachDm({ ...olemissIfc, courseCode: null, outreachLink: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.missing).toEqual(["course code", "outreach link"]); expect(missingMessage(r.missing)).toBe("Can't copy yet — add the course code and outreach link for this recipient first."); }
    expect(renderOutreachDm({ ...olemissIfc, campusShorthand: "", campusName: "University of Mississippi" }).ok).toBe(true);
    expect(organizationTypePlural({ kind: "council", council: null })).toBe("chapters");
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
