// STITCHES & PUBLICATIONS — the layer between takes and Mux.
//
// The rules worth defending here are the ones that cost real money or real work
// if they break: the migration must never delete or duplicate, staleness must
// never silently pass, and the publish gate must block the things Lee shouldn't
// have to remember.
import { describe, expect, test } from "bun:test";

import {
  applyToDeck, ceqStitchId, gateBlocks, gateReady, isStale, itemsFromTakes, lessonPubId,
  liveItems, migrationPlan, newStitch, planReport, publishGate, recut, setStitchId,
  type MigrationInput, type PublicationDef, type StitchDef,
} from "./stitch-defs";
import type { TakeRef } from "./types";

const take = (path: string, over: Partial<TakeRef> = {}): TakeRef => ({ url: `https://x/${path}`, path, duration: 30, ...over });
const stitch = (over: Partial<StitchDef> = {}): StitchDef => ({ id: "st1", scope: { kind: "set" }, items: [], rev: 1, ...over });
const pub = (over: Partial<PublicationDef> = {}): PublicationDef => ({
  id: "pb1", stitchId: "st1", kind: "blast", destinations: ["site"], framing: "16:9", state: "draft", meta: {}, ...over,
});

describe("a stitch is a recipe, not a bake", () => {
  test("items carry no trims — the slate offset and detection still decide at cut time", () => {
    const items = itemsFromTakes([take("a.mkv"), take("b.mkv")], "q1");
    expect(items).toEqual([{ takePath: "a.mkv", ceqId: "q1" }, { takePath: "b.mkv", ceqId: "q1" }]);
    expect(items.every((i) => i.trimInS === undefined)).toBe(true);
  });
  test("a moment tag rides along so chapters survive the migration", () => {
    expect(itemsFromTakes([take("a.mkv", { momentId: "m2" })], "q1")[0].momentId).toBe("m2");
  });
  test("dropping a clip MUTES it — the decision survives, so re-cutting can undo it", () => {
    const s = stitch({ items: [{ takePath: "a" }, { takePath: "b", muted: true }, { takePath: "c" }] });
    expect(liveItems(s).map((i) => i.takePath)).toEqual(["a", "c"]);
    expect(s.items.length).toBe(3); // nothing was removed
  });
  test("every re-cut bumps the rev — that integer IS the staleness mechanism", () => {
    const s = newStitch("st1", { kind: "set" }, []);
    expect(s.rev).toBe(1);
    expect(recut(s, { items: [{ takePath: "a" }] }).rev).toBe(2);
    expect(recut(recut(s, {}), {}).rev).toBe(3);
  });
});

describe("staleness — a shipped asset is never silently left out of date", () => {
  test("a publication rendered from an older rev is STALE", () => {
    expect(isStale(pub({ state: "rendered", stitchRev: 2 }), stitch({ rev: 3 }))).toBe(true);
  });
  test("same rev is fine", () => {
    expect(isStale(pub({ state: "shipped", stitchRev: 3 }), stitch({ rev: 3 }))).toBe(false);
  });
  test("a draft has rendered nothing, so it cannot be stale", () => {
    expect(isStale(pub({ state: "draft", stitchRev: 1 }), stitch({ rev: 9 }))).toBe(false);
  });
  test("a publication that never rendered is not stale either", () => {
    expect(isStale(pub({ state: "rendered" }), stitch({ rev: 9 }))).toBe(false);
  });
});

