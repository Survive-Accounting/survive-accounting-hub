// The chair page's words and links go out in DMs and on printed slides — pinned here so a copy
// edit is a deliberate one (Lee's wording, 2026-09-11) and the /learn links never drift to /go.
import { describe, expect, test } from "bun:test";

import {
  chairArtwork, chairForLine, chairGroupMe, chairHeadline, chairLearnPath, chairShareUrl, chairSubhead, chairValueCards,
} from "./chair-promo";

describe("chairHeadline", () => {
  test("a chapter is addressed by its letters, a council by every chapter", () => {
    expect(chairHeadline("chapter", "ΑΤΩ", "ACCT 200")).toBe("Boost ΑΤΩ's GPA in ACCT 200.");
    expect(chairHeadline("council", "IFC", "ACCT 200")).toBe("Boost every chapter's GPA in ACCT 200.");
  });
  test("no verified code degrades honestly — never a placeholder", () => {
    expect(chairHeadline("chapter", "ΑΤΩ", null)).toBe("Boost ΑΤΩ's GPA in intro accounting.");
  });
  test("the code appears once — the subhead never repeats it", () => {
    expect(chairSubhead("chapter")).not.toMatch(/ACCT/);
    expect(chairSubhead("council")).toMatch(/every member/);
  });
});

describe("links", () => {
  test("the top line", () => {
    expect(chairForLine("Alpha Tau Omega", "Tennessee")).toBe("For Alpha Tau Omega · Tennessee");
  });
  test("a chapter's share link is the chapter's /learn page, by School.id", () => {
    expect(chairShareUrl("chapter", "tennessee", "alpha-tau-omega")).toBe("https://surviveaccounting.com/learn/tennessee/alpha-tau-omega");
    expect(chairLearnPath("chapter", "tennessee", "alpha-tau-omega")).toBe("/learn/tennessee/alpha-tau-omega");
  });
  test("a council's share link is the campus /learn page with the council preset", () => {
    expect(chairShareUrl("council", "tennessee", "ifc")).toBe("https://surviveaccounting.com/learn/tennessee?c=ifc");
    expect(chairLearnPath("council", "tennessee", "ifc")).toBe("/learn/tennessee?c=ifc");
  });
  test("nothing the chair hands out points at /go", () => {
    for (const k of ["chapter", "council"] as const) {
      expect(chairShareUrl(k, "tennessee", "x")).not.toContain("/go/");
    }
  });
});

describe("the GroupMe post", () => {
  test("a chapter's post says 'our chapter' and carries exactly one link", () => {
    const url = chairShareUrl("chapter", "tennessee", "alpha-tau-omega");
    const msg = chairGroupMe("chapter", "ACCT 200", url, "ATO");
    expect(msg).toContain("our chapter free ACCT 200 cram videos");
    expect(msg.match(/https?:\/\//g)?.length).toBe(1);
    expect(msg.endsWith(url)).toBe(true);
  });
  test("a council's post speaks to every chapter and asks them to pick theirs", () => {
    const url = chairShareUrl("council", "tennessee", "ifc");
    const msg = chairGroupMe("council", "ACCT 200", url, "IFC");
    expect(msg).toContain("every chapter free ACCT 200");
    expect(msg).toContain("Pick your chapter and start here:");
    expect(msg.endsWith(url)).toBe(true);
  });
});

describe("artwork", () => {
  test("a chapter gets the flyer and the slide, off the existing flyer endpoint", () => {
    const a = chairArtwork("chapter", "university-of-tennessee-knoxville", "alpha-tau-omega");
    expect(a.flyer).toBe("/api/flyer/university-of-tennessee-knoxville/alpha-tau-omega");
    expect(a.slide).toBe("/api/flyer/university-of-tennessee-knoxville/alpha-tau-omega?f=slide&pdf=1");
  });
  test("a council gets the slide only (Lee: councils just need the meeting slide)", () => {
    const a = chairArtwork("council", "university-of-tennessee-knoxville", "ifc");
    expect(a.flyer).toBeNull();
    expect(a.slide).toBe("/api/slide/university-of-tennessee-knoxville/council/ifc?pdf=1");
  });
});

describe("value cards", () => {
  test("three cards, in the chair's words", () => {
    const c = chairValueCards("chapter").map((x) => x.copy);
    expect(c).toEqual([
      "Fast explanations for the problems your members actually need to know.",
      "Exam-style questions that teach your members to recognize the pattern before test day.",
      "Matched to your members' course. If anything's missing, send the syllabus.",
    ]);
    expect(chairValueCards("council")[0].copy).toBe("Fast explanations for the problems everyone actually needs to know.");
  });
});
