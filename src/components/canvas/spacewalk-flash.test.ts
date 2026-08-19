// SPACEWALK-FLASH FIX (08-19) — the background must not remount on navigation.
//
// Root cause (diagnosed before fixing): the film stack mounts every frame once
// and hands over by flipping a stand-in to active. The CARD was already stable
// (active + stand-in share the `qid`), but the active frame's BACKGROUND used a
// SHARED id `__frame__` while stand-ins used `fbg:<qid>`. Navigating swapped the
// arriving slot's background node id (fbg:<qid> → __frame__), so React Flow tore
// down and rebuilt the FrameBgNode → WorldBackground remounted and its glow/drift
// animations restarted from frame 0: the "whole frame refreshes" flash.
//
// The fix: in the film stack the active frame's background carries the SAME
// stable per-frame id the stand-ins use, so the node is identical before and
// after the seed and never remounts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8").split("\r\n").join("\n");
const previewer = read("CeqPreviewer.tsx");

describe("the active frame's background id is stable per frame (no remount on Space)", () => {
  test("in the film stack it uses `fbg:<qid>` — the SAME namespace as the stand-ins", () => {
    // the active frame background
    expect(previewer).toContain('const frameNode = { id: filmStack ? `fbg:${ceqId}` : "__frame__", type: "frameBg"');
    // the stand-in background for every OTHER frame — same `fbg:` scheme, so the
    // arriving slot's node id is identical whether it's a stand-in or active.
    expect(previewer).toContain('out.push({ id: `fbg:${qid}`, type: "frameBg"');
  });
  test("outside the stack (authoring) it stays the shared __frame__ — no stand-ins there", () => {
    expect(previewer).toContain('filmStack ? `fbg:${ceqId}` : "__frame__"');
  });
  test("fitActive frames the active background by its REAL id, not a dead __frame__", () => {
    // the recording surface is film-stack (via `recording`) with no popout, so it
    // relies on this fit — it must target the id the fix actually emits.
    expect(previewer).toContain('fitRef.current?.fitView({ nodes: [{ id: filmStack ? `fbg:${ceqId}` : "__frame__" }]');
  });
  test("filmStack is in the seed build's deps, so the id updates when the mode toggles", () => {
    expect(previewer).toContain("dealAnim, filmV2, filmWin, filmStack, fadeMs]);");
  });
});

describe("Step 3 — the transition is smooth, tunable, and GPU-only (opacity/transform)", () => {
  test("one duration setting (fadeMs) with an instant option, persisted", () => {
    expect(previewer).toContain('localStorage.getItem("sa-fade-ms")');
    expect(previewer).toContain('localStorage.setItem("sa-fade-ms"');
    expect(previewer).toContain("onClick={() => setFade(ms)}"); // the transport control
    expect(previewer).toContain('["off", 0]'); // instant option
  });
  test("the STACK card never re-animates (no 1→0→1 blink) — the pan is the transition", () => {
    // V1 stack card entrance is "none"; the camera glide carries the change.
    expect(previewer).toContain('filmStack ? "none"');
    expect(previewer).toContain("fitFilm(fadeMs <= 0 ? 0 : fadeMs);"); // the pan, duration = fadeMs
  });
  test("the pan is a viewport transform of tunable duration — instant when fadeMs 0", () => {
    expect(previewer).toContain("const fitFilm = useCallback((duration = 0) =>");
    expect(previewer).toContain("zoom }, { duration });");
    // the recording surface pans too, via the main RF fit
    expect(previewer).toContain("filmStack ? (fadeMs <= 0 ? 0 : fadeMs) : 0");
  });
  test("V2 stays a pure-opacity crossfade of the SAME tunable duration", () => {
    expect(previewer).toContain("v2Film ? `sa-ceq-v2-fade ${fadeMs}ms ease-out both`");
  });
});
