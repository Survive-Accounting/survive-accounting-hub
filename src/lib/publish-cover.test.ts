// Your own thumbnail and the saved copy share one jsonb bag; neither write may wipe the other.
import { describe, expect, test } from "bun:test";

import { normalizeCaptions } from "./caption-brief";
import { coverOf, keepCover, withCover } from "./publish-cover";

const cover = { url: "https://x.supabase.co/storage/v1/object/public/canvas-media/blastoff-covers/a.png", name: "assets.png", uploadedAt: "2026-09-11T09:00:00.000Z" };
const copy = { youtube: { title: "Assets in 60 seconds", caption: "Own it, future benefit.", hashtags: ["accounting"] } };

describe("the thumbnail kept with the video", () => {
  test("reads a stored cover, and nothing else as one", () => {
    expect(coverOf({ ...copy, cover })).toEqual(cover);
    expect(coverOf(copy)).toBeNull();
    expect(coverOf(null)).toBeNull();
    expect(coverOf({ cover: { url: "javascript:alert(1)", name: "x" } })).toBeNull();
    expect(coverOf({ cover: { url: "https://x/y.png" } })).toEqual({ url: "https://x/y.png", name: "thumbnail", uploadedAt: "" });
  });

  test("saving a cover keeps the copy; clearing it leaves the copy", () => {
    const stored = withCover(copy, cover);
    expect(stored).toEqual({ ...copy, cover });
    expect(withCover(stored, null)).toEqual(copy);
    expect(withCover(null, cover)).toEqual({ cover });
    expect(withCover({ cover }, null)).toBeNull();
  });

  test("saving copy keeps the cover; clearing the copy leaves the cover", () => {
    expect(keepCover({ ...copy, cover }, { youtube: { title: "new", caption: "", hashtags: [] } })).toEqual({ youtube: { title: "new", caption: "", hashtags: [] }, cover });
    expect(keepCover({ ...copy, cover }, null)).toEqual({ cover });
    expect(keepCover(copy, null)).toBeNull();
  });

  test("the copy reader never sees the cover, and a cover-only bag reads as no copy", () => {
    expect(normalizeCaptions({ cover })).toBeNull();
    const withBoth = normalizeCaptions({ ...copy, cover });
    expect(withBoth?.youtube.title).toBe("Assets in 60 seconds");
    expect(Object.keys(withBoth ?? {})).not.toContain("cover");
  });
});
