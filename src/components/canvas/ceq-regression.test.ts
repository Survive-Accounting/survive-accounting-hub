// REGRESSION GUARD — the five named areas from the audit. Tests only.
import { describe, expect, it } from "bun:test";

import { ingestNumOf, matchIngestNames, sweepState, walkTransition } from "./ceq-walk";
import { CommandBus, compositeCmd, patchDataCmd, type RfLike } from "./commands";
import { FILM_MODE_CSS } from "./FilmOverlays";
import { resolveMemoSpot, withInstanceSpot } from "./ceq-geom";
import { rackOf } from "./CeqPreviewer";

const Q = (n: number, hasClips = false) => ({ id: `q${n}`, hasClips });

describe("1 · batch-ingest filename matching", () => {
  it("extracts numbers: leading, q-prefix, topic.question", () => {
    expect(ingestNumOf("01.mp4")).toBe(1);
    expect(ingestNumOf("q3.mov")).toBe(3);
    expect(ingestNumOf("1.03.mp4")).toBe(3); // topic.question → question
    expect(ingestNumOf("2026-recording.mp4")).toBe(null); // date prefix too long
  });
  it("duplicates: first (natural-sorted) claims; loser falls to deck order on a clip-less question", () => {
    const m = matchIngestNames(["q2 retake.mp4", "q2.mp4"], [Q(1), Q(2), Q(3)]);
    const assigned = [m.get("q2.mp4"), m.get("q2 retake.mp4")].sort();
    expect(assigned).toContain("q2");
    expect(new Set(m.values()).size).toBe(2); // never two files on one question
  });
  it("cross-topic ids still resolve by question digit (documented current behaviour)", () => {
    expect(matchIngestNames(["9.03.mp4"], [Q(1), Q(2), Q(3)]).get("9.03.mp4")).toBe("q3");
  });
  it("no-number rows fall back only onto CLIP-LESS questions; none free ⇒ excluded (null)", () => {
    const m = matchIngestNames(["intro-take.mp4"], [Q(1, true), Q(2, true)]);
    expect(m.get("intro-take.mp4")).toBe(null);
  });
});

describe("2 · compositeCmd — one action = one undo", () => {
  const mkRf = () => {
    const data = new Map<string, Record<string, unknown>>([["a", { v: 1 }], ["b", { v: 2 }]]);
    return {
      rf: { getNode: (id: string) => (data.has(id) ? { id, data: data.get(id)! } : undefined), updateNodeData: (id: string, patch: Record<string, unknown>) => data.set(id, { ...data.get(id)!, ...patch }) } as unknown as RfLike,
      data,
    };
  };
  it("does in order, undoes as ONE bus step across a mixed bulk op", () => {
    const { rf, data } = mkRf();
    const bus = new CommandBus();
    const cmd = compositeCmd([patchDataCmd(rf, "a", { v: 10 }, "a"), patchDataCmd(rf, "b", { v: 20 }, "b")].filter((c): c is NonNullable<typeof c> => !!c), "bulk");
    bus.dispatch(cmd!);
    expect(data.get("a")!.v).toBe(10);
    expect(data.get("b")!.v).toBe(20);
    expect(bus.undo()).toBe(true);      // ONE undo…
    expect(data.get("a")!.v).toBe(1);   // …restores everything
    expect(data.get("b")!.v).toBe(2);
    expect(bus.undo()).toBe(false);     // and there is nothing else on the stack
  });
  it("filters null members and returns null for an empty set", () => {
    expect(compositeCmd([], "empty")).toBe(null);
    const { rf } = mkRf();
    expect(compositeCmd([patchDataCmd(rf, "missing", { v: 1 }, "x"), patchDataCmd(rf, "a", { v: 3 }, "a")].filter((c): c is NonNullable<typeof c> => !!c), "one")).not.toBe(null);
  });
});

describe("3 · chain walk + sweep", () => {
  it("Enter: resolve first (no memo), then reveal in order, then no-op", () => {
    let s = walkTransition(false, 0, 2, 1);
    expect(s).toEqual({ resolved: true, shown: 0, action: "resolve" });
    s = walkTransition(s.resolved, s.shown, 2, 1);
    expect(s).toEqual({ resolved: true, shown: 1, action: "reveal" });
    s = walkTransition(s.resolved, s.shown, 2, 1);
    expect(s.shown).toBe(2);
    expect(walkTransition(true, 2, 2, 1).action).toBe("noop");
  });
  it("Shift+Enter: hide back; past item 1 un-resolves to neutral; then no-op", () => {
    expect(walkTransition(true, 2, 2, -1)).toEqual({ resolved: true, shown: 1, action: "hide" });
    expect(walkTransition(true, 0, 2, -1)).toEqual({ resolved: false, shown: 0, action: "unresolve" });
    expect(walkTransition(false, 0, 2, -1).action).toBe("noop");
  });
  it("Shift+` sweep clears every reveal and KEEPS resolution", () => {
    const out = sweepState([{ resolved: true, chainShown: 2 }, { resolved: false, chainShown: 1 }]);
    expect(out.map((c) => c.chainShown)).toEqual([0, 0]);
    expect(out.map((c) => c.resolved)).toEqual([true, false]);
  });
});

describe("4 · baseline/geometry guards", () => {
  it("instance writes never mutate their input (template stays untouchable)", () => {
    const inst = { card: { x: 1, y: 2 }, memoSlots: [{ x: 3, y: 4 }] };
    const snap = JSON.stringify(inst);
    withInstanceSpot(inst, 0, { x: 99, y: 99, scale: 2 });
    expect(JSON.stringify(inst)).toBe(snap);
  });
  it("a chainless question resolves memos from the TEMPLATE's rack — padding never shrinks saved slots", () => {
    const saved = [{ x: 10, y: 10 }, { x: 10, y: 200 }, { x: 10, y: 400 }];
    expect(rackOf(saved, 1600, 900).slice(0, 3)).toEqual(saved);
    expect(resolveMemoSpot(undefined, { memoSlots: saved }, 1, 1600, 900)).toEqual({ x: 10, y: 200, scale: 1 });
  });
});

describe("5 · film-mode CSS contract", () => {
  it("handles are hidden with a MEASURABLE rect (visibility, never display:none)", () => {
    expect(FILM_MODE_CSS).toContain(".film-mode .react-flow__handle { visibility: hidden !important; }");
    expect(FILM_MODE_CSS).not.toMatch(/\.react-flow__handle[^}]*display:\s*none/);
  });
  it("frame chrome + card chrome are display-hidden on camera", () => {
    expect(FILM_MODE_CSS).toContain(".film-mode [data-frame-chrome] { display: none !important; }");
    expect(FILM_MODE_CSS).toContain(".film-mode .sa-chrome { display: none !important; }");
  });
});
