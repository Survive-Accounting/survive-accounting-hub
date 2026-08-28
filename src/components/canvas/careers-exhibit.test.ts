// "WHO DO YOU WORK FOR?" (careers exhibit) tests — the config is the contract:
// the branch-map shape, the audited copy, the DOORS accuracy rule (adjacency,
// never membership), the text diet, the reveal sequence, and the film wiring.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  CAREERS_CONTRAST, CAREERS_CPA, CAREERS_DOORS, CAREERS_DOORS_NOTE, CAREERS_REVEAL_MAX,
  CAREERS_REVEAL_STEPS, CAREERS_TRUNKS, careersBandVisible, careersBranchIds, careersLeaf,
  careersLeafBand, careersNodeIds, careersTrunk, careersTrunkOf,
} from "./careers-exhibit-config";
import { standardsTile } from "./standards-exhibit-config";

const cardSrc = readFileSync(join(import.meta.dir, "cards", "CareersNode.tsx"), "utf8").split("\r\n").join("\n");
const configSrc = readFileSync(join(import.meta.dir, "careers-exhibit-config.ts"), "utf8").split("\r\n").join("\n");

/** Config copy carries 【…】 highlight marks; strip them to measure real text. */
const plain = (s: string): string => s.replace(/[【】]/g, "");
const allLeaves = CAREERS_TRUNKS.flatMap((t) => t.leaves);

/** Every string this exhibit paints on screen. */
const RENDERED_COPY: string[] = [
  ...CAREERS_TRUNKS.flatMap((t) => [
    t.label, t.anchor, ...(t.caption ? [t.caption.text] : []),
    ...t.leaves.flatMap((l) => [l.label, l.desc, ...(l.contrast ? [l.contrast] : [])]),
  ]),
  CAREERS_CPA.text,
  CAREERS_DOORS_NOTE,
  ...CAREERS_DOORS.map((d) => d.label),
  ...CAREERS_CONTRAST.flatMap((p) => [p.pub, p.priv]),
];

describe("the branch map — who do you work for", () => {
  test("three trunks, left to right: PUBLIC · PRIVATE/CORPORATE · GOVERNMENT & NONPROFIT", () => {
    expect(CAREERS_TRUNKS.map((t) => t.id)).toEqual(["public", "private", "govnp"]);
    expect(CAREERS_TRUNKS.map((t) => t.label)).toEqual(["PUBLIC", "PRIVATE / CORPORATE", "GOVERNMENT & NONPROFIT"]);
  });
  test("every trunk answers WHO in one anchor line", () => {
    expect(plain(careersTrunk("public")!.anchor)).toBe("You work for an accounting FIRM — many clients.");
    expect(plain(careersTrunk("private")!.anchor)).toBe("You work INSIDE one company.");
    expect(plain(careersTrunk("govnp")!.anchor)).toBe("You work for the public.");
  });
  test("the two exam trunks carry MUST KNOW", () => {
    expect(careersTrunk("public")!.cue).toBe("must");
    expect(careersTrunk("private")!.cue).toBe("must");
  });
  test("GOV/NONPROFIT stays compact — 2–3 chips", () => {
    expect(careersTrunk("govnp")!.leaves.length).toBeGreaterThanOrEqual(2);
    expect(careersTrunk("govnp")!.leaves.length).toBeLessThanOrEqual(3);
  });
  test("every leaf belongs to exactly the trunk it renders under", () => {
    for (const t of CAREERS_TRUNKS) for (const l of t.leaves) expect(careersTrunkOf(l.id)).toBe(t.id);
  });
});

describe("accuracy audit — the external/internal auditor trap", () => {
  test("Audit is the EXTERNAL auditor, and it is MUST KNOW", () => {
    const a = careersLeaf("audit")!;
    expect(a.cue).toBe("must");
    expect(a.desc).toContain("【EXTERNAL AUDITOR】");
    expect(plain(a.desc)).toContain("CLIENTS' books");
  });
  test("Internal Audit crosslights Audit and prints the contrast, both sides named", () => {
    const ia = careersLeaf("internal-audit")!;
    expect(ia.cue).toBe("easy");
    expect(ia.colight).toEqual(["audit"]);
    expect(ia.contrast).toContain("External auditor");
    expect(ia.contrast).toContain("must be independent");
    expect(ia.contrast).toContain("Internal auditor = employee");
  });
  test("only the crosslight leaf co-lights anything — no hidden relationships", () => {
    expect(allLeaves.filter((l) => l.colight).map((l) => l.id)).toEqual(["internal-audit"]);
  });
});

