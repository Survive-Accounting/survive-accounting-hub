// The reflow-proof round trip: a frame with EVERY field set survives the schema
// unchanged. If a field is added to BlastFrame and not to the schema, Zod 3 strips it
// silently and this fails — which is the whole point.
import { describe, expect, test } from "bun:test";

import { AD_KINDS } from "@/components/blastoff/ad-kinds";
import { BLAST_FRAME_KINDS, type BlastFrame } from "@/components/blastoff/plan";

import { frameSchema } from "./blastoff-frame-schema";

describe("blastoff frame schema", () => {
  test("a fully-populated frame round-trips byte-for-byte", () => {
    const full: Required<Omit<BlastFrame, "kind" | "ad" | "cam" | "backdrop" | "banner" | "portrait">> & Pick<BlastFrame, "kind" | "ad" | "cam" | "backdrop" | "banner" | "portrait"> = {
      id: "f1", kind: "ad", ceqId: "c1", text: "t", title: "T", body: "B", exhibitRef: "je", bankItemId: "b1",
      skipped: true, prompter: ["one", "two"], prompterKeys: ["one = 1", "→ two"], prompterTransition: "Next question.", prompterMarks: { phrase: "Next question.", word: "Next" }, bullets: ["a", "b"], backdrop: "off", variant: "zoom", psych: 0.1,
      banner: "on", ad: "building", url: "surviveaccounting.com", portrait: "on", cam: "hero", camPos: { x: 0.2, y: 0.8 }, camSize: 0.4,
      illustration: {
        requested: true, prompt: "a vault with two doors", teachingIntent: "Internal vs external users", provider: "recraft", stylePreset: "survive-watercolor", styleVersion: 1, assetUrl: "https://x/y.png", localAssetId: "illustrations/s/f-1.png", animationPreset: "boil", generatedAt: "2026-09-05T00:00:00.000Z", seed: 42,
        placement: { x: 0.5, y: 0.62, w: 0.5 }, brief: "a vault, two doors, one labelled internal", summary: { title: "Two doors", bullets: ["a vault", "two doors", "no text"] }, referenceFrameId: "f0",
        // A reference photo Lee attached, and a second picture paired beside this one — both
        // new 2026-09-05 and exactly the kind of field a schema gap silently drops.
        referencePhoto: { id: "illustration-references/raw-abc.png", name: "bull.png", mime: "image/png", size: 12345, path: "illustration-references/raw-abc.png", url: "https://x/bull.png" },
        pairedAssetUrl: "https://x/paired.png", pairedTitle: "External users",
        // The revision count (2026-09-07) — a strip here would reset every cap on load.
        attempts: 2,
      },
      // The equation rubric (2026-09-11) — a strip here would blank every arrow on load.
      rubric: { mode: "ale", text: "Paid $600 cash for rent", amount: 600, arrows: { A: ["down"], L: [], E: [], Rev: [], Exp: ["up"] }, show: "amounts", equityEffect: true },
    };
    const out = frameSchema.parse(full);
    expect(out).toEqual(full);
  });

  test("every frame kind and every ad kind is accepted", () => {
    for (const kind of BLAST_FRAME_KINDS) expect(frameSchema.safeParse({ id: "x", kind }).success).toBe(true);
    for (const ad of AD_KINDS) expect(frameSchema.safeParse({ id: "x", kind: "ad", ad }).success).toBe(true);
  });

  test("a placed picture keeps its spot through the schema (a zod strip here would snap it back to the band)", () => {
    const r = frameSchema.safeParse({ id: "x", kind: "blank", illustration: { requested: true, prompt: null, teachingIntent: null, provider: null, stylePreset: null, styleVersion: null, assetUrl: "u", localAssetId: null, animationPreset: null, generatedAt: null, seed: null, placement: { x: 0.5, y: 0.44, w: 0.72 } } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.illustration?.placement).toEqual({ x: 0.5, y: 0.44, w: 0.72 });
  });
  test("a cleared illustration (null) and an absent one both pass", () => {
    expect(frameSchema.safeParse({ id: "x", kind: "ceq", illustration: null }).success).toBe(true);
    expect(frameSchema.safeParse({ id: "x", kind: "ceq" }).success).toBe(true);
  });

  // 2026-09-07: the timing marks — a strip here would blank every highlight on the prompter.
  test("the timing marks survive, whole or half, and an absent one passes", () => {
    const r = frameSchema.safeParse({ id: "x", kind: "ceq", prompterMarks: { word: "External" } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.prompterMarks).toEqual({ word: "External" });
    expect(frameSchema.safeParse({ id: "x", kind: "ceq", prompterMarks: {} }).success).toBe(true);
    expect(frameSchema.safeParse({ id: "x", kind: "ceq", prompterMarks: { phrase: 3 } }).success).toBe(false);
  });

  test("a rubric with three arrows in one box, or an unknown mode, is refused — not stripped", () => {
    const ok = { mode: "ale", text: "", amount: 0, arrows: { A: [], L: [], E: [], Rev: [], Exp: [] }, show: "arrows", equityEffect: false };
    expect(frameSchema.safeParse({ id: "x", kind: "rubric", rubric: ok }).success).toBe(true);
    expect(frameSchema.safeParse({ id: "x", kind: "rubric", rubric: { ...ok, mode: "je" } }).success).toBe(false);
    expect(frameSchema.safeParse({ id: "x", kind: "rubric", rubric: { ...ok, arrows: { ...ok.arrows, A: ["up", "down", "up"] } } }).success).toBe(false);
  });

  test("an unknown ad kind is refused loudly, not stripped", () => {
    expect(frameSchema.safeParse({ id: "x", kind: "ad", ad: "nope" }).success).toBe(false);
  });
});
