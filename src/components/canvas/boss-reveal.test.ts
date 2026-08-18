// BOSS REVEAL — timings, the automatic FINAL BOSS, and the one hard constraint.
//
// The constraint is the reason most of these exist: nothing in the reveal may
// cover the stem or the choices, at any point, in either orientation. A student
// has to read that question.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  BOSS_REVEAL_CSS, DROP_OFFSET_MS, FLASH_MS, REVEAL_MS, SCRIM_ALPHA, bossLabel, labelSize, revealZone,
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
    expect(bossLabel("q3", order)).toBe("FINAL Boss Question!");
  });
  test("anything else is just the boss callout", () => {
    expect(bossLabel("q1", order)).toBe("Boss Question!");
    expect(bossLabel("q2", order)).toBe("Boss Question!");
  });
  test("an empty or unknown set degrades gracefully rather than throwing mid-take", () => {
    expect(bossLabel("q1", [])).toBe("Boss Question!");
    expect(bossLabel("nope", order)).toBe("Boss Question!");
  });
  test("the label reads as a callout, not a logo", () => {
    // "B O S S" alone read as branding; Lee asked for the exclamation.
    expect(bossLabel("q1", order)).toContain("Question!");
  });
});

describe("CENTRE STAGE — the constraint is met by the scrim, not by margins", () => {
  // SUPERSEDES the margin model. The question is obscured for the beat and fully
  // legible the instant the scrim lifts, which is what the old rule protected.
  test("the zone is the WHOLE frame, in both orientations", () => {
    for (const o of ["16:9", "9:16"] as const) {
      const f = frameSize(o);
      expect(revealZone(f)).toEqual({ x: 0, y: 0, w: f.w, h: f.h });
    }
  });
  test("the scrim is dark enough to push the card back, but never blacks the frame", () => {
    expect(SCRIM_ALPHA).toBeGreaterThan(0.5);
    expect(SCRIM_ALPHA).toBeLessThan(0.9);
  });
  test("the scrim FADES and never scales — a scaling dim reads as a zoom", () => {
    expect(BOSS_REVEAL_CSS).toContain("sa-boss-unscrim");
    const rule = BOSS_REVEAL_CSS.slice(BOSS_REVEAL_CSS.indexOf(".sa-boss-scrim"));
    expect(rule.slice(0, rule.indexOf("}"))).not.toContain("sa-boss-settle");
  });
  test("the scrim lifts BEFORE the reveal window closes, so the card is readable again", () => {
    expect(BOSS_REVEAL_CSS).toContain(`${REVEAL_MS - 260}ms`);
  });
  test("the label is sized off the frame width and stays big in vertical", () => {
    const land = labelSize("16:9", frameSize("16:9"));
    const vert = labelSize("9:16", frameSize("9:16"));
    expect(land).toBeGreaterThanOrEqual(28);
    expect(vert).toBeGreaterThanOrEqual(28);
    // one line has to fit across a 900-wide frame with the tracking applied
    expect(vert).toBeLessThan(frameSize("9:16").w / 6);
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
    expect(fn).toContain("unlockOnce();");
    expect(fn).toContain('playSfx("cramLaunch");');
    expect(fn).toContain("setReveal({ label: bossLabel(ceqId, deckCeqIds ?? []), zone: revealZone({ w: frameW, h: frameH }) });");
    // the only timer here is the SETTLE, never a delay before the sound
    expect((fn.match(/setTimeout/g) ?? []).length).toBe(1);
  });
  test("the reveal is CENTRED on the frame — it no longer hunts for a free margin", () => {
    expect(previewer).toContain("zone: revealZone({ w: frameW, h: frameH })");
    // The margin hunt is gone: the trigger no longer measures the card at all.
    const fn = previewer.slice(previewer.indexOf("const toggleBossFlag ="), previewer.indexOf("const [emph, setEmph]"));
    expect(fn).not.toContain("cardW");
    expect(fn).not.toContain("resolveCardSpot");
  });
  test("the scrim renders behind the flash, and fades rather than scaling", () => {
    expect(previewer).toContain('<div className="sa-boss-scrim"');
    expect(previewer).toContain("background: `rgba(6,10,20,${SCRIM_ALPHA})`");
  });
  test("it always renders when armed — there is no no-room case any more", () => {
    expect(previewer).toContain("{reveal && <BossReveal label={reveal.label} zone={reveal.zone} o={orientation()} />}");
  });
  test("it self-dismisses on REVEAL_MS — Lee talks over a calm card", () => {
    expect(previewer).toContain("revealTimer.current = window.setTimeout(() => setReveal(null), REVEAL_MS);");
  });
  test("the audio context is unlocked on the first key in the film window", () => {
    expect(previewer).toContain("unlockOnce();   // first key in the film window resumes the audio context");
    expect(previewer).toContain("const unlockOnce = useCallback(() => { if (!sfxUnlock.current) sfxUnlock.current = unlockSfx(); }, []);");
  });
});
