// Guards the DERIVED Free/Full stitch lists: order follows the passed CEQ (deck)
// order only, Free filters to free-flagged, clip-less CEQs are skipped → missing.
import { expect, test } from "bun:test";

import { autoClipName, buildStitch, stitchManifest, stitchRuntime } from "./ceq-takes";
import type { TakeRef } from "./types";

const t = (dur: number): TakeRef => ({ url: `u${dur}`, path: `p${dur}`, duration: dur });
const opts = (order: string[]) => ({
  intro: t(3), outro: t(4),
  ceqs: [
    { id: "a", prompt: "A", take: t(10), free: true },
    { id: "b", prompt: "B", take: t(20), free: false },
    { id: "c", prompt: "C", take: undefined, free: true }, // no clip → missing
    { id: "d", prompt: "D", take: t(30), free: true },
  ].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)),
});

test("FULL = intro → clip-bearing CEQs in order → outro", () => {
  const { items, missing } = buildStitch("full", opts(["a", "b", "c", "d"]));
  expect(items.map((i) => i.kind)).toEqual(["intro", "ceq", "ceq", "ceq", "outro"]);
  expect(items.filter((i) => i.kind === "ceq").map((i) => i.ceqId)).toEqual(["a", "b", "d"]); // c skipped
  expect(missing.map((m) => m.id)).toEqual(["c"]);
});

test("FREE = only free-flagged clip-bearing CEQs, still in deck order", () => {
  const { items, missing } = buildStitch("free", opts(["a", "b", "c", "d"]));
  expect(items.filter((i) => i.kind === "ceq").map((i) => i.ceqId)).toEqual(["a", "d"]); // b not free, c no clip
  expect(missing.map((m) => m.id)).toEqual(["c"]); // free + clip-less → missing
});

test("reordering the deck reorders the stitch (derived from order only)", () => {
  const { items } = buildStitch("full", opts(["d", "b", "a", "c"]));
  expect(items.filter((i) => i.kind === "ceq").map((i) => i.ceqId)).toEqual(["d", "b", "a"]);
});

test("runtime = summed clip durations (incl. intro/outro)", () => {
  const { items } = buildStitch("full", opts(["a", "b", "c", "d"]));
  expect(stitchRuntime(items)).toBe(3 + 10 + 20 + 30 + 4);
});

test("manifest: one entry per CEQ, offsets account for crossfade, sums line up", () => {
  const { items } = buildStitch("full", opts(["a", "b", "c", "d"])); // intro(3) a(10) b(20) d(30) outro(4)
  const cf = 50; const cfS = cf / 1000;
  const m = stitchManifest(items, cf);
  expect(m.map((x) => x.ceqId)).toEqual(["a", "b", "d"]); // one per CEQ only
  // cumulative starts: a after intro (idx 1), b (idx 2), d (idx 3), minus i*cf
  expect(m[0]).toEqual({ ceqId: "a", clip: 0, kind: "ceq", start: Math.round((3 - 1 * cfS) * 1000) / 1000, end: Math.round((3 - 1 * cfS + 10) * 1000) / 1000 });
  // each CEQ's span equals its own duration
  expect(m.map((x) => Math.round((x.end - x.start) * 1000) / 1000)).toEqual([10, 20, 30]);
  // starts strictly increase (monotonic timeline)
  expect(m[0].start < m[1].start && m[1].start < m[2].start).toBe(true);
});

test("a CEQ's clip STACK emits one ceq item per clip (base then lookbacks)", () => {
  const { items } = buildStitch("full", { ceqs: [{ id: "a", prompt: "A", takes: [t(10), t(5)], free: true }] });
  const ceqs = items.filter((i) => i.kind === "ceq");
  expect(ceqs.map((i) => [i.ceqId, i.clip])).toEqual([["a", 0], ["a", 1]]);
  expect(ceqs.map((i) => i.take.duration)).toEqual([10, 5]);
});

