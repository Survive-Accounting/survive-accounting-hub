// EXHIBIT BASE — pins for the shared layer's laws and the declaration model.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { declaredAdjacent, type ExhibitDeclaration } from "./exhibit-base";
import { EXHIBIT_GLOW } from "./exhibit-highlights";

const cycleSrc = readFileSync(join(import.meta.dir, "cards", "CycleNode.tsx"), "utf8").split("\r\n").join("\n");
const baseSrc = readFileSync(join(import.meta.dir, "exhibit-base.tsx"), "utf8").split("\r\n").join("\n");
const demoSrc = readFileSync(join(import.meta.dir, "..", "..", "routes", "exhibit-demo.tsx"), "utf8").split("\r\n").join("\n");

describe("declaredAdjacent — adjacency from declarations", () => {
  const ring: ExhibitDeclaration = { minWidth: 1, minHeight: 1, nodes: ["a", "b", "c"], adjacency: "ring" };
  test("ring: neighbors both ways, wrapping, non-neighbors excluded", () => {
    expect(declaredAdjacent(ring, "a", "b")).toBe(true);
    expect(declaredAdjacent(ring, "b", "a")).toBe(true);
    expect(declaredAdjacent(ring, "c", "a")).toBe(true); // wraps
    expect(declaredAdjacent({ ...ring, nodes: ["a", "b", "c", "d"] }, "a", "c")).toBe(false);
  });
  test("explicit pairs are order-insensitive; unknown nodes never adjacent", () => {
    const t: ExhibitDeclaration = { minWidth: 1, minHeight: 1, nodes: ["dr", "cr"], adjacency: [["dr", "cr"]] };
    expect(declaredAdjacent(t, "cr", "dr")).toBe(true);
    expect(declaredAdjacent(t, "dr", "zz")).toBe(false);
  });
  test("no declaration = no edge glow, ever", () => {
    expect(declaredAdjacent({ minWidth: 1, minHeight: 1 }, "a", "b")).toBe(false);
  });
});

describe("the layer's laws (source pins)", () => {
  test("nodeStyle never changes the CARD's box — no size, no position, no layout", () => {
    // NARROWED 08-17 (tease mode). The law was written after a pop-to-centre
    // transform RESIZED THE CARD mid-take, and that is still what it protects:
    // emphasis may not touch width/height/top/left/translate. Tease mode adds a
    // bounded `scale` on the NODE — a transform on an absolutely-positioned pill,
    // which cannot change the card's box — so the ban is now on the harm, not on
    // the word "transform". The bound is asserted in the test below.
    const styleFn = baseSrc.slice(baseSrc.indexOf("nodeStyle: (nodeId)"), baseSrc.indexOf("edgeLit: (a, b)"));
    expect(styleFn).not.toMatch(/translate|width|height|top:|left:/);
  });
  test("the only motion is a BOUNDED node scale, read from the shared constant", () => {
    const styleFn = baseSrc.slice(baseSrc.indexOf("nodeStyle: (nodeId)"), baseSrc.indexOf("edgeLit: (a, b)"));
    // never a computed/animated scale — one constant, one value, capped
    expect(styleFn).toContain("scale: lit ? EXHIBIT_GLOW.litScale : 1,");
    expect(EXHIBIT_GLOW.litScale).toBeLessThanOrEqual(1.1);
  });
  test("the base never binds keys — Space/Enter/Tab/` belong to the film controller", () => {
    expect(baseSrc).not.toContain("addEventListener");
  });
  test("CycleNode is a pure declarer: shell + useExhibit, no bespoke film/highlight plumbing", () => {
    expect(cycleSrc).toContain("useExhibit(decl)");
    expect(cycleSrc).toContain("<ExhibitShell");
    expect(cycleSrc).not.toMatch(/useFilm|useExhibitHighlights|ElementResizer|ElementChrome|ConnectionDots/);
  });
  test("the T-account stub proves the model: one declaration, zero behavior code", () => {
    expect(demoSrc).toContain("nodes: [\"debits\", \"credits\", \"balance\"]");
    expect(demoSrc).toContain("useExhibit(T_DECL)");
    // the stub itself binds no keys and imports no film/highlight machinery
    const stub = demoSrc.slice(demoSrc.indexOf("const T_DECL"), demoSrc.indexOf("// ---- end of stub"));
    expect(stub).not.toMatch(/addEventListener|useFilm|useExhibitHighlights|toggle\(/);
  });
  test("the checklist exists where the next builder will find it", () => {
    const checklist = readFileSync(join(import.meta.dir, "..", "..", "..", "docs", "NEW-EXHIBIT-CHECKLIST.md"), "utf8").split("\r\n").join("\n");
    expect(checklist).toContain("What a card must NEVER implement");
    expect(checklist).toContain("exhibit-base.test.ts");
  });
});
