// BOSS REVEAL — timings, the automatic FINAL BOSS, and the one hard constraint.
//
// The constraint is the reason most of these exist: nothing in the reveal may
// cover the stem or the choices, at any point, in either orientation. A student
// has to read that question.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  BOSS_REVEAL_CSS, DROP_OFFSET_MS, FLASH_MS, REVEAL_MS, bossLabel, clearsCard, labelSize, revealZone,
} from "./boss-reveal";
import { frameSize } from "./orientation";
import { MAX_GAIN, SFX_DEFAULT } from "./sfx";

// LINE ENDINGS NORMALISED AT READ. These tests assert on raw source text, and the multi-line
// expectations below are written with plain \n. On a Windows checkout git leaves CRLF on disk, so
// every one of those assertions failed against code that was perfectly correct — the suite was red
// on this machine and green on another, for the same commit. Normalising here keeps the
// expectations readable and makes the answer the same everywhere.
const readSrc = (name: string) => readFileSync(join(import.meta.dir, name), "utf8").split("\r\n").join("\n");

const sfx = readSrc("sfx.ts");
const previewer = readSrc("CeqPreviewer.tsx");

describe("the timing", () => {
  test("the whole reveal lands in Lee's 600–900ms window", () => {
    expect(REVEAL_MS).toBeGreaterThanOrEqual(600);
    expect(REVEAL_MS).toBeLessThanOrEqual(900);
  });
  test("the flash is the fast part, and finishes well inside the reveal", () => {
    expect(FLASH_MS).toBeLessThan(REVEAL_MS / 2);
  });
  test("the drop hits ON the flash — a late 808 reads as a mistimed cue", () => {
    expect(DROP_OFFSET_MS).toBeLessThanOrEqual(40);
  });
  test("the CSS is generated FROM the constants, so animation and sound can't drift", () => {
    expect(BOSS_REVEAL_CSS).toContain(`${FLASH_MS}ms`);
    expect(BOSS_REVEAL_CSS).toContain(`${REVEAL_MS - 220}ms`);
  });
  test("it settles — the flash does not sit on screen while Lee talks over the card", () => {
    expect(BOSS_REVEAL_CSS).toContain("sa-boss-settle");
    expect(BOSS_REVEAL_CSS).toContain("opacity: 0");
  });
});

describe("FINAL BOSS is automatic", () => {
  const order = ["q1", "q2", "q3"];
  test("the last CEQ in the set is the final boss, with no separate control", () => {
    expect(bossLabel("q3", order)).toBe("FINAL BOSS");
  });
  test("anything else is just BOSS", () => {
    expect(bossLabel("q1", order)).toBe("BOSS");
    expect(bossLabel("q2", order)).toBe("BOSS");
  });
  test("an empty or unknown set degrades to BOSS rather than throwing mid-take", () => {
    expect(bossLabel("q1", [])).toBe("BOSS");
    expect(bossLabel("nope", order)).toBe("BOSS");
  });
});

describe("THE HARD CONSTRAINT — the reveal never covers the question", () => {
  const land = frameSize("16:9");
  const vert = frameSize("9:16");
  // a landscape card, centred with margin either side
  const landCard = { x: 380, y: 180, w: 700, h: 520 };
  // a vertical card, nearly full width with a band above it
  const vertCard = { x: 40, y: 200, w: 820, h: 700 };

  test("landscape puts the flash in the RIGHT margin, clear of the card", () => {
    const z = revealZone(land, landCard, "16:9")!;
    expect(z).toBeTruthy();
    expect(clearsCard(z, landCard)).toBe(true);
    expect(z.x).toBeGreaterThanOrEqual(landCard.x + landCard.w);
  });
  test("vertical puts it ABOVE the card — the only safe band in a narrow frame", () => {
    const z = revealZone(vert, vertCard, "9:16")!;
    expect(z).toBeTruthy();
    expect(clearsCard(z, vertCard)).toBe(true);
    expect(z.y + z.h).toBeLessThanOrEqual(vertCard.y);
  });
  test("it falls back to the LEFT margin when the right has no room", () => {
    const hugRight = { x: 300, y: 100, w: 1290, h: 600 };  // 10px of right margin
    const z = revealZone(land, hugRight, "16:9")!;
    expect(clearsCard(z, hugRight)).toBe(true);
    expect(z.x + z.w).toBeLessThanOrEqual(hugRight.x);
  });
  test("NO ROOM ⇒ null, and the caller skips the flash rather than drawing over text", () => {
    const fullBleed = { x: 5, y: 0, w: 1590, h: 900 };
    expect(revealZone(land, fullBleed, "16:9")).toBeNull();
    const tallVert = { x: 0, y: 10, w: 900, h: 1580 };
    expect(revealZone(vert, tallVert, "9:16")).toBeNull();
  });
  test("clearsCard actually catches an overlap — the guard is not vacuous", () => {
    expect(clearsCard({ x: 400, y: 200, w: 200, h: 200 }, landCard)).toBe(false);
  });
  test("the label fits its zone in both orientations, and stays readable", () => {
    for (const [frame, card, o] of [[land, landCard, "16:9"], [vert, vertCard, "9:16"]] as const) {
      const z = revealZone(frame, card, o)!;
      const size = labelSize(o, z);
      expect(size).toBeGreaterThanOrEqual(22);   // a game callout, not fine print
      expect(size).toBeLessThanOrEqual(z.h);     // and it fits
    }
  });
});

