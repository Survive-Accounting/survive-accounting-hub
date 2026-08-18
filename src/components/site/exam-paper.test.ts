// Guards the hero cycle, which is impossible to check reliably in a browser (the graphic starts
// cycling before a test script can attach, so timing-based checks keep catching it mid-rotation).
//
// THE RULE THESE TESTS ENFORCE CHANGED IN PASS 8, so it is worth saying what happened rather than
// leaving a reader to wonder why the old assertions vanished. The hero used to PRINT a course code
// and a campus name on the card, so the suite guarded an honesty rule: never show a code that
// isn't verified, and drop any school that hasn't confirmed one rather than inventing a plausible
// "ACCY 201". Pass 8 deleted the card and all of its type — the graphic is now the bolt alone.
//
// With no text, there is no claim to be wrong about, and that filter would now be silently
// shrinking the colour cycle to enforce a rule about something nobody renders. So the honesty
// tests are not weakened here, they are OBSOLETE, and the rule that replaces them is the inverse:
// every school is in, and a stop carries colours and nothing else.
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
  });

  it("keeps EVERY school, verified course code or not — colours are not a claim", () => {
    // The exact case the old suite required to be dropped. A school with no confirmed code still
    // has official colours, and the hero no longer says anything about its course.
    const stops = paperStops(
      [
        S("ole-miss", "Ole Miss", "ACCY 201", true),
        S("lsu", "LSU", "ACCT 2001", false), // present but unconfirmed
        S("tennessee", "Tennessee", undefined, true), // verified flag, no code
      ],
      bolt,
    );
    expect(stops.map((s) => s.id)).toEqual(["ole-miss", "lsu", "tennessee"]);
  });

  it("carries the school's own bolt colourway", () => {
    const [first] = paperStops([S("ole-miss", "Ole Miss", "ACCY 201", true)], bolt);
    expect(first).toMatchObject({ id: "ole-miss", c1: "c1-ole-miss", c2: "c2-ole-miss" });
  });

  it("carries NO text — a stop cannot leak a course code or campus name back onto the card", () => {
    // A regression here would not throw or look broken; it would quietly re-enable the thing Pass 8
    // removed the moment someone renders `stop.name` "just for the alt text".
    const [first] = paperStops([S("ole-miss", "Ole Miss", "ACCY 201", true)], bolt);
    expect(Object.keys(first).sort()).toEqual(["c1", "c2", "id"]);
  });

  it("returns nothing only when there are no schools at all", () => {
    expect(paperStops([], bolt)).toEqual([]);
  });
});
