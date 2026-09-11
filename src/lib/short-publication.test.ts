// The publication a "Post to the site" press writes, pinned: its stable id (pressing again
// replaces), its shape, the strictly public playback id, and the row's link.
import { describe, expect, test } from "bun:test";

import { publicPlaybackIdOf, siteLinkFor, sitePublication, sitePublicationId, splitOfPubKey, upsertPublication } from "./short-publication";

const at = new Date("2026-09-11T10:00:00.000Z");
const input = { pubKey: "deck-e1s-2-1#2", takeIndex: 1, takeName: "Liabilities", title: "5 Types of Accounts: Liabilities", muxAssetId: "a1", muxPlaybackId: "p1", durationS: 97.4, access: "free" as const, sourceUrl: "https://x/canvas-media/blastoff-takes/l.mp4", now: at };

describe("a Blast Off video on the site", () => {
  test("the publication: shipped, vertical, in part order, with a stable id", () => {
    const p = sitePublication(input);
    expect(p).toMatchObject({
      id: "pb:blastoff:deck-e1s-2-1#2", kind: "blast", state: "shipped", framing: "9:16", source: "blastoff",
      takeIndex: 1, takeName: "Liabilities", pubKey: "deck-e1s-2-1#2",
      meta: { title: "5 Types of Accounts: Liabilities", description: "" },
      render: { muxAssetId: "a1", muxPlaybackId: "p1", durationS: 97.4, at: at.getTime() },
      shipped: { access: "FREE", at: at.getTime() },
    });
    expect(sitePublication({ ...input, access: "paid" }).shipped).toEqual({ access: "PAID", at: at.getTime() });
    expect(sitePublicationId("deck-x")).toBe("pb:blastoff:deck-x");
  });

  test("pressing again replaces the video's publication; other publications are untouched", () => {
    const legacy = { id: "pb:set:deck-e1s-2-1:blast", kind: "blast", state: "shipped" };
    const first = upsertPublication([legacy], sitePublication(input));
    expect(first).toHaveLength(2);
    const again = upsertPublication(first, sitePublication({ ...input, muxAssetId: "a2", muxPlaybackId: "p2" }));
    expect(again).toHaveLength(2);
    expect(again[0]).toBe(legacy);
    expect((again[1].render as { muxPlaybackId: string }).muxPlaybackId).toBe("p2");
    expect(upsertPublication(undefined, sitePublication(input))).toHaveLength(1);
  });

  test("only a public playback id will do", () => {
    expect(publicPlaybackIdOf({ playback_ids: [{ id: "s", policy: "signed" }, { id: "pub", policy: "public" }] })).toBe("pub");
    expect(publicPlaybackIdOf({ playback_ids: [{ id: "s", policy: "signed" }] })).toBeNull();
    expect(publicPlaybackIdOf({})).toBeNull();
  });

  test("a publish key names its set and part", () => {
    expect(splitOfPubKey("deck-e1s-2-1")).toEqual({ setId: "deck-e1s-2-1", takeIndex: 0 });
    expect(splitOfPubKey("deck-e1s-2-1#2")).toEqual({ setId: "deck-e1s-2-1", takeIndex: 1 });
    expect(splitOfPubKey("deck-e1s-2-1#5")).toEqual({ setId: "deck-e1s-2-1", takeIndex: 4 });
  });

  test("the row's link is the set on /learn", () => {
    expect(siteLinkFor("deck-e1s-2-1")).toBe("https://surviveaccounting.com/learn?set=deck-e1s-2-1");
  });
});
