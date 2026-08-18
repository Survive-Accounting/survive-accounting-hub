// F3 — STITCH PREVIEW. The math Lee reads before approving an upload, so it has
// to be right about the boring things: what a trim defaults to, what a gap costs,
// and what happens when a clip is dropped or a take goes missing.
import { describe, expect, test } from "bun:test";

import { newStitch, recut, type StitchDef, type StitchItem } from "./stitch-defs";
import {
  DEFAULT_GAP_MS, PREVIEW_CAVEAT, clearTrim, fmtT, moveItem, nudgeTrim, previewChapters,
  previewTimeline, resolveItemTrim, setGap, toggleMuted,
} from "./stitch-preview";
import type { TakeRef } from "./types";

const take = (path: string, durationS: number, over: Partial<TakeRef> = {}): TakeRef =>
  ({ url: `https://x/${path}`, path, duration: durationS, ...over });

const map = (...t: TakeRef[]) => new Map(t.map((x) => [x.path, x]));
const st = (items: StitchItem[], over: Partial<StitchDef> = {}): StitchDef =>
  ({ ...newStitch("s1", { kind: "ceq", ceqId: "q1" }, items), ...over });

describe("what a trim defaults to", () => {
  test("a SLATED clip trims at the slate — deterministic, not detected", () => {
    const r = resolveItemTrim({ takePath: "a" }, take("a", 30, { slateEndMs: 3200 }));
    expect(r).toEqual({ inS: 3.2, outS: 30, manual: false, slated: true });
  });
  test("an un-slated clip starts at zero and lets the worker detect the tail", () => {
    const r = resolveItemTrim({ takePath: "a" }, take("a", 30));
    expect(r.inS).toBe(0);
    expect(r.slated).toBe(false);
  });
  test("a manual trim outranks the slate, and says it is manual", () => {
    const r = resolveItemTrim({ takePath: "a", trimInS: 5, trimOutS: 20 }, take("a", 30, { slateEndMs: 3200 }));
    expect(r).toEqual({ inS: 5, outS: 20, manual: true, slated: true });
  });
  test("a slate longer than the clip is nonsense and falls back to zero", () => {
    expect(resolveItemTrim({ takePath: "a" }, take("a", 2, { slateEndMs: 9000 })).inS).toBe(0);
  });
  test("a trim can never cross itself — a vanished clip is the bug this preview exists to catch", () => {
    const r = resolveItemTrim({ takePath: "a", trimInS: 20, trimOutS: 5 }, take("a", 30));
    expect(r.outS).toBeGreaterThanOrEqual(r.inS);
  });
  test("an out beyond the clip's end is clamped to the clip", () => {
    expect(resolveItemTrim({ takePath: "a", trimOutS: 99 }, take("a", 30)).outS).toBe(30);
  });
});

describe("the timeline math", () => {
  const tl = () => previewTimeline(
    st([{ takePath: "a", ceqId: "q1" }, { takePath: "b", ceqId: "q1" }, { takePath: "c", ceqId: "q2" }]),
    map(take("a", 30, { slateEndMs: 3000 }), take("b", 20), take("c", 10)),
  );
  test("each clip contributes its TRIMMED length, not its raw one", () => {
    const t = tl();
    expect(t.segments.map((s) => s.trimmedS)).toEqual([27, 20, 10]);
    expect(t.contentS).toBe(57);
  });
  test("gaps go BETWEEN clips — never after the last one", () => {
    const t = tl();
    expect(t.segments.map((s) => s.gapAfterMs)).toEqual([DEFAULT_GAP_MS, DEFAULT_GAP_MS, 0]);
    expect(t.gapS).toBeCloseTo(0.84, 5);
  });
  test("total is content plus gaps, and start offsets accumulate both", () => {
    const t = tl();
    expect(t.totalS).toBeCloseTo(57.84, 5);
    expect(t.segments.map((s) => s.startS)).toEqual([0, 27.42, 47.84]);
  });
  test("what the trims threw away is reported — it is the number that catches a bad slate", () => {
    expect(tl().trimmedAwayS).toBe(3);
  });
  test("a muted clip leaves the cut entirely, and the gaps re-flow around it", () => {
    const t = previewTimeline(
      st([{ takePath: "a" }, { takePath: "b", muted: true }, { takePath: "c" }]),
      map(take("a", 30), take("b", 20), take("c", 10)),
    );
    expect(t.segments.map((s) => s.takePath)).toEqual(["a", "c"]);
    expect(t.segments[1].gapAfterMs).toBe(0); // c is now last
    expect(t.contentS).toBe(40);
  });
  test("a missing take is NAMED, never silently skipped", () => {
    const t = previewTimeline(st([{ takePath: "a" }, { takePath: "gone" }]), map(take("a", 30)));
    expect(t.missing).toEqual(["gone"]);
    expect(t.segments.length).toBe(1);
  });
  test("a per-clip gap override beats the stitch default", () => {
    const t = previewTimeline(st([{ takePath: "a", gapAfterMs: 1500 }, { takePath: "b" }]), map(take("a", 10), take("b", 10)));
    expect(t.segments[0].gapAfterMs).toBe(1500);
  });
  test("an empty stitch is zero, not NaN", () => {
    expect(previewTimeline(st([]), map()).totalS).toBe(0);
  });
});

