import { describe, expect, test } from "bun:test";

import { DEST_UPLOAD_URL, looksLikeUrl, shouldAutoTick } from "./post-links";
import { PUBLISH_DESTINATIONS } from "@/lib/publish-queue.functions";

describe("DEST_UPLOAD_URL — one door per platform, none for the site", () => {
  test("every destination has an entry; three are links, the site is null", () => {
    for (const d of PUBLISH_DESTINATIONS) expect(d in DEST_UPLOAD_URL).toBe(true);
    const links = PUBLISH_DESTINATIONS.filter((d) => DEST_UPLOAD_URL[d] !== null);
    expect(links.sort()).toEqual(["instagram", "tiktok", "youtube"]);
    expect(DEST_UPLOAD_URL.site).toBeNull();
  });
  test("the links are https and point at each platform's own host", () => {
    expect(DEST_UPLOAD_URL.youtube).toBe("https://www.youtube.com/upload");
    expect(DEST_UPLOAD_URL.tiktok).toBe("https://www.tiktok.com/tiktokstudio/upload");
    // The root, deliberately — see the comment on the map.
    expect(DEST_UPLOAD_URL.instagram).toBe("https://www.instagram.com/");
    for (const d of PUBLISH_DESTINATIONS) {
      const u = DEST_UPLOAD_URL[d];
      if (u) expect(looksLikeUrl(u)).toBe(true);
    }
  });
});

describe("looksLikeUrl", () => {
  test("http and https, any case, surrounding whitespace forgiven", () => {
    expect(looksLikeUrl("https://youtu.be/abc123")).toBe(true);
    expect(looksLikeUrl("http://example.com")).toBe(true);
    expect(looksLikeUrl("HTTPS://www.tiktok.com/@sa/video/1")).toBe(true);
    expect(looksLikeUrl("  https://www.instagram.com/reel/x/  ")).toBe(true);
  });
  test("not a URL: empty, a bare scheme, a domain without one, spaces inside, other schemes", () => {
    expect(looksLikeUrl("")).toBe(false);
    expect(looksLikeUrl("   ")).toBe(false);
    expect(looksLikeUrl("https://")).toBe(false);
    expect(looksLikeUrl("youtube.com/shorts/abc")).toBe(false);
    expect(looksLikeUrl("https://a b.com")).toBe(false);
    expect(looksLikeUrl("ftp://files.example.com/x")).toBe(false);
    expect(looksLikeUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("shouldAutoTick — a new real link on an unposted destination ticks it", () => {
  const link = "https://youtube.com/shorts/abc";
  test("no previous link, a real one pasted, not posted → tick", () => {
    expect(shouldAutoTick(null, link, false)).toBe(true);
    expect(shouldAutoTick(undefined, link, false)).toBe(true);
    expect(shouldAutoTick("", link, false)).toBe(true);
  });
  test("already posted → never ticks again; the paste just updates the link", () => {
    expect(shouldAutoTick(null, link, true)).toBe(false);
    expect(shouldAutoTick("https://old", link, true)).toBe(false);
  });
  test("the same link again is not an event", () => {
    expect(shouldAutoTick(link, link, false)).toBe(false);
    expect(shouldAutoTick(link, `  ${link}  `, false)).toBe(false);
  });
  test("a different link replaces the old one and still ticks", () => {
    expect(shouldAutoTick("https://youtube.com/shorts/old", link, false)).toBe(true);
  });
  test("not a URL → no tick: empty, cleared, plain words", () => {
    expect(shouldAutoTick(null, "", false)).toBe(false);
    expect(shouldAutoTick(link, "", false)).toBe(false);
    expect(shouldAutoTick(null, "posted it", false)).toBe(false);
    expect(shouldAutoTick(null, "youtube.com/shorts/abc", false)).toBe(false);
  });
});
