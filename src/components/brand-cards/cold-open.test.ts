// The assembly cold open's timing — the one thing that must be true whatever
// length it runs at: the camera is first, the wordmark lands LAST and lands
// exactly on zero, and it is the only piece that lands hard.
import { describe, expect, test } from "bun:test";

import {
  ASSEMBLY_KEYS, ASSEMBLY_PIECES, ASSEMBLY_SHORT_MS, ASSEMBLY_TOTAL_MS,
  assemblyPlan, coldOpenCss, easeHard, easeSoft, pieceAt, pieceOffset, pieceProgress, pieceStyle, tickerBeat,
} from "./cold-open";

const TOTALS = [ASSEMBLY_TOTAL_MS, ASSEMBLY_SHORT_MS, 1200, 4500, 30_000];

describe("ASSEMBLY_PIECES — Lee's order, and only one hard landing", () => {
  test("the order is stable: camera first, wordmark last", () => {
    expect(ASSEMBLY_PIECES.map((p) => p.key)).toEqual([...ASSEMBLY_KEYS]);
    expect(ASSEMBLY_PIECES[0].key).toBe("camera");
    expect(ASSEMBLY_PIECES[ASSEMBLY_PIECES.length - 1].key).toBe("wordmark");
  });
  test("the wordmark is the only hard piece", () => {
    expect(ASSEMBLY_PIECES.filter((p) => p.hard).map((p) => p.key)).toEqual(["wordmark"]);
  });
  test("each piece flies in from the edge Lee named", () => {
    const from = Object.fromEntries(ASSEMBLY_PIECES.map((p) => [p.key, p.from]));
    // "my camera's out on the right and comes in" · "the question comes from the top"
    // "the topics come in, top line, left, bottom line, right"
    // "Survive watermark comes from the top left, left to right"
    expect(from).toEqual({ camera: "right", question: "top", topicTop: "left", topicBottom: "right", wordmark: "left" });
  });
});

describe("assemblyPlan — the same choreography at any length", () => {
  for (const total of TOTALS) {
    test(`${total} ms: nothing starts before 0, nothing ends after the total`, () => {
      const plan = assemblyPlan(total);
      expect(plan.totalMs).toBe(total);
      for (const p of plan.pieces) {
        expect(p.atMs).toBeGreaterThanOrEqual(0);
        expect(p.durMs).toBeGreaterThan(0);
        expect(p.atMs + p.durMs).toBeLessThanOrEqual(total);
      }
    });
    test(`${total} ms: the order holds and the wordmark ends EXACTLY on zero`, () => {
      const plan = assemblyPlan(total);
      expect(plan.pieces.map((p) => p.key)).toEqual([...ASSEMBLY_KEYS]);
      const starts = plan.pieces.map((p) => p.atMs);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
      const wm = pieceAt(plan, "wordmark");
      expect(wm.atMs + wm.durMs).toBe(total);
      expect(wm.hard).toBe(true);
      expect(plan.pieces.filter((p) => p.hard)).toHaveLength(1);
    });
    test(`${total} ms: the ticker is last-but-one — after the topics, before the wordmark`, () => {
      const plan = assemblyPlan(total);
      const tb = pieceAt(plan, "topicBottom");
      const wm = pieceAt(plan, "wordmark");
      const t = tickerBeat(plan);
      expect(t.from).toBe("bottom");
      expect(t.atMs).toBeGreaterThanOrEqual(tb.atMs + tb.durMs);
      expect(t.atMs + t.durMs).toBeLessThanOrEqual(wm.atMs);
    });
  }
  test("the default is the countdown's own length", () => {
    expect(assemblyPlan().totalMs).toBe(ASSEMBLY_TOTAL_MS);
  });
});