describe("the 808 can actually be heard", () => {
  test("gain is no longer clamped to 1 — that cap WAS the quiet bug", () => {
    expect(MAX_GAIN).toBeGreaterThan(1);
    expect(sfx).toContain("gain.gain.value = Math.max(0, Math.min(MAX_GAIN, vol));");
  });
  test("the drop defaults LOUD, above the old ceiling", () => {
    expect(SFX_DEFAULT.volume.cramLaunch).toBeGreaterThan(1);
    expect(SFX_DEFAULT.volume.cramLaunch).toBeLessThanOrEqual(MAX_GAIN);
  });
  test("there is an unlock for the suspended-context case, and it REPORTS which it was", () => {
    // A context created without a gesture starts suspended and plays silently —
    // nothing throws, so it has to be asked, not assumed.
    expect(sfx).toContain('export function unlockSfx(): "running" | "suspended" | "unavailable"');
    expect(sfx).toContain("export const sfxReady =");
  });
  test("preloading decodes even while muted — un-muting must not cost a late first cue", () => {
    expect(sfx).toContain("if (reducedMotion()) return;");
    expect(sfx).not.toContain("if (cfg.muted || reducedMotion()) return;\n  for (const ev of");
  });
});

describe("no bolt is burned into the frame", () => {
  test("the persistent top-right boss bolt is gone", () => {
    expect(previewer).not.toContain('className="sa-boss-bolt"');
    expect(previewer).not.toContain("<BoltBoil height={40 * s} />");
  });
  test("the topic kicker draws no bolt either", () => {
    expect(previewer).not.toContain("<Bolt c1={boltCol.c1} c2={boltCol.c2} />");
  });
  test("the counter uses the locked Q x/y format and is still top-right", () => {
    expect(previewer).toContain('<span style={{ opacity: 0.6 }}>Q </span>{d.progress.x}<span style={{ opacity: 0.6 }}>/</span>{d.progress.y}');
  });
});

describe("the reveal is wired, and it exits", () => {
  test("Ctrl+Alt+Click is the trigger — the old bare Alt+Click is gone", () => {
    expect(previewer).toContain("if (e.altKey && e.ctrlKey) { e.preventDefault(); e.stopPropagation(); prLive.toggleBoss?.(); }");
  });
  test("clicking again EXITS instead of re-firing the flash", () => {
    expect(previewer).toContain('if (!arming) { setReveal(null); return; }   // Ctrl+Alt+Click again exits');
  });
  test("` clears the reveal too, in both keymaps", () => {
    expect((previewer.match(/setReveal\(null\);/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  test("the drop fires in the SAME tick as the flash — no setTimeout between them", () => {
    const fn = previewer.slice(previewer.indexOf("const toggleBossFlag ="), previewer.indexOf("const [emph, setEmph]"));
    expect(fn).toContain("unlockOnce();\n    playSfx(\"cramLaunch\");");
    expect(fn).toContain("setReveal({ label: bossLabel(ceqId, deckCeqIds ?? []), zone });");
    // the only timer here is the SETTLE, never a delay before the sound
    expect((fn.match(/setTimeout/g) ?? []).length).toBe(1);
  });
  test("the zone is resolved from the card's ACTUAL spot, so a dragged card still gets clear margin", () => {
    expect(previewer).toContain("const zone = revealZone({ w: frameW, h: frameH }, { x: cs.x, y: cs.y, w: cardW, h: cardH }, orientation());");
  });
  test("no room ⇒ no flash: the reveal only renders when a zone was found", () => {
    expect(previewer).toContain("{reveal?.zone && <BossReveal label={reveal.label} zone={reveal.zone} o={orientation()} />}");
  });
  test("it self-dismisses on REVEAL_MS — Lee talks over a calm card", () => {
    expect(previewer).toContain("revealTimer.current = window.setTimeout(() => setReveal(null), REVEAL_MS);");
  });
  test("the audio context is unlocked on the first key in the film window", () => {
    expect(previewer).toContain("unlockOnce();   // first key in the film window resumes the audio context");
    expect(previewer).toContain("const unlockOnce = useCallback(() => { if (!sfxUnlock.current) sfxUnlock.current = unlockSfx(); }, []);");
  });
});
