// CALLOUT (P1) regression tests — the kind taxonomy, drop-mapping, cycler, and
// the film gates on the previewer's callout affordances.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { CALLOUT_KINDS, calloutKindForCategory, nextCalloutKind } from "./CalloutCard";
import type { CalloutKind } from "../types";

const previewerSrc = readFileSync(join(import.meta.dir, "..", "CeqPreviewer.tsx"), "utf8");

describe("callout kinds", () => {
  test("exactly the five agreed types, each with a label + accent", () => {
    expect(Object.keys(CALLOUT_KINDS).sort()).toEqual(["cheat-code", "deeper-idea", "distractor", "memorize-this", "recap"]);
    for (const m of Object.values(CALLOUT_KINDS)) { expect(m.label.length).toBeGreaterThan(0); expect(m.accent).toMatch(/^#/); }
  });
  test("memo categories map to sensible default kinds on drop", () => {
    expect(calloutKindForCategory("CHEAT CODES")).toBe("cheat-code");
    expect(calloutKindForCategory("STEPS")).toBe("memorize-this");
    expect(calloutKindForCategory("EXAM TRAPS")).toBe("distractor");
    expect(calloutKindForCategory("OTHER TIPS")).toBe("deeper-idea");
    expect(calloutKindForCategory(undefined)).toBe("recap");
    expect(calloutKindForCategory("UNFILED")).toBe("recap");
  });
  test("the kind cycler walks all five then returns to none", () => {
    const seen: (CalloutKind | undefined)[] = [];
    let k: CalloutKind | undefined = undefined;
    for (let i = 0; i < 6; i++) { k = nextCalloutKind(k); seen.push(k); }
    expect(seen.filter(Boolean).length).toBe(5);
    expect(seen[5]).toBeUndefined();
  });
});

describe("previewer integration (source pins)", () => {
  test("a zero-choice frame renders as a callout", () => {
    expect(previewerSrc).toContain('const isCallout = !d.layoutBadge && (d.choices?.length ?? 0) === 0;');
  });
  test("memo drop-to-convert and the controls row are film-gated", () => {
    expect(previewerSrc).toContain("onDragOver={film || !isCallout ? undefined");
    expect(previewerSrc).toContain("onDrop={film || !isCallout ? undefined");
    expect(previewerSrc).toContain("{isCallout && !film && (");
  });
  test("callouts auto-fit their text — no orphaned empty tail (MC cards honor the per-frame width override)", () => {
    expect(previewerSrc).toContain('width: isCallout ? "fit-content" : (wDrag ?? (d as { cardW?: number }).cardW ?? CARD_W) * s');
  });
  test("the demo route renders the shared CalloutBody, not a copy", () => {
    const demo = readFileSync(join(import.meta.dir, "..", "..", "..", "routes", "callout-demo.tsx"), "utf8");
    expect(demo).toContain("CalloutBody");
    expect(demo).not.toContain("choices");
  });
});