describe("pieceOffset / pieceStyle — a direction maps to the right sign", () => {
  test("the offset points back out at the edge the piece came from", () => {
    expect(pieceOffset("right", 100, 40)).toEqual({ x: 100, y: 0 });
    expect(pieceOffset("left", 100, 40)).toEqual({ x: -100, y: 0 });
    expect(pieceOffset("top", 100, 40)).toEqual({ x: 0, y: -40 });
    expect(pieceOffset("bottom", 100, 40)).toEqual({ x: 0, y: 40 });
  });
  test("at its first frame a piece sits off its own edge; once landed it sits at zero", () => {
    const plan = assemblyPlan();
    const dist = { dx: 200, dy: 90 };
    const signs: Record<string, (s: string) => boolean> = {
      camera: (s) => /translate3d\(2\d\d(\.\d+)?px, 0px/.test(s),        // from the right: +x
      question: (s) => /translate3d\(0px, -\d/.test(s),                  // from the top: -y
      topicTop: (s) => /translate3d\(-\d/.test(s),                       // from the left: -x
      topicBottom: (s) => /translate3d\(\d/.test(s),                     // from the right: +x
      wordmark: (s) => /translate3d\(-\d/.test(s),                       // from the left: -x
    };
    for (const p of plan.pieces) {
      const start = pieceStyle(p, p.atMs, dist);
      expect(start.opacity).toBe(0);
      expect(signs[p.key](start.transform)).toBe(true);
      const end = pieceStyle(p, p.atMs + p.durMs, dist);
      expect(end.opacity).toBe(1);
      expect(end.transform).toBe("translate3d(0px, 0px, 0)");
    }
  });
  test("before it starts a piece is invisible and fully offset; the finished frame has every piece home", () => {
    const plan = assemblyPlan();
    const wm = pieceAt(plan, "wordmark");
    expect(pieceStyle(wm, 0, { dx: 200, dy: 90 }).opacity).toBe(0);
    for (const p of plan.pieces) {
      expect(pieceStyle(p, plan.totalMs, { dx: 200, dy: 90 })).toEqual({ opacity: 1, transform: "translate3d(0px, 0px, 0)" });
    }
  });
  test("pieceProgress clamps outside the piece's own window", () => {
    const p = { atMs: 1000, durMs: 500 };
    expect(pieceProgress(p, 0)).toBe(0);
    expect(pieceProgress(p, 1250)).toBe(0.5);
    expect(pieceProgress(p, 99_999)).toBe(1);
  });
});

describe("the eases — soft everywhere, one overshoot", () => {
  test("both start at 0 and end at 1", () => {
    for (const f of [easeSoft, easeHard]) { expect(f(0)).toBeCloseTo(0, 6); expect(f(1)).toBeCloseTo(1, 6); }
  });
  test("only the hard ease goes past 1 — the snap", () => {
    const soft = Array.from({ length: 21 }, (_, i) => easeSoft(i / 20));
    expect(Math.max(...soft)).toBeLessThanOrEqual(1);
    const hard = Array.from({ length: 21 }, (_, i) => easeHard(i / 20));
    expect(Math.max(...hard)).toBeGreaterThan(1);
  });
});

describe("coldOpenCss — one class per piece, keyed off the same plan", () => {
  test("every piece and the ticker get a rule, and the bolt pulses on the landing", () => {
    const plan = assemblyPlan();
    const css = coldOpenCss(plan, 200, 90);
    for (const k of ASSEMBLY_KEYS) expect(css).toContain(`.sa-co-${k} {`);
    expect(css).toContain(".sa-co-ticker {");
    const wm = pieceAt(plan, "wordmark");
    expect(css).toContain(`animation-delay: ${wm.atMs}ms`);
    expect(css).toContain(".sa-co-shock {");
  });
  // 2026-09-08, Lee: "will students see the 3 2 1?" — no. The count left the captured frame for
  // the main /film window, so the assembly's stylesheet has no timer rule of any kind.
  test("nothing in the shot is a countdown", () => {
    expect(coldOpenCss(assemblyPlan(), 200, 90)).not.toContain("sa-co-count");
  });
  test("reduced motion zeroes the travel — everything simply appears", () => {
    const css = coldOpenCss(assemblyPlan(), 200, 90);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*--sa-co-x: 0px; --sa-co-y: 0px;/);
  });
});
