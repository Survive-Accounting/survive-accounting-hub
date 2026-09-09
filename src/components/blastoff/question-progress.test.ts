import { describe, expect, test } from "bun:test";

import { questionProgress } from "./frame-view";
import type { BlastFrame } from "./plan";
import type { BoothCeq } from "@/lib/talkthrough.functions";

const ceq = (id: string, noteOnly = false): BoothCeq =>
  ({ id, label: id, stem: id, choices: [], noteOnly } as unknown as BoothCeq);

// Lee, 2026-09-09: "if I split somewhere, change the numbering of the sets in top right… so a
// student doesn't think that video is 1/29 — it's like, the split I'm doing for 'assets' is
// actually just 1/11. Wherever the split point is, adjust the numbers shown."
describe("the question counter", () => {
  const byId = new Map([["a", ceq("a")], ["b", ceq("b")], ["c", ceq("c")], ["d", ceq("d")], ["n", ceq("n", true)]]);

  test("with no cuts it counts the whole deck", () => {
    const frames: BlastFrame[] = [
      { id: "f1", kind: "ceq", ceqId: "a" }, { id: "f2", kind: "ceq", ceqId: "b" },
      { id: "f3", kind: "ceq", ceqId: "c" }, { id: "f4", kind: "ceq", ceqId: "d" },
    ];
    expect([...questionProgress(frames, byId).values()]).toEqual([
      { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 },
    ]);
  });

  test("a cut restarts the count and shrinks the total — 1/2 and 1/2, not 1/4 and 3/4", () => {
    const frames: BlastFrame[] = [
      { id: "f1", kind: "ceq", ceqId: "a" }, { id: "f2", kind: "ceq", ceqId: "b", cutAfter: true },
      { id: "f3", kind: "ceq", ceqId: "c" }, { id: "f4", kind: "ceq", ceqId: "d" },
    ];
    const p = questionProgress(frames, byId);
    expect(p.get("f1")).toEqual({ x: 1, y: 2 });
    expect(p.get("f2")).toEqual({ x: 2, y: 2 });
    expect(p.get("f3")).toEqual({ x: 1, y: 2 });
    expect(p.get("f4")).toEqual({ x: 2, y: 2 });
  });

  test("note frames are breath — never counted, never counted against", () => {
    const frames: BlastFrame[] = [
      { id: "n1", kind: "ceq", ceqId: "n" },
      { id: "f1", kind: "ceq", ceqId: "a" }, { id: "s1", kind: "slogan" },
      { id: "f2", kind: "ceq", ceqId: "b" },
    ];
    const p = questionProgress(frames, byId);
    expect(p.has("n1")).toBe(false);
    expect(p.has("s1")).toBe(false);
    expect(p.get("f2")).toEqual({ x: 2, y: 2 });
  });

  test("the same card twice in one group is one question, asked twice", () => {
    const frames: BlastFrame[] = [
      { id: "f1", kind: "ceq", ceqId: "a" }, { id: "f2", kind: "ceq", ceqId: "b" },
      { id: "f3", kind: "ceq", ceqId: "a" },
    ];
    const p = questionProgress(frames, byId);
    expect(p.get("f1")).toEqual({ x: 1, y: 2 });
    expect(p.get("f3")).toEqual({ x: 1, y: 2 });
  });
});
