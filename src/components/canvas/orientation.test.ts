// VERTICAL FILMING — the frame model.
//
// The rule these defend: orientation is a LAYOUT concern, never a content fork.
// One CEQ, two ways of drawing it. And 9:16 is not 16:9 shrunk — it is watched
// on a phone at arm's length, so type steps UP and the card is re-typeset.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { captureCssSize, isCaptureExact, physicalSize } from "./capture-window";
import {
  CARD_BAND_RANGE, DEFAULT_ORIENTATION, DEFAULT_VERTICAL_BANDS, MIN_TYPE, ORIENTATIONS, TYPE_SCALE,
  captureSize, clampBands, clearsEndScreen, exhibitFit, frameSize, isVertical, safeZones, typeSize,
  verticalZones,
} from "./orientation";

describe("the two shapes", () => {
  test("capture sizes are the delivered pixels for each", () => {
    expect(captureSize("16:9")).toEqual({ w: 1920, h: 1080 });
    expect(captureSize("9:16")).toEqual({ w: 1080, h: 1920 });
  });
  test("the authoring frame matches its capture aspect — nothing distorts between authoring and film", () => {
    for (const o of ORIENTATIONS) {
      const f = frameSize(o), c = captureSize(o);
      expect(f.w / f.h).toBeCloseTo(c.w / c.h, 4);
    }
  });
  test("landscape is the default — vertical is the second pass, never the surprise", () => {
    expect(DEFAULT_ORIENTATION).toBe("16:9");
    expect(isVertical("16:9")).toBe(false);
    expect(isVertical("9:16")).toBe(true);
  });
});

describe("type steps UP in vertical, and has a floor", () => {
  test("vertical scales type up, not down", () => {
    expect(TYPE_SCALE["9:16"]).toBeGreaterThan(1);
    expect(TYPE_SCALE["16:9"]).toBe(1);
  });
  test("a stem set for landscape gets bigger in vertical", () => {
    expect(typeSize(40, "9:16")).toBeGreaterThan(typeSize(40, "16:9"));
  });
  test("nothing may drop below the legibility floor, in either orientation", () => {
    expect(typeSize(4, "16:9", "stem")).toBe(MIN_TYPE.stem);
    expect(typeSize(4, "9:16", "choice")).toBe(MIN_TYPE.choice);
  });
  test("a choice may be smaller than a stem, but both stay readable", () => {
    expect(MIN_TYPE.choice).toBeLessThanOrEqual(MIN_TYPE.stem);
    expect(MIN_TYPE.choice).toBeGreaterThan(20);
  });
});

describe("the vertical composition", () => {
  test("card on top, camera below, and together they fill the frame exactly", () => {
    const z = verticalZones("9:16");
    const { h } = frameSize("9:16");
    expect(z.card.y).toBe(0);
    expect(z.camera.y).toBe(z.card.h);
    expect(z.card.h + z.camera.h).toBe(h);       // no gap, no overlap
  });
  test("the card band sits in Lee's 55–65% range by default", () => {
    expect(DEFAULT_VERTICAL_BANDS.card).toBeGreaterThanOrEqual(CARD_BAND_RANGE.min);
    expect(DEFAULT_VERTICAL_BANDS.card).toBeLessThanOrEqual(CARD_BAND_RANGE.max);
  });
  test("a band outside the range is CLAMPED — too tall leaves the cutout no room", () => {
    expect(clampBands({ card: 0.95 }).card).toBe(CARD_BAND_RANGE.max);
    expect(clampBands({ card: 0.1 }).card).toBe(CARD_BAND_RANGE.min);
  });
  test("the two bands always sum to 1, whatever is asked for", () => {
    for (const card of [0.3, 0.55, 0.6, 0.65, 0.99]) {
      const b = clampBands({ card });
      expect(b.card + b.camera).toBeCloseTo(1, 3);
    }
  });
  test("landscape keeps its own composition — the cutout floats, it owns no band", () => {
    const z = verticalZones("16:9");
    const { w, h } = frameSize("16:9");
    expect(z.card).toEqual({ x: 0, y: 0, w, h });   // the card has the whole frame
    expect(z.camera.w).toBeLessThan(w);
  });
});