describe("the publish gate", () => {
  test("a 9:16 with no authored reframe is BLOCKED — there is no auto-crop to fall back to", () => {
    const g = publishGate(pub({ framing: "9:16" }), stitch());
    expect(gateBlocks(g).map((x) => x.id)).toContain("framing/no-reframe");
  });
  test("a saved reframe that no longer exists blocks just the same", () => {
    const g = publishGate(pub({ framing: "9:16", reframeId: "rf1" }), stitch(), { reframeExists: false, lessonId: "l1", access: "FREE" });
    expect(gateBlocks(g).map((x) => x.id)).toContain("framing/no-reframe");
  });
  test("the solved-JE check is a CONFIRM, never a guess — the machine cannot see it", () => {
    const g = publishGate(pub({ kind: "short", framing: "9:16", reframeId: "r" }), stitch(), { reframeExists: true });
    const je = g.find((x) => x.id === "short/no-solved-je");
    expect(je?.level).toBe("confirm");
  });
  test("a short rips only at the end, and runs 22–30s", () => {
    const ctx = { reframeExists: true, ripAtEnd: false, totalS: 41 };
    const ids = gateBlocks(publishGate(pub({ kind: "short", framing: "9:16", reframeId: "r" }), stitch(), ctx)).map((x) => x.id);
    expect(ids).toContain("short/rip-at-end");
    expect(ids).toContain("short/duration");
  });
  test("a 26s short that rips at the end clears both duration and rip gates", () => {
    const ctx = { reframeExists: true, ripAtEnd: true, totalS: 26 };
    const ids = gateBlocks(publishGate(pub({ kind: "short", framing: "9:16", reframeId: "r", destinations: ["youtube"], meta: { title: "t", description: "surviveaccounting.com" } }), stitch(), ctx)).map((x) => x.id);
    expect(ids).not.toContain("short/duration");
    expect(ids).not.toContain("short/rip-at-end");
  });
  test("YouTube needs a title, a description, and the surviveaccounting.com line", () => {
    const ids = gateBlocks(publishGate(pub({ destinations: ["youtube"], meta: { description: "watch this" } }), stitch())).map((x) => x.id);
    expect(ids).toContain("yt/title");
    expect(ids).toContain("yt/description-line");
  });
  test("a stitch with chapters must ship them as timestamps", () => {
    const s = stitch({ cut: { at: 0, totalS: 100, chapters: [{ start: 0, end: 50 }] } });
    const ids = gateBlocks(publishGate(pub({ destinations: ["youtube"], meta: { title: "t", description: "surviveaccounting.com" } }), s)).map((x) => x.id);
    expect(ids).toContain("yt/chapters");
  });
  test("YouTube ships UNWATERMARKED — approved 08-16, so a confirm, not a block", () => {
    const g = publishGate(pub({ destinations: ["youtube"], meta: { title: "t", description: "surviveaccounting.com" } }), stitch());
    const w = g.find((x) => x.id === "yt/unwatermarked");
    expect(w?.level).toBe("confirm");
    expect(gateBlocks(g).map((x) => x.id)).not.toContain("yt/unwatermarked");
  });
  test("the site needs a resolved lesson and an explicit tier — a tier is never inferred", () => {
    const ids = gateBlocks(publishGate(pub({ destinations: ["site"] }), stitch(), {})).map((x) => x.id);
    expect(ids).toContain("site/attached");
    expect(ids).toContain("site/tier");
  });
  test("a BAKED watermark is blocked for every kind and destination", () => {
    const ids = gateBlocks(publishGate(pub(), stitch(), { bakesWatermark: true, lessonId: "l1", access: "PAID" })).map((x) => x.id);
    expect(ids).toContain("all/no-baked-watermark");
  });
  test("a clean site blast raises nothing", () => {
    expect(publishGate(pub(), stitch(), { lessonId: "l1", access: "FREE" })).toEqual([]);
  });
  test("nothing is ready until every item is acknowledged", () => {
    const g = publishGate(pub({ destinations: ["youtube"], meta: { title: "t", description: "surviveaccounting.com" } }), stitch());
    expect(gateReady(g, new Set())).toBe(false);
    expect(gateReady(g, new Set(g.map((x) => x.id)))).toBe(true);
  });
});

// ---------------------------------------------------------------- migration

const input = (): MigrationInput => ({
  decks: [
    { id: "d1", name: "The accounting cycle", intro: take("intro.mp4"), outro: take("outro.mp4"), lookback: take("look.mp4") },
    { id: "d2", name: "Empty set" },
  ],
  cards: [
    { id: "q1", deckId: "d1", takes: [take("q1a.mkv"), take("q1b.mkv")] },
    { id: "q2", deckId: "d1", takes: [take("q2a.mkv")] },
    { id: "q3", deckId: "d1", takes: [] },
    { id: "q4", deckId: "d1", takes: [], stitched: take("q4-baked.mp4", { duration: 90 }), moments: [{ id: "m1", startMs: 0 }, { id: "m2", startMs: 40000 }] },
  ],
  lessons: [
    { id: "l1", deckId: "d1", access: "FREE", muxPlaybackId: "pb-free", muxAssetId: "as-free", muxPublishedAt: 1000, muxDurationS: 300, ceqManifest: [{ ceqId: "q1", start: 0, end: 60 }] },
    { id: "l2", deckId: "d1", access: "PAID", muxPlaybackId: "pb-paid", muxPublishedAt: 2000 },
    { id: "l3", deckId: "d1" }, // never published — must not become a publication
  ],
});

