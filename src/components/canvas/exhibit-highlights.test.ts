// EXHIBIT HIGHLIGHTS (A3) regression tests — the glow may NEVER move a pixel,
// and the cycle card must stay a declaration (nodes + adjacency), not behavior.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { EXHIBIT_GLOW, toggleLit } from "./exhibit-highlights";

const cycleSrc = readFileSync(join(import.meta.dir, "cards", "CycleNode.tsx"), "utf8");
const previewerSrc = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8");

describe("toggleLit — multi-select is the whole teaching tool", () => {
  test("toggling on, on, on lights a 3-node run", () => {
    let lit: ReadonlySet<string> = new Set();
    for (const id of ["utb", "adj", "atb"]) lit = toggleLit(lit, id);
    expect([...lit].sort()).toEqual(["adj", "atb", "utb"]);
  });
  test("toggling a lit node clears just that node, never the rest", () => {
    const lit = toggleLit(new Set(["a", "b", "c"]), "b");
    expect([...lit].sort()).toEqual(["a", "c"]);
  });
  test("never mutates the input set", () => {
    const before = new Set(["a"]);
    toggleLit(before, "b");
    expect([...before]).toEqual(["a"]);
  });
});

describe("EXHIBIT_GLOW — purely visual, by construction", () => {
  test("its values are shadow/border/filter/opacity only — no transform, no scale, no size", () => {
    const all = Object.values(EXHIBIT_GLOW).join(" ");
    expect(all).not.toMatch(/transform|scale\(|translate|width|height/);
  });
});

describe("the cycle card declares, the shared layer behaves (source pins)", () => {
  test("pop-to-centre is GONE — the pill never moves, and never resizes the card", () => {
    // NARROWED 08-17 (tease mode): the banned thing is a pill that LEAVES ITS
    // POSITION or grows without bound, which is what resized the card mid-take.
    // A lit pill now scales in place by one capped constant; its translate is
    // still the plain centering offset, so its position is unchanged.
    expect(cycleSrc).not.toMatch(/popToCentre|bigScale|chainScale/);
    expect(cycleSrc).toContain("transform: `translate(-50%, -50%) scale(${ns.scale})`");
    // the ONLY scale in the card comes from the shared style — nothing bespoke
    expect([...cycleSrc.matchAll(/scale\(/g)]).toHaveLength(1);
  });
  test("the card no longer touches the spotlight system", () => {
    expect(cycleSrc).not.toMatch(/useSpotlight|SpotlightContext|toggleFlame/);
  });
  test("the number badges (1-9) are gone — order is taught with highlights now", () => {
    expect(cycleSrc).not.toContain("{i + 1}");
  });
  test("emphasis comes from the shared exhibit layer (via exhibit-base since the extraction)", () => {
    expect(cycleSrc).toContain("useExhibit(decl)");
    expect(cycleSrc).toContain("ex.edgeLit(s.id, placed[(i + 1) % n].id)");
    expect(cycleSrc).toContain("ex.nodeStyle(s.id)");
  });
  test("film click toggles glow (layer-owned); authoring click still edits", () => {
    expect(cycleSrc).toContain("ex.nodeClick(s.id)");
    expect(cycleSrc).toContain("setEditingStep(s.id)");
  });
});

describe("` clears highlights on every filming surface", () => {
  test("the film popout's reset includes exhibit highlights", () => {
    expect(previewerSrc).toContain("clearExhibitHighlights()");
  });
  test("the recording surface clears on plain ` (typing-guarded upstream)", () => {
    const recBranch = previewerSrc.slice(previewerSrc.indexOf("if (recording) {"), previewerSrc.indexOf("// RECORDING MODE = the FILM POP-OUT"));
    expect(recBranch).toContain("clearExhibitHighlights()");
  });
});
