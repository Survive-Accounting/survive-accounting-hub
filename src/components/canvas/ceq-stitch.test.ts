// Guards the DERIVED Free/Full stitch lists: order follows the passed CEQ (deck)
// order only, Free filters to free-flagged, clip-less CEQs are skipped → missing.
import { expect, test } from "bun:test";

import { buildStitch, stitchManifest, stitchRuntime } from "./ceq-takes";
import type { TakeRef } from "./types";

const t = (dur: number): TakeRef => ({ url: `u${dur}`, path: `p${dur}`, duration: dur });
const opts = (order: string[]) => ({
  intro: t(3), transition: t(2), outro: t(4),
  ceqs: [
    { id: "a", prompt: "A", take: t(10), free: true },
    { id: "b", prompt: "B", take: t(20), free: false },
    { id: "c", prompt: "C", take: undefined, free: true }, // no clip → missing
    { id: "d", prompt: "D", take: t(30), free: true },
  ].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)),
});

test("FULL = intro → transition → clip-bearing CEQs in order → outro", () => {
  const { items, missing } = buildStitch("full", opts(["a", "b", "c", "d"]));
  expect(items.map((i) => i.kind)).toEqual(["intro", "transition", "ceq", "ceq", "ceq", "outro"]);
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

test("runtime = summed clip durations (incl. intro/transition/outro)", () => {
  const { items } = buildStitch("full", opts(["a", "b", "c", "d"]));
  expect(stitchRuntime(items)).toBe(3 + 2 + 10 + 20 + 30 + 4);
});

test("manifest: one entry per CEQ, offsets account for crossfade, sums line up", () => {
  const { items } = buildStitch("full", opts(["a", "b", "c", "d"])); // intro(3) transition(2) a(10) b(20) d(30) outro(4)
  const cf = 50; const cfS = cf / 1000;
  const m = stitchManifest(items, cf);
  expect(m.map((x) => x.ceqId)).toEqual(["a", "b", "d"]); // one per CEQ only
  // cumulative starts: a after intro+transition (idx 2), b (idx 3), d (idx 4), minus i*cf
  expect(m[0]).toEqual({ ceqId: "a", start: Math.round((3 + 2 - 2 * cfS) * 1000) / 1000, end: Math.round((3 + 2 - 2 * cfS + 10) * 1000) / 1000 });
  // each CEQ's span equals its own duration
  expect(m.map((x) => Math.round((x.end - x.start) * 1000) / 1000)).toEqual([10, 20, 30]);
  // starts strictly increase (monotonic timeline)
  expect(m[0].start < m[1].start && m[1].start < m[2].start).toBe(true);
});
