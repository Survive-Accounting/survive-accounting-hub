// THE SPOTLIGHT TAKES ROOM ON FILM (2026-09-12). Lee, looking at a spotlit answer choice: "I want
// to also enhance the spotlight tool some. Like, if I spotlight Asset here. It should really bring
// it bigger, Like push everything below it down. Glow, etc."
//
// A transform cannot push anything down — it draws over its neighbours. So on the film surface a
// spotlit choice grows its PADDING and its TYPE, which moves the choices under it down the card,
// and the glow goes up with it. The canvas keeps the old scale-pop: it authors in a tighter box.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const src = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");

describe("the spotlight on film", () => {
  test("it is film-only", () => {
    expect(src).toContain('const spotBig = film && spState === "spot";');
  });

  test("it grows in LAYOUT — padding and type — so the choices below it are pushed down", () => {
    expect(src).toContain("padding: spotBig ?");
    expect(src).toContain("(spotBig ? 25 : 18) * s");     // the choice's words
    expect(src).toContain("(spotBig ? 36 : 28) * s");     // its letter chip
    expect(src).toContain("transition: \"padding 240ms");
  });

  test("the transform is dropped there (it would cover the neighbours) and the glow goes up", () => {
    const spot = src.slice(src.indexOf("...(spotBig ? {"), src.indexOf("...(spotBig ? {") + 260);
    expect(spot).toContain('transform: "none"');
    expect(spot).toContain("rgba(252,163,17,0.85)");
  });

  test("the canvas keeps its scale-pop", () => {
    expect(src).toContain('transform: "scale(1.06)"');
  });
});
