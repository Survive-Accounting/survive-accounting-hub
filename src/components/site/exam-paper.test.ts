// Guards the hero cycle's two honesty rules, which are easy to break by accident and impossible
// to check reliably in a browser (the graphic starts cycling before a test script can attach, so
// timing-based checks keep catching it mid-rotation).
import { describe, expect, it } from "bun:test";

import { paperStops } from "./ExamPaper";

const bolt = (id: string) => ({ c1: `c1-${id}`, c2: `c2-${id}` });

const S = (id: string, name: string, code?: string, codeVerified?: boolean) =>
  ({ campusId: `campus-${id}`, id, name, code, codeVerified }) as never;

describe("paperStops", () => {
  it("leads with Ole Miss, LSU, Tennessee and keeps picker order after them", () => {
    const stops = paperStops(
      [
        S("alabama", "Alabama", "AC 210", true),
        S("lsu", "LSU", "ACCT 2001", true),
        S("arkansas", "Arkansas", "ACCT 2013", true),
        S("ole-miss", "Ole Miss", "ACCY 201", true),
        S("tennessee", "Tennessee", "ACCT 200", true),
      ],
      bolt,
    );
    expect(stops.map((s) => s.id)).toEqual(["ole-miss", "lsu", "tennessee", "alabama", "arkansas"]);
    // the FIRST stop is what a reduced-motion visitor sees, permanently
    expect(stops[0].code).toBe("ACCY 201");
  });

  it("drops schools whose course code is not verified rather than inventing one", () => {
    const stops = paperStops(
      [
        S("ole-miss", "Ole Miss", "ACCY 201", true),
        S("lsu", "LSU", "ACCT 2001", false), // present but unconfirmed
        S("tennessee", "Tennessee", undefined, true), // verified flag, no code
      ],
      bolt,
    );
    expect(stops.map((s) => s.id)).toEqual(["ole-miss"]);
  });

  it("carries the school's own bolt colourway so the header and bolt cannot disagree", () => {
    const [first] = paperStops([S("ole-miss", "Ole Miss", "ACCY 201", true)], bolt);
    expect(first).toMatchObject({ code: "ACCY 201", c1: "c1-ole-miss", c2: "c2-ole-miss" });
  });

  it("returns nothing when no school has a confirmed code, so the hero renders no graphic", () => {
    expect(paperStops([S("ole-miss", "Ole Miss", undefined, false)], bolt)).toEqual([]);
  });
});
