// PIPELINE TRIMS (P2) — waveforms, landmarks, handles, PROPOSE TRIMS.
//
// The detection and proposal math is PURE and tested directly here — the DOM
// decode (waveform-peaks.clipAudio) is the only untested seam, and it is a
// thin fetch+decode wrapper around frameAudio, which IS tested.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { detectSpeech, proposeTrim, snapMs, SNAP_RADIUS_MS } from "./landmarks";
import { frameAudio } from "./waveform-peaks";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");

// ---- frameAudio: bucketing ------------------------------------------------

describe("frameAudio", () => {
  test("peak and RMS land in the right frames", () => {
    // 100 samples/frame at 1000Hz+100ms frames; frame 1 carries a full-scale spike
    const ch = new Float32Array(300);
    ch[150] = 1.0;
    const { peaks, rms } = frameAudio(ch, 1000, 100);
    expect(peaks.length).toBe(3);
    expect(peaks[0]).toBe(0);
    expect(peaks[1]).toBe(1);
    expect(peaks[2]).toBe(0);
    expect(rms[1]).toBeCloseTo(Math.sqrt(1 / 100), 5);
  });
  test("a trailing partial frame divides by ITS length, not the full frame", () => {
    const ch = new Float32Array(150).fill(0.5); // 1.5 frames
    const { rms } = frameAudio(ch, 1000, 100);
    expect(rms.length).toBe(2);
    expect(rms[1]).toBeCloseTo(0.5, 5); // 50 samples of 0.5 → RMS 0.5, not diluted
  });
});

// ---- detectSpeech ---------------------------------------------------------

/** Build an RMS track: quiet floor with loud spans. 20ms frames. */
const track = (frames: number, loud: Array<[number, number]>, level = 0.2, floor = 0.002) => {
  const rms = new Float32Array(frames).fill(floor);
  for (const [a, b] of loud) for (let i = a; i < b; i++) rms[i] = level;
  return rms;
};

describe("detectSpeech", () => {
  test("onset is the FIRST sustained frame, offset the END of the last", () => {
    const rms = track(100, [[10, 40], [60, 90]]);
    const span = detectSpeech(rms, 20);
    expect(span.onsetMs).toBe(200);   // frame 10 × 20ms
    expect(span.offsetMs).toBe(1800); // frame 90's end
  });
  test("a single crackle frame is NOT speech — sustain gates it", () => {
    const rms = track(100, [[50, 51]]);
    expect(detectSpeech(rms, 20)).toEqual({ onsetMs: null, offsetMs: null });
  });
  test("THE 808 COUNTS AS AUDIO: a bass thump is pure energy, so it is onset", () => {
    // A 60Hz thump has no high-frequency content — energy detection cannot
    // tell it from a word, and per the prompt it MUST NOT try to.
    const rms = track(100, [[5, 9]]); // 80ms thump ≥ 60ms sustain
    expect(detectSpeech(rms, 20).onsetMs).toBe(100);
  });
  test("a silent clip yields nulls, and an empty track doesn't crash", () => {
    expect(detectSpeech(track(50, []), 20)).toEqual({ onsetMs: null, offsetMs: null });
    expect(detectSpeech(new Float32Array(0), 20)).toEqual({ onsetMs: null, offsetMs: null });
  });
  test("the threshold adapts to the clip's own noise floor", () => {
    // a NOISY room (floor 0.04): 0.1 speech is only 2.5× the floor — rejected
    const noisy = track(100, [[20, 80]], 0.1, 0.04);
    expect(detectSpeech(noisy, 20).onsetMs).toBe(null);
    // the same 0.1 level over a QUIET floor is unmistakable
    const quiet = track(100, [[20, 80]], 0.1, 0.002);
    expect(detectSpeech(quiet, 20).onsetMs).toBe(400);
  });
});

// ---- proposeTrim: in = onset − X, out = offset + Y ------------------------

describe("proposeTrim", () => {
  const span = { onsetMs: 2000, offsetMs: 8000 };
  test("the rule, verbatim: in = onset − X, out = offset + Y", () => {
    const p = proposeTrim(span, { durationS: 10, slateEndMs: null, preRollMs: 150, postRollMs: 250 });
    expect(p).toEqual({ inS: 1.85, outS: 8.25 });
  });
  test("the pre-roll can never dip inside the slate", () => {
    const p = proposeTrim(span, { durationS: 10, slateEndMs: 1950, preRollMs: 150, postRollMs: 250 });
    expect(p?.inS).toBe(1.95); // slate end wins over onset − X
  });
  test("the post-roll can never pass the real end of the clip", () => {
    const p = proposeTrim({ onsetMs: 2000, offsetMs: 9900 }, { durationS: 10, slateEndMs: null, preRollMs: 150, postRollMs: 250 });
    expect(p?.outS).toBe(10);
  });
  test("silence proposes NOTHING — cutting a whole clip is not a trim", () => {
    expect(proposeTrim({ onsetMs: null, offsetMs: null }, { durationS: 10, slateEndMs: null, preRollMs: 150, postRollMs: 250 })).toBe(null);
  });
});

