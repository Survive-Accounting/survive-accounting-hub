// PIPELINE TIMELINE (Q1) — the editing room: no spine, capture as a modal, a
// large cut preview, and a single HORIZONTAL track you scrub/seek/reorder.
//
// The seek math is PURE and tested directly; the layout contracts are pinned.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { seekTarget, segmentStartsMs, seqSeek, type SeqSegment } from "./cut-sequencer";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");
const studio = read("CeqStudio.tsx");
const stage = read("PipelineStage.tsx");

const seg = (inS: number, outS: number, gapAfterMs = 0): SeqSegment => ({ inS, outS, gapAfterMs, url: "u", name: "n" });

describe("segmentStartsMs", () => {
  test("cumulative starts include trims AND gaps", () => {
    // clip A: 2s content + 500ms gap; clip B: 1s content
    expect(segmentStartsMs([seg(0, 2, 500), seg(0, 1)])).toEqual([0, 2500]);
  });
  test("empty cut has no starts", () => {
    expect(segmentStartsMs([])).toEqual([]);
  });
});

describe("seekTarget — global ms → (segment, seconds inside it)", () => {
  const segs = [seg(1, 3, 400), seg(0, 2)]; // A: play 1→3 (2s) +400ms gap, B: 0→2
  test("a point inside clip A maps to inS + offset", () => {
    expect(seekTarget(segs, 500)).toEqual({ index: 0, seekS: 1.5 }); // 0.5s into A → 1s in + 0.5
  });
  test("a point inside clip B maps past the gap", () => {
    // B starts at 2000+400 = 2400ms; 3000ms → 600ms into B → 0.6s
    expect(seekTarget(segs, 3000)).toEqual({ index: 1, seekS: 0.6 });
  });
  test("a point landing IN the gap resolves to the start of the next clip", () => {
    // gap is 2000..2400ms; 2200 → clip B at its in point
    expect(seekTarget(segs, 2200)).toEqual({ index: 1, seekS: 0 });
  });
  test("past the end clamps to the last clip; empty cut is null", () => {
    expect(seekTarget(segs, 99_999)?.index).toBe(1);
    expect(seekTarget([], 100)).toBe(null);
  });
});

describe("seqSeek clamps into the clip's trimmed span", () => {
  test("a seek before in or after out is pulled back inside", () => {
    const segs = [seg(1, 3)];
    expect(seqSeek(segs, 0, 0.2).action).toMatchObject({ kind: "load", seekS: 1 });   // < in → in
    expect(seqSeek(segs, 0, 9).action).toMatchObject({ kind: "load", seekS: 3 });      // > out → out
    expect(seqSeek(segs, 0, 2).action).toMatchObject({ kind: "load", seekS: 2 });      // inside → itself
  });
});

describe("the editing room, not the filming room", () => {
  test("the frame spine is DROPPED from the Pipeline view", () => {
    expect(studio).toContain("{!filming && (\n              <SetFilmstrip");
  });
  test("the capture window is a MODAL, kept mounted so the OBS popout survives", () => {
    // display toggles; the previewer is never unmounted by open/close
    expect(studio).toContain("display: captureOpen ? \"flex\" : \"none\"");
    expect(studio).toContain("{filming && !recording && (");
    expect(studio).toContain("onOpenCapture={() => setCaptureOpen(true)}"); // a button opens it
    // the inline authoring previewer is filming-gated off (it's in the modal now)
    expect(studio).toContain("{!recording && !filming && renderPreviewer(false)}");
  });
});

describe("the timeline is a single track, not an NLE", () => {
  test("one horizontal row, sized by trimmed duration, scrolls horizontally", () => {
    expect(stage).toContain("overflow-x-auto");
    expect(stage).toContain("const widthOf = (c: { inS: number; outS: number }) => Math.max(MIN_W, (c.outS - c.inS) * PX_PER_S);");
    expect(stage).not.toContain("track2"); // single track — no second layer
  });
  test("drag reorders / inserts; click seeks; detach returns to scratch — all via the P3 ops", () => {
    expect(stage).toContain("onMoveClip({ frameId: p.frameId, index: p.index }, tgt.frameId, tgt.index)"); // reorder/move
    expect(stage).toContain("onDropTake(p.id, tgt.frameId, tgt.index)"); // scratch take insert
    expect(stage).toContain("player.playFromMs("); // click-to-seek
    expect(studio).toContain("onMoveClip={(from, toFrameId, at) => moveClip(from, toFrameId, at)}");
    expect(studio).toContain("onDetach={(frameId, index) => detachClip(frameId, index)}");
  });
  test("the frame-bar label is the door to AUTHORING (the marker row is gone — 08-20)", () => {
    expect(stage).toContain("onClick={() => onAuthorFrame(f.id)}");
    expect(stage).not.toContain("markerRuns"); // the redundant strip under the scrubber
    const fn = studio.slice(studio.indexOf("const authorFrame ="), studio.indexOf("const stageTrueRender ="));
    expect(fn).toContain("setFilming(false);");
    expect(fn).toContain("setQId(frameId);");
  });
  test("TRUE RENDER reads as the FINAL bake, not the iteration loop", () => {
    expect(stage).toContain("final bake · lock timing first");
  });
});

