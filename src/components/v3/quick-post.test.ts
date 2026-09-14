import { describe, expect, test } from "bun:test";

import { clock, coverFor, EASY_POINTS_ORDER, filmingOrder, leftovers, lengthStats, parseTitles, quickPubKey } from "./quick-post";

describe("quick post", () => {
  test("video N of the list is the set's publication N — the normal post's keys", () => {
    expect(quickPubKey("deck-e1s-2-1", 0)).toBe("deck-e1s-2-1");
    expect(quickPubKey("deck-e1s-2-1", 1)).toBe("deck-e1s-2-1#2");
    expect(quickPubKey("deck-e1s-2-1", 14)).toBe("deck-e1s-2-1#15");
  });

  test("titles: one per line, blanks dropped", () => {
    expect(parseTitles(" Assets \r\n\nEquity\n")).toEqual(["Assets", "Equity"]);
    expect(parseTitles(EASY_POINTS_ORDER.join("\n"))).toHaveLength(15);
  });

  test("cheat code titles get the cheat code cover", () => {
    expect(coverFor("Receivables cheat code")).toEqual({ title: "Receivables", variant: "CHEAT_CODE" });
    expect(coverFor("Equity")).toEqual({ title: "Equity", variant: "STANDARD" });
    expect(coverFor("Cheat code")).toEqual({ title: "Cheat code", variant: "STANDARD" });
  });

  test("files sort into filming order by their timestamp names", () => {
    const names = ["2026-09-13 14-10-02.mp4", "2026-09-13 9-59-00.mp4", "2026-09-13 14-02-11.mp4"].map((name) => ({ name }));
    expect(filmingOrder(names).map((f) => f.name)).toEqual(["2026-09-13 9-59-00.mp4", "2026-09-13 14-02-11.mp4", "2026-09-13 14-10-02.mp4"]);
  });

  test("lengths: average over the known ones", () => {
    expect(lengthStats([60, 90, null])).toEqual({ count: 2, total: 150, average: 75 });
    expect(lengthStats([]).average).toBeNull();
    expect(clock(107.4)).toBe("1:47");
    expect(clock(null)).toBe("—");
  });

  test("leftovers are the old videos past the new list's end", () => {
    const old = [0, 1, 2, 3, 4].map((takeIndex) => ({ takeIndex }));
    expect(leftovers(old, 15)).toEqual([]);
    expect(leftovers(old, 3).map((p) => p.takeIndex)).toEqual([3, 4]);
  });
});
