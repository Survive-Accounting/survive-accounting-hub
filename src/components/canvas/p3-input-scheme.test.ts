// P3 INPUT SCHEME regression pins — the hands-friendly film-mode map:
// arrows/click = navigate+select (stem is element -1) · Tab = the walk ·
// Space/PgDn = questions · ` = reset · Alt+Click = boss. All of it lives in
// the film controller (A1 law: objects never receive the keys themselves).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const src = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
const types = readFileSync(join(import.meta.dir, "types.ts"), "utf8").split("\r\n").join("\n");

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
    // ctrl/meta belong to the spotlight (polish pass, 2026-09-05): a ctrl+click must not also select.
    expect(src).toMatch(/onClick=\{film \? \(e\) => \{ if \(e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey \|\| inert\) return;/);
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
  test("Ctrl+Alt+Click toggles at the controller level, capture phase, never on stand-ins (Alt alone = the arrow tool)", () => {
    expect(src).toContain("onClickCapture={!inert ? (e) => { if (e.altKey && e.ctrlKey) {");
  });
  test("charge-then-settle is shadow/border only — the film-lock law holds", () => {
    const css = src.slice(src.indexOf("@keyframes sa-boss-charge"), src.indexOf(".sa-pv-node .sa-grip-film"));
    expect(css).toContain("box-shadow");
    expect(css).not.toMatch(/sa-boss-card[^}]*transform|width|height/);
  });
  test("boss is the SAVED card flag now (Lee 08-15): Ctrl+Alt+Click marks it, the 808 fires on arm", () => {
    expect(src).toContain("const toggleBossFlag = () => {");
    // 08-17: the 808 now fires as part of the REVEAL, after an autoplay unlock —
    // it still fires only on ARM (a second Ctrl+Alt+Click exits silently).
    expect(src).toContain('if (!arming) { setReveal(null); return; }');
    expect(src).toContain('playSfx("cramLaunch");');
    expect(src).not.toContain("const [bossOn, setBossOn]"); // the film-local state is gone
  });
  test("the charge + bolt render straight from the saved flag", () => {
    expect(src).toContain('(d as { boss?: boolean }).boss ? " sa-boss-card" : ""');
  });
});
