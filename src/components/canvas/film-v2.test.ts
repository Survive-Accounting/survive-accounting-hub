// FILM V2 (the one-frame speed experiment) — pins. V1 (stack) stays default;
// V2's guarantee is STRUCTURAL: the stack is off, the frame sits at origin,
// the camera has nothing to pan to — the black-flash class cannot occur.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const src = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");

describe("film v2", () => {
  test("V2 disables the stack — one stationary frame (recording/rehearse keeps V1)", () => {
    expect(src).toContain("const filmStack = ((!!filmWin && !filmV2) || recording) && !!deckCeqIds");
  });
  test("the chooser: V1 and the V2 experiment, pref persisted", () => {
    expect(src).toContain("Film V1");
    expect(src).toContain("V2 ⚡");
    expect(src).toContain('localStorage.getItem("sa-film-mode")');
  });
  test("V2 transitions are a pure-opacity crossfade — zero movement, tunable duration (Step 3)", () => {
    expect(src).toContain("v2Film ? `sa-ceq-v2-fade ${fadeMs}ms ease-out both`");
    const kf = src.slice(src.indexOf("@keyframes sa-ceq-v2-fade"), src.indexOf("/* BOSS MOMENT"));
    expect(kf).toContain("opacity");
    expect(kf).not.toMatch(/transform|translate|scale/);
  });
  test("the backslash key keeps the stored pref (toggleFilm argless call sites)", () => {
    expect(src).toContain("const toggleFilm = (v2?: boolean, capture?: boolean) =>");
    expect(src).not.toMatch(/onClick=\{toggleFilm\}/); // never passes the event as the mode
  });
});
