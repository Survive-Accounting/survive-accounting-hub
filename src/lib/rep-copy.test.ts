// The copy carries earnings claims made to students, so the invariants are tested rather than
// trusted: both numbers present, ceiling before ramp, the bonus gate never softened, and no
// corporate vocabulary anywhere a rep can read.
import { describe, expect, it } from "bun:test";

import {
  emptyStateCopy, declineCopy, BONUS_GATE_LINE, CALL_CAPTURE_PROMPTS, CEILING_LINE,
  FIRST_SEMESTER_RANGE, RAMP_LINE, RESUME_LINE, CAMPUS_MATURE_ANNUAL_USD, REP_COMMISSION_PCT,
} from "@/lib/rep-copy";

describe("the two numbers", () => {
  it("the ceiling names $20,000, the 10%, and Ole Miss as evidence", () => {
    expect(CEILING_LINE).toContain("$20,000");
    expect(CEILING_LINE).toContain("10%");
    expect(CEILING_LINE).toContain("Ole Miss");
    expect(CAMPUS_MATURE_ANNUAL_USD).toBe(20_000);
    expect(REP_COMMISSION_PCT).toBe(10);
  });
  it("the ramp is honest about the first semester and never promises the ceiling", () => {
    expect(RAMP_LINE).toContain("won't be there");
    expect(RAMP_LINE).toContain("a few hundred dollars");
    expect(RAMP_LINE).not.toContain("$20,000");
    expect(FIRST_SEMESTER_RANGE).toBe("$300–800");
  });
  it("the résumé line carries no dollar figure — it stands on its own", () => {
    expect(RESUME_LINE).not.toMatch(/\$|\d/);
  });
});

describe("the bonus gate", () => {
  it("states the condition plainly, in both directions", () => {
    expect(BONUS_GATE_LINE).toContain("unlocks at your first chapter sale");
    expect(BONUS_GATE_LINE).toContain("If no chapter signs up, the bonus isn't paid");
  });
});

describe("dashboard empty state", () => {
  const c = emptyStateCopy({ campusName: "Alabama", chapterCount: 7 });
  it("names the campus and the real chapter count", () => {
    expect(c.eyebrow).toBe("Your campus · ALABAMA");
    expect(c.headline).toBe("You've got 7 chapters. Here's what happens next.");
  });
  it("is three steps: we give, you send, they buy", () => {
    expect(c.steps).toHaveLength(3);
    expect(c.steps[0]).toContain("Instagram");
    expect(c.steps[1]).toContain("10 a day");
    expect(c.steps[2]).toContain("10% of everything they buy");
  });
  it("carries the ceiling and the gate", () => {
    expect(c.ceiling).toContain("$20,000");
    expect(c.job).toBe("Your job is getting it started.");
    expect(c.gate).toContain("first chapter sale");
  });
  it("stays grammatical at one chapter and degrades cleanly at zero", () => {
    expect(emptyStateCopy({ campusName: "Auburn", chapterCount: 1 }).headline).toContain("1 chapter.");
    const none = emptyStateCopy({ campusName: null, chapterCount: 0 });
    expect(none.headline).toContain("being set up");
    expect(none.eyebrow).toBe("Your campus · YOUR CAMPUS");
  });
});

describe("the decline note", () => {
  const d = declineCopy({ firstName: "Jordan", campusName: "Auburn" });
  it("is short, warm, and leaves the door open", () => {
    expect(d.blocks.length).toBeLessThanOrEqual(4);
    expect(d.blocks[0]).toBe("Hey Jordan,");
    expect(d.blocks.join(" ")).toContain("I'll come back to you first");
  });
  it("never reads as a rejection letter and still points them at the free product", () => {
    const all = d.blocks.join(" ").toLowerCase();
    expect(all).not.toContain("unfortunately");
    expect(all).not.toContain("regret");
    expect(all).not.toContain("application was unsuccessful");
    expect(all).toContain("exam 1 is free");
  });
});

describe("tone", () => {
  it("no corporate vocabulary anywhere a student reads", () => {
    const all = [CEILING_LINE, RAMP_LINE, BONUS_GATE_LINE, RESUME_LINE,
      ...Object.values(emptyStateCopy({ campusName: "Alabama", chapterCount: 7 })).flat(),
      ...declineCopy({ firstName: "Jordan", campusName: "Auburn" }).blocks].join(" ").toLowerCase();
    for (const banned of ["ambassador", "brand partner", "leverage", "growth partner", "synergy", "onboard you"]) {
      expect(all).not.toContain(banned);
    }
  });
});

describe("call capture prompts", () => {
  it("are the four questions the first calls have to answer", () => {
    expect(CALL_CAPTURE_PROMPTS).toHaveLength(4);
    expect(CALL_CAPTURE_PROMPTS[0]).toContain("ask about first");
  });
});
