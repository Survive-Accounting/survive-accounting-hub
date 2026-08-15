// LAYOUT REWORK — pins for the model Lee specced: Layout opens the BASE FRAME,
// the apply decision happens at SAVE TIME, frames can opt out, and the HARD
// RULE holds: layout application is author-time only, never runtime.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { templateFor } from "./ceq-geom";

const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8");
const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8");

describe("templateFor — the one opt-out gate", () => {
  const layout = { card: { x: 1, y: 2 } };
  test("opted-out frames never see the template", () => {
    expect(templateFor(true, layout)).toBeUndefined();
  });
  test("everyone else does (undefined opt-out = normal)", () => {
    expect(templateFor(false, layout)).toBe(layout);
    expect(templateFor(undefined, layout)).toBe(layout);
  });
});

describe("the flow", () => {
  test("Edit set layout opens the base frame in the unmistakable editing state", () => {
    expect(previewer).toContain("Edit set layout…");
    expect(studio).toContain("Editing set layout — the base frame every frame deals from");
  });
  test("Done → the save-time apply choice, with honest counts", () => {
    expect(studio).toContain("Layout saved — apply it?");
    expect(studio).toContain("hand-placed geometry that applying will overwrite");
    expect(studio).toContain('opted out (📐)');
  });
  test("the toggle-time window.confirm is gone — apply lives at save time only", () => {
    const fn = studio.slice(studio.indexOf("const setLayoutMode"), studio.indexOf("const spineRows"));
    expect(fn).not.toContain("window.confirm");
    expect(fn).not.toContain("applyLayoutToAll");
  });
  test("apply-to-all hard-skips opted-out frames and says so", () => {
    const fn = studio.slice(studio.indexOf("const applyLayoutToAll"), studio.indexOf("const setLayoutMode"));
    expect(fn).toContain("if (d.ignoreLayout) { optedOut++; continue; }");
    expect(fn).toContain("opted out, untouched");
  });
});

describe("HARD RULE — layout application is author-time, save-time only", () => {
  test("stampFromTemplate has exactly ONE call site: applyLayoutToAll", () => {
    const calls = studio.match(/stampFromTemplate\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const fn = studio.slice(studio.indexOf("const applyLayoutToAll"), studio.indexOf("const setLayoutMode"));
    expect(fn).toContain("stampFromTemplate(");
    expect(previewer).not.toContain("stampFromTemplate");
  });
  test("every render-time resolve honors the opt-out via templateFor", () => {
    expect((previewer.match(/templateFor\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
