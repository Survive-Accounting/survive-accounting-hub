// DISSECT STITCH — guards the pure half: silence parsing, trim decisions
// (incl. the two real-world shapes Lee flagged: long dead air and clipped-
// tight ends), deterministic gap rhythm, graph construction, manifest math.
import { describe, expect, test } from "bun:test";

import { DISSECT_DEFAULTS, detectSilenceArgs, dissectStitchArgs, gapForJoin, parseSilence, trimFromSilence } from "./dissect-stitch";
import type { StagedFile } from "./stages";

const f = (durationS: number, i = 0, hasAudio = true): StagedFile => ({ path: `/tmp/clip-${i}.mp4`, durationS, hasAudio });
const graphOf = (args: string[]) => args[args.indexOf("-filter_complex") + 1];

describe("silence detection plumbing", () => {
  test("detect argv targets the null muxer with the requested floor", () => {
    const a = detectSilenceArgs("/tmp/x.mp4", -38, 0.2);
    expect(a).toContain("silencedetect=n=-38dB:d=0.2");
    expect(a.slice(-2)).toEqual(["null", "-"]);
  });
  test("parseSilence reads start/end pairs and leaves an open tail as Infinity", () => {
    const err = [
      "[silencedetect @ 0x1] silence_start: 0",
      "[silencedetect @ 0x1] silence_end: 1.84 | silence_duration: 1.84",
      "[silencedetect @ 0x1] silence_start: 9.2",
    ].join("\n");
    expect(parseSilence(err)).toEqual([{ start: 0, end: 1.84 }, { start: 9.2, end: Infinity }]);
  });
});

describe("trimFromSilence — the two real-world shapes", () => {
  test("LONG DEAD AIR: head and tail silences trim off; padding keeps a held pause", () => {
    const iv = [{ start: 0, end: 2.5 }, { start: 11.0, end: Infinity }];
    expect(trimFromSilence(iv, 12)).toEqual({ start: 2.5, end: 11.0 });
    expect(trimFromSilence(iv, 12, { padHeadS: 0.3, padTailS: 0.5 })).toEqual({ start: 2.2, end: 11.5 });
  });
  test("CLIPPED-TIGHT ENDS: no edge silence ⇒ the clip is untouched", () => {
    expect(trimFromSilence([{ start: 4, end: 5 }], 10)).toEqual({ start: 0, end: 10 }); // interior pause ≠ dead air
    expect(trimFromSilence([], 7.3)).toEqual({ start: 0, end: 7.3 });
  });
  test("a wrong guess that would leave almost nothing falls back to the FULL clip", () => {
    expect(trimFromSilence([{ start: 0, end: 5.9 }], 6)).toEqual({ start: 0, end: 6 });
  });
});

describe("gapForJoin — human rhythm, deterministic", () => {
  test("every gap is within base±jitter, reproducible, and not metronomic", () => {
    const gaps = Array.from({ length: 8 }, (_, k) => gapForJoin(k));
    for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(125); expect(g).toBeLessThanOrEqual(275); }
    expect(Array.from({ length: 8 }, (_, k) => gapForJoin(k))).toEqual(gaps); // same job ⇒ same rhythm
    expect(new Set(gaps).size).toBeGreaterThan(1); // never a metronome
  });
});

describe("dissectStitchArgs — the graph and the manifest", () => {
  const clips = [f(10, 0), f(8, 1), f(12, 2)];
  const trims = [{ start: 1, end: 9 }, { start: 0, end: 8 }, { start: 0.5, end: 11.5 }];
  const gapsS = [0.2, 0.25];

  test("video: per-clip trim, gap freeze on all but the last, hard concat (no xfade)", () => {
    const g = graphOf(dissectStitchArgs(clips, trims, "/tmp/out.mp4", { gapsS }).args);
    expect(g).toContain("trim=start=1:end=9");
    expect(g).toContain("tpad=stop_mode=clone:stop_duration=0.2");
    expect(g).toContain("tpad=stop_mode=clone:stop_duration=0.25");
    expect((g.match(/tpad/g) ?? []).length).toBe(2); // never on the last clip
    expect(g).toContain("concat=n=3:v=1:a=0[vout]");
    expect(g).not.toContain("xfade");
  });
  test("audio: loudnorm to one target, micro-fade envelopes, 2N-1 concat", () => {
    const g = graphOf(dissectStitchArgs(clips, trims, "/tmp/out.mp4", { gapsS }).args);
    expect((g.match(/loudnorm=I=-16:TP=-1\.5:LRA=11/g) ?? []).length).toBe(3);
    expect(g).toContain(`afade=t=in:d=${DISSECT_DEFAULTS.jointFadeS}`);
    expect(g).toContain("concat=n=5:v=0:a=1[aout]");
  });
  test("room tone fills the gaps (asplit + aloop) with the longer blend", () => {
    const g = graphOf(dissectStitchArgs(clips, trims, "/tmp/out.mp4", { gapsS, roomTone: f(3, 9) }).args);
    expect(g).toContain("asplit=2[rt0][rt1]");
    expect(g).toContain("aloop=loop=-1");
    expect(g).toContain(`afade=t=in:d=${DISSECT_DEFAULTS.toneBlendS}`);
    expect(g).not.toContain("anoisesrc");
  });
  test("no room tone ⇒ the low pink floor, never digital silence", () => {
    const g = graphOf(dissectStitchArgs(clips, trims, "/tmp/out.mp4", { gapsS }).args);
    expect(g).toContain("anoisesrc");
    expect(g).toContain("amplitude=0.0006");
  });
  test("MANIFEST: chapter offsets are cumulative trimmed durations + gaps, exact", () => {
    const { manifest } = dissectStitchArgs(clips, trims, "/tmp/out.mp4", { gapsS, roomTone: f(3, 9) });
    expect(manifest.clips).toEqual([
      { startS: 0, durS: 8 },
      { startS: 8.2, durS: 8 },       // 8 + 0.2
      { startS: 16.45, durS: 11 },    // 8 + 0.2 + 8 + 0.25
    ]);
    expect(manifest.totalS).toBe(27.45);
    expect(manifest.roomTone).toBe(true);
  });
  test("a single clip still trims + normalizes, with no gaps and no concat", () => {
    const { args, manifest } = dissectStitchArgs([f(10, 0)], [{ start: 2, end: 9 }], "/tmp/out.mp4");
    const g = graphOf(args);
    expect(g).not.toContain("concat");
    expect(g).not.toContain("tpad");
    expect(manifest.clips).toEqual([{ startS: 0, durS: 7 }]);
    expect(manifest.totalS).toBe(7);
  });
  test("mute clips become exact-length silence instead of failing the stitch", () => {
    const g = graphOf(dissectStitchArgs([f(5, 0), f(6, 1, false)], [{ start: 0, end: 5 }, { start: 0, end: 6 }], "/tmp/o.mp4", { gapsS: [0.2] }).args);
    expect(g).toContain("anullsrc");
  });
});
