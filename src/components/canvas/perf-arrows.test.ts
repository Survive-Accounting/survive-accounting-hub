// PERF-ARROW REWORK + COMPONENT CLIPBOARD — pins for the input fixes:
// Alt is the arrow tool (both modes persist), Ctrl+Alt+Click is boss, and
// Ctrl+C copies the SELECTED COMPONENT before it ever copies the frame.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");

describe("perf arrows — two ways, one result, everything persists", () => {
  test("drag mode persists on release (no Shift-to-keep mode anymore)", () => {
    const layer = previewer.slice(previewer.indexOf("const onDown = (e: React.PointerEvent)"), previewer.indexOf("const onHover"));
    expect(layer).toContain("if (moved) { add({ x1: p.x, y1: p.y, x2: q.x, y2: q.y }); setDraw(null); }");
    expect(layer).not.toContain("persist");
    expect(previewer).not.toContain("const persist = e.shiftKey");
  });
  test("tap-tap mode: click anchors, second Alt+click sets, preview tracks the cursor", () => {
    expect(previewer).toContain("pendingRef.current = p;");
    expect(previewer).toContain("if (Math.hypot(p.x - pending.x, p.y - pending.y) > CLICK_EPS) add({ x1: pending.x, y1: pending.y, x2: p.x, y2: p.y });");
    expect(previewer).toContain("onPointerMove={onHover}");
  });
  test("releasing Alt cancels a pending anchor (disarm = clean slate)", () => {
    expect(previewer).toContain("if (!e.altKey) { setArmed(false); pendingRef.current = null; setDraw(null); }");
  });
  test("` still clears all arrows; select+Delete still removes one", () => {
    expect(previewer).toContain("setPerfArrows([]); setSelPerf(null); clearExhibitHighlights();");
    expect(previewer).toContain("setPerfArrows((p) => p.filter((x) => x.id !== selPerf));");
  });
  test("the layer never arms under Ctrl — Ctrl+Alt+Click passes through to boss", () => {
    expect(previewer).toContain("setArmed(e.altKey && !e.ctrlKey && !e.metaKey)");
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
