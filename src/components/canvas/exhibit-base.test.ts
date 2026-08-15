// EXHIBIT BASE — pins for the shared layer's laws and the declaration model.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { declaredAdjacent, type ExhibitDeclaration } from "./exhibit-base";

const cycleSrc = readFileSync(join(import.meta.dir, "cards", "CycleNode.tsx"), "utf8");
const baseSrc = readFileSync(join(import.meta.dir, "exhibit-base.tsx"), "utf8");
const demoSrc = readFileSync(join(import.meta.dir, "..", "..", "routes", "exhibit-demo.tsx"), "utf8");

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
  test("nodeStyle is purely visual — no transform, no size, no position", () => {
    const styleFn = baseSrc.slice(baseSrc.indexOf("nodeStyle: (nodeId)"), baseSrc.indexOf("edgeLit: (a, b)"));
    expect(styleFn).not.toMatch(/transform|scale\(|translate|width|height|top|left/);
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
    const checklist = readFileSync(join(import.meta.dir, "..", "..", "..", "docs", "NEW-EXHIBIT-CHECKLIST.md"), "utf8");
    expect(checklist).toContain("What a card must NEVER implement");
    expect(checklist).toContain("exhibit-base.test.ts");
  });
});
