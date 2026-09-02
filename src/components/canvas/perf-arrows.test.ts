// PERF-ARROW REWORK + COMPONENT CLIPBOARD — pins for the input fixes:
// Alt is the arrow tool (both modes persist), Ctrl+Alt+Click is boss, and
// Ctrl+C copies the SELECTED COMPONENT before it ever copies the frame.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");

// PERF ARROWS ARE AN F1 TOOL NOW (Lee, 2026-09-01). They used to be armed by
// ALT, which cost Alt for everything else and meant a stray alt-drag drew an
// orange line across a take. Alt is picking cards up; the arrow tool is F1.
//
// The tap-tap SHAPE is unchanged and still pinned below — it was the good part.
// What changed is the trigger and, importantly, that the layer is pointer-inert
// unless an anchor is pending, so it can never intercept a card gesture again.
describe("perf arrows — F1 tap-tap, pointer-inert when idle", () => {
  test("F1 anchors, F1 again sets — and F1's browser help is suppressed", () => {
    expect(previewer).toContain('if (e.key !== "F1" || e.ctrlKey || e.metaKey || e.altKey) return;');
    expect(previewer).toContain("e.preventDefault();                       // F1 is the browser's help key");
    expect(previewer).toContain("if (!pending) { pendingRef.current = c; setArmed(true);");
    expect(previewer).toContain("if (Math.hypot(c.x - pending.x, c.y - pending.y) > CLICK_EPS) add({ x1: pending.x, y1: pending.y, x2: c.x, y2: c.y });");
  });
  test("ALT no longer arms the arrow layer — it belongs to moving cards", () => {
    const layer = previewer.slice(previewer.indexOf("function PerfArrowLayer"), previewer.indexOf("function Inner("));
    // Alt must never ARM the tool, and must never gate the pointer handler.
    expect(layer).not.toContain("setArmed(e.altKey");
    expect(layer).not.toContain("if (!e.altKey");
    // The only permitted mention is the guard that stops Alt+F1 from firing it,
    // so Alt-anything stays free for moving cards.
    expect(layer).toContain('if (e.key !== "F1" || e.ctrlKey || e.metaKey || e.altKey) return;');
    // And no doc left claiming the old Alt gesture.
    expect(layer).not.toContain("Alt+DRAG");
    expect(layer).not.toContain("Alt+CLICK");
  });
  test("the layer is pointer-inert with nothing pending, so it cannot eat a card click", () => {
    const layer = previewer.slice(previewer.indexOf("function PerfArrowLayer"), previewer.indexOf("function Inner("));
    expect(layer).toContain('pointerEvents: armed ? "auto" : "none"');
    // onDown bails immediately unless an anchor is already waiting.
    expect(layer).toContain("const pending = pendingRef.current;\n    if (!pending) return;");
  });
  test("Esc or ` cancels a pending anchor (clean slate)", () => {
    expect(previewer).toContain('if (e.key === "Escape" || e.key === "`" || e.code === "Backquote") { if (pendingRef.current) cancel(); return; }');
  });
  test("the cursor is tracked on the DOCUMENT, since an inert layer sees no pointer events", () => {
    expect(previewer).toContain('doc.addEventListener("pointermove", pm)');
    expect(previewer).toContain("cursorRef");
  });
  test("` still clears all arrows; select+Delete still removes one", () => {
    expect(previewer).toContain("setPerfArrows([]); setSelPerf(null); clearExhibitHighlights();");
    expect(previewer).toContain("setPerfArrows((p) => p.filter((x) => x.id !== selPerf));");
  });
});

describe("component clipboard — copy the edited component, not the frame", () => {
  test("the previewer reports the selected STAGED element", () => {
    expect(previewer).toContain("onSelectStageEl?.((sel.find((nd) => !!(nd.data as { stage?: unknown } | undefined)?.stage)?.id) ?? null);");
  });
  test("Ctrl+C priority: chain memos → selected component → SPINE-selected frames (never the open frame implicitly)", () => {
    expect(studio).toContain("else if (selStageEl) copyStageElement(selStageEl); else if (qSel.size > 0) copyFrames([...qSel]);");
    expect(studio).toContain("The open frame is no longer copied implicitly");
  });
  test("frames paste BELOW the selected spine row, reindexed, one undo", () => {
    expect(studio).toContain("const at = (selIdx.length ? Math.max(...selIdx) : openIdx >= 0 ? openIdx : questions.length - 1) + 1;");
    expect(studio).toContain('patchDataCmd(rfl, q.id, { stageOrder: at + qClip.length + i }, "reorder")');
  });
  test("frame copies carry full fidelity: noteOnly, callout, run, STEM chains", () => {
    expect(studio).toContain("pull(d.stemChain, -1);");
    expect(studio).toContain("noteOnly: d.noteOnly, callout: d.callout ? structuredClone(d.callout) : undefined, run: d.run");
  });
  test("Ctrl+V pastes the most recent copy; a copied component lands on the OPEN frame", () => {
    expect(studio).toContain('if (lastClipRef.current === "el" && elClip && qId && qId !== LAYOUT_Q0) pasteStageElement();');
  });
  test("the paste is the EXACT edited form — deep-cloned, stage retargeted by stageCardData", () => {
    expect(studio).toContain("stageCardData(structuredClone(elClip.data)");
  });
});
