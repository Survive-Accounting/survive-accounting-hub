// The brand kit's rules, pinned: nothing re-typed that the app already owns, every critical word
// inside the crops it has to survive, and Lee's copy rules for these surfaces.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";

import { fontFaceCss, GUIDE_ATTR } from "./export-png";
import { BOLT_INK, BOLT_KEYLINE, BOLT_VB, boltRectCentered } from "./geometry";
import {
  AVATAR_FILL, AVATAR_MIN_CLEARANCE, avatarClearance, BANNER, BANNER_COPY, BANNER_SAFE, BANNER_TRAIL_IDS, BANNER_VIEWS,
  bannerStack, bannerTrail, CAMPUS_CHECK_IDS, rectInside, rectsOverlap,
} from "./social";
import {
  conceptParts, containRect, coverRect, cramNumbers, defaultThumbSpec, exportProblem, fitSocialTitle, GRID_CROPS, layoutTitle, LAYOUT, seriesLabel,
  seriesTitleCap, socialLowerThird, thumbFilename, videoRows,
} from "./thumbnail";
import { accentFor, colorwayFor, contrastRatio, KIT, KIT_FONT_FILES, NEUTRAL_COLORWAY_ID } from "./tokens";
import { WORDMARK, wordmarkLayout } from "./wordmark";

