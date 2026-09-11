// The three viewport tiers /learn lays itself out for (use-tier.ts) — the one rule, pinned.
import { describe, expect, test } from "bun:test";

import { MID_MAX, NARROW_MAX, tierFor } from "./use-tier";

describe("viewport tiers", () => {
  test("narrow under 640, mid to 1023, wide from 1024", () => {
    expect(tierFor(320)).toBe("narrow");
    expect(tierFor(NARROW_MAX)).toBe("narrow");
    expect(tierFor(640)).toBe("mid");
    expect(tierFor(MID_MAX)).toBe("mid");
    expect(tierFor(1024)).toBe("wide");
    expect(tierFor(1920)).toBe("wide");
  });
});
