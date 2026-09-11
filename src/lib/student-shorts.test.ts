// A set's posted parts, read back for students: only shipped Blast Off videos, in part order, ids
// withheld for paid sets, and a set with none is unchanged.
import { describe, expect, test } from "bun:test";

import { sitePublication } from "./short-publication";
import { shortsFrom } from "./student-shorts";

const part = (takeIndex: number, name: string, pid: string) =>
  sitePublication({ pubKey: `deck-a#${takeIndex + 1}`, takeIndex, takeName: name, title: `T ${name}`, muxAssetId: `a${takeIndex}`, muxPlaybackId: pid, durationS: 60.4 + takeIndex, access: "free", sourceUrl: "https://x/t.mp4" });

describe("a set's parts for students", () => {
  test("in part order, named, with their runtimes", () => {
    const s = shortsFrom([part(2, "Equity", "p3"), part(0, "Assets", "p1"), part(1, "Liabilities", "p2")], false);
    expect(s.map((x) => x.name)).toEqual(["Assets", "Liabilities", "Equity"]);
    expect(s.map((x) => x.playbackId)).toEqual(["p1", "p2", "p3"]);
    expect(s[0].runtimeSec).toBe(60);
  });

  test("only shipped Blast Off videos with a playback id count", () => {
    const legacy = { id: "pb:set:deck-a:blast", kind: "blast", state: "shipped", render: { muxPlaybackId: "legacy" } };
    const draft = { ...part(0, "Assets", "p1"), state: "draft" };
    const noId = { ...part(1, "L", "x"), render: { muxPlaybackId: null } };
    const look = { ...part(2, "E", "p3"), kind: "lookback" };
    expect(shortsFrom([legacy, draft, noId, look], false)).toEqual([]);
  });

  test("paid sets list their parts with every id withheld", () => {
    expect(shortsFrom([part(0, "Assets", "p1")], true)).toEqual([{ takeIndex: 0, name: "Assets", playbackId: null, runtimeSec: 60, coverUrl: null }]);
  });

  test("a set with no posted parts has none", () => {
    expect(shortsFrom(undefined, false)).toEqual([]);
    expect(shortsFrom([], false)).toEqual([]);
  });

  test("a part with no name falls back to its title", () => {
    expect(shortsFrom([{ ...part(0, "", "p1") }], false)[0].name).toBe("T");
  });
});
