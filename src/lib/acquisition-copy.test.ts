import { describe, expect, test } from "bun:test";

import {
  COLD_DM_TEMPLATES, campusGroupMePost, chairHero, chapterGroupMePost, councilHero, councilShareMessage, membersCrammingLine, repShareEmail, repShareLine,
} from "./acquisition-copy";

const STALE = /Exam 1|first exam|completely free|GPA|Be the first|Nobody from the house|Zero cost|Free to start/i;

describe("acquisition copy is evergreen", () => {
  test("council → chairs message: Lee's exact shape, the council only forwards", () => {
    expect(councilShareMessage({ courseCode: "BUS-A 201", councilLink: "https://surviveaccounting.com/indiana/ifc" })).toBe([
      "Scholarship chairs — Survive Accounting set up BUS-A 201 study pages for every chapter, with short cram videos + practice exams. Students can start free.",
      "",
      "Pick your chapter here to get your member link, GroupMe post, and flyer:",
      "https://surviveaccounting.com/indiana/ifc",
    ].join("\n"));
  });

  test("chapter GroupMe post: Lee's exact shape, the tracked link kept verbatim", () => {
    const link = "https://surviveaccounting.com/learn/tennessee/sigma-nu?ref=0e54a9c2-1111-4000-8000-000000000001";
    expect(chapterGroupMePost({ courseCode: "ACCT 200", chapterLink: link })).toBe([
      "Hey everyone — Survive Accounting set up a page for our chapter with short ACCT 200 cram videos + practice exams.",
      "",
      "If you're in ACCT 200, you can study for free here:",
      link,
    ].join("\n"));
  });

  test("nothing an exec or outreach target reads mentions Exam 1, GPA or zero-usage", () => {
    const texts = [
      COLD_DM_TEMPLATES.council, COLD_DM_TEMPLATES.chapter,
      councilShareMessage({ courseCode: "ACCY 201", councilLink: "x" }),
      chapterGroupMePost({ courseCode: "ACCY 201", chapterLink: "x" }),
      campusGroupMePost({ courseCode: null, link: "x" }),
      repShareLine({ courseCode: "ACCY 201", chapterName: "Sigma Chi", shortUrl: "x" }),
      repShareEmail({ campusName: "Ole Miss", chapterName: "Sigma Chi", courseCode: "ACCY 201", shortUrl: "x" }).body,
      ...Object.values(councilHero({ courseCode: "BUS-A 201", schoolName: "Indiana" })),
      ...Object.values(chairHero({ courseCode: "ACCT 200", chapter: "ΣΝ" })),
    ];
    for (const t of texts) expect(t).not.toMatch(STALE);
  });

  test("heroes carry the course code, the school and the chapter", () => {
    expect(councilHero({ courseCode: "BUS-A 201", schoolName: "Indiana" }).headline).toBe("BUS-A 201 prep for every chapter.");
    expect(councilHero({ courseCode: "BUS-A 201", schoolName: "Indiana" }).sub).toContain("for Indiana students");
    expect(chairHero({ courseCode: "ACCT 200", chapter: "ΣΝ" }).headline).toBe("Your ACCT 200 study page is ready.");
    expect(chairHero({ courseCode: "ACCT 200", chapter: "ΣΝ" }).sub).toBe("Short cram videos + practice exams for ΣΝ members. Students can start free — just send the page to the house.");
    expect(chairHero({ courseCode: null, chapter: null }).headline).toBe("Your chapter's study page is ready.");
  });

  test("no social proof until there is some; singular and plural", () => {
    expect(membersCrammingLine("ΒΘΠ", 0)).toBeNull();
    expect(membersCrammingLine("ΒΘΠ", null)).toBeNull();
    expect(membersCrammingLine("ΒΘΠ", 1)).toBe("1 ΒΘΠ member is cramming");
    expect(membersCrammingLine("ΒΘΠ", 12)).toBe("12 ΒΘΠ members are cramming");
    expect(membersCrammingLine("", 3)).toBe("3 members are cramming");
  });
});