describe("the editing room reshaped (Lee, 08-20)", () => {
  test("segments are PADDED apart, and offsets/playhead/seek all share the gapped space", () => {
    expect(stage).toContain("const GAP_PX = 10;");
    expect(stage).toContain("o.push(a); a += w + GAP_PX;"); // gaps live in the ONE offsets array
  });
  test("edge handles trim ON RELEASE, no confirmation — through the studio's applyTrim door", () => {
    expect(stage).toContain('const startHandle = (which: "in" | "out") =>');
    expect(stage).toContain("if (Math.abs(v - base) > 0.005) onTrim("); // release commits; drag back = revert
    expect(stage).toContain("onTrim={c.split ? null : (inS, outS) => onTrimClip(c.path, inS, outS)}"); // split clips: handles off (path-keyed trims would clobber both halves)
    expect(studio).toContain('onTrimClip={(path, inS, outS) => applyTrim(path, inS, outS, "drag")}');
    // OUT can extend past the current trim, bounded by the SOURCE duration
    expect(stage).toContain("durS: number;");
  });
  test("hovering a tile pulls its neighbours apart so either edge is easy to pick", () => {
    expect(stage).toContain("shift={hoverIdx == null || i === hoverIdx ? 0 : i < hoverIdx ? -5 : 5}");
  });
  test("each segment draws its own waveform from the shared audio cache", () => {
    expect(stage).toContain("function ClipWave(");
    // ONE decode per tile since #7: the tile loads it, the wave and the
    // snap landmarks both read it.
    expect(stage).toContain("clipAudio(clip.path, clip.url)");
  });
  test("the transcript panel lives in the stage: click seeks the CUT player, Delete cuts", () => {
    expect(stage).toContain("function TranscriptPanel(");
    expect(stage).toContain("transcriptFor(path)");
    expect(stage).toContain('if ((e.key === "Delete" || e.key === "Backspace") && range)');
    expect(studio).toContain("onCutClip={(path, a, b) => splitClipAt(path, a, b)}");
    // words the trims already dropped render struck-through, not clickable
    expect(stage).toContain("const gone = w.e <= clip.inS + 0.001 || w.s >= clip.outS - 0.001;");
  });
  test("clicking the track PARKS the cursor; Space plays/pauses from it (08-20)", () => {
    expect(stage).toContain("const positionAtPx = (clientX: number) => {");
    expect(stage).toContain("setCursorMs(startsMs[i] + within * contentMs);"); // park, don't play
    expect(stage).toContain("if (hidden || e.defaultPrevented) return;");
    expect(stage).toContain("if (isSpace && e.repeat) return;");
    expect(stage).toContain("if (playingRef.current) { setCursorMs(posRef.current); stopRef.current(); }");
    expect(stage).toContain("else playFromMsRef.current(cursorRef.current);");
    // ONE line: live playhead while playing, parked cursor while not
    expect(stage).toContain("const headPx = player.state.playing ? playheadPx : cursorPx;");
  });
  test("the dead middle is gone: the authoring column never renders during filming", () => {
    expect(studio).toContain("{!filming && (\n              <div className=\"flex min-h-0 flex-1 flex-col\">");
  });
  test("arrows nudge the PARKED cursor (50ms / shift 500ms); playback keeps its clock", () => {
    expect(stage).toContain('const isArrow = e.key === "ArrowLeft" || e.key === "ArrowRight";');
    expect(stage).toContain("if (playingRef.current) return; // arrows park-hunt; playback keeps its clock");
    expect(stage).toContain('const step = (e.shiftKey ? 500 : 50) * (e.key === "ArrowLeft" ? -1 : 1);');
  });
  test("a released edge handle SNAPS to the nearest speech boundary; the drag stays free", () => {
    expect(stage).toContain("const snapLandmarksMs = useMemo(() => (audio ? speechSpans(audio.rms, audio.frameMs).flatMap((s) => [s.startMs, s.endMs]) : []), [audio]);");
    expect(stage).toContain("const v = clampV(snapMs(raw * 1000, snapLandmarksMs) / 1000);");
    const move = stage.slice(stage.indexOf("const move = (ev: PointerEvent) => setDrag"), stage.indexOf("const up = (ev: PointerEvent) => {"));
    expect(move).not.toContain("snapMs"); // mid-drag stays free — only the release snaps
  });
  test("SILENCE SWEEP cuts through the ONE split door, against the live recipe, undoable", () => {
    const sweep = studio.slice(studio.indexOf("const sweepSilences = "), studio.indexOf("const undoSweep = "));
    expect(sweep).toContain("silenceCuts(spans, { inS, outS, minSilenceMs: minSilenceS * 1000, preRollMs, postRollMs })");
    expect(sweep).toContain("parts.flatMap((p) => splitAroundCut(p, take, c.startS, c.endS))");
    expect(sweep).toContain("const live = pipelineStitchRef.current;"); // never the click-time snapshot
    expect(sweep).toContain("sweepBackupRef.current = live.items;");    // one-click undo
    expect(sweep).not.toContain("moveToRecycle"); // recipe only, never a file op
  });
  test("AUTO-TRANSCRIBE: timeline clips without words are enqueued once, via the toggle-gated queue", () => {
    expect(studio).toContain("void transcriptFor(c.path).then((r) => { if (!r) enqueueTranscription(c.path, c.url, c.name); }");
    expect(studio).toContain("txSweepRef.current.add(c.path);"); // once per session, not per render
  });
  test("PUBLISH FROM THE PIPELINE renders the RECIPE through the trim-aware worker door", () => {
    const pub = studio.slice(studio.indexOf("const doPipePublish = "), studio.indexOf("/** P3: an attachable TakeRef"));
    expect(pub).toContain("trims: tl.segments.map((s) => ({ start: s.inS, end: s.outS }))"); // trims + silence cuts reach the render
    expect(pub).toContain("startDissectStitch(");
    expect(pub).toContain("startPipelineTestAuphonic({ data: { fileUrl } });"); // mastered, same pipeline as publish
    expect(pub).toContain('const lessonId = targetLesson(access)!;');            // site kinds attach to the lesson → Videos
    expect(pub).toContain('savePub({ ...pub, stitchRev, state: "shipped"');      // the publication record, kind-first
    expect(pub).toContain('savePub({ ...pub, stitchRev, state: "rendered"');     // a short stops at the mastered file
  });
  test("publish gates run the REAL publishGate — shorts must be vertical, site needs a lesson", () => {
    const gatesFn = studio.slice(studio.indexOf("const pipeGates = "), studio.indexOf("const doPipePublish = "));
    expect(gatesFn).toContain("publishGate(pub, pipelineStitch, {");
    expect(gatesFn).toContain("clipOrientations: ors,");
    expect(studio).toContain('destinations: kind === "short" ? ["youtube"] : ["site"],');
    expect(studio).toContain('framing: kind === "short" ? "9:16" : "16:9",');
  });
  test("fine trim is OPT-IN; the toolbar and the take rail both collapse for focus", () => {
    expect(studio).toContain("return fineTrimOpen && sel && t ? (");
    expect(studio).toContain('localStorage.getItem("sa-pipe-tools")');
    expect(studio).toContain('localStorage.getItem("sa-inbox-collapsed")');
    // the collapsed rail is VISUAL — the inbox component never unmounts (P0 law)
    expect(read("TakesInbox.tsx")).toContain("{inline && collapsed ? (");
  });
});

