// EXHIBIT MODES (cycle-modes) tests — the mode cycle order is the M key's
// contract, the config matcher must land BOTH cycle vocabularies (the legacy
// 7-step shorthand and the canonical 9-step labels) on the right entries, and
// the film-controller wiring must keep its precedence (orbit keys before the
// walk) and its film-safety (chips never on camera).
//
// 2026-08-30: the canvas template now seeds the canonical NINE steps (it used
// to seed the 7-step shorthand, which contradicted the bank's own answer to
// "Which list shows the full accounting cycle in the correct order?"). The
// 7-step vocabulary is still matched — hand-authored and legacy labels use it —
// but it is no longer what a new element starts with, which the last test pins.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { nextModeId } from "./exhibit-modes";
import { CYCLE_STEP_INFO, cycleStepInfo, endOfPeriodStart } from "./cycle-exhibit-config";
import { CYCLE_STEPS } from "./exhibit-lab/cycle-model";
import { blankCard } from "./templates";

const previewerSrc = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const modesSrc = readFileSync(join(import.meta.dir, "exhibit-modes.tsx"), "utf8").split("\r\n").join("\n");
const cycleSrc = readFileSync(join(import.meta.dir, "cards", "CycleNode.tsx"), "utf8").split("\r\n").join("\n");

// The two vocabularies the matcher must serve (shorthand = legacy/hand-authored).
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

// A new cycle element is the ring Lee films. If it seeds a different list from
// the one the bank teaches, the exhibit and the CEQ answer disagree ON CAMERA —
// which is exactly what a 7-step seed did until 2026-08-30.
describe("the seeded cycle element agrees with the bank", () => {
  const seeded = (blankCard("cycle") as { steps: { text: string }[] }).steps.map((s) => s.text);

  test("seeds the canonical nine, in cycle-model's order", () => {
    expect(seeded).toEqual(CYCLE_STEPS.map((s) => s.text));
    expect(seeded).toHaveLength(9);
  });
  test("every seeded label resolves to a DISTINCT config entry", () => {
    const ids = seeded.map((l) => cycleStepInfo(l)?.id);
    expect(ids).toEqual(LAB_9.map(([, id]) => id));
    expect(new Set(ids).size).toBe(9); // no two steps collapse onto one entry
  });
  test("the end-of-period handoff lands on the unadjusted trial balance", () => {
    expect(endOfPeriodStart(seeded)).toBe(3);
  });
});

// PLAIN MODE (Lee, 09-01) — the cycle card used to boot into SOURCE DOCS, so
// every click on a step popped a source-document card. For the "what is the
// correct order?" videos that is noise: Lee wants the crayon and the glasses
// (highlight, blur, chain) and nothing else. Plain is that mode, and it is the
// one the card starts in.
describe("plain mode — the default the cycle card films in", () => {
  test("the shared store starts in plain, not source", () => {
    expect(modesSrc).toContain('let snap: ModeSnap = { mode: "plain"');
    expect(modesSrc).not.toContain('let snap: ModeSnap = { mode: "source"');
  });

  test("plain is the cycle card's FIRST mode, so M walks plain → source → definitions → order", () => {
    const block = cycleSrc.slice(cycleSrc.indexOf("const CYCLE_MODES"), cycleSrc.indexOf("] as const;", cycleSrc.indexOf("const CYCLE_MODES")));
    const ids = [...block.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["plain", "source", "definitions", "order"]);
    expect(nextModeId(ids, "plain")).toBe("source");
    expect(nextModeId(ids, "order")).toBe("plain");
  });

  test("Source Docs and Definitions are kept, not deleted — one M press away", () => {
    expect(cycleSrc).toContain('label: "Source Docs"');
    expect(cycleSrc).toContain('label: "Definitions"');
  });

  test("a step click in plain mode opens NO popover", () => {
    // The popover toggle is gated on the two moded views; plain is neither, so
    // the click falls through to the highlight cycle alone.
    expect(cycleSrc).toContain('if (mode === "source" || mode === "definitions") setPopStep(');
    // …and a mode change always drops a popover that is already open.
    expect(cycleSrc).toContain("useEffect(() => { setPopStep(null); }, [mode]);");
  });

  test("plain keeps the whole crayon gesture set", () => {
    // Click cycles normal → highlighted → blurred; ` clears; 0 resets. These are
    // the exhibit-highlight layer's, unconditioned by mode — pin that.
    expect(cycleSrc).toContain("ex.nodeClick(s.id)?.(e)");
    expect(cycleSrc).toContain("normal → highlighted → blurred → normal");
  });
});
