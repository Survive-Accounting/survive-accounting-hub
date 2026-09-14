import { describe, expect, test } from "bun:test";

import { chapterDm, councilDm, mergeOrder, moveSlug, slotLink, V2_PRIORITY, v2CouncilOf } from "./outreach-v2";

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
  test("the DMs are Lee's words with the course, campus and link filled in", () => {
    const c = councilDm({ courseCode: "ACCY 201", campusShort: "Ole Miss", link: "https://surviveaccounting.com/l/abc" });
    expect(c.startsWith("Hey y’all!")).toBe(true);
    expect(c).toContain("first ACCY 201 exam");
    expect(c).toContain("giving Ole Miss students free Exam 1 prep");
    expect(c).toContain("\n\nhttps://surviveaccounting.com/l/abc\n\n");
    const ch = chapterDm({ courseCode: "ACCY 201", link: "x" });
    expect(ch).toContain("giving your members free Exam 1 prep");
    expect(ch).toContain("pass this along to your scholarship chair");
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
