// BURN CAPTIONS — the stage that bakes Lee's subtitles into the pixels.
//
// This runs on Fly because Lee posts from a laptop with no repo and no ffmpeg. That is also why
// it is pinned hard: when a burn goes wrong it does not error, it quietly ships a video with no
// captions (a truncated filter) or the wrong font (libass falling back). Both failures exit 0.
import { describe, expect, test } from "bun:test";

import { BURN } from "./config";
import { assFilterPath, burnCaptionsArgs, planStage, validateSpec, type StagedFile } from "./stages";

const take: StagedFile = { path: "/tmp/job/in0.mp4", durationS: 182.4 };
const subs: StagedFile = { path: "/tmp/job/in1.ass", durationS: 0 };
const argv = (o?: Parameters<typeof burnCaptionsArgs>[3]) => burnCaptionsArgs(take, subs.path, "/tmp/job/out.mp4", o);

describe("the argv", () => {
  test("the subtitles are the video filter, and the font directory rides with them", () => {
    const a = argv().join(" ");
    expect(a).toContain(`-vf ass=/tmp/job/in1.ass:fontsdir=/app/fonts`);
    expect(a).toContain("-i /tmp/job/in0.mp4");
    expect(a.endsWith("/tmp/job/out.mp4")).toBe(true);
  });
  test("the audio is COPIED — never a second lossy generation", () => {
    const a = argv();
    expect(a.join(" ")).toContain("-c:a copy");
    expect(a).not.toContain("aac");
  });
  test("the video is re-encoded, faststart, at the house numbers", () => {
    const a = argv().join(" ");
    expect(a).toContain("-c:v libx264");
    expect(a).toContain(`-crf ${BURN.crf}`);
    expect(a).toContain(`-preset ${BURN.preset}`);
    expect(a).toContain("-pix_fmt yuv420p");
    expect(a).toContain("-movflags +faststart");
  });
  test("a slow preset is the default — a fast one smears exactly the text edges we are burning", () => {
    expect(BURN.preset).toBe("medium");
    expect(BURN.fontsDir).toBe("/app/fonts");
  });
  test("per-job overrides win", () => {
    const a = argv({ crf: 22, preset: "slow", fontsDir: "/other" }).join(" ");
    expect(a).toContain("-crf 22");
    expect(a).toContain("-preset slow");
    expect(a).toContain("fontsdir=/other");
  });
  test("no font directory leaves a clean filter rather than an empty value", () => {
    expect(argv({ fontsDir: "" }).join(" ")).toContain("-vf ass=/tmp/job/in1.ass");
    expect(argv({ fontsDir: "" }).join(" ")).not.toContain("fontsdir");
  });
});

describe("escaping — the silent failure", () => {
  test("a filter separator in the path is escaped, not left to truncate the filter", () => {
    expect(assFilterPath("/tmp/a,b.ass")).toBe("/tmp/a\\,b.ass");
    expect(assFilterPath("/tmp/a:b.ass")).toBe("/tmp/a\\:b.ass");
    expect(assFilterPath("/tmp/it's.ass")).toBe("/tmp/it\\'s.ass");
    expect(assFilterPath("/tmp/[1].ass")).toBe("/tmp/\\[1\\].ass");
  });
  test("an ordinary path is untouched", () => {
    expect(assFilterPath("/tmp/job/in1.ass")).toBe("/tmp/job/in1.ass");
  });
  test("a path with a comma still reaches ffmpeg whole", () => {
    const a = burnCaptionsArgs(take, "/tmp/a,b.ass", "/tmp/out.mp4").join(" ");
    expect(a).toContain("ass=/tmp/a\\,b.ass");
  });
});

describe("planStage", () => {
  test("it routes, taking the take first and the subtitles second", () => {
    const a = planStage({ kind: "burn_captions", input: "take", subs: "ass" }, [take, subs], "/tmp/out.mp4");
    expect(a.join(" ")).toContain("ass=/tmp/job/in1.ass");
  });
  test("a missing input fails loud rather than rendering an uncaptioned copy", () => {
    expect(() => planStage({ kind: "burn_captions", input: "take", subs: "ass" }, [take], "/tmp/out.mp4")).toThrow(/needs the take and the/);
    expect(() => planStage({ kind: "burn_captions", input: "take", subs: "ass" }, [], "/tmp/out.mp4")).toThrow();
  });
});

describe("validateSpec", () => {
  const spec = (stage: unknown) => ({
    v: 1,
    inputs: [{ id: "take", url: "https://x/y.mp4" }, { id: "ass", url: "https://x/y.ass" }],
    stages: [stage],
    output: { putUrl: "https://x/out" },
  });
  test("a well-formed burn passes", () => {
    expect(() => validateSpec(spec({ kind: "burn_captions", input: "take", subs: "ass" }))).not.toThrow();
  });
  test("an input the spec never declared is refused by name", () => {
    expect(() => validateSpec(spec({ kind: "burn_captions", input: "nope", subs: "ass" }))).toThrow(/unknown input "nope"/);
    expect(() => validateSpec(spec({ kind: "burn_captions", input: "take", subs: "nope" }))).toThrow(/unknown subs "nope"/);
  });
});
