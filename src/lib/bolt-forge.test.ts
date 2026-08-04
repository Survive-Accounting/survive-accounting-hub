// Guards the parametric bolt forge: valid closed paths, deterministic given seed,
// and knobs actually move the geometry.
import { describe, expect, test } from "bun:test";

import { BOLT_STYLE_PRESETS, DEFAULT_BOLT, forgeBolt } from "./bolt-forge";

describe("bolt forge", () => {
  test("produces closed outer + seam paths and a sane viewBox/ratio", () => {
    const g = forgeBolt(DEFAULT_BOLT);
    expect(g.outer.startsWith("M")).toBe(true);
    expect(g.outer.trimEnd().endsWith("Z")).toBe(true);
    expect(g.seam.trimEnd().endsWith("Z")).toBe(true);
    expect(g.viewBox.split(" ").length).toBe(4);
    expect(g.ratio).toBeGreaterThan(0.2);
    expect(g.ratio).toBeLessThan(1.4);
    // a serrated bolt has many vertices
    expect((g.outer.match(/[ML]/g) ?? []).length).toBeGreaterThan(10);
  });

  test("deterministic — same params (incl. seed) give identical paths", () => {
    expect(forgeBolt(DEFAULT_BOLT).outer).toBe(forgeBolt({ ...DEFAULT_BOLT }).outer);
  });

  test("seed changes the jittered shape; zero jitter ignores the seed", () => {
    expect(forgeBolt({ ...DEFAULT_BOLT, seed: 1 }).outer).not.toBe(forgeBolt({ ...DEFAULT_BOLT, seed: 2 }).outer);
    expect(forgeBolt({ ...DEFAULT_BOLT, jitter: 0, seed: 1 }).outer).toBe(forgeBolt({ ...DEFAULT_BOLT, jitter: 0, seed: 2 }).outer);
  });

  test("teeth knob changes vertex count", () => {
    const few = (forgeBolt({ ...DEFAULT_BOLT, teeth: 3 }).outer.match(/[ML]/g) ?? []).length;
    const many = (forgeBolt({ ...DEFAULT_BOLT, teeth: 8 }).outer.match(/[ML]/g) ?? []).length;
    expect(many).toBeGreaterThan(few);
  });

  test("every style preset forges valid geometry", () => {
    for (const p of BOLT_STYLE_PRESETS) {
      const g = forgeBolt({ ...DEFAULT_BOLT, ...p.params });
      expect(g.outer.startsWith("M")).toBe(true);
      expect(Number.isFinite(g.ratio)).toBe(true);
    }
  });
});
