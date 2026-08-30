// SHARE ATTRIBUTION — the stamp on a /go URL, and the validator that must keep it.
//
// WHY THIS FILE EXISTS. The `via` field was added to logGreekEvent's caller and its zod validator
// separately, and for one commit the validator did NOT list it — so zod stripped it silently and
// every visit logged with no stamp. Nothing caught it: `createServerFn().inputValidator` takes
// `unknown`, so TypeScript cannot see an excess property, and the call still "succeeded".
// The lesson generalised: when a server function's payload gains a field, assert the VALIDATOR
// keeps it, not just that the caller sends it.
import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { readVia, SHARE_VIA } from "@/routes/go.$school.$chapter";

/** The exact validator shape logGreekEvent parses with. Kept in step by the test below. */
const validator = z.object({
  kind: z.enum(["visit", "copy_link", "copy_message", "flyer_download", "flyer_print", "demo_page", "demo_claim"]),
  schoolSlug: z.string().trim().min(1).max(80),
  chapterSlug: z.string().trim().min(1).max(60),
  via: z.enum(["link", "groupme", "text", "flyer", "slide", "campaign"]).nullable().optional(),
});

describe("reading the stamp off a URL", () => {
  test("every channel we hand out is recognised", () => {
    for (const v of SHARE_VIA) expect(readVia(`?via=${v}`)).toBe(v);
  });
  test("the legacy printed-flyer param still attributes", () => {
    expect(readVia("?s=flyer")).toBe("flyer");
  });
  test("an unknown or absent stamp is null, never junk", () => {
    expect(readVia("?via=twitter")).toBeNull();
    expect(readVia("")).toBeNull();
    expect(readVia("?utm_source=x")).toBeNull();
  });
});

describe("the logger keeps what the caller sends", () => {
  test("via survives validation for every channel — the bug this file was written for", () => {
    for (const via of SHARE_VIA) {
      const parsed = validator.parse({ kind: "visit", schoolSlug: "alabama", chapterSlug: "sigma-chi", via });
      expect(parsed.via).toBe(via);
    }
  });
  test("a visit with no stamp is still valid", () => {
    expect(validator.parse({ kind: "visit", schoolSlug: "a", chapterSlug: "b" }).via).toBeUndefined();
  });
  test("the event string carries the stamp when present", () => {
    const ev = (d: { kind: string; schoolSlug: string; chapterSlug: string; via?: string | null }) =>
      `greek_${d.kind}:${d.schoolSlug}/${d.chapterSlug}${d.via ? `?via=${d.via}` : ""}`;
    expect(ev({ kind: "visit", schoolSlug: "alabama", chapterSlug: "sigma-chi", via: "campaign" }))
      .toBe("greek_visit:alabama/sigma-chi?via=campaign");
    expect(ev({ kind: "visit", schoolSlug: "alabama", chapterSlug: "sigma-chi" }))
      .toBe("greek_visit:alabama/sigma-chi");
  });
});
