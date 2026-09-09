// A TAKE'S NAME MUST SURVIVE THE ROUND TRIP. Zod strips unknown keys, so a field added to the
// type and not to the schema is silently dropped on save — which is exactly how the spine kinds
// were once lost (see the note atop plan.ts). Lee renamed a split and it came back "Split 1".
import { describe, expect, test } from "bun:test";

import { frameSchema } from "./blastoff-frame-schema";

describe("takeName survives the save", () => {
  test("the schema keeps it", () => {
    expect(frameSchema.parse({ id: "i1", kind: "intro", takeName: "Assets" }).takeName).toBe("Assets");
  });
  test("absent stays absent, and a cut still parses beside it", () => {
    expect(frameSchema.parse({ id: "i1", kind: "intro" }).takeName).toBeUndefined();
    const cut = frameSchema.parse({ id: "o1", kind: "outro", cutAfter: true, takeName: "Liabilities" });
    expect(cut.cutAfter).toBe(true);
    expect(cut.takeName).toBe("Liabilities");
  });
  test("an over-long name is rejected rather than silently truncated on the wire", () => {
    expect(frameSchema.safeParse({ id: "i1", kind: "intro", takeName: "x".repeat(81) }).success).toBe(false);
  });
});