describe("blast drop — one clip across many frames via checkboxes", () => {
  test("a frame bar with per-frame checkboxes + an ALL toggle; drop requires a check", () => {
    expect(stage).toContain("const [frameSel, setFrameSel] = useState<Set<string>>(new Set());");
    expect(stage).toContain("setFrameSel(allChecked ? new Set() : new Set(frames.map((f) => f.id)))"); // ALL toggle
    expect(stage).toContain("onClick={() => toggleFrame(f.id)}"); // per-frame checkbox
    expect(stage).toContain("onDropTakeToFrames(p.id, [...frameSel])"); // drop → checked frames
  });
  test("the studio attaches it as ONE clip with coversFrameIds when >1 frame is checked", () => {
    const fn = studio.slice(studio.indexOf("const dropTakeToFrames ="), studio.indexOf("const moveClip ="));
    expect(fn).toContain("if (!ids.length) { setNote(\"Check at least one frame first"); // required
    expect(fn).toContain("const clip = ids.length > 1 ? { ...ref, coversFrameIds: ids } : ref;");
    expect(fn).toContain("patchQ(first, { takes: [...cardClips(d), clip] });"); // lives once, on the first frame
    expect(studio).toContain("onDropTakeToFrames={(id, frameIds) => dropTakeToFrames(id, frameIds)}");
  });
});
