// EXHIBIT MODES (cycle-modes) tests — the mode cycle order is the M key's
// contract, the config matcher must land BOTH cycle vocabularies (the 7-step
// canvas template and the Lab's 9-step labels) on the right entries, and the
// film-controller wiring must keep its precedence (orbit keys before the walk)
// and its film-safety (chips never on camera).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { nextModeId } from "./exhibit-modes";
import { CYCLE_STEP_INFO, cycleStepInfo, endOfPeriodStart } from "./cycle-exhibit-config";

const previewerSrc = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const modesSrc = readFileSync(join(import.meta.dir, "exhibit-modes.tsx"), "utf8").split("\r\n").join("\n");
const cycleSrc = readFileSync(join(import.meta.dir, "cards", "CycleNode.tsx"), "utf8").split("\r\n").join("\n");

// The two vocabularies the matcher must serve.
const TEMPLATE_7 = [
  ["Analyze transactions", "analyze"],
  ["Record JEs", "journalize"],
  ["Post to Ledger", "post"],
  ["Trial Balance", "trial-balance"],
  ["Adj Entries", "adjusting"],
  ["Financial Stmts", "statements"],
  ["Year End Closed", "closing"],
] as const;
const LAB_9 = [
  ["Analyze transactions", "analyze"],
  ["Record journal entries", "journalize"],
  ["Post to T accounts", "post"],
  ["Make unadjusted trial balance", "unadjusted-tb"],
  ["Record adjusting entries", "adjusting"],
  ["Make adjusted trial balance", "adjusted-tb"],
  ["Prep financial statements", "statements"],
  ["Record closing entries", "closing"],
  ["Make post-closing trial balance", "post-closing-tb"],
] as const;

describe("nextModeId — the M key's cycle order", () => {
  test("source → definitions → order → source", () => {
    const ids = ["source", "definitions", "order"];
    expect(nextModeId(ids, "source")).toBe("definitions");
    expect(nextModeId(ids, "definitions")).toBe("order");
    expect(nextModeId(ids, "order")).toBe("source");
  });
});

describe("cycleStepInfo — authored labels land on the right config entry", () => {
  for (const [label, id] of [...TEMPLATE_7, ...LAB_9]) {
    test(`"${label}" → ${id}`, () => expect(cycleStepInfo(label)?.id).toBe(id));
  }
  test("an unmatched label returns undefined (the popover says so, never guesses)", () => {
    expect(cycleStepInfo("Interpretive dance break")).toBeUndefined();
  });
});

describe("config seeds — the text diet holds", () => {
  test("every entry has at least one source doc and a definition under 140 chars", () => {
    for (const row of CYCLE_STEP_INFO) {
      expect(row.docs.length).toBeGreaterThan(0);
      expect(row.definition.length).toBeGreaterThan(0);
      expect(row.definition.length).toBeLessThan(140);
    }
  });
});

describe("endOfPeriodStart — the arcs hand off at the first trial balance", () => {
  test("7-step template: END OF PERIOD begins at index 3 (Trial Balance)", () => {
    expect(endOfPeriodStart(TEMPLATE_7.map(([l]) => l))).toBe(3);
  });
  test("9-step labels: END OF PERIOD begins at index 3 (unadjusted TB)", () => {
    expect(endOfPeriodStart(LAB_9.map(([l]) => l))).toBe(3);
  });
  test("no TB step ⇒ −1, so the card skips the arcs rather than guessing", () => {
    expect(endOfPeriodStart(["Analyze transactions", "Record JEs"])).toBe(-1);
  });
});

describe("film-controller wiring (source pins)", () => {
  test("both key branches check the orbit keys BEFORE the Tab walk", () => {
    // Recording branch: M / exhibitOrderKey lines precede its Enter|Tab walk line.
    const rec = previewerSrc.indexOf('if (e.key === "Enter" || e.key === "Tab")');
    expect(rec).toBeGreaterThan(-1);
    expect(previewerSrc.slice(0, rec)).toContain('exhibitOrderKey(e.shiftKey ? "back" : "step")');
    expect(previewerSrc.slice(0, rec)).toContain("cycleExhibitModes()");
    // Popout branch: its own orbit-key check precedes the bare Tab walk line.
    const walk = previewerSrc.indexOf('if (e.key === "Tab") { e.preventDefault();');
    expect(walk).toBeGreaterThan(-1);
    expect(previewerSrc.slice(0, walk).split('exhibitOrderKey(e.shiftKey ? "back" : "step")').length).toBe(3); // once per branch
  });
  test("the chip row is authoring chrome — film renders nothing", () => {
    expect(modesSrc).toContain("if (film) return null;");
    expect(modesSrc).toContain('className="sa-chrome nodrag');
  });
  test("the cycle card mounts the shared chips and keeps click-to-highlight in film", () => {
    expect(cycleSrc).toContain("<ExhibitModeChips modes={CYCLE_MODES} />");
    expect(cycleSrc).toContain("ex.nodeClick(s.id)?.(e);");
  });
});
