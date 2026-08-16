// F1 — THE FILMING LOOP: slate → deterministic trim → auto-attach → auto-advance.
//
// The loop only earns its keep if each link is honest, so each link is pinned:
// the slate's offset must refuse timestamps that don't belong together, attach
// must follow COVERAGE (what was on screen) rather than the armed target alone,
// and a dissect CEQ with moments left must never be advanced past.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { SLATE_CHOICES, SPEAK_MS, __setLastSlateEnd, slateEndOffsetMs, subscribeSlate } from "./film-slate";
import { attachTargets, type TakeRecord } from "./takes-store";

const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8");
const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8");

const take = (over: Partial<TakeRecord> = {}): TakeRecord => ({
  id: "t1", fileName: "a.mkv", sizeBytes: 10, mtimeMs: 1, recordedAt: "2026-08-16T00:00:00.000Z", status: "pending", ...over,
});

describe("the slate's trim point (F1)", () => {
  test("the offset is the gap from record-start to when the countdown cleared", () => {
    __setLastSlateEnd(10_000);
    expect(slateEndOffsetMs(7_000)).toBe(3_000);
  });
  test("a slate that ended BEFORE this record started belongs to the previous take", () => {
    __setLastSlateEnd(10_000);
    expect(slateEndOffsetMs(12_000)).toBeNull();
  });
  test("an implausible gap is refused rather than trimming a minute off the take", () => {
    __setLastSlateEnd(10_000);
    expect(slateEndOffsetMs(10_000 - 90_000)).toBeNull();
  });
  test("no slate at all ⇒ null, and the stitcher falls back to silence detection", () => {
    __setLastSlateEnd(0);
    expect(slateEndOffsetMs(1_000)).toBeNull();
  });
  test("subscribers get the current state immediately (the popout mounts mid-slate)", () => {
    let seen: unknown = "never";
    const off = subscribeSlate((s) => { seen = s; });
    expect(seen).toEqual({ count: null, speak: false });
    off();
  });
  test("the lengths Lee can pick, and a speak beat short enough not to eat the take", () => {
    expect([...SLATE_CHOICES]).toEqual([3, 5, 10]);
    expect(SPEAK_MS).toBeLessThan(1_000);
  });
});

describe("where a kept take attaches (F1)", () => {
  const spine = ["q1", "q2", "q3", "q4"];
  test("coverage wins: the frames that were on screen while it rolled", () => {
    const t = take({ coverage: { startedAt: "", stoppedAt: "", frameIds: ["q2", "q3"] }, target: { kind: "ceq", ids: ["q1"] } });
    expect(attachTargets(t, spine)).toEqual(["q2", "q3"]);
  });
  test("no coverage ⇒ the armed target still works (arm-then-roll is untouched)", () => {
    expect(attachTargets(take({ target: { kind: "ceq", ids: ["q4"] } }), spine)).toEqual(["q4"]);
  });
  test("results come back in SPINE order, not the order Lee wandered through them", () => {
    const t = take({ coverage: { startedAt: "", stoppedAt: "", frameIds: ["q4", "q1", "q4"] } });
    expect(attachTargets(t, spine)).toEqual(["q1", "q4"]);
  });
  test("frames deleted since filming are dropped, never attached to a ghost id", () => {
    const t = take({ coverage: { startedAt: "", stoppedAt: "", frameIds: ["q2", "gone"] } });
    expect(attachTargets(t, spine)).toEqual(["q2"]);
  });
  test("nothing to attach to ⇒ empty, so the caller can refuse loudly", () => {
    expect(attachTargets(take(), spine)).toEqual([]);
  });
});

describe("the loop is wired end to end (F1 source pins)", () => {
  test("the slate renders INSIDE the capture window — it is a slate, not status", () => {
    expect(previewer).toContain("function FilmSlate()");
    expect(previewer).toContain("<FilmSlate />");
  });
  test("keep attaches by coverage, not by the armed target alone", () => {
    expect(studio).toContain("const ids = attachTargets(t, questions.map((q) => q.id));");
  });
  test("a run of frames attaches as run coverage; the slate trim rides along", () => {
    expect(studio).toContain("...(ids.length > 1 ? { coversFrameIds: ids } : {})");
    expect(studio).toContain("...(t.slateEndMs != null ? { slateEndMs: t.slateEndMs } : {})");
  });
  test("auto-advance defaults ON and is remembered", () => {
    expect(studio).toContain('localStorage.getItem("sa-auto-advance") !== "0"');
  });
  test("a dissect CEQ with an unfilmed moment parks the spine — advancing would skip the shot", () => {
    expect(studio).toContain("const nextMoment = dz?.on ? dz.moments.find((m) => !m.waived && !covered.has(m.id)) : undefined;");
    expect(studio).toContain("STAYING PUT");
  });
  test("the slate trim reaches the stitcher instead of guessing at head silence", () => {
    expect(studio).toContain("const heads = clips.map((c) => (c.slateEndMs != null ? c.slateEndMs / 1000 : null));");
  });
  test("ONE countdown: the studio mirrors the slate store, it does not run a second clock", () => {
    expect(studio).toContain("useEffect(() => subscribeSlate(setSlate), []);");
    expect(studio).not.toContain("const runCountdown = useCallback");
    expect(studio).not.toContain('localStorage.getItem("sa-countdown")');
  });
  test("run coverage accumulates every frame walked while OBS rolls", () => {
    // Start-frame + stop-frame alone would attach a five-frame blast to two of
    // them and silently drop the middle three.
    expect(studio).toContain("if (!coveredRef.current.includes(qId)) coveredRef.current = [...coveredRef.current, qId];");
    expect(studio).toContain("liveFrameIds={() => Array.from(new Set([...coveredRef.current,");
    expect(studio).toContain("const onRecordStart = useCallback(() => { coveredRef.current = []; }, []);");
  });
});
