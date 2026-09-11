import { describe, expect, test } from "bun:test";

import { CALLOUT_KINDS, detourAccent } from "@/components/canvas/cards/CalloutCard";

import { variantBadge } from "./variant";

describe("variant badges", () => {
  test("STANDARD wears none; the rest wear their detour slide's own label and accent", () => {
    expect(variantBadge("STANDARD")).toBeNull();
    expect(variantBadge("CHEAT_CODE")).toEqual({ label: CALLOUT_KINDS["cheat-code"].label, accent: detourAccent("cheat-code") });
    expect(variantBadge("MEMORIZE")).toEqual({ label: CALLOUT_KINDS["memorize-this"].label, accent: detourAccent("memorize-this") });
    expect(variantBadge("DEEP_QUESTION")).toEqual({ label: CALLOUT_KINDS["deeper-idea"].label, accent: detourAccent("deeper-idea") });
  });
  test("the four accents are four different colours", () => {
    const accents = (["CHEAT_CODE", "MEMORIZE", "DEEP_QUESTION"] as const).map((v) => variantBadge(v)!.accent);
    expect(new Set(accents).size).toBe(3);
  });
});
