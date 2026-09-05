import { describe, expect, test } from "bun:test";

import {
  bestTranscript, formatDuration, formatRecordDate, inferSemester, muxThumbnailUrl, redactForPublic,
  slugifyTitle, transcriptExcerpt, uniqueSlug, vttToPlainText, type ShippedEntry,
} from "./model";

const mk = (over: Partial<ShippedEntry> = {}): ShippedEntry => ({
  id: "e1", slug: "testing-the-illustrator", title: "Testing the illustrator", topic: null, semester: "Fall 2026",
  recordedAt: "2026-09-05T19:00:00Z", durationSeconds: 272, transcriptLive: null, transcriptMux: "Here's what I built.",
  transcriptSource: "mux", notesHtml: "<b>secret plan</b>", notesPublic: false, muxUploadId: "up_1", muxAssetId: "as_1",
  muxPlaybackId: "pb_1", videoStatus: "ready", publishStatus: "published", publishedAt: "2026-09-05T19:10:00Z",
  createdBy: "lee", createdAt: "2026-09-05T19:00:00Z", updatedAt: "2026-09-05T19:10:00Z", ...over,
});

describe("semester inference", () => {
  test("Jan–May Spring, Jun–Jul Summer, Aug–Dec Fall", () => {
    expect(inferSemester(new Date("2026-01-15"))).toBe("Spring 2026");
    expect(inferSemester(new Date("2026-05-31"))).toBe("Spring 2026");
    expect(inferSemester(new Date("2026-06-01"))).toBe("Summer 2026");
    expect(inferSemester(new Date("2026-07-31"))).toBe("Summer 2026");
    expect(inferSemester(new Date("2026-08-01"))).toBe("Fall 2026");
    expect(inferSemester(new Date("2026-12-31"))).toBe("Fall 2026");
  });
});

test("the header's date line", () => {
  expect(formatRecordDate(new Date("2026-09-05T12:00:00Z"))).toBe("September 5, 2026");
});

describe("slugs", () => {
  test("lowercase, hyphenated, never empty", () => {
    expect(slugifyTitle("Testing a new AI illustrator")).toBe("testing-a-new-ai-illustrator");
    expect(slugifyTitle("  Café Résumé!!  ")).toBe("cafe-resume");
    expect(slugifyTitle("")).toBe("shipped");
    expect(slugifyTitle("!!!")).toBe("shipped");
  });
  test("a collision gets -2, -3, …", () => {
    expect(uniqueSlug("shipped", [])).toBe("shipped");
    expect(uniqueSlug("shipped", ["shipped"])).toBe("shipped-2");
    expect(uniqueSlug("shipped", ["shipped", "shipped-2"])).toBe("shipped-3");
  });
});

describe("transcript and duration", () => {
  test("Mux wins once it exists; the live draft otherwise", () => {
    expect(bestTranscript({ transcriptMux: "the real one", transcriptLive: "draft" })).toBe("the real one");
    expect(bestTranscript({ transcriptMux: null, transcriptLive: "draft" })).toBe("draft");
    expect(bestTranscript({ transcriptMux: "  ", transcriptLive: null })).toBeNull();
  });
  test("an excerpt cuts at a word boundary, never mid-word", () => {
    const long = "I'm testing a new AI illustrator inside the Survive Accounting shorts-production platform, and we'll see where I can get it tonight.";
    const cut = transcriptExcerpt(long, 40)!;
    expect(cut.length).toBeLessThanOrEqual(41);
    expect(cut.endsWith("…")).toBe(true);
    expect(transcriptExcerpt("short", 40)).toBe("short");
    expect(transcriptExcerpt(null)).toBeNull();
  });
  test("duration reads m:ss, never NaN or negative", () => {
    expect(formatDuration(272)).toBe("4:32");
    expect(formatDuration(47)).toBe("0:47");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
  });
  test("the thumbnail URL names the playback id", () => {
    expect(muxThumbnailUrl("abc123")).toBe("https://image.mux.com/abc123/thumbnail.jpg?time=1");
  });
});

describe("redacting for a public viewer", () => {
  test("private notes are hidden; public ones stay", () => {
    expect(redactForPublic(mk()).notesHtml).toBeNull();
    expect(redactForPublic(mk({ notesPublic: true })).notesHtml).toBe("<b>secret plan</b>");
  });
  test("internal plumbing never reaches a visitor", () => {
    const r = redactForPublic(mk());
    expect(r.muxUploadId).toBeNull();
    expect(r.muxAssetId).toBeNull();
    expect(r.createdBy).toBeNull();
    expect(r.muxPlaybackId).toBe("pb_1"); // needed to actually play the video
    expect(r.transcriptMux).toBe("Here's what I built."); // the transcript is meant to be public
  });
});

describe("Mux's generated VTT, flattened", () => {
  test("drops cue numbers, timestamps and blank lines; collapses an immediate repeat", () => {
    const vtt = [
      "WEBVTT", "",
      "1", "00:00:00.000 --> 00:00:02.000", "Testing a new AI illustrator.", "",
      "2", "00:00:02.000 --> 00:00:04.000", "Testing a new AI illustrator.", "",
      "3", "00:00:04.000 --> 00:00:06.000", "Here's where it is right now.",
    ].join("\n");
    expect(vttToPlainText(vtt)).toBe("Testing a new AI illustrator. Here's where it is right now.");
  });
});
