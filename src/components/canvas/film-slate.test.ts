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

const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");
const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const inbox = readFileSync(join(import.meta.dir, "TakesInbox.tsx"), "utf8").split("\r\n").join("\n");

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
  test("keep attaches by coverage, then armed, then the OPEN frame (08-17)", () => {
    // P3 put ONE thing ahead of the automation: an EXPLICIT drop target (drag is
    // the correction layer). F10 keeps never set `explicit`, so the keyboard
    // loop's precedence is exactly what it was.
    expect(studio).toContain("const ids = opts?.explicit && t.target?.ids.length ? t.target.ids : attachTargets(t, questions.map((q) => q.id), qId && qId !== LAYOUT_Q0 ? qId : null);");
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
  test("run coverage is the MODULE-LEVEL visited log (P0 rebuild, 08-18)", () => {
    // The studio-owned accumulator is GONE: it captured live frames before its
    // own reset, only fed the event ingest path, and its badge showed the armed
    // target. The coverage log gates on its own open window, so this effect can
    // fire on every navigation and between-take wandering is ignored.
    expect(studio).toContain("useEffect(() => { if (qId && qId !== LAYOUT_Q0) logCoverageFrame(qId); }, [qId]);");
    expect(studio).not.toContain("coveredRef");
    expect(studio).toContain("openFrameId={() => (qId && qId !== LAYOUT_Q0 ? qId : null)}");
    // record-start RESETS AND SEEDS in one call — the capture-before-reset
    // ordering that polluted every take with its predecessor cannot recur.
    expect(inbox).toContain("beginCoverage(openFrameRef.current());");
    expect(inbox).toContain("const win = endCoverage();");
    // and the SCAN path now matches late files to their recording window
    expect(inbox).toContain("coverageForFile(f.lastModified)");
  });
});

describe("a kept take always has somewhere to go (Lee, 08-17)", () => {
  const spine = ["q1", "q2", "q3"];
  test("THE BUG: no coverage and nothing armed used to attach to NOTHING", () => {
    // That is how a take banked as "KEPT 1" beside "0/11 frames filmed".
    expect(attachTargets(take(), spine)).toEqual([]);
  });
  test("the OPEN FRAME is now the fallback — the row highlighted in Attached Clips", () => {
    expect(attachTargets(take(), spine, "q2")).toEqual(["q2"]);
  });
  test("coverage still wins — a run blast spans the frames it actually covered", () => {
    const t = take({ coverage: { startedAt: "", stoppedAt: "", frameIds: ["q1", "q2"] } });
    expect(attachTargets(t, spine, "q3")).toEqual(["q1", "q2"]);
  });
  test("an armed target still beats the open frame — it was an explicit instruction", () => {
    const t = take({ target: { kind: "ceq", ids: ["q1"] } });
    expect(attachTargets(t, spine, "q3")).toEqual(["q1"]);
  });
  test("an open frame that is not in this set is ignored, not attached to a ghost", () => {
    expect(attachTargets(take(), spine, "from-another-set")).toEqual([]);
  });
  test("the layout pseudo-frame is never an attach target", () => {
    // CeqStudio passes null for LAYOUT_Q0, so this can only ever be a real frame.
    expect(attachTargets(take(), spine, null)).toEqual([]);
  });
});

describe("detach and replace (Lee, 08-17)", () => {
  test("detach breaks the LINK only — the file survives, and the clip lands in scratch", () => {
    expect(studio).toContain("patchQ(frameId, { takes: clips.filter((_, i) => i !== idx) });");
    expect(studio).toContain("File untouched; Ctrl+Z re-attaches.");
    // Q0: detach now also guarantees a scratch record (migrates legacy clips) so
    // every clip is re-attachable — but it must still never touch a file.
    expect(studio).toContain("void ensureScratchRecord(gone).then");
    const fn = studio.slice(studio.indexOf("const detachClip ="), studio.indexOf("const clearAllClips ="));
    expect(fn).not.toContain("moveToRecycle");
    expect(fn).not.toContain("dropTakeRecord");
  });
  test("attach-latest takes the most recent KEPT + uploaded take, newest first", () => {
    expect(studio).toContain('const kept = currentTakes().filter((t) => t.status === "kept" && t.upload?.url && t.upload?.path);');
    expect(studio).toContain("const t = kept[0]; // currentTakes() is newest-first");
  });
  test("it refuses loudly rather than attaching an un-uploaded take", () => {
    expect(studio).toContain('No kept take has been uploaded yet — press F10 on one first.');
  });
  test("the attached clip carries its slate trim and orientation across", () => {
    expect(studio).toContain("...(t.slateEndMs != null ? { slateEndMs: t.slateEndMs } : {}), ...(t.orientation ? { orientation: t.orientation } : {})");
  });
});