describe("the migration — nothing lost, nothing doubled", () => {
  test("a CEQ's clip stack becomes ONE stitch; a frame with no clips becomes nothing", () => {
    const p = migrationPlan(input());
    const d1 = p.perDeck.find((x) => x.deckId === "d1")!;
    expect(d1.ceqStitches.map((s) => s.id).sort()).toEqual([ceqStitchId("q1"), ceqStitchId("q2"), ceqStitchId("q4")].sort());
    expect(d1.ceqStitches.find((s) => s.id === ceqStitchId("q1"))!.items.length).toBe(2);
  });
  test("an already-baked dissect asset is PRESERVED as the cached cut — migrating re-renders nothing", () => {
    const s = migrationPlan(input()).perDeck[0].ceqStitches.find((x) => x.id === ceqStitchId("q4"))!;
    expect(s.cut?.asset?.path).toBe("q4-baked.mp4");
    expect(s.cut?.chapters.map((c) => c.start)).toEqual([0, 40]);
    expect(s.cut?.chapters[1].end).toBe(90); // the last chapter runs to the asset's end
  });
  test("published lessons become SHIPPED publications, carrying their mux ids", () => {
    const d1 = migrationPlan(input()).perDeck[0];
    const l1 = d1.publications.find((x) => x.id === lessonPubId("l1"))!;
    expect(l1.state).toBe("shipped");
    expect(l1.render?.muxPlaybackId).toBe("pb-free");
    expect(l1.shipped?.access).toBe("FREE");
    expect(l1.meta.chapters?.length).toBe(1);
    expect(l1.stitchId).toBe(setStitchId("d1"));
  });
  test("an UNPUBLISHED lesson becomes nothing — only real shipments are recorded", () => {
    expect(migrationPlan(input()).perDeck[0].publications.some((p) => p.id === lessonPubId("l3"))).toBe(false);
  });
  test("the lookback gets its own stitch and its own publication, derived from nothing", () => {
    const d1 = migrationPlan(input()).perDeck[0];
    const lb = d1.setStitches.find((s) => s.label === "lookback")!;
    expect(lb.items.map((i) => i.takePath)).toEqual(["look.mp4"]);
    const pubLb = d1.publications.find((p) => p.kind === "lookback")!;
    expect(pubLb.stitchId).toBe(lb.id);
    // it must NOT reference any blast material
    expect(lb.items.some((i) => ["intro.mp4", "outro.mp4"].includes(i.takePath))).toBe(false);
  });
  test("IDEMPOTENT: running it against its own output plans nothing new", () => {
    const inp = input();
    const first = migrationPlan(inp);
    for (const d of inp.decks) {
      const p = first.perDeck.find((x) => x.deckId === d.id)!;
      const applied = applyToDeck(d, p);
      d.stitches = applied.stitches;
      d.publications = applied.publications;
    }
    const second = migrationPlan(inp);
    expect(second.totals.ceqStitches).toBe(0);
    expect(second.totals.setStitches).toBe(0);
    expect(second.totals.publications).toBe(0);
    expect(second.totals.skipped).toBeGreaterThan(0);
  });
  test("applying never drops what was already there", () => {
    const d = { id: "d1", name: "x", stitches: [stitch({ id: "mine" })] };
    const p = migrationPlan({ decks: [d], cards: [{ id: "q1", deckId: "d1", takes: [take("a.mkv")] }], lessons: [] }).perDeck[0];
    expect(applyToDeck(d, p).stitches.map((s) => s.id)).toContain("mine");
  });
  test("what cannot be mapped is NAMED, never silently dropped", () => {
    const p = migrationPlan({ decks: [], cards: [], lessons: [{ id: "lx", deckId: "gone", muxPlaybackId: "pb" }] });
    expect(p.orphans.length).toBe(1);
    expect(p.orphans[0].what).toContain("lx");
  });
  test("the report is built from the SAME plan it would write — it cannot drift", () => {
    const p = migrationPlan(input());
    const r = planReport(p);
    expect(r).toContain("DRY RUN (nothing written)");
    expect(r).toContain(`TOTAL: ${p.totals.ceqStitches} ceq-stitches`);
    expect(r).toContain("NOTHING IS DELETED OR MOVED");
  });
});

describe("the report is honest about what it looked at", () => {
  test("a zero result still says what was scanned — 0-found and 0-scanned are different bugs", () => {
    const p = migrationPlan({ decks: [{ id: "d1", name: "Nothing filmed yet" }], cards: [{ id: "q1", deckId: "d1", takes: [] }], lessons: [] });
    expect(p.totals.ceqStitches).toBe(0);
    expect(p.scanned.decks).toBe(1);
    expect(planReport(p)).toContain("SCANNED: 1 sets");
  });
  test("scan counts separate frames WITH clips from frames walked", () => {
    const p = migrationPlan(input());
    expect(p.scanned.cards).toBe(4);
    expect(p.scanned.cardsWithClips).toBe(3); // q3 has none
    expect(p.scanned.publishedLessons).toBe(2); // l3 was never published
  });
});
