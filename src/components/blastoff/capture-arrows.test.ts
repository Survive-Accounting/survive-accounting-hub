// THE CAPTURE ARROWS — the canvas's F1 tool on /v3/…/blast-off/film. Pins for the
// contract capture/arrows.tsx keeps with BlastOffCapture: which keys it claims, which
// it lets through, and that the arrow it draws IS the canvas's arrow.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function read(f: string): string {
  return readFileSync(join(import.meta.dir, f), "utf8").split("\r\n").join("\n");
}

const arrows = read("capture/arrows.tsx");
const capture = read("BlastOffCapture.tsx");

describe("capture arrows — the canvas's F1 tool on the capture surface", () => {
  test("one arrow on both surfaces: the SVG comes from the extracted canvas layer", () => {
    expect(arrows).toContain('from "@/components/canvas/PerfArrowLayer"');
    expect(arrows).toContain("<PerfArrowSvg ");
    expect(arrows).not.toContain("#FCA311"); // the colour is the layer's, never restated here
    expect(capture).toContain("<CaptureArrows hostRef={hostRef} frameId={frame.id} />");
  });
  test("F1 anchors at the last pointer position, F1 again sets — the pointer is tracked on the window, not hover", () => {
    expect(arrows).toContain('if (e.key !== "F1" || e.ctrlKey || e.metaKey || e.altKey) return;');
    expect(arrows).toContain('win.addEventListener("pointermove", onMove)');
    expect(arrows).toContain("cursorRef");
    expect(arrows).toContain("Math.hypot(c.x - p.x, c.y - p.y) > PERF_ARROW_CLICK_EPS"); // the canvas's same-point rule
  });
  test("Esc is claimed ONLY with an arrow half-drawn — otherwise it stays the capture's exit key", () => {
    // Capture phase on the window: ahead of the capture's own (bubble) window listener.
    expect(arrows).toContain('win.addEventListener("keydown", onKey, true)');
    expect(arrows).toContain('if (e.key === "Escape") {\n        if (!pendingRef.current) return;');
    expect(arrows).toContain("e.preventDefault(); e.stopImmediatePropagation(); cancel(); return;");
    // Exactly one stop, and it is the Esc one.
    expect((arrows.match(/stopImmediatePropagation/g) ?? []).length).toBe(1);
    expect(capture).toContain('else if (e.key === "Escape") { e.preventDefault(); onExit(); }'); // the handler it must not reach
  });
  test("` clears the arrows and is left to bubble into the capture's own wipe", () => {
    const tick = arrows.slice(arrows.indexOf('if (e.code === "Backquote"'), arrows.indexOf('if (e.key === "Delete"'));
    expect(tick).toContain("setArrows([])");
    expect(tick).not.toContain("stopPropagation");
    expect(tick).not.toContain("preventDefault");
    expect(capture).toContain('else if (e.code === "Backquote" || e.key === "`") { e.preventDefault(); resetTake(); }');
  });
  test("Delete / Backspace takes the most recent arrow back", () => {
    expect(arrows).toContain('if (e.key === "Delete" || e.key === "Backspace")');
    expect(arrows).toContain("if (pendingRef.current) cancel(); else setArrows((p) => p.slice(0, -1));");
  });
  test("arrows belong to the slide, and the layer never catches a pointer", () => {
    expect(arrows).toContain("useEffect(() => { pendingRef.current = null; setDraw(null); setArrows([]); }, [frameId]);");
    expect(arrows).toContain('pointerEvents: "none"');
    expect(arrows).toContain("hit={false}");
  });
  test("keys aimed at a field are ignored", () => {
    expect(arrows).toContain("if (typingIn(e.target)) return;");
    expect(arrows).toContain('el.tagName === "INPUT" || el.tagName === "TEXTAREA" || !!el.isContentEditable');
  });
  test("no data-sa-el ids (the usage manifest would have to declare them)", () => {
    expect(arrows).not.toContain("data-sa-el");
  });
  test("module-scope callables are hoisted functions (the render-path TDZ rule)", () => {
    const tdz = [...arrows.matchAll(/^(?:export )?const ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*(?::[^=]+)?=>|function\b|async\s*\()/gm)].map((m) => m[1]);
    expect(tdz).toEqual([]);
  });
});
