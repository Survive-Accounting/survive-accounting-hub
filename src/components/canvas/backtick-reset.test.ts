// BACKTICK SWEEP — one mental model everywhere: "` wipes the temporary state,
// touches nothing saved" — and never fires while typing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");
const route = readFileSync(join(import.meta.dir, "..", "..", "routes", "study_.canvas.tsx"), "utf8").split("\r\n").join("\n");
const elements = readFileSync(join(import.meta.dir, "cards", "elements.tsx"), "utf8").split("\r\n").join("\n");
const filmLock = readFileSync(join(import.meta.dir, "film-lock.ts"), "utf8").split("\r\n").join("\n");

describe("one typing guard, shared", () => {
  test("isTypingTarget lives in the keyboard-law home", () => {
    expect(filmLock).toContain("export function isTypingTarget");
  });
  test("every ` surface uses it — no hand-rolled activeElement checks remain at key sites", () => {
    expect(previewer).toContain("isTypingTarget(win.document)");
    expect(route).toContain("if (isTypingTarget() || e.shiftKey");
    expect(elements).toContain("if (isTypingTarget()) return;");
    expect(studio).toContain("if (isTypingTarget()) return;"); // F8 quick-capture
  });
});

describe("` = the same full wipe on every filming surface", () => {
  test("rehearse/recording now resets practice + spotlights + arrows + highlights (was highlights-only)", () => {
    const rec = previewer.slice(previewer.indexOf("if (recording) {"), previewer.indexOf("// RECORDING MODE = the FILM POP-OUT"));
    expect(rec).toContain("resetPractice(); setSpots(EMPTY_SPOTS); resetArrows(); setPerfArrows([]); setSelPerf(null); clearExhibitHighlights();");
  });
  test("the canvas surface wipes highlights + selection, nothing saved", () => {
    const site = route.slice(route.indexOf('if (e.code === "Backquote" || e.key === "`") { clearExhibitHighlights();'));
    expect(site.slice(0, 300)).toContain("nd.selected ? { ...nd, selected: false }");
  });
  test("the Studio wipes the strip multi-select", () => {
    expect(studio).toContain('(e.code === "Backquote" || e.key === "`") && qSel.size > 0) { setQSel(new Set()); return; }');
  });
});

describe("the hint", () => {
  test("a one-line \"` resets\" lives in the transport bar — no new help surface", () => {
    expect(previewer).toContain(">` resets</span>");
    expect(previewer).toContain("In a text field it just types a backtick");
  });
});