describe("film-safe guides, recomputed per orientation", () => {
  test("title-safe is inset inside the frame in both", () => {
    for (const o of ORIENTATIONS) {
      const { titleSafe } = safeZones(o);
      const f = frameSize(o);
      expect(titleSafe.x).toBeGreaterThan(0);
      expect(titleSafe.x + titleSafe.w).toBeLessThan(f.w);
      expect(titleSafe.y + titleSafe.h).toBeLessThan(f.h);
    }
  });
  test("vertical's end-screen zone is the SOCIAL CHROME band — full width, along the bottom", () => {
    const z = safeZones("9:16").endScreen;
    const f = frameSize("9:16");
    expect(z.w).toBe(f.w);                       // captions/handles span the width
    expect(z.y + z.h).toBe(f.h);                 // and sit at the very bottom
  });
  test("the camera zone in the guides IS the composition's camera band — one source of truth", () => {
    expect(safeZones("9:16").camera).toEqual(verticalZones("9:16").camera);
  });
  test("clearsEndScreen catches a punchline that would sit under a TikTok caption", () => {
    const f = frameSize("9:16");
    expect(clearsEndScreen({ x: 0, y: 0, w: f.w, h: 100 }, "9:16")).toBe(true);
    expect(clearsEndScreen({ x: 0, y: Math.round(f.h * 0.9), w: f.w, h: 80 }, "9:16")).toBe(false);
  });
  test("the watermark zone stays clear of the frame edges in vertical", () => {
    const { watermark } = safeZones("9:16");
    const f = frameSize("9:16");
    expect(watermark.x + watermark.w).toBeLessThanOrEqual(f.w);
    expect(watermark.y).toBeGreaterThan(0);
  });
});

describe("exhibit reflow (shared — future cards inherit it)", () => {
  test("a landscape-authored exhibit SHRINKS to fit the vertical card band", () => {
    const s = exhibitFit({ w: 900, h: 560 }, "9:16");
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThan(0);
  });
  test("it never blows an exhibit up past its authored size — that only softens it", () => {
    expect(exhibitFit({ w: 50, h: 40 }, "9:16")).toBe(1);
    expect(exhibitFit({ w: 50, h: 40 }, "16:9")).toBe(1);
  });
  test("the scaled exhibit actually FITS the band it was fitted to", () => {
    const nat = { w: 900, h: 560 };
    const s = exhibitFit(nat, "9:16");
    const band = verticalZones("9:16").card;
    expect(nat.w * s).toBeLessThanOrEqual(band.w);
    expect(nat.h * s).toBeLessThanOrEqual(band.h);
  });
  test("a degenerate size returns 1 rather than NaN or Infinity", () => {
    expect(exhibitFit({ w: 0, h: 0 }, "9:16")).toBe(1);
  });
});

describe("the capture window is pixel-exact in BOTH orientations", () => {
  test("vertical divides cleanly at the common Windows scalings", () => {
    expect(captureCssSize(1, "9:16")).toEqual({ w: 1080, h: 1920, exact: true });
    expect(captureCssSize(1.5, "9:16")).toEqual({ w: 720, h: 1280, exact: true });
    expect(captureCssSize(2, "9:16")).toEqual({ w: 540, h: 960, exact: true });
  });
  test("exactness is judged against the RIGHT target for the orientation", () => {
    expect(isCaptureExact(720, 1280, 1.5, "9:16")).toBe(true);
    expect(isCaptureExact(720, 1280, 1.5, "16:9")).toBe(false);   // that's a vertical window
    expect(isCaptureExact(1280, 720, 1.5, "16:9")).toBe(true);
  });
  test("one CSS pixel off is still wrong — the badge must not round it away", () => {
    expect(isCaptureExact(719, 1280, 1.5, "9:16")).toBe(false);
  });
  test("physical size is orientation-agnostic — it just reports what OBS sees", () => {
    expect(physicalSize(540, 960, 2)).toEqual({ w: 1080, h: 1920 });
  });
  test("landscape callers that pass no orientation keep their old behaviour", () => {
    expect(captureCssSize(1)).toEqual({ w: 1920, h: 1080, exact: true });
  });
});

describe("orientation is layout, never a content fork", () => {
  const src = readFileSync(join(import.meta.dir, "orientation.ts"), "utf8").split("\r\n").join("\n");
  test("the model touches geometry and type only — it knows nothing about CEQ content", () => {
    for (const forbidden of ["choices", "stem:", "memo", "prompt", "correct"]) {
      expect(src.toLowerCase()).not.toContain(forbidden.toLowerCase() + " =");
    }
  });
  test("no crop/reframe renderer was built — verticals are FILMED vertical", () => {
    // Strip comments first: the header EXPLAINS that there is no crop path, and
    // matching prose would fail on the very sentence stating the rule.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/crop|letterbox/i);
  });
});

