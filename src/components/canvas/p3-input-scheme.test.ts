// P3 INPUT SCHEME regression pins — the hands-friendly film-mode map:
// arrows/click = navigate+select (stem is element -1) · Tab = the walk ·
// Space/PgDn = questions · ` = reset · Alt+Click = boss. All of it lives in
// the film controller (A1 law: objects never receive the keys themselves).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const src = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8");
const types = readFileSync(join(import.meta.dir, "types.ts"), "utf8");

describe("navigate / select", () => {
  test("elemNav ranges over the stem (-1) through the choices, wrapping", () => {
    expect(src).toContain("const lo = -1, hi = nChoices - 1;");
  });
  test("arrows navigate on BOTH surfaces (recording + film popout)", () => {
    expect(src).toContain('if (e.key === "ArrowDown" || e.key === "ArrowRight") { elemNav(1); return; }');
    expect(src).toContain('elemNav(e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1);');
  });
  test("film clicks select — choices and the stem — and Alt is reserved for boss", () => {
    expect(src).toContain("prLive.select?.(i);");
    expect(src).toContain("prLive.select?.(-1);");
    expect(src).toMatch(/onClick=\{film \? \(e\) => \{ if \(e\.altKey \|\| inert\) return;/);
  });
});

describe("walk", () => {
  test("Tab walks and Shift+Tab un-walks, on both surfaces (Enter unchanged)", () => {
    expect(src).toContain('if (e.key === "Enter" || e.key === "Tab") { if (e.shiftKey) retreat(); else advance(); return; }');
    expect(src).toContain('if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) retreat(); else advance(); return; }');
  });
  test("a selected-but-drained stem never falls through and resolves choice 0", () => {
    expect(src).toContain('if (emph === -1) return; // stem selected + drained');
  });
});

describe("boss moment", () => {
  test("Ctrl+Alt+Click toggles at the film controller level, capture phase, never on stand-ins (Alt alone = the arrow tool)", () => {
    expect(src).toContain("onClickCapture={film && !inert ? (e) => { if (e.altKey && e.ctrlKey) {");
  });
  test("charge-then-settle is shadow/border only — the film-lock law holds", () => {
    const css = src.slice(src.indexOf("@keyframes sa-boss-charge"), src.indexOf(".sa-pv-node .sa-grip-film"));
    expect(css).toContain("box-shadow");
    expect(css).not.toMatch(/sa-boss-card[^}]*transform|width|height/);
  });
  test("boss state is film-local presentation state — never written to the scene", () => {
    expect(src).toContain("const [bossOn, setBossOn] = useState(false);");
    expect(src).not.toContain("patchDataCmd(rflW, id, { boss");
  });
  test("per-set auto-arm exists on DeckDef, default off", () => {
    expect(types).toContain("bossAutoArm?: boolean;");
  });
});
