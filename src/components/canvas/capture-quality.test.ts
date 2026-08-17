// CAPTURE QUALITY (C1/C2) — pixel-perfect OBS capture + encoder-friendly film.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { CAPTURE_H, CAPTURE_W, captureCssSize, isCaptureExact, physicalSize } from "./capture-window";

const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8");

describe("capture sizing math (C1)", () => {
  test("common Windows scalings divide to exact 1920x1080 physical", () => {
    expect(captureCssSize(1)).toEqual({ w: 1920, h: 1080, exact: true });     // 100%
    expect(captureCssSize(1.25)).toEqual({ w: 1536, h: 864, exact: true });   // 125%
    expect(captureCssSize(1.5)).toEqual({ w: 1280, h: 720, exact: true });    // 150%
    expect(captureCssSize(2)).toEqual({ w: 960, h: 540, exact: true });       // 200%
  });
  test("the badge reads PHYSICAL pixels and refuses near-misses", () => {
    expect(physicalSize(1536, 864, 1.25)).toEqual({ w: CAPTURE_W, h: CAPTURE_H });
    expect(isCaptureExact(1536, 864, 1.25)).toBe(true);
    expect(isCaptureExact(1535, 864, 1.25)).toBe(false); // one CSS px off = red badge
  });
  test("a degenerate dpr never divides by zero", () => {
    expect(captureCssSize(0).w).toBe(1920);
  });
});

describe("the stable-wrapper fullscreen + capture window (C1 source pins)", () => {
  test("fullscreen targets the film-mode container that never unmounts — frames swap INSIDE it", () => {
    expect(previewer).toContain('<div ref={filmRootRef} className="film-mode"');
    expect(previewer).toContain("el.requestFullscreen()");
  });
  test("F toggles it at the film-controller level, film windows only", () => {
    expect(previewer).toContain('if (filmWindow && (e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey)');
  });
  test("the capture window snaps on open (ITERATING) and re-snaps on focus; the badge hides on first key", () => {
    // orientation-aware since vertical filming: the snap target is 1080x1920 in 9:16
    expect(previewer).toContain("snapCaptureSize(w, (ok, why) => setCaptureNote(ok ? null : why ?? null), o)");
    expect(previewer).toContain('const onKey = () => setHidden(true);');
    expect(previewer).toContain("if (!isCaptureExact(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1, o)) { snapCaptureSize(win, undefined, o);");
  });
  test("the capture window gets its OWN name — never inherits a stale film window's size", () => {
    expect(previewer).toContain('openPopoutWindow(capture ? "ceqcapture" : "ceqfilm"');
  });
  test("BLACK-ON-ADVANCE: the film camera measures the PANE, not the window", () => {
    // In element fullscreen the window's inner size never changes — sizing the
    // camera from it put the frame outside the real viewport (a black screen).
    expect(previewer).toContain("const r = filmRootRef.current?.getBoundingClientRect();");
    expect(previewer).toContain("const w = Math.round(r?.width || win.innerWidth), h = Math.round(r?.height || win.innerHeight);");
    expect(previewer).toContain("if (filmRootRef.current) ro.observe(filmRootRef.current);");
  });
  test("Recording Mode untouched: the recording key branch gained nothing from C1", () => {
    const rec = previewer.slice(previewer.indexOf("if (recording) {"), previewer.indexOf("// RECORDING MODE = the FILM POP-OUT"));
    expect(rec).not.toContain("requestFullscreen");
    expect(rec).not.toContain("CaptureBadge");
  });
});

describe("anti-banding (C2 source pins)", () => {
  test("the grain exists once, in the FILM branch only, at imperceptible opacity", () => {
    expect((previewer.match(/FILM_GRAIN_URI/g) ?? []).length).toBe(2); // const + one use
    const filmBranch = previewer.slice(previewer.indexOf("if (film) return ("), previewer.indexOf("  return (\n    <div style={{ width: d.w, height: d.h, borderRadius: 12"));
    expect(filmBranch).toContain("backgroundImage: FILM_GRAIN_URI");
    expect(filmBranch).toContain("opacity: 0.015");
  });
  test("filmed positions land on integer pixels — no fractional-pixel text blur", () => {
    expect(previewer).toContain("position: { x: Math.round(cs.x), y: Math.round(yOff + cs.y) }");
    expect(previewer).toContain("position: { x: Math.round(geom.x), y: Math.round(yOff + geom.y) }");
    expect(previewer).toContain("position: { x: Math.round(dd.stage.x), y: Math.round(yOff + dd.stage.y) }");
  });
});
