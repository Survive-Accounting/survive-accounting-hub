// "THE RULEBOOK & THE COPS" tests — the audited copy is the contract: exact
// phrases, exact highlight targets, the accuracy corrections pinned so the old
// deck's errors can never regress in, and the reveal/A+ shape.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  STANDARDS_APLUS, STANDARDS_ARROWS, STANDARDS_CHAIN, STANDARDS_DELEGATION, STANDARDS_REVEAL_MAX,
  STANDARDS_REVEAL_STEPS, STANDARDS_WHY, splitHighlights, standardsBandVisible, standardsNodeIds, standardsTile,
} from "./standards-exhibit-config";

const cardSrc = readFileSync(join(import.meta.dir, "cards", "StandardsNode.tsx"), "utf8").split("\r\n").join("\n");
const configSrc = readFileSync(join(import.meta.dir, "standards-exhibit-config.ts"), "utf8").split("\r\n").join("\n");

describe("the chain — who does what", () => {
  test("FASB writes GAAP; SEC enforces it; heads point at GAAP", () => {
    expect(STANDARDS_ARROWS.find((a) => a.id === "writes")).toEqual({ id: "writes", label: "writes", from: "fasb", to: "gaap" });
    expect(STANDARDS_ARROWS.find((a) => a.id === "enforces")).toEqual({ id: "enforces", label: "enforces", from: "sec", to: "gaap" });
  });
  test("role captions: WRITERS / RULEBOOK / COPS, all MUST KNOW", () => {
    expect(STANDARDS_CHAIN.map((t) => t.caption)).toEqual(["THE WRITERS", "THE RULEBOOK", "THE COPS"]);
    for (const t of STANDARDS_CHAIN) expect(t.cue).toBe("must");
  });
  test("the most-tested trap: FASB private-sector vs SEC government, BOTH highlighted", () => {
    expect(splitHighlights(standardsTile("fasb")!.what).filter((s) => s.hl).map((s) => s.text)).toEqual(["private-sector"]);
    expect(splitHighlights(standardsTile("sec")!.what).filter((s) => s.hl).map((s) => s.text)).toEqual(["U.S. government agency"]);
  });
});

describe("accuracy corrections — the old deck's errors die here", () => {
  test("the 1934 law is the Securities EXCHANGE Act; 1933 is the Securities Act", () => {
    const beat = STANDARDS_WHY.find((w) => w.id === "why-1929")!.text;
    expect(beat).toContain("Securities Act (1933)");
    expect(beat).toContain("【EXCHANGE】 Act (1934)");
  });
  test('"GAAP-G" is never rendered anywhere', () => {
    expect(configSrc).not.toContain("GAAP-G");
    expect(cardSrc).not.toContain("GAAP-G");
  });
  test("GASB owns governments — GAAP/FASB copy never claims them", () => {
    expect(standardsTile("gasb")!.what).toContain("state & local governments");
    expect(standardsTile("gaap")!.what).not.toMatch(/government/i);
    expect(standardsTile("fasb")!.does).not.toMatch(/government/i);
  });
  test("AICPA ≠ licensing: exam + ethics AICPA, license = state boards", () => {
    const a = standardsTile("aicpa")!;
    expect(a.what).toContain("CPA Exam");
    expect(a.does).toContain("STATE board of accountancy");
  });
  test("Dodd-Frank / CFPB / CFTC omitted by design, present only as commented config", () => {
    expect(STANDARDS_APLUS.map((t) => t.id)).toEqual(["gasb", "iasb", "pcaob", "aicpa", "faf"]);
    expect(configSrc).toContain("// { id: \"doddfrank\"");
    expect(configSrc).toContain("Restore only if a");
  });
});

describe("importance cues", () => {
  test("GASB + PCAOB are EASY POINT; AICPA + FAF + delegation + both WHY beats are A+ DETAIL", () => {
    expect(standardsTile("gasb")!.cue).toBe("easy");
    expect(standardsTile("pcaob")!.cue).toBe("easy");
    expect(standardsTile("aicpa")!.cue).toBe("aplus");
    expect(standardsTile("faf")!.cue).toBe("aplus");
    expect(STANDARDS_DELEGATION.cue).toBe("aplus");
    for (const wy of STANDARDS_WHY) expect(wy.cue).toBe("aplus");
  });
  test("FAF co-lights FASB and GASB (the org relationship)", () => {
    expect(standardsTile("faf")!.colight).toEqual(["fasb", "gasb"]);
    expect(STANDARDS_DELEGATION.colight).toEqual(["sec", "fasb"]);
  });
});

describe("reveal + layers", () => {
  test("five authored states: blank → GAAP → FASB → SEC → captions", () => {
    expect([...STANDARDS_REVEAL_STEPS]).toEqual(["blank", "gaap", "fasb", "sec", "captions"]);
    expect(STANDARDS_REVEAL_MAX).toBe(4);
    expect(standardsBandVisible("gaap", 0)).toBe(false); // tick 0 = truly blank
    expect(standardsBandVisible("gaap", 1)).toBe(true);
    expect(standardsBandVisible("captions", 3)).toBe(false);
    expect(standardsBandVisible("captions", 4)).toBe(true);
  });
  test("the A+ layer is not a reveal band, and node ids are unique", () => {
    expect([...STANDARDS_REVEAL_STEPS] as string[]).not.toContain("aplus");
    const ids = standardsNodeIds();
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("film renders the sequence; other surfaces are always full", () => {
    expect(cardSrc).toContain("!film || standardsBandVisible(band, revealTick)");
  });
});

describe("splitHighlights", () => {
  test("splits 【…】 into highlight segments and keeps surrounding text", () => {
    expect(splitHighlights("a 【b】 c")).toEqual([{ text: "a ", hl: false }, { text: "b", hl: true }, { text: " c", hl: false }]);
    expect(splitHighlights("no marks")).toEqual([{ text: "no marks", hl: false }]);
  });
});
