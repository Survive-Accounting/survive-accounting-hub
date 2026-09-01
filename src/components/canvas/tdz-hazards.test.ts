// NO TEMPORAL DEAD ZONES ON THE RENDER PATH.
//
// Why this exists (Lee, 08-16). The CEQ previewer died in production with
// "Cannot access 'oi' before initialization" — a minified module-level const,
// read from inside a useMemo during render. Dev never reproduced it (unbundled
// ESM), every local production build ordered the modules correctly, and there
// was no import cycle to blame. The hazard is structural rather than positional:
//
//   const f = () => …    is in a temporal dead zone until the module body
//                        reaches that line. If a bundler orders module bodies
//                        such that a component renders first, calling f throws.
//
//   function f() {}      is HOISTED — initialised before any code in the module
//                        runs — so it cannot be in a dead zone under ANY ordering.
//
// So anything at module scope that render can call is declared as a function.
// This test enforces that on the two modules the crash actually ran through,
// because "it built fine locally" was never evidence for this class of bug.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { activeSlots, dealCentre, defaultMemoPos, paletteSlots, rackOf } from "./ceq-geom";

const read = (f: string) => readFileSync(join(import.meta.dir, f), "utf8").split("\r\n").join("\n");

/** Module-scope `const NAME = (…)` / `= function` — i.e. a callable in a dead
 *  zone. Indented (in-component) declarations are fine: those run after mount. */
const tdzCallables = (src: string): string[] =>
  [...src.matchAll(/^(?:export )?const ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*(?::[^=]+)?=>|function\b|async\s*\()/gm)].map((m) => m[1]);

describe("render-path helpers are hoisted, not dead-zoned", () => {
  test("ceq-geom exports no module-scope arrow callables", () => {
    expect(tdzCallables(read("ceq-geom.ts"))).toEqual([]);
  });
  test("CeqPreviewer declares no module-scope arrow callables", () => {
    // LETTER was the one the crash landed on: `walk` calls it inside a useMemo.
    expect(tdzCallables(read("CeqPreviewer.tsx"))).toEqual([]);
  });
  test("the geometry helpers are real function declarations", () => {
    const geom = read("ceq-geom.ts");
    for (const fn of ["dealCentre", "paletteSlots", "defaultMemoPos", "rackOf", "activeSlots"]) {
      expect(geom).toContain(`export function ${fn}`);
    }
    expect(read("CeqPreviewer.tsx")).toContain("function LETTER(i: number): string");
  });
});

describe("in-component render-time TDZ (08-19: opening a set crashed prod)", () => {
  // The heuristic above only flags MODULE-scope arrows. But an IN-component const
  // can dead-zone too: a useMemo factory runs DURING render, so if it calls a
  // const declared LATER in the same component body, that const is still in its
  // TDZ → "Cannot access X before initialization". stageFrames maps spineLabelOf
  // over every question at render time, so any set with questions crashed on
  // mount until spineLabelOf was hoisted above it.
  test("CeqStudio.spineLabelOf is declared before its render-time callers", () => {
    const s = read("CeqStudio.tsx");
    const label = s.indexOf("const spineLabelOf");
    expect(label).toBeGreaterThan(0);
    expect(label).toBeLessThan(s.indexOf("const stageClips = useMemo"));
    expect(label).toBeLessThan(s.indexOf("const stageFrames = useMemo"));
  });
});

// 2026-09-01: it happened a THIRD time. film-camera.ts shipped getFilmCamera /
// subscribeFilmCamera / autoFitAllowed / emit as module-scope arrows, and
// withCeqPin calls the first two from useSyncExternalStore DURING RENDER — so
// the capture window died with "Cannot access 'wl' before initialization" while
// dev, the local prod build and 1435 tests were all green.
//
// The lesson is that naming the two files that had crashed was too narrow: the
// rule belongs to any module the render path can reach. This list is now the
// register of those modules, and adding a store here is cheaper than shipping
// the crash again.
const RENDER_PATH_MODULES = ["ceq-geom.ts", "CeqPreviewer.tsx", "film-camera.ts", "exhibit-modes.tsx", "exhibit-highlights.ts"];

describe("no module-scope arrow callables anywhere the render path reaches", () => {
  for (const f of RENDER_PATH_MODULES) {
    test(`${f} declares its callables as hoisted functions`, () => {
      expect(tdzCallables(read(f))).toEqual([]);
    });
  }
});

describe("film-camera's state survives ANY module ordering", () => {
  const src = read("film-camera.ts");

  test("mutable module state is `var` — hoisted AND initialised to undefined", () => {
    // A `let`/`const` read before its module body runs throws exactly the way
    // the arrow did, so hoisting only the functions would have moved the crash
    // rather than removed it.
    expect(src).toContain("var snap: Snap | undefined;");
    expect(src).toContain("var listeners: Set<() => void> | undefined;");
    expect(src).not.toMatch(/^let snap/m);
    expect(src).not.toMatch(/^const listeners/m);
  });

  test("state is materialised lazily by a hoisted function, so the first reader wins", () => {
    expect(src).toContain("function state(): Snap {");
    expect(src).toContain("function subs(): Set<() => void> {");
  });

  test("nothing reads the raw bindings directly — every read goes through state()", () => {
    // `snap` may only be ASSIGNED (in state()/emit); reading `snap.x` anywhere
    // would reintroduce the hazard the accessor exists to remove.
    expect(src).not.toMatch(/\bsnap\.\w/);
    expect(src).not.toMatch(/\blisteners\.\w/);
  });
});

describe("hoisting changed the shape, not the behaviour", () => {
  test("dealCentre still centres a card in its frame", () => {
    expect(dealCentre(1920, 1080)).toEqual({ x: 680, y: 300 });
  });
  test("a frame smaller than the card clamps to zero rather than going negative", () => {
    expect(dealCentre(100, 100)).toEqual({ x: 0, y: 0 });
  });
  test("the palette generates non-overlapping slots down the right side", () => {
    const slots = paletteSlots(1920, 1080);
    expect(slots).toHaveLength(5);
    expect(new Set(slots.map((s) => s.x)).size).toBe(1);          // one column
    for (let i = 1; i < slots.length; i++) expect(slots[i].y).toBeGreaterThan(slots[i - 1].y);
  });
  test("defaultMemoPos clamps past the end of the palette instead of returning undefined", () => {
    expect(defaultMemoPos(1920, 1080, 99)).toEqual(paletteSlots(1920, 1080)[4]);
  });
  test("rackOf pads to the full palette with INACTIVE slots and keeps saved ones", () => {
    const rack = rackOf([{ x: 1, y: 2, scale: 1 }], 1920, 1080);
    expect(rack).toHaveLength(5);
    expect(rack[0]).toEqual({ x: 1, y: 2, scale: 1 });            // saved geometry survives
    expect(rack.slice(1).every((s) => s.off)).toBe(true);
  });
  test("a pre-palette layout has no `off` flags, so nothing switches itself off", () => {
    const saved = Array.from({ length: 5 }, (_, i) => ({ x: i, y: i, scale: 1 }));
    expect(activeSlots(rackOf(saved, 1920, 1080))).toHaveLength(5);
  });
  test("activeSlots drops only what is switched off, in order", () => {
    expect(activeSlots([{ x: 0, y: 0, scale: 1 }, { x: 1, y: 1, scale: 1, off: true }, { x: 2, y: 2, scale: 1 }]).map((s) => s.x)).toEqual([0, 2]);
  });
});
