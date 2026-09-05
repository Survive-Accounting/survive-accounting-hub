// THE REFLOW RATCHET (polish pass, 2026-09-05). A live highlight on the take must
// never change the slide's layout under the camera: the emphasis rule is paint only,
// the ctrl+click spotlight does not also select, and the spotlight does not rewrap.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { SEL_EMPH_CSS } from "./text-highlights";

// CRLF-proof at read (import-cycles.test pins that every source-pin test does this).
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").split("\r\n").join("\n");

describe("live highlighting stays paint-only", () => {
  test(".sa-sel-emph sets no layout property", () => {
    const rule = /\.sa-sel-emph \{([^}]*)\}/.exec(SEL_EMPH_CSS)?.[1] ?? "";
    expect(rule.length).toBeGreaterThan(0);
    expect(rule).not.toMatch(/font-weight|padding|font-size|margin|letter-spacing|border(?!-radius)/);
    expect(rule).toContain("background");
  });
  test("ctrl+click on a stem or a choice is the spotlight's, never a select", () => {
    const pv = src("./CeqPreviewer.tsx");
    const guards = pv.match(/onClick=\{film \? \(e\) => \{ if \(e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey \|\| inert\) return;/g) ?? [];
    expect(guards.length).toBe(2);
  });
  test("the spotlight does not change a choice's weight", () => {
    const pv = src("./CeqPreviewer.tsx");
    const body = pv.slice(pv.indexOf("function containSpot("), pv.indexOf("// HOISTED ON PURPOSE"));
    expect((body.match(/fontWeight: "inherit"/g) ?? []).length).toBe(2);
  });
  test("ad copy is highlightable on the take, keyed by the frame", () => {
    const ad = src("../blastoff/AdSlide.tsx");
    expect(ad).toContain("hlKey?: string");
    expect(ad).toContain("hlx.setMemo(k, r)");
    expect(src("../blastoff/frame-view.tsx")).toContain("hlKey={live ? frame.id : undefined}");
  });
});
