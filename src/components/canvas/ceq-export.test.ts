// SET EXPORT — the document contract, plus the report's size measurement for a
// realistic 22-question set. Pure module: no canvas needed.
import { describe, expect, it, test } from "bun:test";

import { buildSetExport, type SetExportInput } from "./ceq-export";
import { migrateScriptLayers } from "./scene-io";

const q = (n: number): SetExportInput["questions"][number] => ({
  tqq: `Types of Accounts · Q${n}`,
  stem: `What type of account is Example ${n}?`,
  choices: [
    { text: "Asset", correct: n % 5 === 1, chain: [{ label: `Why ${n}A`, body: `Because assets are future benefits (${n}).`, sound: n % 3 === 0 ? "vinylScratch" : undefined }] },
    { text: "Liability", correct: n % 5 === 2, chain: [] },
    { text: "Equity", correct: n % 5 === 3, chain: [{ label: `Trap ${n}`, body: `The common flip (${n}).` }, { label: `Fix ${n}` }] },
    { text: "Revenue", correct: n % 5 === 4, chain: [] },
    { text: "Expense", correct: n % 5 === 0, chain: [] },
  ],
  flags: { starred: n % 4 === 0, free: n % 2 === 0, boss: n === 22, short: n === 3, shortNote: n === 3 ? "the contra trap" : undefined, chachingSilenced: n === 7 },
  scripts: { suggested: n % 3 === 0 ? `Say the ${n} thing.` : undefined, revised: `The ${n} line I actually say.`, transcript: undefined },
  clips: n % 3 === 0 ? [] : [{ name: `q${n}.mp4`, duration: 34, lookback: false, refs: n > 2 ? [`Types of Accounts · Q${n - 1}`] : [] }],
});

const INPUT: SetExportInput = {
  setName: "Types of Accounts — Full",
  course: "Start Here Course",
  topic: "Types of Accounts",
  freeCount: 11, fullCount: 22,
  runtimeFreeS: 420, runtimeFullS: 780,
  clipCoverage: { withBase: 15, total: 22 },
  questions: Array.from({ length: 22 }, (_, i) => q(i + 1)),
  introFrame: { exists: true, clip: { name: "intro.mp4", duration: 12 } },
  wrap: [{ name: "wrap.mp4", duration: 40, refs: ["Types of Accounts · Q4", "Types of Accounts · Q8"] }],
  slots: { intro: { state: "global", name: "brand-intro.mp4", duration: 6 }, transition: { state: "global", name: "swoosh.mp4", duration: 1 }, outro: { state: "empty" } },
};

describe("buildSetExport", () => {
  const md = buildSetExport(INPUT);

  it("keeps deck order and includes every question", () => {
    const idx = Array.from({ length: 22 }, (_, i) => md.indexOf(`## Types of Accounts · Q${i + 1}`));
    expect(idx.every((x) => x >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx); // strictly in order
  });

  it("marks the correct choice, renders chains in reveal order with sounds", () => {
    expect(md).toContain("**A. Asset** ✓"); // Q1's correct
    expect(md).toContain("1. Trap 3 — The common flip (3).");
    expect(md).toContain("2. Fix 3");
    expect(md).toContain("*(sound: vinylScratch)*");
  });

  it("includes flags, scripts and clip refs when present — and omits empty sections", () => {
    expect(md).toContain("★ starred");
    expect(md).toContain("chaching silenced");
    expect(md).toContain("**Revised script:** The 5 line I actually say.");
    expect(md).toContain("covers: Types of Accounts · Q3");
    expect(md).not.toContain("**Transcript:**"); // never set
  });

  it("reports set assets: intro frame, wrap refs, slot states", () => {
    expect(md).toContain("Intro frame: created · clip attached (intro.mp4, 0:12)");
    expect(md).toContain("Wrap 1: wrap.mp4 (0:40) — covers: Types of Accounts · Q4, Types of Accounts · Q8");
    expect(md).toContain("- Outro slot: —");
  });

  it("a realistic 22-question set stays a comfortable paste (< 64KB)", () => {
    expect(md.length).toBeGreaterThan(4000);
    expect(md.length).toBeLessThan(65536);
    console.info(`[export-size] 22-question set → ${md.length} chars (~${Math.round(md.length / 102.4) / 10}KB)`);
  });
});

describe("migrateScriptLayers", () => {
  it("seeds revisedScript from the legacy note, once, keeping note readable", () => {
    const nodes = [{ type: "ceq", data: { note: "say it plainly" } }];
    const out = migrateScriptLayers(nodes);
    expect(out[0].data).toEqual({ note: "say it plainly", revisedScript: "say it plainly" });
  });

  it("never clobbers an existing revision, ignores non-CEQs, and no-ops to the SAME array", () => {
    const nodes = [
      { type: "ceq", data: { note: "old", revisedScript: "newer" } },
      { type: "memo", data: { note: "not a ceq" } },
      { type: "ceq", data: {} },
    ];
    expect(migrateScriptLayers(nodes)).toBe(nodes); // idempotent: identical reference when nothing changes
  });
});

test("misconception summary renders slug → questions; derivation helper is pure/read-only", () => {
  const md = buildSetExport({ ...INPUT, misconceptions: [{ slug: "FLIP", questions: ["T · Q1", "T · Q4"] }] });
  expect(md).toContain("## Misconceptions covered");
  expect(md).toContain("- FLIP: T · Q1, T · Q4");
});
