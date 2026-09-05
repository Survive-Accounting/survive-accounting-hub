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
      skipped: true, prompter: ["one", "two"], bullets: ["a", "b"], backdrop: "off", variant: "zoom", psych: 0.1,
      banner: "on", ad: "building", url: "surviveaccounting.com", portrait: "on", cam: "hero", camPos: { x: 0.2, y: 0.8 }, camSize: 0.4,
      illustration: { requested: true, prompt: "a vault with two doors", teachingIntent: "Internal vs external users", provider: "recraft", stylePreset: "survive-dreamstate", styleVersion: 1, assetUrl: "https://x/y.png", localAssetId: "illustrations/s/f-1.png", animationPreset: "boil", generatedAt: "2026-09-05T00:00:00.000Z", seed: 42 },
    };
    const out = frameSchema.parse(full);
    expect(out).toEqual(full);
  });

  test("every frame kind and every ad kind is accepted", () => {
    for (const kind of BLAST_FRAME_KINDS) expect(frameSchema.safeParse({ id: "x", kind }).success).toBe(true);
    for (const ad of AD_KINDS) expect(frameSchema.safeParse({ id: "x", kind: "ad", ad }).success).toBe(true);
  });

  test("a cleared illustration (null) and an absent one both pass", () => {
    expect(frameSchema.safeParse({ id: "x", kind: "ceq", illustration: null }).success).toBe(true);
    expect(frameSchema.safeParse({ id: "x", kind: "ceq" }).success).toBe(true);
  });

  test("an unknown ad kind is refused loudly, not stripped", () => {
    expect(frameSchema.safeParse({ id: "x", kind: "ad", ad: "nope" }).success).toBe(false);
  });
});