// ---------------------------------------------------------------- wiring pins
describe("the workspace wiring", () => {
  const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");
  const inbox = readFileSync(join(import.meta.dir, "TakesInbox.tsx"), "utf8").split("\r\n").join("\n");
  const previewer = readFileSync(join(import.meta.dir, "CeqPreviewer.tsx"), "utf8").split("\r\n").join("\n");
  const store = readFileSync(join(import.meta.dir, "orientation-store.ts"), "utf8").split("\r\n").join("\n");

  test("one store, subscribed — the studio and the capture popout can never disagree", () => {
    // They are ONE React tree (PanelPopout), so a prop would have to thread
    // through three boundaries; a module store is the same call the slate made.
    expect(studio).toContain("useEffect(() => subscribeOrientation(setOrient), []);");
    expect(previewer).toContain("useEffect(() => subscribeOrientation(setO), []);");
  });
  test("the toggle offers exactly the two shapes and nothing else", () => {
    expect(studio).toContain('{(["16:9", "9:16"] as const).map((o) => (');
  });
  test("the frame RENDERS in the active shape", () => {
    expect(studio).toContain("frameW={isVertical(orient) ? frameSize(orient).w : frameW}");
  });
  test("the capture window opens and snaps to the ACTIVE orientation's pixels", () => {
    expect(previewer).toContain("const css = capture ? captureCssSize(window.devicePixelRatio || 1, o) : null;");
    expect(previewer).toContain("snapCaptureSize(w, (ok, why) => setCaptureNote(ok ? null : why ?? null), o)");
  });
  test("a take is stamped with what it was FILMED in, at ingest", () => {
    expect(inbox).toContain("const rec = makeRecord(f, { orientation: orientation(),");
  });
  test("the stamp rides onto the attached clip, so the publish gate can see it", () => {
    expect(studio).toContain("...(t.orientation ? { orientation: t.orientation } : {})");
  });
  test("orientation survives a refresh — a mid-set revert would film the rest wrong", () => {
    expect(store).toContain('const KEY = "sa-orientation";');
    expect(store).toContain("localStorage.setItem(KEY, o)");
  });
  test("the store defaults to landscape and refuses junk from storage", () => {
    expect(store).toContain('(ORIENTATIONS as readonly string[]).includes(v ?? "") ? (v as Orientation) : DEFAULT_ORIENTATION');
  });
});

describe("exhibit reflow is wired into the SHARED shell", () => {
  const base = readFileSync(join(import.meta.dir, "exhibit-base.tsx"), "utf8").split("\r\n").join("\n");

  test("every exhibit card inherits the fit by using the shell — no per-card code", () => {
    expect(base).toContain('const fit = isVertical(o) ? exhibitFit({ w: width, h: minHeight }, o) : 1;');
    // CycleNode still declares and paints; it must not learn about orientation.
    const cycle = readFileSync(join(import.meta.dir, "cards", "CycleNode.tsx"), "utf8").split("\r\n").join("\n");
    expect(cycle).not.toContain("orientation");
    expect(cycle).not.toContain("exhibitFit");
  });
  test("LANDSCAPE IS UNTOUCHED: fit is exactly 1 and no wrapper is emitted", () => {
    // Lee films landscape today; the vertical work must not be able to disturb it.
    expect(exhibitFit({ w: 900, h: 560 }, "16:9")).toBe(1);
    expect(base).toContain("{fit < 1 ? (");
    expect(base).toContain(") : children}");
  });
  test("the inner box keeps its NATURAL size — the card's own maths stay valid", () => {
    // pill %s and the arc viewBox are computed against the authored size; scaling
    // the outer box instead would desynchronise them from the arcs.
    expect(base).toContain('<div style={{ width, minHeight, transform: `scale(${fit})`, transformOrigin: "top left" }}>{children}</div>');
  });
  test("the outer box reports the SCALED size, so neighbours don't overlap it", () => {
    expect(base).toContain("style={fit < 1 ? { width: Math.round(width * fit), minHeight: Math.round(minHeight * fit) } : { width, minHeight }}");
  });
});