describe("chapters", () => {
  test("takes of the SAME CEQ collapse into one chapter — three takes is still one chapter to a viewer", () => {
    const t = previewTimeline(
      st([{ takePath: "a", ceqId: "q1" }, { takePath: "b", ceqId: "q1" }, { takePath: "c", ceqId: "q2" }]),
      map(take("a", 10), take("b", 10), take("c", 10)),
    );
    const ch = previewChapters(t);
    expect(ch.map((c) => c.id)).toEqual(["q1", "q2"]);
    expect(ch[0].end).toBeCloseTo(20.42, 5);
  });
  test("moment tags win over the CEQ id, so a dissected CEQ chapters per beat", () => {
    const t = previewTimeline(
      st([{ takePath: "a", ceqId: "q1", momentId: "m1" }, { takePath: "b", ceqId: "q1", momentId: "m2" }]),
      map(take("a", 10), take("b", 10)),
    );
    expect(previewChapters(t).map((c) => `${c.kind}:${c.id}`)).toEqual(["moment:m1", "moment:m2"]);
  });
  test("untagged clips produce no chapters rather than a bogus one", () => {
    expect(previewChapters(previewTimeline(st([{ takePath: "a" }]), map(take("a", 10))))).toEqual([]);
  });
});

describe("manual overrides — and the staleness contract they carry", () => {
  const t = take("a", 30, { slateEndMs: 3000 });
  test("nudging the head moves it and marks the clip manual", () => {
    const out = nudgeTrim([{ takePath: "a" }], 0, "in", 0.5, t);
    expect(out[0].trimInS).toBe(3.5);
    expect(resolveItemTrim(out[0], t).manual).toBe(true);
  });
  test("a nudge can never push a head past its own tail, or off either end", () => {
    expect(nudgeTrim([{ takePath: "a" }], 0, "in", -99, t)[0].trimInS).toBe(0);
    expect(nudgeTrim([{ takePath: "a" }], 0, "in", 999, t)[0].trimInS).toBe(30);
    expect(nudgeTrim([{ takePath: "a" }], 0, "out", 999, t)[0].trimOutS).toBe(30);
  });
  test("clearing a trim hands the clip back to the slate", () => {
    const out = clearTrim([{ takePath: "a", trimInS: 9, trimOutS: 12 }], 0);
    expect(resolveItemTrim(out[0], t)).toEqual({ inS: 3, outS: 30, manual: false, slated: true });
  });
  test("a gap is never negative", () => {
    expect(setGap([{ takePath: "a" }], 0, -500)[0].gapAfterMs).toBe(0);
  });
  test("moving at a boundary is a NO-OP, not a wrap", () => {
    const items: StitchItem[] = [{ takePath: "a" }, { takePath: "b" }];
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 1, 1)).toBe(items);
    expect(moveItem(items, 0, 1).map((i) => i.takePath)).toEqual(["b", "a"]);
  });
  test("dropping a clip MUTES it — the original survives and un-dropping is one click", () => {
    const dropped = toggleMuted([{ takePath: "a" }], 0);
    expect(dropped[0].muted).toBe(true);
    expect(dropped.length).toBe(1);
    expect(toggleMuted(dropped, 0)[0].muted).toBe(false);
  });
  test("routing an override through recut is what marks derived publications stale", () => {
    const s = st([{ takePath: "a" }]);
    expect(recut(s, { items: setGap(s.items, 0, 900) }).rev).toBe(s.rev + 1);
  });
});

describe("the preview does not overclaim", () => {
  test("it names what it cannot reproduce", () => {
    expect(PREVIEW_CAVEAT).toContain("Loudness normalization");
    expect(PREVIEW_CAVEAT).toContain("micro-crossfades");
    expect(PREVIEW_CAVEAT).toContain("not reproduced here");
  });
  test("timecodes read cleanly at a glance", () => {
    expect(fmtT(0)).toBe("0:00.0");
    expect(fmtT(9.44)).toBe("0:09.4");
    expect(fmtT(75.5)).toBe("1:15.5");
    expect(fmtT(-1)).toBe("0:00.0");
  });
});

// ---------------------------------------------------------------- source pins
import { readFileSync } from "node:fs";
import { join } from "node:path";
const panel = readFileSync(join(import.meta.dir, "StitchPreview.tsx"), "utf8").split("\r\n").join("\n");
const studio = readFileSync(join(import.meta.dir, "CeqStudio.tsx"), "utf8").split("\r\n").join("\n");

describe("nothing publishes from the preview (F3 source pins)", () => {
  test("the panel uploads, renders and publishes NOTHING — approving is a callback", () => {
    expect(panel).not.toContain("stageTake");
    expect(panel).not.toContain("startDissectStitch");
    expect(panel).not.toContain("publishStitch");
    expect(panel).toContain("onApprove?.(stitch)");
  });
  test("every edit routes through recut, or staleness silently stops working", () => {
    expect(panel).toContain("const edit = (items: StitchDef[\"items\"]) => onChange(recut(stitch, { items }));");
  });
  test("a visible row maps back to its FULL items index — muted clips shift the two apart", () => {
    expect(panel).toContain("const itemIndexOf = (takePath: string, nth: number): number =>");
  });
  test("opening a preview never writes — a derived stitch is previewed unsaved", () => {
    const open = studio.slice(studio.indexOf("const openStitchPreview ="), studio.indexOf("const saveStitch ="));
    expect(open).not.toContain("setDecks");
    expect(open).toContain("setPreviewStitch(newStitch(");
  });
  test("blocking gates are shown, and Approve is disabled while any is unmet", () => {
    expect(panel).toContain("disabled={!onApprove || !tl.segments.length || !!blockers?.length}");
  });
  test("both entry points exist: per-CEQ in the spine menu, whole-set in Publish", () => {
    expect(studio).toContain('previewStitch: () => { if (qId && qId !== LAYOUT_Q0) openStitchPreview({ kind: "ceq", ceqId: qId });');
    expect(studio).toContain('onClick={() => openStitchPreview({ kind: "set" })}');
  });
});
