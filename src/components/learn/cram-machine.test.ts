// THE CRAM MACHINES — the pure decisions pinned: every Recraft path lands in exactly one part or
// the body; the campus paints only the power parts; the bolt's matrix is finite and lands inside
// the paper; the variant rotates by section, never at random.
import { describe, expect, test } from "bun:test";

import { BOLT_PLACEMENTS, boltMatrix, MACHINE_VARIANTS, MACHINES, machineForSection, partOf, PRACTICE_ART, ROTATION } from "./CramMachine";
import { COMPACT_MACHINE, CONVEYOR_MACHINE, LAPTOP_MACHINE, OPEN_MACHINE } from "./cram-machine-data";
import { BOLT_VIEWBOX } from "@/components/canvas/brand";

const ORANGES = new Set(["#F17338", "#EB7437", "#E76F32", "#DF723D"]);

describe("the three machines", () => {
  test("the four files became open / compact / conveyor / laptop, nothing redrawn", () => {
    expect(OPEN_MACHINE.paths.length).toBe(87);
    expect(COMPACT_MACHINE.paths.length).toBe(61);
    expect(CONVEYOR_MACHINE.paths.length).toBe(87);
    expect(LAPTOP_MACHINE.paths.length).toBe(137);
    for (const v of ROTATION) expect(MACHINES[v].data.viewBox).toBe("0 0 2048 2048");
    expect(MACHINES.laptop.data.viewBox).toBe("0 0 4096 4096");
    expect(PRACTICE_ART).toBe("laptop");
  });
  test("every path is in at most one part; the parts named in the brief exist", () => {
    for (const v of MACHINE_VARIANTS) {
      const seen = new Set<number>();
      for (const idx of Object.values(MACHINES[v].parts)) for (const i of idx) { expect(seen.has(i)).toBe(false); seen.add(i); expect(i).toBeLessThan(MACHINES[v].data.paths.length); }
      const need = v === "laptop" ? (["lid", "keys", "power-line", "power-node", "sparks", "success-mark", "placeholder"] as const) : (["stamp-head", "abacus-beads", "power-line", "finished-paper", "success-mark", "placeholder", "output-tray", "input-tray"] as const);
      for (const part of need) expect((MACHINES[v].parts[part] ?? []).length).toBeGreaterThan(0);
      expect(partOf(v, 0)).toBe("machine-body");
    }
  });
  test("the orange Recraft drew is only the power line, the node and the placeholder — nothing else goes campus", () => {
    for (const v of MACHINE_VARIANTS) {
      MACHINES[v].data.paths.forEach((p, i) => {
        if (!ORANGES.has(p.fill.toUpperCase())) return;
        expect(["power-line", "power-node", "placeholder", "accent", "sparks"]).toContain(partOf(v, i));
      });
      // and the success mark stays the illustration's green
      for (const i of MACHINES[v].parts["success-mark"] ?? []) expect(MACHINES[v].data.paths[i].fill).toMatch(/^#(7AB37B|2D8668|3F9074|409562|7C9781)$/);
    }
  });
  test("the placeholder is the one orange rectangle on the paper (the laptop's: the two-path slot on its screen), never drawn", () => {
    for (const v of ROTATION) {
      const ph = MACHINES[v].parts.placeholder!;
      expect(ph.length).toBe(1);
      expect(ORANGES.has(MACHINES[v].data.paths[ph[0]].fill.toUpperCase())).toBe(true);
      expect(partOf(v, ph[0])).toBe("placeholder");
    }
    expect(MACHINES.laptop.parts.placeholder).toEqual([132, 133]);
    expect(partOf("laptop", 133)).toBe("placeholder");
  });
});

describe("the bolt on the paper", () => {
  test("each machine's matrix is finite and maps the bolt's centre onto the rectangle's centre", () => {
    const vb = BOLT_VIEWBOX.split(" ").map(Number);
    const bx = vb[0] + vb[2] / 2, by = vb[1] + vb[3] / 2;
    for (const v of MACHINE_VARIANTS) {
      const m = boltMatrix(MACHINES[v].paper);
      for (const n of m) expect(Number.isFinite(n)).toBe(true);
      const p = MACHINES[v].paper;
      const cx = p.t[0] + (p.r[0] - p.t[0]) / 2 + (p.l[0] - p.t[0]) / 2, cy = p.t[1] + (p.r[1] - p.t[1]) / 2 + (p.l[1] - p.t[1]) / 2;
      expect(m[0] * bx + m[2] * by + m[4]).toBeCloseTo(cx, 3);
      expect(m[1] * bx + m[3] * by + m[5]).toBeCloseTo(cy, 3);
      expect(BOLT_PLACEMENTS[v]).toMatch(/^matrix\((-?\d+\.\d{4} ){5}-?\d+\.\d{4}\)$/);
    }
  });
  test("the bolt's four corners stay inside the rectangle (the margin holds)", () => {
    const vb = BOLT_VIEWBOX.split(" ").map(Number);
    for (const v of MACHINE_VARIANTS) {
      const m = boltMatrix(MACHINES[v].paper);
      const p = MACHINES[v].paper;
      const u = [p.r[0] - p.t[0], p.r[1] - p.t[1]], w = [p.l[0] - p.t[0], p.l[1] - p.t[1]];
      // solve P = t + a·u + b·w for each mapped corner; inside ⇔ 0 ≤ a, b ≤ 1
      const det = u[0] * w[1] - u[1] * w[0];
      for (const [x, y] of [[vb[0], vb[1]], [vb[0] + vb[2], vb[1]], [vb[0], vb[1] + vb[3]], [vb[0] + vb[2], vb[1] + vb[3]]]) {
        const px = m[0] * x + m[2] * y + m[4] - p.t[0], py = m[1] * x + m[3] * y + m[5] - p.t[1];
        const a = (px * w[1] - py * w[0]) / det, b = (u[0] * py - u[1] * px) / det;
        expect(a).toBeGreaterThanOrEqual(0.1); expect(a).toBeLessThanOrEqual(0.9);
        expect(b).toBeGreaterThanOrEqual(0.1); expect(b).toBeLessThanOrEqual(0.9);
      }
    }
  });
});

describe("which machine a section gets", () => {
  test("the rotation is sectionIndex % 3 over the three cram machines, deterministic", () => {
    expect([0, 1, 2, 3, 4, 5].map(machineForSection)).toEqual(["open", "compact", "conveyor", "open", "compact", "conveyor"]);
    expect(machineForSection(7)).toBe(machineForSection(7));
    expect(ROTATION).not.toContain("laptop");
  });
});
