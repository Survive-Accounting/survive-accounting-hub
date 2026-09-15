import { describe, expect, test } from "bun:test";

import { clampTrim, downloadName, isTrimmed, ledgerRows, money, payFor, periodStart, queueOf, statsFor, takesFingerprint, type StitchRecord } from "./film-stitch";

const rec = (o: Partial<StitchRecord>): StitchRecord => ({
  id: "x", setId: "s", takeIndex: 0, name: "V", topicKey: null, setKey: null, setName: null, topicName: null, slides: 4, rateCents: 500, payCents: 2000,
  fingerprint: "", sourceUrl: "https://a/b.mp4", durationS: 30, trimStartS: 0, trimEndS: 30, fileUrl: "https://a/b.mp4", outroTrimS: 0, socialUrl: null,
  endCta: null, status: "stitched", queuePos: null, queuedAt: null, postedAt: null, postedLink: null, createdAt: "2026-09-15T12:00:00Z", updatedAt: "2026-09-15T12:00:00Z", ...o,
});

describe("film stitches", () => {
  test("pay is $5 a filmed slide", () => {
    expect(payFor(12)).toBe(6000);
    expect(money(6000)).toBe("$60");
    expect(money(250)).toBe("$2.50");
  });
  test("the same kept takes make the same fingerprint", () => {
    const picks = [{ take: { file: "a.mp4" }, from: 0, to: 0 }, { take: { file: "b.mp4" }, from: 1, to: 8 }];
    expect(takesFingerprint(picks)).toBe("0-0:a.mp4|1-8:b.mp4");
    expect(takesFingerprint([{ ...picks[0] }, { take: { file: "c.mp4" }, from: 1, to: 8 }])).not.toBe(takesFingerprint(picks));
  });
  test("periods start at local midnight, Monday, the 1st", () => {
    const wed = new Date(2026, 8, 16, 15, 30); // Wed 16 Sep 2026
    expect(periodStart("today", wed)!.getDate()).toBe(16);
    expect(periodStart("week", wed)!.getDate()).toBe(14);
    expect(periodStart("month", wed)!.getDate()).toBe(1);
    expect(periodStart("all", wed)).toBeNull();
  });
  test("stats and the ledger count a video once, when first stitched", () => {
    const now = new Date(2026, 8, 16, 18, 0);
    const today = new Date(2026, 8, 16, 9, 0).toISOString();
    const lastWeek = new Date(2026, 8, 8, 9, 0).toISOString();
    const records = [rec({ id: "a", slides: 3, payCents: 1500, createdAt: today }), rec({ id: "b", slides: 10, payCents: 5000, createdAt: lastWeek })];
    expect(statsFor(records, "today", now)).toEqual({ videos: 1, slides: 3, payCents: 1500 });
    expect(statsFor(records, "all", now)).toEqual({ videos: 2, slides: 13, payCents: 6500 });
    expect(ledgerRows(records).map((r) => [r.id, r.runningCents])).toEqual([["b", 5000], ["a", 6500]]);
  });
  test("the post queue keeps the order he sent them", () => {
    const q = queueOf([rec({ id: "late", status: "queued", queuePos: 3 }), rec({ id: "posted", status: "posted" }), rec({ id: "first", status: "queued", queuePos: 1 })]);
    expect(q.map((r) => r.id)).toEqual(["first", "late"]);
  });
  test("trims stay inside the file with half a second left", () => {
    expect(clampTrim(-1, 40, 30)).toEqual({ startS: 0, endS: 30 });
    expect(clampTrim(29.9, 30, 30)).toEqual({ startS: 29.5, endS: 30 });
    expect(clampTrim(5, 5.1, 30)).toEqual({ startS: 5, endS: 5.5 });
    expect(isTrimmed({ trimStartS: 0, trimEndS: 30, durationS: 30 })).toBe(false);
    expect(isTrimmed({ trimStartS: 0, trimEndS: 29.4, durationS: 30 })).toBe(true);
    expect(downloadName("Assets: debit ↑", true)).toBe("assets-debit-social.mp4");
  });
});
