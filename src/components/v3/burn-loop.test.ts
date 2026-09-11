// The burn's patience, pinned against a sleeping worker, a slow one, and one that won't work.
import { describe, expect, test } from "bun:test";

import { BURN_BUDGET_MS, POLL_MISSES, WAKE_TRIES, runBurn, type BurnCheck, type BurnDeps, type BurnProgress } from "./burn-loop";

function deps(o: { health?: boolean[]; detail?: string; configured?: boolean; checks?: (BurnCheck | Error)[]; clock?: () => number }): BurnDeps & { starts: number } {
  const health = [...(o.health ?? [true])];
  const checks = [...(o.checks ?? [{ state: "done", note: "", fileUrl: "https://x/out.mp4", error: null }])];
  const d = {
    starts: 0,
    preflight: async () => ({ configured: o.configured ?? true, healthy: health.length ? health.shift()! : false, detail: o.detail ?? "worker unreachable: The operation was aborted due to timeout" }),
    start: async () => { d.starts += 1; return { jobId: "00000000-0000-0000-0000-000000000001", path: "blastoff-takes/x.mp4" }; },
    resolve: async () => { const c = checks.shift(); if (!c) throw new Error("no more checks"); if (c instanceof Error) throw c; return c; },
    sleep: async () => {},
    now: o.clock ?? (() => 0),
  };
  return d;
}
const done: BurnCheck = { state: "done", note: "", fileUrl: "https://x/out.mp4", error: null };
const rendering: BurnCheck = { state: "rendering", note: "Burning…", fileUrl: null, error: null };
const timeout = new Error("The operation was aborted due to timeout");

describe("the burn's patience", () => {
  test("a sleeping worker is woken first, and the burn starts exactly once", async () => {
    const d = deps({ health: [false, false, true], checks: [rendering, done] });
    const notes: string[] = [];
    await expect(runBurn(d, "https://x/in.mp4", "https://x/in.ass", (p: BurnProgress) => notes.push(p.note))).resolves.toBe("https://x/out.mp4");
    expect(d.starts).toBe(1);
    expect(notes.some((n) => n.startsWith("Waking the renderer… (1 of"))).toBe(true);
  });

  test("a worker that never wakes fails with what it last said, and nothing starts", async () => {
    const d = deps({ health: [] });
    await expect(runBurn(d, "a", "b", () => {})).rejects.toThrow(`didn't wake up after ${WAKE_TRIES} checks`);
    expect(d.starts).toBe(0);
  });

  test("what won't fix itself fails at once: not configured, a rejected token", async () => {
    await expect(runBurn(deps({ configured: false, health: [false] }), "a", "b", () => {})).rejects.toThrow("isn't configured");
    const tok = deps({ health: [false], detail: "worker up but the token is rejected" });
    await expect(runBurn(tok, "a", "b", () => {})).rejects.toThrow("token is rejected");
    expect(tok.starts).toBe(0);
  });

  test("a few slow progress checks are ridden out; a success resets the count", async () => {
    const checks = [...Array(POLL_MISSES - 1).fill(timeout), rendering, ...Array(POLL_MISSES - 1).fill(timeout), done];
    await expect(runBurn(deps({ checks }), "a", "b", () => {})).resolves.toBe("https://x/out.mp4");
  });

  test("too many failed checks in a row ends the burn and says so", async () => {
    await expect(runBurn(deps({ checks: Array(POLL_MISSES).fill(timeout) }), "a", "b", () => {})).rejects.toThrow(`${POLL_MISSES} checks in a row failed`);
  });

  test("a worker that reports an error fails at once, in its own words", async () => {
    await expect(runBurn(deps({ checks: [{ state: "error", note: "", fileUrl: null, error: "ffmpeg: font not found" }] }), "a", "b", () => {})).rejects.toThrow("ffmpeg: font not found");
  });

  test("the twenty-minute budget still holds", async () => {
    let t = 0;
    const d = deps({ checks: Array(50).fill(rendering), clock: () => (t += BURN_BUDGET_MS / 4) });
    await expect(runBurn(d, "a", "b", () => {})).rejects.toThrow("longer than twenty minutes");
  });
});
