import { describe, expect, test } from "bun:test";

import { CLICK_ID_KEYS, carryParams, withCarried } from "./carry-params";
import { pageShareUrl } from "./share-url";

describe("attribution across a redirect", () => {
  test("carries utm_* and click ids — nothing else", () => {
    expect(carryParams({ utm_source: "instagram", utm_campaign: "fall launch", gclid: "Cj0K-abc_123", fbclid: "IwAR1", ttclid: 12345, ref: "x", set: "s1", email: "a@b.co" }))
      .toEqual({ utm_source: "instagram", utm_campaign: "fall launch", gclid: "Cj0K-abc_123", fbclid: "IwAR1", ttclid: "12345" });
    expect(carryParams(new URLSearchParams("utm_medium=paid&msclkid=m1&gbraid=g1"))).toEqual({ utm_medium: "paid", msclkid: "m1", gbraid: "g1" });
    expect(carryParams({ utm_source: "<script>", gclid: "x".repeat(201), fbclid: "  " })).toEqual({});
    expect(carryParams(null)).toEqual({});
  });

  test("a rep link forwards click ids only — its own utm_* stay authoritative", () => {
    expect(carryParams(new URLSearchParams("utm_source=ad&gclid=G1"), CLICK_ID_KEYS)).toEqual({ gclid: "G1" });
  });

  test("a shared link never forwards the ad click that brought the sharer", () => {
    const u = new URL(pageShareUrl({ origin: "https://surviveaccounting.com", pathname: "/learn/ole-miss", search: "?gclid=G&fbclid=F&ttclid=T&utm_source=instagram&utm_content=v2&utm_term=t&ref=abc" }));
    for (const k of [...CLICK_ID_KEYS, "utm_content", "utm_term"]) expect(u.searchParams.has(k)).toBe(false);
    expect(u.searchParams.get("utm_source")).toBe("share");
    expect(u.searchParams.get("ref")).toBe("abc");
  });

  test("adds what's missing, never overwrites, keeps relative paths relative", () => {
    expect(withCarried("/", { gclid: "G1", utm_source: "yt" })).toBe("/?gclid=G1&utm_source=yt");
    expect(withCarried("/go/ole-miss/ato?utm_source=flyer#claim", { utm_source: "ad", fbclid: "F" })).toBe("/go/ole-miss/ato?utm_source=flyer&fbclid=F#claim");
    expect(withCarried("https://surviveaccounting.com/learn?ref=r1", { ttclid: "T" })).toBe("https://surviveaccounting.com/learn?ref=r1&ttclid=T");
    expect(withCarried("/x", {})).toBe("/x");
  });
});