test("legacy single `take` still stitches as a one-item stack (migration)", () => {
  const { items, missing } = buildStitch("full", { ceqs: [{ id: "a", prompt: "A", take: t(10), free: true }] });
  expect(items.filter((i) => i.kind === "ceq").map((i) => [i.ceqId, i.clip])).toEqual([["a", 0]]);
  expect(missing).toEqual([]);
});

test("WRAP clips play after the last question, before the outro; manifest tags them", () => {
  const { items } = buildStitch("full", { outro: t(4), wrap: [t(6), t(7)], ceqs: [{ id: "a", prompt: "A", take: t(10), free: true }] });
  expect(items.map((i) => i.kind)).toEqual(["ceq", "wrap", "wrap", "outro"]);
  const m = stitchManifest(items, 0);
  expect(m.map((x) => x.kind)).toEqual(["ceq", "wrap", "wrap"]); // outro not indexed
  expect(m.filter((x) => x.kind === "wrap").map((x) => x.clip)).toEqual([0, 1]);
});

test("SET INTRO (hook) stitches boilerplate intro → hook → Q1 (hard cut), in BOTH cuts", () => {
  for (const mode of ["free", "full"] as const) {
    const { items } = buildStitch(mode, { intro: t(3), hook: t(8), ceqs: [{ id: "a", prompt: "A", take: t(10), free: true }] });
    expect(items.map((i) => i.kind)).toEqual(["intro", "hook", "ceq"]);
  }
});

test("no intro clip attached ⇒ the stitch skips it silently (pre-hook order exactly)", () => {
  const { items } = buildStitch("full", { intro: t(3), ceqs: [{ id: "a", prompt: "A", take: t(10), free: true }] });
  expect(items.map((i) => i.kind)).toEqual(["intro", "ceq"]);
});

test("manifest tags the SET INTRO as kind 'intro' — not a ceqId entry; boilerplate stays unindexed", () => {
  const { items } = buildStitch("full", { intro: t(3), hook: t(8), ceqs: [{ id: "a", prompt: "A", take: t(10), free: true }] });
  const m = stitchManifest(items, 0);
  expect(m.map((x) => x.kind)).toEqual(["intro", "ceq"]); // boilerplate intro not indexed
  const intro = m[0];
  expect(intro.ceqId).toBeUndefined();
  expect(intro.clip).toBe(0);
  expect(intro.start).toBe(3); // after the 3s boilerplate
  expect(intro.end).toBe(11);
});

test("BUMPERS: front after intro/before hook, back after wrap/before outro", () => {
  const { items } = buildStitch("full", {
    intro: t(3), hook: t(8), outro: t(4), wrap: [t(6)],
    frontBumpers: [t(1), t(2)], backBumpers: [t(5)],
    ceqs: [{ id: "a", prompt: "A", take: t(10), free: true }],
  });
  expect(items.map((i) => i.kind)).toEqual(["intro", "frontBumper", "frontBumper", "hook", "ceq", "wrap", "backBumper", "outro"]);
  expect(items.filter((i) => i.kind === "frontBumper").map((i) => i.clip)).toEqual([0, 1]);
  expect(items.filter((i) => i.kind === "backBumper").map((i) => i.clip)).toEqual([0]);
  expect(stitchRuntime(items)).toBe(3 + 1 + 2 + 8 + 10 + 6 + 5 + 4);
});

test("autoClipName: front 01,02… · back 1001,1002… · content role-NN", () => {
  expect(autoClipName("frontBumper", 1, "mp4")).toBe("front-bumper-01.mp4");
  expect(autoClipName("frontBumper", 12, "mov")).toBe("front-bumper-12.mov");
  expect(autoClipName("backBumper", 1)).toBe("back-bumper-1001.mp4");
  expect(autoClipName("backBumper", 3)).toBe("back-bumper-1003.mp4");
  expect(autoClipName("hook", 2, "mp4")).toBe("hook-02.mp4");
  expect(autoClipName(undefined, 1, "mp4")).toBe("clip-01.mp4");
});