const ROOT = resolve(import.meta.dir, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("tokens are the app's own", () => {
  test("navy is styles.css --brand-navy", () => {
    const m = /--brand-navy:\s*(#[0-9A-Fa-f]{6})/.exec(read("src/styles.css"));
    expect(m?.[1].toUpperCase()).toBe(KIT.navy.toUpperCase());
  });
  test("every embedded face is a real TTF and the family the brand stacks lead with", () => {
    for (const f of KIT_FONT_FILES) expect(existsSync(resolve(ROOT, "public", f.url.replace(/^\//, "")))).toBe(true);
    expect(BRAND_DISPLAY.startsWith("'Rubik'")).toBe(true);
    expect(BRAND_SANS.startsWith("'Inter'")).toBe(true);
    expect(KIT_FONT_FILES.map((f) => f.family)).toEqual(["Rubik", "Inter", "Inter"]);
  });
  test("campus colours come from the school table, never retyped", () => {
    expect(colorwayFor("lsu").c1).toBe(colorwayFor("lsu").c1.toUpperCase());
    expect(() => colorwayFor("not-a-school")).toThrow();
    expect(colorwayFor(null).id).toBe(NEUTRAL_COLORWAY_ID);
    expect(colorwayFor(null).c1).toBe(KIT.boltLit);
  });
});

describe("the one campus accent", () => {
  test("picks the colour that reads on the navy", () => {
    // Ole Miss's primary IS the navy; LSU's purple sinks into it; Tennessee's secondary is white.
    expect(colorwayFor("ole-miss").accent).toBe(colorwayFor("ole-miss").c2);
    expect(colorwayFor("lsu").accent).toBe(colorwayFor("lsu").c2);
    expect(colorwayFor("tennessee").accent).toBe(colorwayFor("tennessee").c1);
    expect(colorwayFor("arkansas").accent).toBe(colorwayFor("arkansas").c1);
  });
  test("every campus the kit previews gets an accent that stands off the navy", () => {
    for (const id of [...CAMPUS_CHECK_IDS, ...BANNER_TRAIL_IDS, "arkansas", NEUTRAL_COLORWAY_ID]) {
      expect(contrastRatio(colorwayFor(id).accent, KIT.navy)).toBeGreaterThanOrEqual(1.9);
    }
  });
  test("falls back to the stronger of two weak colours", () => {
    expect(accentFor("#14213D", "#1B1B1B")).toBe("#1B1B1B");
  });
});

describe("the bolt's geometry is read off brand.tsx", () => {
  test("the keyline is brand.tsx's", () => {
    expect(BOLT_KEYLINE).toBe(8);
  });
  test("the ink sits inside the viewBox", () => {
    expect(BOLT_INK.x).toBeGreaterThan(BOLT_VB.x);
    expect(BOLT_INK.y).toBeGreaterThan(BOLT_VB.y);
    expect(BOLT_INK.x + BOLT_INK.w).toBeLessThan(BOLT_VB.x + BOLT_VB.w);
    expect(BOLT_INK.y + BOLT_INK.h).toBeLessThan(BOLT_VB.y + BOLT_VB.h);
  });
  test("a centred bolt puts its INK centre on the target", () => {
    const r = boltRectCentered(500, 700, 300);
    const s = r.h / BOLT_VB.h;
    expect(r.x + (BOLT_INK.cx - BOLT_VB.x) * s).toBeCloseTo(500, 6);
    expect(r.y + (BOLT_INK.cy - BOLT_VB.y) * s).toBeCloseTo(700, 6);
    expect(BOLT_INK.h * s).toBeCloseTo(300, 6);
  });
});

describe("the wordmark is SurviveWordmark's lockup", () => {
  test("bolt-boil.tsx still bakes the numbers wordmark.ts copies", () => {
    const src = read("src/components/brand-cards/bolt-boil.tsx");
    expect(src).toContain(`boltScale = ${WORDMARK.boltScale}, boltGap = ${WORDMARK.boltGap}`);
    expect(src).toContain(`size * ${WORDMARK.drop}}px) rotate(${WORDMARK.lean}deg)`);
    expect(src).toContain("size * (-1 / 96)");
    expect(src).toContain(`"100% ${WORDMARK.pivotY * 100}%"`);
    expect(src).toContain(`letterSpacing: "${WORDMARK.tracking}em"`);
  });
  test("lays the pieces out left to right", () => {
    const L = wordmarkLayout(100, 100, 50);
    expect(L.boltH).toBeCloseTo(80, 6);
    expect(L.boltX).toBeCloseTo(100 - 1.5 - 100 / 96, 6);
    expect(L.veX).toBeCloseTo(98.5 + L.boltW + 3, 6);
    expect(L.width).toBeCloseTo(L.veX + 50, 6);
    expect(L.bottom).toBeCloseTo(13, 6);
  });
});

describe("the thumbnail system", () => {
  test("series labels", () => {
    expect(seriesLabel(1, "3")).toBe("EXAM 1 · 03");
    expect(seriesLabel(1, "Easy Points")).toBe("EXAM 1 · EASY POINTS");
    expect(seriesLabel(2, "12")).toBe("EXAM 2 · 12");
    expect(seriesLabel(1, "  ")).toBe("EXAM 1");
  });

  const m = (t: string, s: number) => t.length * s * 0.62;
  const opts = { ...LAYOUT.social.title, maxHeight: socialLowerThird({ kicker: "", subtitle: "" }).titleRoom };

  test("the title is as big as it fits, on as few lines as that allows", () => {
    const t = layoutTitle("5 types of accounts", m, opts);
    expect(t).toEqual({ lines: ["5 TYPES OF", "ACCOUNTS"], size: 144, fits: true });
  });
  test("Lee's own line breaks are kept", () => {
    expect(layoutTitle("5 types of\naccounts", m, opts).lines).toEqual(["5 TYPES OF", "ACCOUNTS"]);
    expect(layoutTitle("Assets", m, opts).lines).toEqual(["ASSETS"]);
  });
  test("a series shares its hardest title's size", () => {
    const base = { kicker: "TYPES OF ACCOUNTS", subtitle: "" };
    const titles = ["Assets", "Liabilities", "Equity"];
    const cap = seriesTitleCap(titles.map((title) => ({ ...base, title })), m);
    const each = titles.map((title) => fitSocialTitle({ ...base, title, titleCap: null }, m).size);
    expect(cap).toBe(Math.min(...each));
    expect(each[0]).toBeGreaterThan(cap!);
    for (const title of titles) expect(fitSocialTitle({ ...base, title, titleCap: cap }, m).size).toBe(cap!);
    expect(seriesTitleCap([], m)).toBeNull();
  });
  test("a title that can't fit says so", () => {
    expect(layoutTitle("Supercalifragilisticexpialidocious", m, opts).fits).toBe(false);
  });

  test("the social cover keeps its critical words inside the grid crops", () => {
    const [g34, g11] = GRID_CROPS.map((g) => g.box);
    const b = socialLowerThird({ kicker: "TYPES OF ACCOUNTS", subtitle: "x" });
    expect(b.top).toBeGreaterThanOrEqual(g11.y);
    expect(b.bottom).toBeLessThanOrEqual(g11.y + g11.h);
    expect(b.titleRoom).toBeGreaterThan(LAYOUT.social.title.minSize * 0.72);
    expect(LAYOUT.social.pill.y).toBeGreaterThanOrEqual(g34.y);
    const wmBottom = LAYOUT.social.mark.baseline + LAYOUT.social.mark.wordmark * WORDMARK.drop;
    expect(wmBottom).toBeLessThanOrEqual(g34.y + g34.h);
  });

  test("a frame always fills the card and slides within its overhang", () => {
    const box = { x: 0, y: 0, w: 1080, h: 1920 };
    expect(coverRect({ w: 1000, h: 1000 }, box)).toEqual({ x: -420, y: 0, w: 1920, h: 1920 });
    expect(coverRect({ w: 1000, h: 1000 }, box, 1.5, -1).y).toBeCloseTo(0, 6);
    expect(coverRect({ w: 1000, h: 1000 }, box, 1.5, 1).y).toBeCloseTo(-960, 6);
    expect(containRect({ w: 1000, h: 500 }, { x: 90, y: 400, w: 900, h: 720 })).toEqual({ x: 90, y: 535, w: 900, h: 450 });
  });

  test("concept lines", () => {
    expect(conceptParts("stat", "5 | types")).toEqual({ kind: "stat", value: "5", caption: "TYPES" });
    expect(conceptParts("stat", "5 types")).toEqual({ kind: "stat", value: "5", caption: "TYPES" });
    expect(conceptParts("equation", "A=L+E")).toEqual({ kind: "equation", tokens: [
      { text: "A", op: false }, { text: "=", op: true }, { text: "L", op: false }, { text: "+", op: true }, { text: "E", op: false },
    ] });
    expect(conceptParts("list", "Assets, Liabilities\nEquity")).toEqual({ kind: "list", items: ["Assets", "Liabilities", "Equity"] });
    expect(conceptParts("vs", "Cash vs Accrual")).toEqual({ kind: "vs", a: "CASH", b: "ACCRUAL" });
    expect(conceptParts("vs", "just one")).toBeNull();
    expect(conceptParts("stat", "   ")).toBeNull();
    expect(conceptParts("bolt", "")).toEqual({ kind: "bolt" });
  });

  test("nothing exports with a placeholder in it", () => {
    const bolt = defaultThumbSpec({ concept: { kind: "bolt", text: "" } });
    expect(exportProblem(bolt, "site")).toBeNull();
    expect(exportProblem(bolt, "social")).toMatch(/title/);
    expect(exportProblem({ ...bolt, title: "Assets" }, "social")).toBeNull();
    expect(exportProblem({ ...bolt, visualType: "frame" }, "site")).toMatch(/frame/);
    expect(exportProblem({ ...bolt, visualType: "illustration" }, "site")).toMatch(/illustration/);
    expect(exportProblem({ ...bolt, concept: { kind: "list", text: "" } }, "site")).toMatch(/concept/);
  });

  test("filenames", () => {
    const s = { exam: 1, part: "3", title: "Assets" };
    expect(thumbFilename(s, "arkansas", "social")).toBe("survive-exam-1-03-assets-cover-arkansas.png");
    expect(thumbFilename(s, "survive", "site")).toBe("survive-exam-1-03-assets-site-survive.webp");
    expect(thumbFilename({ exam: 1, part: "Easy Points", title: "5 types of\naccounts" }, "lsu", "social")).toBe("survive-exam-1-easy-points-5-types-of-accounts-cover-lsu.png");
  });

  test("the cram path numbers only cram videos, in bank order", () => {
    const rows = [
      { key: "a", set: {}, topic: {} },
      { key: "a#2", set: {}, topic: {} },
      { key: "off", set: { lane: "offshoot" }, topic: {} },
      { key: "strat", set: {}, topic: { kind: "strategy" } },
      { key: "b", set: {}, topic: {} },
    ];
    expect([...cramNumbers(rows)]).toEqual([["a", 1], ["a#2", 2], ["b", 3]]);
  });

  test("one row per video, keyed the way /v3/post keys it", () => {
    const set = (id: string, name: string, lane?: "offshoot") => ({ id, name, ceqs: [], liveCount: 0, draftCount: 0, ...(lane ? { lane } : {}) });
    const topics = [{ id: "t", name: "Easy Points", number: 1, sets: [set("s1", "Account classification"), set("s2", "Contra accounts", "offshoot")] }];
    const takes = new Map([["s1", [{ name: "Assets", headId: "h1", frames: 3, ceqIds: [] }, { name: "", headId: "h2", frames: 2, ceqIds: [] }]]]);
    expect(videoRows(topics as never, takes).map((r) => [r.key, r.title, r.cram])).toEqual([
      ["s1", "Assets", 1],
      ["s1#2", "Account classification", 2],
      ["s2", "Contra accounts", null],
    ]);
  });
});

describe("the social kit", () => {
  test("the default avatar bolt clears the circle, and the gate exists for a reason", () => {
    const d = avatarClearance(AVATAR_FILL.default);
    expect(d.share).toBeGreaterThanOrEqual(AVATAR_MIN_CLEARANCE);
    expect(d.share).toBeLessThan(0.3);
    expect(avatarClearance(AVATAR_FILL.max).share).toBeLessThan(AVATAR_MIN_CLEARANCE);
  });

  test("YouTube's safe area is centred and inside every device's view", () => {
    expect(BANNER_SAFE).toEqual({ x: (2560 - 1235) / 2, y: (1440 - 338) / 2, w: 1235, h: 338 });
    for (const v of BANNER_VIEWS) expect(rectInside(BANNER_SAFE, v.rect)).toBe(true);
  });

  test("the whole stack fits the safe area", () => {
    const st = bannerStack();
    expect(st.height).toBeLessThanOrEqual(BANNER_SAFE.h);
    expect(st.top).toBeGreaterThanOrEqual(BANNER_SAFE.y);
    expect(st.bottom).toBeLessThanOrEqual(BANNER_SAFE.y + BANNER_SAFE.h + 0.001);
  });

  test("the trail: six campuses, none behind a word, all on the banner", () => {
    const trail = bannerTrail();
    expect(trail.map((b) => b.id)).toEqual([...BANNER_TRAIL_IDS]);
    for (const b of trail) {
      expect(() => colorwayFor(b.id)).not.toThrow();
      expect(rectsOverlap(b.box, BANNER_SAFE)).toBe(false);
      expect(b.box.x).toBeGreaterThanOrEqual(0);
      expect(b.box.x + b.box.w).toBeLessThanOrEqual(BANNER.w);
      expect(b.opacity).toBeLessThanOrEqual(0.25);
    }
  });

  test("Lee's copy rules", () => {
    const banner = JSON.stringify(BANNER_COPY).toLowerCase();
    expect(banner).not.toContain("reels");
    expect(BANNER_COPY.tagline).toEqual(["Cram what's on your exam.", "Skip everything else."]);
    for (const f of ["src/components/brand-kit/ThumbnailArt.tsx", "src/lib/brand-kit/thumbnail.ts"]) {
      expect(read(f).toLowerCase()).not.toContain("surviveaccounting.com");
    }
  });
});

describe("export", () => {
  test("embeds each face", () => {
    const css = fontFaceCss([{ family: "Rubik", weight: 900, dataUrl: "data:font/ttf;base64,AAA" }]);
    expect(css).toBe('@font-face{font-family:"Rubik";font-weight:900;font-style:normal;src:url(data:font/ttf;base64,AAA) format("truetype");}');
  });
  test("the guides the art marks are the ones export strips", () => {
    expect(GUIDE_ATTR).toBe("data-kit-guide");
    for (const f of ["src/components/brand-kit/ThumbnailArt.tsx", "src/components/brand-kit/SocialArt.tsx"]) {
      expect(read(f)).toContain(`${GUIDE_ATTR}="1"`);
    }
  });
});
