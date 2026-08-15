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
  test("the capture window snaps on open and re-snaps on focus; the badge hides on first key", () => {
    expect(previewer).toContain("window.setTimeout(() => snapCaptureSize(w), 120);");
    expect(previewer).toContain('const onKey = () => setHidden(true);');
    expect(previewer).toContain("if (!isCaptureExact(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1)) { snapCaptureSize(win);");
  });
  test("Recording Mode untouched: the recording key branch gained nothing from C1", () => {
    const rec = previewer.slice(previewer.indexOf("if (recording) {"), previewer.indexOf("// RECORDING MODE = the FILM POP-OUT"));
    expect(rec).not.toContain("requestFullscreen");
    expect(rec).not.toContain("CaptureBadge");
  });
});
