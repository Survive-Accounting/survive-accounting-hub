import { describe, expect, test } from "bun:test";

import { endCtaOf, practiceWords, PRACTICE_FILMED_LINE } from "./practice-cta";
import { keepCover, endCtaOfBag, withEndCta } from "@/lib/publish-cover";
import { shortsFrom } from "@/lib/student-shorts";

describe("the practice slide", () => {
  test("defaults per variant; his words win", () => {
    expect(practiceWords({}).heading).toBe("Try the practice questions");
    expect(practiceWords({ practice: "unlock" }).chip).toBe("Lock it in");
    expect(practiceWords({ practice: "unlock", text: "Your move", bullets: ["", "Finish them"] })).toMatchObject({ heading: "Your move", line: "Finish them" });
    expect(PRACTICE_FILMED_LINE).toBe("Practice at surviveaccounting.com");
  });
  test("a video's end button is its last practice slide that films", () => {
    expect(endCtaOf([{ kind: "ceq" }, { kind: "practice" }])).toBe("try");
    expect(endCtaOf([{ kind: "practice", practice: "unlock" }, { kind: "practice", skipped: true }])).toBe("unlock");
    expect(endCtaOf([{ kind: "ceq" }])).toBeNull();
  });
  test("the end button rides in the captions bag, survives a copy save, and reaches the student part", () => {
    const bag = withEndCta({ cover: { url: "https://x/y.png", name: "y" } }, "unlock");
    expect(endCtaOfBag(keepCover(bag, { youtube: { title: "t" } }))).toBe("unlock");
    expect(withEndCta(null, null)).toBeNull();
    const [p] = shortsFrom([{ kind: "blast", state: "shipped", source: "blastoff", takeIndex: 0, render: { muxPlaybackId: "abc" }, endCta: "try" }], false);
    expect(p.endCta).toBe("try");
  });
});