// ---- snapMs: magnetic handles --------------------------------------------

describe("snapMs", () => {
  test("inside the radius the NEAREST landmark wins; outside, the hand does", () => {
    expect(snapMs(1050, [1000, 1120])).toBe(1000);
    expect(snapMs(1090, [1000, 1120])).toBe(1120);
    expect(snapMs(1000 + SNAP_RADIUS_MS + 1, [1000])).toBe(1000 + SNAP_RADIUS_MS + 1);
  });
  test("null landmarks (no slate, silent clip) are skipped, not zero", () => {
    expect(snapMs(60, [null, undefined])).toBe(60);
  });
});

// ---- contract pins --------------------------------------------------------

const studio = read("CeqStudio.tsx");
const strip = read("ClipTrimStrip.tsx");

describe("non-destructive by construction", () => {
  test("a handle writes the RECIPE item and nothing else", () => {
    // the strip's only output is onTrim; the studio's applyTrim turns it into a
    // recut of the stitch — no take mutation, no file operation anywhere.
    expect(strip).toContain('onTrim: (inS: number, outS: number, how: "drag" | "nudge") => void;');
    expect(strip).not.toContain("saveTake");
    expect(strip).not.toContain("patchQ");
    const apply = studio.slice(studio.indexOf("const applyTrim = "), studio.indexOf("/** PROPOSE TRIMS (P2)"));
    expect(apply).toContain("persistStitch(recut(pipelineStitch, { items }));");
    expect(apply).not.toContain("patchQ");
  });
  test("trim writes do NOT open the preview overlay — persistStitch has no setPreviewStitch", () => {
    const persist = studio.slice(studio.indexOf("const persistStitch = "), studio.indexOf("// PRE/POST-ROLL (P2)"));
    expect(persist).not.toContain("setPreviewStitch");
    // and the panel's own save still does both, through the same write path
    expect(studio).toContain("const saveStitch = (next: StitchDef) => { setPreviewStitch(next); persistStitch(next); };");
  });
});

describe("PROPOSE TRIMS writes against the LIVE recipe (review fix, 08-18)", () => {
  test("the post-await write reads the ref, not the click-time snapshot", () => {
    const pt = studio.slice(studio.indexOf("const proposeTrims = "), studio.indexOf("} finally { setProposeBusy(false); }"));
    expect(pt).toContain("const live = pipelineStitchRef.current;");
    expect(pt).toContain("persistStitch(recut(live, { items }));");
    // a clip hand-trimmed DURING the analysis window is not overwritten
    expect(pt).toContain("if (p && i.trimInS == null && i.trimOutS == null && !i.muted)");
    expect(studio).toContain("const pipelineStitchRef = useRef(pipelineStitch);");
  });
});

describe("PROPOSE TRIMS never auto-runs", () => {
  test("exactly one caller: its button", () => {
    // definition + the single onClick — a third occurrence means someone wired
    // it to an effect or a keep, which the prompt forbids.
    expect((studio.match(/proposeTrims/g) ?? []).length).toBe(2);
    expect(studio).toContain("onClick={proposeTrims}");
  });
  test("proposals are marked, and a hand adjustment clears the mark", () => {
    expect(studio).toContain("autoTrim: true");                 // propose marks
    expect(studio).toContain("autoTrim: undefined");            // drag/nudge clears
    expect(strip).toContain("autoTrim ? \"#FFB020\"");          // amber = auto, visibly distinct
  });
});

describe("the strip's contracts", () => {
  test("drag snaps to landmarks; nudges never snap (10ms precision is the point)", () => {
    expect(strip).toContain("snapMs(raw, [slateMs, span.onsetMs, span.offsetMs])");
    const nudge = strip.slice(strip.indexOf("const nudge = "), strip.indexOf("const handleColor"));
    expect(nudge).not.toContain("snapMs");
    expect(nudge).toContain("e.shiftKey ? 10 : 50");
  });
  test("px↔ms math uses the DECODED duration, not the 0.1s-rounded stored one", () => {
    expect(strip).toContain("(audio?.durationS ?? take.duration ?? 0) * 1000");
  });
});

describe("settings, not constants", () => {
  test("X and Y persist and feed the rule", () => {
    expect(studio).toContain('localStorage.getItem("sa-trim-preroll-ms")');
    expect(studio).toContain('localStorage.getItem("sa-trim-postroll-ms")');
    expect(studio).toContain("preRollMs, postRollMs });");
  });
});