describe("accuracy audit — the CPA badge", () => {
  test("one line: a STATE-issued license, earned by passing the CPA Exam", () => {
    expect(CAREERS_CPA.cue).toBe("aplus");
    expect(CAREERS_CPA.text).toContain("【STATE-issued license】");
    expect(CAREERS_CPA.text).toContain("CPA Exam");
    expect(CAREERS_CPA.text).not.toContain("\n");
  });
  test("it agrees with the standards exhibit: the license is a STATE board's, not the AICPA's", () => {
    expect(standardsTile("aicpa")!.does).toContain("STATE board of accountancy");
    expect(plain(CAREERS_CPA.text)).not.toContain("AICPA");
  });
  test("the badge is pinned to the PUBLIC trunk, so it lights with that branch", () => {
    expect(careersTrunkOf(CAREERS_CPA.id)).toBe("public");
    expect(careersBranchIds("public")).toEqual(["public", "audit", "tax", "advisory", "bigfour", "cpa"]);
  });
  test("no salary data, no rankings, no credential walls in any RENDERED copy", () => {
    // Scan the strings the exhibit actually paints, not the file's comments —
    // the accuracy note in the header legitimately names what is banned.
    for (const copy of RENDERED_COPY) {
      expect(copy).not.toMatch(/\$[0-9]/);
      expect(copy).not.toMatch(/salary|salaries|highest.paid|best career|top.ranked|#1/i);
    }
    // …and no dollar figure may hide anywhere in the file, commented or not.
    expect(configSrc).not.toMatch(/\$[0-9]/);
  });
});

describe("the DOORS strip — adjacency, never membership", () => {
  test("exactly the four doors, in order", () => {
    expect(CAREERS_DOORS.map((d) => d.label)).toEqual(["Consulting", "Corporate Finance", "Entrepreneurship", "Investing / VC / PE"]);
  });
  test("no door belongs to any trunk — VC/PE can never render as accounting practice", () => {
    for (const d of CAREERS_DOORS) expect(careersTrunkOf(d.id)).toBeUndefined();
    const trunkLabels = allLeaves.map((l) => l.label).join(" | ");
    expect(trunkLabels).not.toMatch(/VC|PE|Investing|Entrepreneurship/);
  });
  test("the strip says out loud that these are not accounting jobs", () => {
    expect(CAREERS_DOORS_NOTE).toContain("not accounting jobs");
  });
  test("the doors reveal as their own band, after every trunk", () => {
    const steps = [...CAREERS_REVEAL_STEPS] as string[];
    expect(steps.indexOf("doors")).toBeGreaterThan(steps.indexOf("govnp"));
  });
});

describe("the Big Four caption", () => {
  test("named under PUBLIC, EASY POINT, never ranked", () => {
    const cap = careersTrunk("public")!.caption!;
    expect(cap.id).toBe("bigfour");
    expect(cap.cue).toBe("easy");
    for (const firm of ["Deloitte", "PwC", "EY", "KPMG"]) expect(cap.text).toContain(firm);
  });
  test("only PUBLIC carries a caption row", () => {
    expect(CAREERS_TRUNKS.filter((t) => t.caption).map((t) => t.id)).toEqual(["public"]);
  });
});

describe("text diet", () => {
  test("every leaf description is one short line", () => {
    for (const l of allLeaves) {
      const d = plain(l.desc);
      expect(d.length).toBeGreaterThan(0);
      expect(d.length).toBeLessThan(95);
      expect(d).not.toContain("\n");
    }
  });
  test("every trunk anchor is one line", () => {
    for (const t of CAREERS_TRUNKS) {
      expect(plain(t.anchor).length).toBeLessThan(60);
      expect(t.anchor).not.toContain("\n");
    }
  });
  test("depth-layer cells stay tight (≤5 words)", () => {
    for (const p of CAREERS_CONTRAST) for (const cell of [p.pub, p.priv]) {
      expect(cell.trim().split(/\s+/).length).toBeLessThanOrEqual(5);
    }
    expect(CAREERS_CONTRAST).toHaveLength(4);
  });
});

describe("reveal sequence", () => {
  test("six authored states: trunks → public → private → govnp → doors → extras", () => {
    expect([...CAREERS_REVEAL_STEPS]).toEqual(["trunks", "public", "private", "govnp", "doors", "extras"]);
    expect(CAREERS_REVEAL_MAX).toBe(5);
  });
  test("tick 0 shows the trunks and nothing else; visibility is cumulative", () => {
    expect(careersBandVisible("trunks", 0)).toBe(true);
    expect(careersBandVisible("public", 0)).toBe(false);
    expect(careersBandVisible("public", 1)).toBe(true);
    expect(careersBandVisible("doors", 4)).toBe(true);
    expect(careersBandVisible("extras", 4)).toBe(false);
    expect(careersBandVisible("extras", 5)).toBe(true);
  });
  test("each trunk's leaves ride its own band", () => {
    for (const t of CAREERS_TRUNKS) expect(careersLeafBand(t.id)).toBe(t.id);
  });
  test("the depth layer is NOT a reveal band (manual toggle only)", () => {
    expect([...CAREERS_REVEAL_STEPS] as string[]).not.toContain("contrast");
    expect([...CAREERS_REVEAL_STEPS] as string[]).not.toContain("depth");
  });
});

describe("declarations + wiring", () => {
  test("node ids are unique: 3 trunks + 10 leaves + caption + CPA + 4 doors", () => {
    const ids = careersNodeIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(3 + 10 + 1 + 1 + 4);
  });
  test("film surfaces render the sequence; other surfaces are always full", () => {
    expect(cardSrc).toContain("!film || careersBandVisible(band, revealTick)");
  });
  test("an unrevealed element can never be resurrected by a spotlight", () => {
    // emphasisIn puts the hidden state AFTER the muted state, so hidden wins.
    const fn = cardSrc.slice(cardSrc.indexOf("const emphasisIn"), cardSrc.indexOf("// ---- leaves"));
    expect(fn).toContain("...emphasis(nodeId)");
    expect(fn.indexOf("opacity: 0")).toBeGreaterThan(fn.indexOf("...emphasis(nodeId)"));
  });
  test("emphasis is opacity/filter only — nothing moves (A3 law)", () => {
    const emph = cardSrc.slice(cardSrc.indexOf("const emphasis = "), cardSrc.indexOf("/** The full glow"));
    expect(emph).not.toMatch(/transform|width|height|margin|padding/);
  });
  test("selection rides the shared highlight store, so ` clears it for free", () => {
    expect(cardSrc).toContain("hl.clear();");
    expect(cardSrc).toContain("ids.forEach((n) => hl.cycle(n));");
  });
  test("the card reuses the shared primitives rather than reinventing them", () => {
    for (const imp of ["exhibit-base", "exhibit-highlights", "exhibit-modes", "exhibit-cues", "standards-exhibit-config"]) {
      expect(cardSrc).toContain(`from "../${imp}"`);
    }
  });
});
