// 2026-09-11: "+ Bio" (an extra spine slide can be removed while another stays), the bolt zoom
// background's reach, and the Ask-yourself callout wired through every registry it needs.
import { describe, expect, test } from "bun:test";

import { calloutMeta } from "@/components/canvas/cards/CalloutCard";

import { camDefault } from "./layout";
import { FRAME_LABEL, INSERT_CALLOUT, canGoBig, canRemove, canZoomBehind, dropFrame, isInsert, type BlastFrame } from "./plan";
import { PHRASE_SLIDE_KINDS } from "./prompter";
import { canIllustrate } from "./illustration";

describe("the extras", () => {
  test("a second bio really goes; the last one only skips", () => {
    const two: BlastFrame[] = [{ id: "b1", kind: "bio" }, { id: "c", kind: "ceq", ceqId: "x" }, { id: "b2", kind: "bio" }];
    expect(canRemove(two, two[2])).toBe(true);
    expect(dropFrame(two, "b2").map((f) => f.id)).toEqual(["b1", "c"]);
    const one: BlastFrame[] = [{ id: "b1", kind: "bio" }];
    expect(canRemove(one, one[0])).toBe(false);
    expect(dropFrame(one, "b1")).toEqual([{ id: "b1", kind: "bio", skipped: true }]);
  });

  test("a duplicated set card really goes; the last copy only skips", () => {
    const dup: BlastFrame[] = [{ id: "a", kind: "ceq", ceqId: "x" }, { id: "b", kind: "ceq", ceqId: "x" }];
    expect(canRemove(dup, dup[1])).toBe(true);
    expect(dropFrame(dup, "b").map((f) => f.id)).toEqual(["a"]);
    expect(dropFrame([dup[0]], "a")).toEqual([{ id: "a", kind: "ceq", ceqId: "x", skipped: true }]);
  });

  test("the bolt zoom sits behind cards and the end-of-topic pair, never behind a slide that paints its own", () => {
    expect(canZoomBehind({ id: "a", kind: "ceq" })).toBe(true);
    expect(canZoomBehind({ id: "a", kind: "phrase" })).toBe(true);
    expect(canZoomBehind({ id: "a", kind: "rubric" })).toBe(true);
    expect(canZoomBehind({ id: "a", kind: "topic_done" })).toBe(true);
    expect(canZoomBehind({ id: "a", kind: "slogan" })).toBe(false);
    expect(canZoomBehind({ id: "a", kind: "phrase", display: "big" })).toBe(false);
    expect(canZoomBehind({ id: "a", kind: "intro" })).toBe(false);
  });

  test("Ask yourself is a callout like the other five", () => {
    expect(FRAME_LABEL.ask).toBe("Ask yourself");
    expect(isInsert("ask")).toBe(true);
    expect(canGoBig("ask")).toBe(true);
    expect(INSERT_CALLOUT.ask).toBe("ask-yourself");
    expect(calloutMeta("ask-yourself").label).toBe("ASK YOURSELF");
    expect(PHRASE_SLIDE_KINDS.some((k) => k.kind === "ask")).toBe(true);
    expect(canIllustrate("ask")).toBe(true);
    // .38 since 2026-09-12: the callout kinds' home camera grew when the caption rail went.
    expect(camDefault("pass2", "ask")).toEqual({ spot: "home", size: 0.38 });
  });
});
